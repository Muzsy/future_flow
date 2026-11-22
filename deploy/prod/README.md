# Alterward production host (plan 055)

The new, clean production VPS. One Compose project runs the application (`web`, `api`, `worker`), its own Caddy and the image registry. Nothing here depends on, or connects to, the old Contabo host (which keeps only staging).

## Host layout

| Path                                 | Mode | Content                                                                         |
| ------------------------------------ | ---- | ------------------------------------------------------------------------------- |
| `/srv/alterward/app`                 | 755  | the release source checkout (Compose files, Caddyfile)                          |
| `/srv/alterward/secrets`             | 700  | `server.env` (0600) and `origin/` (Cloudflare Origin certificate and key, 0600) |
| `/srv/alterward/caddy/{data,config}` | 700  | Caddy state (ACME certificate of the registry name)                             |
| `/srv/alterward/registry/data`       | 700  | registry storage                                                                |
| `/srv/alterward/backups`             | 700  | encrypted backups before upload                                                 |
| `/srv/alterward/ops`                 | 700  | release and backup tooling state                                                |
| `/srv/alterward/releases`            | 755  | release receipts                                                                |

## Rules

- **Only Caddy publishes ports (80, 443).** Docker opens published ports beside the host firewall (`ufw` allows only 22), so no other service publishes anything. The registry listens on `127.0.0.1:5000` for the host's own pulls.
- **alterward.com / www:** Cloudflare Origin CA certificate, only Cloudflare peers, the client address only from `Cf-Connecting-Ip` after that check (same rules as the old shared Caddy block).
- **registry.alterward.com:** DNS-only (not proxied: Cloudflare's request size limit breaks image uploads), public ACME certificate, HTTP basic authentication with the CI upload credential only. The host itself pulls through `127.0.0.1:5000` without credentials.
- **The application image is pinned by digest** (`ALTERWARD_IMAGE=127.0.0.1:5000/alterward@sha256:…`); the release verifies its cosign signature before the switch.
- **`server.env`:** write the bcrypt hash of the registry upload password in single quotes (`REGISTRY_UPLOAD_HASH='$2a$14$…'`) so Compose keeps the `$` characters literally.

## Backup, restore check and monitor

- `scripts/prod/backup.py backup` (timer, 03:15 UTC): encrypted dump of schema `public` and the host config, to the operator's age public key; the host cannot decrypt. Seven days kept.
- `scripts/prod/offsite.py run` (operator machine): copies new backups, decrypts with the local identity, restores into a disposable PostgreSQL 17 and reports the result back (`ops/status/restore.json`).
- `scripts/prod/monitor.py run` (timer, every 15 minutes): containers, disk, origin certificate, backup and restore-check freshness, USD threshold crossings; `monitor.py health` is the projection the external GitHub check reads.
- Units: `deploy/prod/systemd/` (install with `systemctl link` or copy, then `systemctl enable --now` the two timers).

## Run

```bash
docker compose -f deploy/prod/compose.prod.yaml --env-file /srv/alterward/secrets/server.env up -d
```

## Release

1. **CI** (`.github/workflows/publish.yml`): on every push to main (beside `Verify main`; the release still needs green CI), the image is built once from public build values, pushed to `registry.alterward.com` and signed with cosign, annotated with `commit=<sha>`. The job summary names the digest. The `release-rehearsal` CI job exercises the host tool on every PR (`scripts/prod/rehearse-release.sh`).
2. **Card** (operator machine, in a checkout that has the release commit):

   ```bash
   python3 -I scripts/prod/ship.py --commit <sha> --pr <n> --image sha256:<digest>
   ```

   It checks CI (main, or the tree-equivalent PR head), refuses any change under `database/migrations` since the serving commit (newest `released` receipt on the host; `--base` only for the first release) and prints the host's card from `release.py plan`: image present, signature verified for that commit.

3. **Switch**, after the owner approves the card: the same command with `--approve <card sha256>`. It takes a host backup, copies and test-restores it here (`offsite.py run`), then `release.py apply`: card re-check, one more fresh backup, worker drain (15 minutes grace), switch of web/api/worker, health wait, automatic rollback to the previous digest on failure, receipt in `/srv/alterward/releases/`.

## Service settings

`scripts/prod/env.py` changes only a closed list of keys in `server.env` (budgets, story directions, Access, Turnstile, provider key and, by decision E1, the billing keys). The request goes on stdin, never in arguments:

```bash
ssh alterward-new python3 -I /srv/alterward/app/scripts/prod/env.py plan < .local/operator-secrets/env-request.json
ssh alterward-new python3 -I /srv/alterward/app/scripts/prod/env.py apply --approved <card sha256> < .local/operator-secrets/env-request.json
```

Secrets show on the card only as SHA-256 prefixes; only live Stripe keys pass; billing and its enforcement stay on; a Stripe change is checked by reading the configured price with the resulting key. `apply` keeps the previous file as `server.env.previous`, recreates the services with the same image and restores the previous file if they do not become healthy.
