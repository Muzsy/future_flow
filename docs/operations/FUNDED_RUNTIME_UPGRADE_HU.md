---
status: active-supporting
owner: engineering
last_updated: 2026-10-16
canonical_parent: NARRATIVE_RELEASE_HU.md
---

# Linux active-funded runtime upgrade — Issue #34

Ez a `scripts/contabo-funded-upgrade.mjs` dedikált Linux útvonala. Nem kezdeti funded aktiválás, owner-zero upgrade vagy általános deployment. A kanonikus kiadási kapuk: [Narrative release](NARRATIVE_RELEASE_HU.md), [Linux operator](LINUX_OPERATOR_HU.md), [backup](BACKUP_HU.md), [recovery](RECOVERY_HU.md). A kód implementációs jelölt; **nem éles kiadási engedély**. N09 továbbra PARTIAL, N08 emberi benchmark kötelező. A task nem végez production műveletet, migrációt, paid hívást vagy credential-rotációt.

## Megőrzött authority és határ

Az eredeti `personal-beta/prepared.json`, `transition.json` (`applied`), `journal.json` (`exposure-committed`), a terms és a négy eredeti candidate fájl marad az induló funded authority. A futó root-konfigurációnak pontosan ezekkel kell egyeznie. Owner-zero receipt nem helyettesíti őket. Az upgrade nem módosítja e fájlokat; saját `funded-runtime-upgrade/` állapotot használ.

Az első transition támogatott. Már létező upgrade-könyvtár mellett új prepare nincs; nincs rejtett törlés, újratervezés vagy ablakmegújítás. Lejárt, félkész vagy befejezett state esetén inspection és külön, auditált következő eljárás kell. Többszöri jövőbeli upgrade ciklus nem része ennek a csomagnak.

Változhat az image/source és kizárólag az `ALTERWARD_TAG` env-sor. A teljes renderelt Compose minden más része, providerérték, UUID-lista, eredeti 30 napos start/end, projekt/user maximum, napi/concurrent limit, reader/Access, CA, hálózat és idegen workload változatlan. Az allowance/accounted/reservation/usage és minden meglévő alkalmazástábla sorai hash-sel összevetettek; sem nulla költés, sem üres adatbázis nem előfeltétel. A feltöltött történetminőség-mód/cohort bekapcsolása külön döntés.

## Privilegizált source bundle

A kliens a committed CLI/helper fájlokat import ELŐTT byte szerint ellenőrzi. Linux 0700 checkout, owned 0600 regular input, valós és nem írható idegen ancestor, hardlink/symlink kizárás kötelező. A `fundedSourceBundle` a committed scripts/tests/apps/packages kódot és manifesteket, migrációkat, Compose-forrást és gyökér package/pnpm/tsconfig, Dockerfile és .dockerignore fájlokat hash-eli. Dokumentum nem helyettesít helper hash-t. A kiválasztott image belsejében ugyanazon fájlok hash-e ellenőrzött, mielőtt annak runtime contractját importáljuk.

A SSH-ra küldött Python-modulok: backup, target, owner, owner-activation, owner-upgrade, writer-fence, personal-beta-readers, personal-beta, funded-watchdog, funded-upgrade. Az utolsó kettő dedikált, az owner-zero útvonal nincs broadenolva. A változó `sourceHashes` csak az ellenőrzött committed bundle-ből származik. GitHub CI friss GET és az eredeti hostpin/key kötelező; nincs SSH-config, új identity, forwarding vagy provider/DB/Auth process-env örökítés.

## Release inputok és friss Access-megfigyelés

A meglévő `.local/contabo-release/` privát directoryban új, külön fájlok szükségesek. Történeti receiptet nem írunk át:

- `funded-upgrade-release.json`: `target` és `recovery`, mindkettő `commit`, immutable `imageId`, `imageTag`, rooton tárolt `sourceDirectory` mezővel. Mindkettő a kiválasztott exact source-ból épül, lehet eltérő digest. A régi futó image önmagában nem recovery target.
- `funded-upgrade-audit-proof.json`: `sourceCommit`, `bundleSha256`, `interpretedByOperator: true`, `critical/high/medium: 0`. Csak tényleges független audit és operátori értelmezés után készülhet.
- `funded-upgrade-fixture-proof.json`: a `releaseEvidence` által megkövetelt exact source/bundle/target/recovery, 13 igazolt check és `privacyFixtureSha256`, `paidAiCalls: 0`. A CI proof kizárólag a CI image digestjeire érvényes; eltérő célgépes image-hez új, ugyanahhoz a source-hoz és tényleges digesthez kötött fixture kell. Hash átírása nem fixture.
- prepare után a kliens új `funded-upgrade-prepare-proof.json` fájlt tárol.
- apply/recover előtt `funded-upgrade-restore-proof.json`: `sourceCommit`, `preparedSha256`, tényleges `runId`, `targetImage`, `recoveryImage`, `privacyFixtureSha256`. A szerver Daily proofja és archívumai ettől függetlenül újra ellenőrzöttek.

Az eredeti `ALTERWARD_SSH_SECRETS_DIR` alatt a külön, privát `cloudflare-access-read.json` mezői: `accountId`, `applicationId`, `token`. Ez meglévő, megfelelő read-jogú hitelesítés, nem új token létrehozása. A fájl nem kerül SSH-ra, image-be vagy reportba. A kliens kizárólag fix Cloudflare API-originre, redirect nélkül GET-eli az appot, organizationt és az app policy-listát. A támogatott alak: `alterward.com` self-hosted alkalmazás, explicit email allow policy(k), üres require/exclude; bypass/service-auth/group vagy más összetett szabály külön review-t igényel, automatikus átírás nincs. A teljes megfigyelt konfiguráció digestje, team domain, audience és email-lista kötött; prepare/apply/recover friss megfigyelést kér (legfeljebb 900 s), driftre elutasít. API-elérhetetlenség mellett nincs transition.

Az API-szerződés forrásai: [app policies](https://developers.cloudflare.com/api/resources/zero_trust/subresources/access/subresources/applications/subresources/policies/methods/list/), [Access applications](https://developers.cloudflare.com/api/resources/zero_trust/subresources/access/subresources/applications/), [organization](https://developers.cloudflare.com/api/resources/zero_trust/subresources/organizations/).

## Parancsok és sorrend

Kizárólag későbbi explicit production felhatalmazás és teljes exact-source release-csomag után, clean main operátori checkoutban:

```sh
node --import tsx scripts/contabo-funded-upgrade.mjs --inspect
node --import tsx scripts/contabo-funded-upgrade.mjs --prepare /private/release-selection.json
# A konkrét candidate UTÁN: kanonikus backup, offsite sync és izolált restore.
node --import tsx scripts/contabo-funded-upgrade.mjs --apply
# Csak hiányos, eredeti candidate-hoz kötött transition esetén:
node --import tsx scripts/contabo-funded-upgrade.mjs --recover
```

`inspect` csak a meglévő hash-chained journal állapotát olvassa; nem állít SQL/Cloudflare frissességet vagy serving-egészséget, nem indít konténert és nem ír DB-t. A kliens a saját új privát inspect receiptjét menti.

Prepare és apply ugyanazt a Daily job-lockot és activation-lockot veszi fel. Prepare ténylegesen ellenőrzi az aktív funded baseline-t, az idegen workloadot, a cache-elt target/recovery digestet és a két image pontos forrását/runtime-contractját, a DB-identityt, Auth mappinget, strict 037/038 catalogot és drain állapotot. Új 0700 candidate-directoryban létrehoz nyolc immutable runtime fájlt (`target/`, `recovery/`) és `prepared.json`-t. Érvényesség pontosan 900 s. Nem állítja le a futó appot és nem módosítja a DB-t. Félkész prepare megmarad, automatikus törlés/újrapróba nincs.

Apply sorrendje:

1. Friss CI/audit/fixture/Access és candidate hash, lejárat, változatlan eredeti authority, tényleges DB-drain és candidate-bound restore gate ellenőrzése még stop előtt. Az inkompatibilis recovery már itt elutasított.
2. Parenthez kötött pidfd/pipe death watch indul; tartós `apply-intent` megelőzi a scoped stopot.
3. Csak a validált három szolgáltatás immutable ID-je áll le. A `held` állapot alatt új DB/Auth/ledger/foreign olvasás és a backup/capability kapuk újra ellenőrzöttek.
4. `migration-intent`; kizárólag a checksummed 038 migráció, tranzakció és a normál migrációs advisory lock alatt. Post-catalog és minden védett sor azonossága szükséges.
5. A target Compose létrehozza a három konténert indítás nélkül. Mindhárom restart policy `no`, a watchdog az új immutable ID-ket még start előtt átveszi.
6. A leállított web/api lekapcsol az eredeti proxy-hálózatról, source-hoz kötött, idegen tagot kizáró ellenőrző bridge-re kerül. Csak ezután indul web/api; a worker created/exited és nem fut. Health, origin 403/no-store, tényleges command/image/env/resource/CA, hálózat, DB/catalog/Auth/drain/accounting ellenőrzött.
7. `verified-staged`; négy root-fájl atomikus promote-ja, majd `exposure-intent`. Az API/web visszakapja az eredeti proxy-aliast, a privát bridge megszűnik; a worker utolsóként indul.
8. Tényleges running/network/foreign/DB readback és új privát receipt. Tartós `applied` után visszaáll az eredeti `unless-stopped` restart policy, majd a death watch lezárul.

Az apply előtti dupla preflight és az image/runtime capability probe szándékos; a baseline felvétele nem writer hold. A sikerhez az első és utolsó megfigyelés közötti összes védett adatnak egyeznie kell. Egy közben beérkező írás drift és fail-closed eredmény, nem felülírható eltérés.

## Drain, schema és frozen policy

A hat job-queue pending/validating/running és lease oszlopai, draft review, generating branch, reserved/unknown vagy settlement nélküli budget reservation és aktív idegen DB-session tiltja az upgrade-et. A kikapcsolt narrative flag nem drain. A már bound-ready ingyenes commit a meglévő, felülvizsgált alkalmazásútvonalon, az upgrade ELŐTT fejezhető be. A tool nem töröl/cancel/manual-settle jobot, nem nulláz számlálót és nem ír át frozen payloadot.

A `captureFundedRuntime` az ismert 037 vagy 038 migrációs checksum-prefixet és strict security catalogot fogadja el. A név szerint külön `assertFundedPre038SecurityCatalog`/`assertReviewedFundedPre038Schema` kizárólag az ismert 855 oszlopos baseline-t engedi; a normál recovery-guard változatlanul a 856 oszlopos 038 baseline-t követeli. Nincs caller által megadható tetszőleges schema-fingerprint, artifact eldobás vagy generikus downgrade.

A két image tényleges contracts-kódja értelmezi a legacy/context policyt, a planner/writer v1–v3 kilenc párosítását és a reviewed max-8 policyt; a review marker max-7 elutasított. Tárolt policy és 038 artifact strict parse történik. Ismeretlen frozen revision vagy >1000 elemű inventory külön elemzést igényel, nincs átírás. A null artifact legacy period olvasható marad; a publikus és normál life DTO nem kap új artifact mezőt. A saját export meglévő privát artifact-szerződése változatlan.

## Backup és recovery

Az installált Daily új `FUNDED_UPGRADE_ARCHIVE_POLICY_VERSION = 1` és exact-source hash-e külön release gate. A régi reader/personal policy nem kap új értelmezést. A finite encrypted config whitelist hozzáadja a két runtime-directoryt, prepared/journal/readback/probe-compose/watchdog fájlokat és legfeljebb nyolc megszakadt atomikus temporary fájlt. Ismeretlen név, alias, hardlink vagy public mode elutasított. A providerértéket tartalmazó config csak a meglévő titkosított config-archívumba kerülhet.

Az apply ugyanazt az installált-source Daily kaput használja: friss, candidate UTÁNI archívum; mindkét ciphertext hash+méret; offsite copy/decrypt/transactional isolated restore; DB row és config hash; cleanup és memória-only decrypt identity. Az új kilenc immutable candidate fájl hash-e is kötelező. Az új exact-image/source privacy fixture digest nélkül egy régi általános restore-proof nem elég. A Daily install, célgépes immutable build, fixture és a rövid candidate-ablakon belüli backup/restore végrehajthatósága éles kiadás előtti kapu; ez a task ezeket nem hajtja végre és nem hamisít hozzájuk receipteket.

Recovery **az aktuális adatbázison**, a már prevalidált, schema-038/policy/artifact kompatibilis image-dzsel történik. Régi DB-snapshot live visszaállítása tilos: az újabb privacy authority, költés és usage elveszne. A kanonikus restore továbbra quarantine, delete/revoke replay, paid-disabled és service activation nélkül. Ez a task nem változtatja meg.

Catchable hiba scoped stopot és tartós `closed` vagy `stop-unverified` journal sort hagy; nincs automatikus fallback vagy alkalmazás-újraindítás. SIGKILL/pipevesztés vagy 900 s operátori időkorlát esetén a külön death watch a rögzített három ID-t állítja le, és megőrzi a régi állapotokat, `watchdog-stop-intent`/záró sort és watchdog-bizonyítékot. Staging alatt host reboot után a `restart=no` akadályozza meg az automatikus servinget. Recovery előtt az esetleges részben exponált saját szolgáltatások leállnak, utána fresh authority/capability/backup/drain ellenőrzés szükséges. A recovery nem hosszabbítja az eredeti ablakot, és lejárat után sem finanszíroz újat. Befejezett `applied/recovered` journal nem játszható újra. Upgrade-state jelenlétében a régi reader/funded emergency disable továbbra stop-first, de az eredeti owner-zero image újraindítását a közös `restore_zero` elutasítja: a szolgáltatások held állapotban maradnak. Befejezett upgrade utáni külön shutdown/restart vagy következő kiadási ciklus felülvizsgált operátori eljárást igényel, az eredeti activation nem játszható újra. A hash-chained journal 32 sort, a watchdog history nyolc bejegyzést enged; a limitnél megőrzött state és kézi elemzés kell, nem evidence-törlés.

## Ellenőrzés és fixture-határok

- `tests/funded-runtime.test.ts`: tényleges PGlite catalog/migration/ledger/Auth/reservation, strict normál recovery és dedikált pre-038 guard.
- `tests/ops/test_funded_upgrade.py`: orchestration fault-mátrix, finite archive, valamint root-only tényleges fsync/atomic/hash-chain/private-file tesztek.
- `tests/ops/funded-upgrade.test.mjs`, `funded-access.test.mjs`: exact-source audit/CI/image/fixture shape és GET-only Access / unsafe policy elutasítás.
- Container CI: `smoke-deployment.mjs` tényleges TLS PostgreSQL 17/privacy fixture után sudo/root `contabo-funded-upgrade-fixture.py`. Nincs host sudo esetén ez CI-only, nem állítható helyi root PASS.

A root fixture a journal intent, held, post-038 és staged post-check határon külön SIGKILL-próbát és explicit recoveryt futtat. Tényleges fájl/Docker/stop/create/network/expose/death-watch/post-check/recover/lock műveleteket és valódi 037→038 PostgreSQL-migrációt végez. Inert Node HTTP/worker processzek, internal bridge és fix synthetic hitelesítés mellett provider SDK/paid hívás nem fut. Valódi age ciphertext offsite másolása, tamper rejection, memfd identity, config tar hash és külön DB-be single-transaction pg_restore ellenőrzött. A PostgreSQL privacy fixture külön tényleges fizikai snapshot-copyban igazolja a nem-null artifactot, null legacy sort, DTO-kizárást és delete/revoke replayt. A CI proof a futás source/bundle/image/13 check/privacy hash értékeit rögzíti artifactként.

Kifejezett synthetic seam: nonce-os host/project/proxy identity, source Compose render a három inert processzhez, installált systemd identity és külső Access GET és audit/CI release-receipt metadata helyettesítése. A ténylegesen előtte lefutott PostgreSQL privacy fixture digestje itt is valós kötés; az audit-placeholder nem független audit. Ezek nem production target proofok, és az inert worker nem paid minőségmérés. A production kapuk ettől változatlanul tényleges installált source-ot, pinned hostot, DB identityt, friss Cloudflare GET-et és célgépes candidate restore-t követelnek. Független exact-source audit és emberi release-review még kötelező.
