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

## Run

```bash
docker compose -f deploy/prod/compose.prod.yaml --env-file /srv/alterward/secrets/server.env up -d
```
