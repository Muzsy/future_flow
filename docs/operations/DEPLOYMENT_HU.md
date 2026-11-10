---
status: canonical
owner: operations
last_reviewed: 2026-10-12
related:
  - ../DEPLOYMENT_HU.md
  - BACKUP_HU.md
  - RECOVERY_HU.md
---

# Deployment operations

## Célkörnyezet

Az Alterward jelenlegi célkörnyezete a meglévő Contabo VPS, `alterward.com` domainnel és Cloudflare előtéttel.

Runtime felosztás:

- web container;
- API container;
- worker container;
- Caddy/proxy;
- Supabase külső DB/Auth;
- külső AI provider.

GPU nem szükséges.

**Worker-párhuzamosság.** A worker szolgáltatási profilban (`SERVICE_ACCESS_ENFORCEMENT=true`) alapból hat jobot futtat egyszerre, máshol egyet. A `WORKER_CONCURRENCY` (1–20) és az adatbázis-pool `DATABASE_POOL_MAX` (1–30, alapból a workerben `concurrency + 4`, az API-ban 5) csak akkor hat, ha a futó Compose az env-t továbbítja; az éles, fagyasztott Compose ezt a kulcsot nem tartalmazza, ezért az érték a kód alapértéke, a konténer CPU/RAM-limitje változatlan (worker 1 GB, 512 MB heap). A `WORKER_POLL_MS` (100–60000) szigorúan érvényesített, a `WORKER_CONCURRENCY > 1` az `AI_EXPERIMENT_LEDGER_PATH` mellett induláskor hiba. A Supabase Session pooler kapcsolatkorlátját az emelés előtt ellenőrizni kell; hat slotnál a worker legfeljebb 10, az API 5 kapcsolatot nyit. Az érték módosítása image-kiadás ([NATIVE040_IMAGE_RELEASE_HU](NATIVE040_IMAGE_RELEASE_HU.md)).

## Security boundary

- csak a proxy 80/443 portja publikus;
- web nem kap DB/admin/OpenAI secretet;
- API/worker secretjei szerveroldaliak;
- Supabase DB TLS verify-full/CA ellenőrzéssel;
- Cloudflare Access zárja a jelenlegi owner-only webhelyet;
- origin-access ellenőrzés nem kerülhető meg;
- production AI budget/feature flag alapból fail-closed.

## Normal deployment elv

1. tiszta, ellenőrzött `main`;
2. teljes Verify/container CI zöld;
3. szükséges migration/recovery hatások áttekintve;
4. image/build reproducible forrásból;
5. secret/config candidate ellenőrzés;
6. deployment úgy, hogy más VPS alkalmazásokat ne módosítsunk;
7. health/TLS/origin ellenőrzés;
8. külső availability/privát monitor ellenőrzés;
9. szükség esetén dokumentált rollback.

A részletes Contabo parancsok és történeti infrastruktúra-határok a meglévő `../DEPLOYMENT_HU.md` és kapcsolódó aktív Contabo runbookok alatt maradnak.

## Tiltott shortcutok

- secret beépítése image-be;
- `rejectUnauthorized:false` vagy TLS-verification kikapcsolása;
- vak VPS/proxy restart más alkalmazások ismerete nélkül;
- host runtime globális cseréje csak az Alterward miatt;
- fizetett AI feature automatikus bekapcsolása deploy részeként;
- Shared bekapcsolása a personal beta deploytól implicit módon.

## Release vs deployment

A sikeres deployment nem azonos feature-release-szel.

Külön gate:

- owner-only deploy;
- personal beta activation;
- Shared beta activation;
- public/community release.

Feature csak a saját activation policy-ja szerint válik elérhetővé.

A 040-es szolgáltatásprofil melletti, migráció nélküli Stripe image-váltás
és a hozzá tartozó mentés/visszaállítás: [Native040 image-release runbook](NATIVE040_IMAGE_RELEASE_HU.md).
