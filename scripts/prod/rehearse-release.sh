#!/usr/bin/env bash
# Short release rehearsal (plan 055 F2d), run by CI and runnable on any Docker host.
#
# Exercises scripts/prod/release.py end to end with throwaway images, a
# throwaway registry and a throwaway signing key; no production value is used:
#   1. the card of a signed image shows a verified signature;
#   2. a wrong card and an image signed for another commit are refused;
#   3. the approved switch releases the new image;
#   4. an image that never becomes healthy is rolled back to the previous one;
#   5. every apply leaves a receipt;
#   6. a signature made under another registry name verifies (as CI -> host).
# Everything it starts is removed on exit.
set -euo pipefail
cd "$(dirname "$0")/../.."
BUSYBOX=busybox@sha256:73aaf090f3d85aa34ee199857f03fa3a95c8ede2ffd4cc2cdb5b94e566b11662          # 1.36.1
REGISTRY=registry@sha256:a3d8aaa63ed8681a604f1dea0aa03f100d5895b6a58ace528858a7b332415373        # 2.8.3
COSIGN=$(python3 -I -c "import ast,sys;t=open('scripts/prod/release.py').read();print(ast.literal_eval(t.split('COSIGN = ',1)[1].split(')',1)[0]+')'))")
T=$(mktemp -d /tmp/alterward-rehearsal.XXXXXX)
P=alterward-rehearsal-$$
say() { echo "[rehearsal] $*"; }
fail() { say "FAILED: $*"; exit 1; }
cleanup() {
  docker compose -p "$P" -f "$T/compose.yaml" --env-file "$T/secrets/server.env" down -t 1 >/dev/null 2>&1 || true
  docker rm -f "$P-registry" >/dev/null 2>&1 || true
  docker image ls --format '{{.Repository}}:{{.Tag}}' | grep "^127.0.0.1:[0-9]*/alterward:rehearsal" |
    xargs -r docker rmi -f >/dev/null 2>&1 || true
  sudo -n rm -rf "$T" 2>/dev/null || rm -rf "$T"
}
trap cleanup EXIT

docker run -d --name "$P-registry" -p 127.0.0.1::5000 "$REGISTRY" >/dev/null
PORT=$(docker port "$P-registry" 5000/tcp | head -1 | sed 's/.*://')
REG=127.0.0.1:$PORT/alterward
for _ in $(seq 30); do curl -fsS "http://127.0.0.1:$PORT/v2/" >/dev/null 2>&1 && break; sleep 1; done

declare -A DIGEST
for v in 1 2 3; do
  mkdir -p "$T/build$v"
  { echo "FROM $BUSYBOX"; echo "LABEL alterward.rehearsal=$v"
    [ "$v" = 3 ] || echo 'RUN touch /healthy'; } >"$T/build$v/Dockerfile"
  docker build -q -t "$REG:rehearsal-v$v" "$T/build$v" >/dev/null
  docker push -q "$REG:rehearsal-v$v" >/dev/null
  DIGEST[$v]=$(docker image inspect "$REG:rehearsal-v$v" --format '{{index .RepoDigests 0}}' | sed 's/.*@//')
done

mkdir -p "$T/keys" "$T/secrets"
docker run --rm --user 0:0 -e COSIGN_PASSWORD= -v "$T/keys:/k" -w /k "$COSIGN" generate-key-pair >/dev/null 2>&1
C1=$(printf '1%.0s' $(seq 40)); C2=$(printf '2%.0s' $(seq 40)); C3=$(printf '3%.0s' $(seq 40))
sign() {
  docker run --rm --network host --user 0:0 -e COSIGN_PASSWORD= -v "$T/keys:/k:ro" "$COSIGN" sign --yes \
    --key /k/cosign.key --allow-insecure-registry --tlog-upload=false -a "commit=$2" \
    "localhost:$PORT/alterward@$1" >/dev/null 2>&1
}
# Signed under another registry name than the one release.py verifies with, as
# in production (CI signs registry.alterward.com/..., the host reads 127.0.0.1:5000/...).
sign "${DIGEST[1]}" "$C1"; sign "${DIGEST[2]}" "$C2"; sign "${DIGEST[3]}" "$C3"

cat >"$T/compose.yaml" <<'YAML'
x-app: &app
  image: ${ALTERWARD_IMAGE:?}
  command: ['sleep', '3600']
  healthcheck: {test: ['CMD', 'test', '-f', '/healthy'], interval: 2s, timeout: 2s, retries: 2, start_period: 1s}
services:
  web: *app
  api: *app
  worker:
    image: ${ALTERWARD_IMAGE:?}
    command: ['sleep', '3600']
YAML
echo "ALTERWARD_IMAGE=$REG@${DIGEST[1]}" >"$T/secrets/server.env"
chmod 600 "$T/secrets/server.env"
export COMPOSE_PROJECT_NAME=$P ALTERWARD_ROOT=$T ALTERWARD_ENV_FILE=$T/secrets/server.env
export ALTERWARD_COMPOSE=$T/compose.yaml ALTERWARD_COSIGN_KEY=$T/keys/cosign.pub ALTERWARD_REGISTRY=$REG
export ALTERWARD_DRAIN_SECONDS=5 ALTERWARD_HEALTH_SECONDS=40 ALTERWARD_TEST_SKIP_BACKUP=1
docker compose -f "$T/compose.yaml" --env-file "$T/secrets/server.env" up -d --quiet-pull >/dev/null 2>&1
REL="python3 -I scripts/prod/release.py"
card_of() { $REL plan --image "$1" --commit "$2" --pr 1 | sed -n 's/^card sha256: //p'; }

out=$($REL plan --image "${DIGEST[2]}" --commit "$C2" --pr 1) || fail "plan: $out"
grep -q 'Signature: verified, annotated with the commit' <<<"$out" || fail 'signature not shown as verified'
CARD=$(sed -n 's/^card sha256: //p' <<<"$out")
say "1/5 card shows the verified signature"

out=$($REL apply --image "${DIGEST[2]}" --commit "$C2" --pr 1 --approved "$(printf '0%.0s' $(seq 64))" || true)
grep -q 'differs from the approved one' <<<"$out" || fail "wrong card not refused: $out"
out=$($REL plan --image "${DIGEST[2]}" --commit "$C3" --pr 1 || true)
grep -q 'does not verify for this commit' <<<"$out" || fail "other commit not refused: $out"
say "2/5 wrong card and other commit refused"

out=$($REL apply --image "${DIGEST[2]}" --commit "$C2" --pr 1 --approved "$CARD") || fail "apply: $out"
grep -q '"outcome": "released"' <<<"$out" || fail "not released: $out"
grep -qx "ALTERWARD_IMAGE=$REG@${DIGEST[2]}" "$T/secrets/server.env" || fail 'env not on v2'
say "3/5 approved switch released v2"

CARD3=$(card_of "${DIGEST[3]}" "$C3")
out=$($REL apply --image "${DIGEST[3]}" --commit "$C3" --pr 1 --approved "$CARD3" || true)
grep -q '"outcome": "rolled-back"' <<<"$out" || fail "broken image not rolled back: $out"
grep -qx "ALTERWARD_IMAGE=$REG@${DIGEST[2]}" "$T/secrets/server.env" || fail 'env not back on v2'
say "4/5 unhealthy v3 rolled back to v2"

[ "$(find "$T/releases" -name '*.json' | wc -l)" = 2 ] || fail 'receipts missing'
say "5/5 receipts written; release rehearsal passed"
