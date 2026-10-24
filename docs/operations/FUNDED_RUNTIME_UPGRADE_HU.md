---
status: active-supporting
owner: engineering
last_updated: 2026-10-24
canonical_parent: NARRATIVE_RELEASE_HU.md
---

# Linux active-funded runtime upgrade — Issue #34

Ez a `scripts/contabo-funded-upgrade.mjs` dedikált Linux útvonala. Nem kezdeti funded aktiválás, owner-zero upgrade vagy általános deployment. A kanonikus kiadási kapuk: [Narrative release](NARRATIVE_RELEASE_HU.md), [Linux operator](LINUX_OPERATOR_HU.md), [backup](BACKUP_HU.md), [recovery](RECOVERY_HU.md). A kód implementációs jelölt; **nem éles kiadási engedély**. N09 továbbra PARTIAL; zárt bétához a kanonikus helyettesítő minőségkapuk, nyilvános/fizetős kiadáshoz a teljes N08 érvényes. A task nem végez production műveletet, migrációt, paid hívást vagy credential-rotációt.

## Megőrzött authority és határ

Az eredeti `personal-beta/prepared.json`, `transition.json` (`applied`), `journal.json` (`exposure-committed`), a terms és a négy eredeti candidate fájl marad az induló funded authority. A futó root-konfigurációnak pontosan ezekkel kell egyeznie. Owner-zero receipt nem helyettesíti őket. Az upgrade nem módosítja e fájlokat; saját `funded-runtime-upgrade/` állapotot használ.

Az első transition támogatott. Már létező upgrade-könyvtár mellett új prepare nincs; nincs rejtett törlés, újratervezés vagy ablakmegújítás. Lejárt, teljes és soha nem alkalmazott előkészítés explicit archiválással rendezhető az alábbi eljárás szerint. Félkész vagy befejezett transition esetén inspection és külön, auditált következő eljárás kell. Többszöri jövőbeli upgrade ciklus nem része ennek a csomagnak.

Változhat az image/source és kizárólag az `ALTERWARD_TAG` env-sor. A teljes renderelt Compose minden más része, providerérték, UUID-lista, eredeti 30 napos start/end, projekt/user maximum, napi/concurrent limit, reader/Access, CA, hálózat és idegen workload változatlan. Az allowance/accounted/reservation/usage és minden meglévő alkalmazástábla sorai hash-sel összevetettek; sem nulla költés, sem üres adatbázis nem előfeltétel. A feltöltött történetminőség-mód/cohort bekapcsolása külön döntés.

## Privilegizált source bundle

A kliens a committed CLI/helper fájlokat import ELŐTT byte szerint ellenőrzi. Linux 0700 checkout, owned 0600 regular input, valós és nem írható idegen ancestor, hardlink/symlink kizárás kötelező. A `fundedSourceBundle` a committed scripts/tests/apps/packages kódot és manifesteket, migrációkat, Compose-forrást és gyökér package/pnpm/tsconfig, Dockerfile és .dockerignore fájlokat hash-eli. Dokumentum nem helyettesít helper hash-t. A kiválasztott image belsejében ugyanazon fájlok hash-e ellenőrzött, mielőtt annak runtime contractját importáljuk.

A SSH-ra küldött Python-modulok: backup, target, owner, owner-activation, owner-upgrade, writer-fence, personal-beta-readers, personal-beta, funded-watchdog, funded-upgrade. Az utolsó kettő dedikált, az owner-zero útvonal nincs broadenolva. A változó `sourceHashes` csak az ellenőrzött committed bundle-ből származik. GitHub CI friss GET és az eredeti hostpin/key kötelező; nincs SSH-config, új identity, forwarding vagy provider/DB/Auth process-env örökítés.

## Release inputok és friss Access-megfigyelés

A meglévő `.local/contabo-release/` privát directoryban új, külön fájlok szükségesek. Történeti receiptet nem írunk át:

- `funded-upgrade-release.json`: `target` és `recovery`, mindkettő `commit`, immutable `imageId`, `imageTag`, rooton tárolt `sourceDirectory` mezővel. Mindkettő a kiválasztott exact source-ból épül, lehet eltérő digest. A régi futó image önmagában nem recovery target.
- `funded-upgrade-audit-proof.json`: `sourceCommit`, `bundleSha256`, `interpretedByOperator: true`, `critical/high/medium: 0`. Csak tényleges független audit és operátori értelmezés után készülhet.
- `funded-upgrade-fixture-proof.json`: a `releaseEvidence` által megkövetelt exact source/bundle/target/recovery, 15 igazolt check és `privacyFixtureSha256`, `paidAiCalls: 0`. A CI proof kizárólag a CI image digestjeire érvényes; eltérő célgépes image-hez új, ugyanahhoz a source-hoz és tényleges digesthez kötött fixture kell. Hash átírása nem fixture.
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

## Lejárt, soha nem alkalmazott előkészítés archiválása

Ha a teljes preparation 900 s érvényessége lejárt, és nincs journal, readback vagy watchdog evidence, az explicit parancs:

```sh
node --import tsx scripts/contabo-funded-upgrade.mjs --archive-expired
```

A kliens a privát `funded-upgrade-prepare-proof.json` pontos hash-ét és friss, csak olvasott Access-megfigyelést küldi. A clean-main/source/SSH és a két operátori lock változatlan. Az installált Daily **v3 archive policy és azonos helper-forrás** előfeltétel; ennek telepítése külön kiadási lépés. Ez a mód nem kér új image-, CI- vagy restore-proofot, mert nem indít átállást.

Csak az eredeti, továbbra változatlan funded konfiguráció és futó szolgáltatások mellett archiválhat. A kilenc kötelező fájl (prepared + két szerep négy-négy runtime fájlja), az opcionális `probe-compose.json` és lezárt `probe.json`, a hash-ek és a private/root jogosultság ellenőrzött. Aktív funded ablak nem szükséges a puszta archiváláshoz: a lejárt eredeti ablakot vagy költségkeretet nem hosszabbítja meg. Félkész prepare, akár egyetlen journal/watchdog/readback fájl, idegen fájl vagy módosult baseline elutasítást jelent; ezekhez ez a parancs nem használható.

A művelet előbb tartós `archive.json` szándékot ír az aktív könyvtárba, majd egyetlen atomikus rename-mel mozgatja azt a `funded-runtime-upgrade-archive/<preparedSha256>/` alá, és fsynceli a könyvtárakat. Az eredeti fájlokat byte szerint megőrzi. A receipt a preparation és az archiváló forrását, a baseline és a fájlok hash-ét, valamint az időpontot köti. Nincs DB-probe/DB-írás, konténerindítás vagy -leállítás, migráció, paid hívás vagy authority-módosítás. A baseline olvasásakor Docker inspect/config történik.

A teljes, tartós intent utáni vagy rename körüli megszakítás után ugyanaz a `--archive-expired` parancs és privát prepare-proof folytatja vagy visszaigazolja a műveletet. Írás közben sérült vagy hiányos receipt esetén zárt állapot és kézi vizsgálat szükséges; bizonyítékot nem törlünk. A megmaradt archíválási szándék blokkolja az apply/recover ágat és a Daily health-et a rendezésig. A teljes archívum önmagában nem aktív upgrade, apply- vagy recovery-authority. A Daily ellenőrzi és a titkosított config backupba foglalja; sérülésre zárva marad. Legfeljebb nyolc archívum megengedett, nincs automatikus törlés. Sikeres archiválás után új prepare csak a normál, változatlan aktív-funded kapukkal lehetséges. Megkezdett transitiont ezzel archiválni tilos; az eredeti candidate explicit recovery útja marad érvényben.

## Megszakadt DB-probe konténer rendezése

Az új frissítő minden DB-probe ELŐTT privát, tartós `probe.json` intentet ír. Ez a forrás commitját és bundle-hashét, a `probe-compose.json` hashét, az immutable image-et és egy véletlen nonce-os konténernevet köti. A Docker one-off ezt a nevet és az intent hashéből származó saját labelt kapja; API-alakú `node` probe, `--rm`, `--no-deps`, `--pull never`, publikus port nélkül. A normál alkalmazásszolgáltatások neve és indítása változatlan.

Normál kilépés, időtúllépés vagy kezelhető jelzés után `finally`-ban történik az egyeztetés. SIGKILL után az explicit parancs:

```sh
node --import tsx scripts/contabo-funded-upgrade.mjs --cleanup-probe
# Megkezdett transitionnél a normál exact-source kapukkal:
node --import tsx scripts/contabo-funded-upgrade.mjs --recover
```

A cleanup a clean main checkoutból, azonos installált Daily v3/source mellett és a két eredeti operátori lock alatt fut. Nem igényel új Access/CI/restore-proofot, nem indít új transitiont. Csak a rögzített név pontos egyezését keresi; a Docker-hiba nem tekinthető hiánynak. Találatnál az immutable ID, image, intent-label, Compose projekt/API/one-off label, node entrypoint/parancs/user, automatikus eltávolítás, `restart=no`, privileged és portkötési határ ellenőrzött. Csak ezután történhet `docker rm --force <ellenőrzött immutable ID>`, projekt- vagy névalapú tömeges törlés nélkül. Az eltűnést friss lekérdezés igazolja; csak ekkor lesz a receipt `cleaned`. A már eltűnt probe egyeztetése és az ismételt cleanup nem indít/leállít alkalmazásszolgáltatást. Sérült evidence, eltérő azonosító vagy sikertelen eltávolítás zárt állapotot hagy.

Az apply a már ellenőrzött candidate mellett, preflight előtt egyeztet. A recover előbb leállítja a három normál szolgáltatást, és csak ezután takarítja a probe-ot: a stop-first védelem nem függ a cleanup sikerétől. Kizárólag a leállítás szereplistája hagyja külön a Compose one-off tagokat; nem állítja le vagy fogadja el őket szolgáltatásként. A serving/stage/held/readback ellenőrzés változatlanul minden negyedik tagot elutasít. Új probe az előző evidence rendezése előtt nem indul. A szerepellenőrzés továbbra pontosan három alkalmazásszolgáltatást követel; ismeretlen negyedik konténert nem hagy figyelmen kívül. Régi, e receipt nélkül indult vagy azonosíthatatlan one-off kézi, külön ellenőrzést igényel; a tool nem fogadja örökbe.

A cleanup nem DB-restore és nem sikeres migrációs/minőségbizonyíték. A `migrate` probe megszakításakor a normál tranzakciós/advisory-lock és következő DB/catalog/drain ellenőrzések döntenek az aktuális állapotról. Nincs schema-downgrade, job-/ledger-törlés vagy providerhívás. Félkész prepare evidence megmarad; a cleanup önmagában nem engedélyezi újra a prepare-t. Az alkalmazás vagy a probe létrejöttének bizonytalan, sérült állapota továbbra kézi vizsgálatot igényel.

A Daily a pending probe-ot nem egészségesnek jelzi. A receipt és a hozzá kötött konfiguráció a finite titkosított config backup része; az immutable candidate restore-kapu továbbra a kilenc candidate-fájlt köti, a változó probe-state-et nem teszi apply-authorityvé. Lejárt preparation csak `cleaned` probe-recorddal archiválható; az archívum a receiptet és configot is byte szerint megőrzi. A cleanup saját privát operátori proofot ment.

## Explicit v9 kiadási konfiguráció — 2026-10-24

A privát `selection.json` változatlan `target` és `recovery` buildjei mellé opcionális `runtime` kerülhet. Hiányában nincs új cohort vagy generációváltás: az image-only út megmarad. Példa, kizárólag szintetikus azonosítókkal:

```json
{
  "mode": "narrative-fiction-v2",
  "generation": "v9",
  "cohortUserIds": ["00000000-0000-4000-8000-000000000001"],
  "timeoutMs": 300000,
  "maxRequestBytes": 131072
}
```

Ez a blokk a `selection.runtime` értéke, nem teljes selection vagy jóváhagyott éles beállítás. A Node-kliens és a root-helper is szigorúan ellenőrzi a mezőket: v9/fiction-v2, 1–10 egyedi UUID, 1000–300000 ms és 100000–196608 B. Root-oldalon a cohort az **eredeti funded admission részhalmaza** kell legyen. Mindkét image ugyanazt a kiválasztást kapja; a prepare az immutable fájlhash-ekbe és a release-bizonyítékba köti, apply/recover alatt nem módosítható. A helyreállítás kompatibilis image-et indít ugyanazon DB-n; nem lép vissza v8-ra egy v9 történet fölött.

Csak a két `NARRATIVE_*` mód/cohort mező, a `NARRATIVE_FICTION_GENERATION`, valamint a worker fiction timeout/cap változhat explicit kiválasztással. Budget/window/provider/admission/access/hálózat és minden más env/config mező változása továbbra tiltott. A Compose új default mezőit (legacy/üres cohort/v8/180000 ms/100000 B) a régi renderhez szemantikailag egyeztetjük; eltérő nemdefault értéket nem rejt el az összehasonlítás. API és worker ugyanazt a generációt/cohortot kapja; a web nem kap generációválasztást. A Daily monitor ezek egyezését, a meglévő admissiont és a határokat is ellenőrzi. A változás nem telepít új Daily-t a szerverre: az exact-source újratelepítés megmaradó kiadási kapu.

A CI root/Docker fixture inert szolgáltatásokkal ugyanezt a v9 kiválasztást viszi végig a target és recovery ágon; a Docker env és az eredeti költség/window-authority visszaolvasása része a próbának. Ez nem valódi provideres minőségmérés vagy production target proof. A kliens CI-hash-e a futás `id`, `head_sha`, `run_attempt`, `status`, `conclusion` mezőit köti, id szerint rendezve; az `updated_at`/actor/sorrend nem akadályozhatja a recoveryt, új futás/próbálkozás viszont új bizonyíték.

## Drain, schema és frozen policy

A hat job-queue pending/validating/running és lease oszlopai, draft review, generating branch, reserved/unknown vagy settlement nélküli budget reservation és aktív idegen DB-session tiltja az upgrade-et. A kikapcsolt narrative flag nem drain. A már bound-ready ingyenes commit a meglévő, felülvizsgált alkalmazásútvonalon, az upgrade ELŐTT fejezhető be. A tool nem töröl/cancel/manual-settle jobot, nem nulláz számlálót és nem ír át frozen payloadot.

A v9 capability ellenőrzi a qualityPolicy 2.8.0-t, a 2.0.0 fiction artifact és az 1.0.0 karakterállapot támogatását is. A tárolt v9 artifact a karakterdeltával és kötéseivel együtt strict parse-on megy át; hiányzó delta esetén a frissítés elutasított, nem dobjuk el a történetállapotot.

A `captureFundedRuntime` az ismert 037 vagy 038 migrációs checksum-prefixet és strict security catalogot fogadja el. A név szerint külön `assertFundedPre038SecurityCatalog`/`assertReviewedFundedPre038Schema` kizárólag az ismert 855 oszlopos baseline-t engedi; a normál recovery-guard változatlanul a 856 oszlopos 038 baseline-t követeli. Nincs caller által megadható tetszőleges schema-fingerprint, artifact eldobás vagy generikus downgrade.

A két image tényleges contracts-kódja értelmezi a legacy/context policyt, a planner/writer v1–v3 kilenc párosítását, a reviewed max-8 policyt és mind a tíz `narrative-fiction-v2` generációt (v1–v9, köztük v6/quality2.5; összesen 19 felsorolt policy); a review marker max-7 elutasított. Tárolt policy (job payload, checkpoint és 038 artifact policy) és a 038 artifact (1.0.0 és 2.0.0) strict parse történik. Ismeretlen frozen revision vagy forrásonként >1000 elemű inventory külön elemzést igényel, nincs átírás. A null artifact legacy period olvasható marad; a publikus és normál life DTO nem kap új artifact mezőt. A saját export meglévő privát artifact-szerződése változatlan.

## Backup és recovery

Az installált Daily új `FUNDED_UPGRADE_ARCHIVE_POLICY_VERSION = 3` és exact-source hash-e külön release gate. A régi reader/personal policy nem kap új értelmezést. A finite encrypted config whitelist hozzáadja a két runtime-directoryt, prepared/journal/readback/probe-compose/probe/watchdog fájlokat és legfeljebb nyolc megszakadt atomikus temporary fájlt. Ismeretlen név, alias, hardlink vagy public mode elutasított. A providerértéket tartalmazó config csak a meglévő titkosított config-archívumba kerülhet.

Az apply ugyanazt az installált-source Daily kaput használja: friss, candidate UTÁNI archívum; mindkét ciphertext hash+méret; offsite copy/decrypt/transactional isolated restore; DB row és config hash; cleanup és memória-only decrypt identity. Az új kilenc immutable candidate fájl hash-e is kötelező. Az új exact-image/source privacy fixture digest nélkül egy régi általános restore-proof nem elég. A Daily install, célgépes immutable build, fixture és a rövid candidate-ablakon belüli backup/restore végrehajthatósága éles kiadás előtti kapu; ez a task ezeket nem hajtja végre és nem hamisít hozzájuk receipteket.

Recovery **az aktuális adatbázison**, a már prevalidált, schema-038/policy/artifact kompatibilis image-dzsel történik. Régi DB-snapshot live visszaállítása tilos: az újabb privacy authority, költés és usage elveszne. A kanonikus restore továbbra quarantine, delete/revoke replay, paid-disabled és service activation nélkül. Ez a task nem változtatja meg.

Catchable hiba scoped stopot és tartós `closed` vagy `stop-unverified` journal sort hagy; nincs automatikus fallback vagy alkalmazás-újraindítás. SIGKILL/pipevesztés vagy 900 s operátori időkorlát esetén a külön death watch a rögzített három ID-t állítja le, és megőrzi a régi állapotokat, `watchdog-stop-intent`/záró sort és watchdog-bizonyítékot. Staging alatt host reboot után a `restart=no` akadályozza meg az automatikus servinget. Recovery előtt az esetleges részben exponált saját szolgáltatások leállnak, utána fresh authority/capability/backup/drain ellenőrzés szükséges. A recovery nem hosszabbítja az eredeti ablakot, és lejárat után sem finanszíroz újat. Befejezett `applied/recovered` journal nem játszható újra. Upgrade-state jelenlétében a régi reader/funded emergency disable továbbra stop-first, de az eredeti owner-zero image újraindítását a közös `restore_zero` elutasítja: a szolgáltatások held állapotban maradnak. Befejezett upgrade utáni külön shutdown/restart vagy következő kiadási ciklus felülvizsgált operátori eljárást igényel, az eredeti activation nem játszható újra. A hash-chained journal 32 sort, a watchdog history nyolc bejegyzést enged; a limitnél megőrzött state és kézi elemzés kell, nem evidence-törlés.

## Ellenőrzés és fixture-határok

- `tests/funded-runtime.test.ts`: tényleges PGlite catalog/migration/ledger/Auth/reservation, strict normál recovery és dedikált pre-038 guard.
- `tests/ops/test_funded_upgrade.py`: orchestration fault-mátrix, finite archive, valamint root-only tényleges fsync/atomic/hash-chain/private-file tesztek.
- `tests/ops/funded-upgrade.test.mjs`, `funded-access.test.mjs`: exact-source audit/CI/image/fixture shape és GET-only Access / unsafe policy elutasítás.
- Container CI: `smoke-deployment.mjs` tényleges TLS PostgreSQL 17/privacy fixture után sudo/root `contabo-funded-upgrade-fixture.py`. Nincs host sudo esetén ez CI-only, nem állítható helyi root PASS.

A root fixture a journal intent, held, post-038 és staged post-check határon külön SIGKILL-próbát és explicit recoveryt futtat. Tényleges fájl/Docker/stop/create/network/expose/death-watch/post-check/recover/lock műveleteket és valódi 037→038 PostgreSQL-migrációt végez. Inert Node HTTP/worker processzek, internal bridge és fix synthetic hitelesítés mellett provider SDK/paid hívás nem fut. Valódi age ciphertext offsite másolása, tamper rejection, memfd identity, config tar hash és külön DB-be single-transaction pg_restore ellenőrzött. A PostgreSQL privacy fixture külön tényleges fizikai snapshot-copyban igazolja a nem-null artifactot, null legacy sort, DTO-kizárást és delete/revoke replayt. A CI proof a futás source/bundle/image/15 check/privacy hash értékeit rögzíti artifactként.

Kifejezett synthetic seam: nonce-os host/project/proxy identity, source Compose render a három inert processzhez, installált systemd identity és külső Access GET és audit/CI release-receipt metadata helyettesítése. A ténylegesen előtte lefutott PostgreSQL privacy fixture digestje itt is valós kötés; az audit-placeholder nem független audit. Ezek nem production target proofok, és az inert worker nem paid minőségmérés. A production kapuk ettől változatlanul tényleges installált source-ot, pinned hostot, DB identityt, friss Cloudflare GET-et és célgépes candidate restore-t követelnek. Független exact-source audit és emberi release-review még kötelező.

## Ismert nyitott korlátok (a független audit előtt döntendők)

- **Registry és receipt:** az apply után az új image nem szerepelhet a saját commitja `deploy/reviewed-recovery-images.json` fájljában. A fence/recovery eszközök receiptjei (`owner-stage-proof`, active build proof) csak egy követő commit registry-bejegyzése után egyeznek az új runtime-mal; ezt a csomag nem végzi el.
- **`applied` utáni restart policy:** az `applied` sor a restart policy visszaállítása ELŐTT tartós; egy késői hiba a verifikált stacket is lezárja és `--recover` kell. Ez szándékos (újraindulás nem indíthat ellenőrizetlen állapotot), de a sorrend külön döntés tárgya.
- **Compose one-off konténer — implementálva 2026-10-24:** intenthez és immutable Docker-azonossághoz kötött cleanup normál/timeout/jelzés ágban; SIGKILL után explicit `--cleanup-probe`, illetve apply/recover előtti egyeztetés. Az új forrás saját CI/review szükséges; receipt nélküli régi/ismeretlen konténer továbbra kézi ellenőrzés.
- **Lejárt, soha nem alkalmazott preparation — implementálva 2026-10-24:** explicit, hash-hez kötött `--archive-expired`, titkosított backup és megszakítás utáni folytatás; részletek fent. Az új forrás root/Docker CI-próbája és független review-ja szükséges, célgépre nincs telepítve.
- **`ciSha256` — javítva 2026-10-24:** stabil futásazonosító/eredmény mezőkre kötött hash; módosuló metaadat nem okoz driftet. A valódi új futás/próbálkozás továbbra új review-bizonyítékot igényel.
- **Recovery restore-proof frissesség:** a `--recover` ugyanazt a 3600 s-nél frissebb offsite restore proofot követeli, míg a funded oldal áll.


### Kiadási triage az integráció után — 2026-10-24

A fenti történeti korlátok nem új motorfeladatok. A CI-metaadat hibája e csomagban javított. Az applied utáni ellenőrzési hiba zárt állapotot és explicit recoveryt eredményez; ez megtartott biztonsági viselkedés, nem automatikus rollback. A lejárt soha nem alkalmazott preparation külön archiválási útja implementált, saját CI/review szükséges. A one-off lifecycle külön intent/cleanup útja is implementált, saját CI/review szükséges. A registry/receipt-folytonosság és a hosszabb leállás alatti friss restore-proof végrehajthatósága még **éles apply előtti operátori lezárás**. Nem állítunk rájuk PASS-t attól, hogy a v9 compatibility és a helyi unit tesztek sikeresek. Következő review ezek konkrét frissítés/helyreállítási útjára szorítkozik; új irodalmi iteráció nem része.


### Integrációs ellenőrzések — 2026-10-24

Lokális typecheck, build, schema export, format és docs ellenőrzés PASS. Teljes Vitest: **127 fájl / 1465 teszt PASS**, `--maxWorkers=2` (496,46 s). A célzott v9 worker 40/40, funded-runtime 10/10 PASS; az új artifact-teszt valóban beszúr egy immutable v9 artifactot, és hiányzó karakterdeltával elutasítást vár. A teszt előkészítésének korábbi hibái (nem létező period UPDATE-je, majd immutable canon UPDATE) az insert-alapú fixture javításával rendezve, termékguard-módosítás nélkül.

A teljes operátori Node-kör **99/99 PASS**. Végső Python-kör **351 teszt: 340 PASS, 11 SKIP** (rootjog/külön környezet szükséges). A nem admitted cohort már a preparation könyvtár létrehozása előtt elutasított, ezt új negatív teszt ellenőrzi; e Python-hardening után a teljes Python-kör ismét lefutott. A teljes Vitest-kört ezután nem számoljuk újrafutottnak. A helyi sudo no-new-privileges miatt nem használható; nem állítunk helyi root-fs/Docker rehearsal PASS-t, és a CI-only fixture guardját nem kerüljük meg. A Docker compose deployment-preflight PASS, application konténerindítás és valódi credential nélkül; a zárt production web lokális smoke-ja 19/19 HTTP PASS, live credential és paid hívás nélkül. Az integráció `98ae2db5893cc8f69ea8ad12bc83fcba3476fd97` forrásának [Verify és Container CI-je](https://github.com/Muzsy/future_flow/actions/runs/40086092008) sikeres, beleértve a root/PostgreSQL frissítés–megszakítás–recovery fixture-t. Ez az előző integráció bizonyítéka; az archiválási kiegészítés új commitjához új CI szükséges.

Az archiválási `d9ad91e` forrás [Verify + Container CI-je](https://github.com/Muzsy/future_flow/actions/runs/40099566826) SUCCESS, mindkét job, 127 fájl / 1465 alkalmazásteszt, 9/9 root funded fájlteszt és tényleges Docker-archiválás/frissítés/recovery. Az archiválási kiegészítés helyi operátori ellenőrzése: **356 Python-teszt: 345 PASS / 11 SKIP**, **99 Node ops PASS**, scripts TypeScript PASS. Öt új, tényleges ideiglenes fájlokkal futó teszt fedi a byte-megőrzést, a friss/megkezdett preparation elutasítását, az intent/rename megszakítását, a jogosultság/hash/baseline driftet és a kapacitás/tamper határt. A CI ezek öt tesztjét a négy meglévő journal teszttel rootként, skip nélkül futtatja. A Docker fixture a szintetikus órát lépteti 901 s-cel, az immutable preparation átírása nélkül; az archiválás előtt/után valódi konténerazonosságot, schema-037/DB/ledger azonosságot és Daily health-et követel. E kiegészítés exact-commit CI-eredménye a [#70 PR-ben](https://github.com/Muzsy/future_flow/pull/70) követendő; helyi root/Docker PASS nem állítható.

A one-off kiegészítés helyi operátori köre: **363 Python-teszt: 352 PASS / 11 SKIP**, **99 Node ops PASS**. Hét új teszt ellenőrzi az immutable ID szerinti cleanupot, a már hiányzó konténer egyeztetését, a más identitású konténer védelmét, source/config/jogosultság driftet, a daemon/eltávolítás hibáját és timeout/jelzés után a finally ágat. A root/Docker fixture a production lifecycle-t inert Node payloadra alkalmazza: normál kilépés, valódi subprocess-timeout, majd külön operátori child SIGKILL és explicit cleanup. A serving ID-k, futás, eredeti fájlok és DB/ledger változatlansága kötelező. A Node payload külön synthetic seam; az adatbázis és migráció ellenőrzése a meglévő valódi PostgreSQL companionban marad. Az új exact-commit CI eredménye a #70 PR-ben követendő.

A független exact-source audit, registry/receipt és restore-frissesség lezárása, telepített Daily/privát monitor helyreállítása, célgépes backup/restore és a jóváhagyott tesztelői paid E2E továbbra éles kiadás előtti feladat. Ebben az integrációban nincs main merge, production módosítás vagy modellhívás.
