#!/usr/bin/env bash
# Image smoke test (plan 055 E6), run by CI on the image it just built.
#
# Starts web, api and worker from deploy/prod/compose.prod.yaml exactly as the
# production host does, against a disposable PostgreSQL 17 with a throwaway
# TLS certificate (tests/deployment/compose.prod-smoke.yaml):
#   1. the application's migration runner applies every migration, twice;
#   2. web and api report healthy and the worker keeps running;
#   3. api answers /health and refuses an unauthenticated private route;
#   4. the api's database session is TLS with the pinned CA.
# No real database, provider, Stripe or AI budget is reachable. Everything it
# starts is removed on exit.
set -euo pipefail
IMAGE=${1:?usage: smoke-image.sh <local image>}
cd "$(dirname "$0")/../.."
T=$(mktemp -d /tmp/alterward-smoke.XXXXXX)
P=alterward-smoke-$$
C=(docker compose -p "$P" -f deploy/prod/compose.prod.yaml -f tests/deployment/compose.prod-smoke.yaml --env-file "$T/smoke.env")
say() { echo "[smoke] $*"; }
fail() { say "FAILED: $*"; "${C[@]}" logs --no-color --tail 40 api worker web 2>&1 | tail -60 || true; exit 1; }
cleanup() { "${C[@]}" down -v -t 1 >/dev/null 2>&1 || true; sudo -n rm -rf "$T" 2>/dev/null || rm -rf "$T"; }
trap cleanup EXIT

mkdir -p "$T/tls"
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj "/CN=alterward-smoke-ca" -keyout "$T/tls/ca.key" -out "$T/tls/ca.crt" 2>/dev/null
openssl req -newkey rsa:2048 -nodes -subj "/CN=smoke-db" -keyout "$T/tls/server.key" -out "$T/tls/server.csr" 2>/dev/null
printf 'subjectAltName=DNS:smoke-db\n' >"$T/tls/ext"
openssl x509 -req -in "$T/tls/server.csr" -CA "$T/tls/ca.crt" -CAkey "$T/tls/ca.key" -CAcreateserial -days 1 -extfile "$T/tls/ext" -out "$T/tls/server.crt" 2>/dev/null
sudo -n chown 999:999 "$T/tls/server.key" "$T/tls/server.crt" 2>/dev/null || chmod 644 "$T/tls/server.key"
chmod 600 "$T/tls/server.key" 2>/dev/null || true
cp "$T/tls/ca.crt" "$T/ca.crt" && chmod 644 "$T/ca.crt"
PW=$(openssl rand -hex 16)
cat >"$T/smoke.env" <<ENV
ALTERWARD_IMAGE=$IMAGE
SMOKE_DB_PASSWORD=$PW
SMOKE_TLS_DIRECTORY=$T/tls
DATABASE_URL=postgresql://postgres:$PW@smoke-db:5432/postgres
DATABASE_SSL=true
DATABASE_SSL_CA_HOST_FILE=$T/ca.crt
PUBLIC_HOST=localhost
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_ci_unused
SUPABASE_SERVICE_ROLE_KEY=ci_admin_unused
OPENAI_API_KEY=ci_openai_unused
AI_PROJECT_BUDGET_USD=0
AI_USER_BUDGET_USD=0
REGISTRY_UPLOAD_USER=ci
REGISTRY_UPLOAD_HASH=ci_unused
ENV

"${C[@]}" up -d db >/dev/null 2>&1
for _ in $(seq 60); do "${C[@]}" exec -T db pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
sleep 2
# Supabase's client roles, which the migrations revoke from (no login).
"${C[@]}" exec -T db psql -U postgres -q -v ON_ERROR_STOP=1 -c 'CREATE ROLE anon NOLOGIN' -c 'CREATE ROLE authenticated NOLOGIN'
for pass in 1 2; do
  "${C[@]}" run --rm --no-deps -T --entrypoint node api --import tsx scripts/migrate.ts >"$T/migrate-$pass.log" 2>&1 ||
    { cat "$T/migrate-$pass.log"; fail "migration run $pass"; }
done
applied=$(grep -c '^Applied ' "$T/migrate-1.log" || true)
expected=$(ls database/migrations/*.sql | wc -l)
[ "$applied" = "$expected" ] || fail "first run applied $applied of $expected migrations"
! grep -q '^Applied ' "$T/migrate-2.log" || fail 'second run applied again'
say "1/4 migrations: $applied applied, second run idempotent"

"${C[@]}" up -d --no-deps web api worker >/dev/null 2>&1
for _ in $(seq 90); do
  web=$(docker inspect "$("${C[@]}" ps -q web)" --format '{{.State.Health.Status}}' 2>/dev/null || true)
  api=$(docker inspect "$("${C[@]}" ps -q api)" --format '{{.State.Health.Status}}' 2>/dev/null || true)
  [ "$web" = healthy ] && [ "$api" = healthy ] && break
  sleep 2
done
[ "$web" = healthy ] && [ "$api" = healthy ] || fail "web=$web api=$api"
sleep 10
[ "$(docker inspect "$("${C[@]}" ps -q worker)" --format '{{.State.Running}}')" = true ] || fail 'worker stopped'
say '2/4 web and api healthy, worker running'

probe='const u=process.argv[1];fetch(u).then(r=>{console.log(r.status);process.exit(0)}).catch(()=>process.exit(1))'
health=$("${C[@]}" exec -T api node -e "$probe" http://127.0.0.1:4000/health)
private=$("${C[@]}" exec -T api node -e "$probe" http://127.0.0.1:4000/api/v1/me/export)
[ "$health" = 200 ] && [ "$private" = 401 ] || fail "health=$health private=$private"
say '3/4 api health 200, private route 401 without credentials'

tls=$("${C[@]}" exec -T api node -e "
const {Client}=require(require.resolve('pg',{paths:['/app/packages/database']}));
const fs=require('fs');
const c=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true,ca:fs.readFileSync(process.env.DATABASE_SSL_CA_FILE,'utf8')}});
c.connect().then(()=>c.query('select ssl from pg_stat_ssl where pid=pg_backend_pid()')).then(r=>{console.log(r.rows[0].ssl);return c.end()}).catch(e=>{console.error(e.message);process.exit(1)})")
[ "$tls" = true ] || fail "api database session TLS: $tls"
say '4/4 api database session uses verified TLS; image smoke passed'
