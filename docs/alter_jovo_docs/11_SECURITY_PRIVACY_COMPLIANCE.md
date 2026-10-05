# alterward — biztonság és adatkezelés

**Aktuális állapot (2026-10-04):** P01–P05 privát v2 mag kész; valódi Auth/AI HTTP- és böngészős próba, export, Auth/DB-törlés és kontrollált megszakításból recovery sikeres. P07 új angol minta Sonnet auditja és P08 privát feedback/session-mérés kész; használói minőség kiadás után mérendő. Kizárólag angol indulás, magyar elrejtve. P09 tulajdonosi előnézeti alap, AI-pre-screen és szerkeszthető privát Privacy/Content Preview kész; fizetett scan-job, publishing/Discovery/Official seed/public fork tervezett. [Közös státusz és bizonyíték](../STATUS_HU.md), [indulási döntés](../ENGLISH_RELEASE_PLAN_HU.md). [Contabo-előkészítés](../CONTABO_PREPARATION_REPORT_HU.md) és teljes izolált web/API/worker/proxy CI sikeres; éles deploy, backup/restore, valós DB-kiesésből recovery és email-kézbesítés még nyitott.

**Shared állapot:** S0–S2 és S3 személyes/time/Connections/safety/privacy implementált; teljes kétfiókos Auth/Shared AI/saját AI/export/törlés/recovery sikeres. 001–013 alkalmazva, normál Shared flag-ek false. Nyers/backup-retention, régi személyes próza, billing/grace/deadline és friend release még kapu; P09–P13 és S4–S7 megmarad. [Aktuális bizonyíték](../SHARED_CONTEXT_S3_PRIVACY_AUTH_REPORT_HU.md).

2026-10-05 · Termék- és mérnöki követelmények, nem igazolt jogi megfelelőségi nyilatkozat. [Setup](../SETUP.md) · [Public részletek](../PUBLIC_CONTENT_IMPLEMENTATION_PLAN_HU.md) · [P06/P13](../NEXT_STEPS.md).

## Meglévő védelem

Supabase Auth token szerveroldali `getUser` ellenőrzése, objektumszintű tulajdonosi ellenőrzés, RLS és anon/authenticated közvetlen táblahozzáférés tiltása. UUID ismerete nem jogosultság. Export és törlés friss tényleges JWT AMR-hitelesítést kér, tokenfrissítés önmagában nem elég. A törlés deleting státusz/lease visszavonás → Auth-törlés → belső adatgráf törlése; Auth-hibánál csak bizonyítottan meglévő Auth-fiók áll vissza aktívra. Bizonytalan Auth esetén deleting marad; durable marker és recovery parancs kezeli az Auth-siker utáni DB-hibát. [Runbook](../ACCOUNT_DELETION_RUNBOOK_HU.md).

Kulcs csak szerveroldalon, titkos helyi `.env`/projekten kívüli védett mappa; publishable key külön. TLS CA és host ellenőrzés, raw profil/prompt/token/jelszó nincs normál logban. CORS/rate-limit és requestId adott kódból ellenőrizendő; reverse proxy/nyilvános host külön konfiguráció. Nyelvváltás nem változtat ownershipt/canont.

## Termékszabály

Minden saját élet privát. Privát működés, adathozzáférés és törlés nem prémium. 18+ indulás, adatminimalizálás és álnevek. AI-tartalom és lehetséges forgatókönyv röviden jelölt; nincs megjósolt százalék vagy jelentős valós joghatású döntés. Nem klinikai teszt, pénzügyi/egészségügyi autoritás, félelem alapú upsell vagy manipuláló streak.

## Public határ — kötelező fejlesztendő védelem

- Külön allowlistes PublicSnapshot és fork-checkpoint; raw profil/memória/prompt/privát state/note/audit és eredeti belső ID nem adható ki.
- PII scan + Privacy Preview + teljes Content Preview + hash/revision/scanverzióhoz kötött Confirm. Harmadik személy adata nem lesz a szerző választásától kiadható. Scan nem anonimitási garancia.
- Private/unlisted/public. Unlisted erős bearer-token, hash tárolás, napló/referer kizárás, noindex és listákból kizárás. Tokenváltás a régit megszünteti.
- Publication/moderation státusz minden kiszolgálás és fork előtt; revoke/hide/remove a cache mellett is érvényes. OG/sitemap/Discovery nem szivárogtathat.
- Unpublish és törlés az összes saját public projekcióra/index/cache/token/save/attribution elemre kiterjed; aktív worker nem írhat vissza. Érzékeny másolatok takarítása külön gate.
- Report dedup/rate-limit, védett jelentőadat, indokolt moderator szerep és audit. Official badge nem kliensflag.

## Adatáramlás és indulási függőségek

Az alkalmazás Supabase-ban tárol, OpenAI-nak feladathoz szükséges kontextust küld. `store:false` nem általános nulla retention garancia. Indulás előtt ellenőrizendő és dokumentálandó a tényleges szolgáltatói adatáramlás/régió/retention/DPA/subprocessor, feature-önkénti jogalap és értesítési szöveg, optional analytics/marketing/publication kezelése. Az alpha-privacy-v1 nem végleges tájékoztató.

Adattípusonként retention, backup törlési életciklus, restore-próba, support/admin minimum hozzáférés, incidenskapcsolat, kulcsrotáció és helyreállítás kell. A profilozás/személyes adatok miatt a megfelelő jogi besorolás és hatásvizsgálat szükségessége launch előtt felülvizsgálandó; itt nincs frissen ellenőrzött jogszabályi határidő vagy megfelelőségi állítás.

## Release-kapu

Auth/ownership/immutable canon/export/törlés és public privacy kapuk **minden esetben** sikeresek legyenek; narratív 18/20 vagy átlagos élménypont nem enged adatvédelmi hibát. Valódi szintetikus Auth-admin/HTTP- és böngészős végigpróba, export, Auth/DB-törlés és kontrollált megszakításból recovery sikeres. Worker-törlési/lease verseny tesztelt. Valós DB-kiesésből recovery, backup/restore és a későbbi public permission/cache/token/PII próbák még külön kapuk; a privát siker nem igazolja a nyilvános folyamatot.

Contabo: új kulcsos SSH kipróbálva, jelszavas/root-password hozzáférés tiltva; root kulcsos belépés megmarad. Konfiguráció/proxy-storage védetten mentve, a másolatok hash-e egyezik. Teljes restore, Docker/Tailscale-kompatibilis tűzfal, TLS/storage és egyeztetett karbantartás még szükséges. [Pontos operatív határ](../CONTABO_PREPARATION_REPORT_HU.md).

## Shared consent, törlés és másik tag védelme

Secure egyhasználatos token, explicit branchválasztás/adatmegosztás, minimum InteractionProfile. Saját intent nélkül nincs más privát pénzügyi/munka/érzelmi döntése. Block/report/leave, anon outsider és cross-member DTO/prompt/export tesztek friend release előtt kötelezők. Törlés leválasztja/anonymizálja a tagot, nem törli mások közös canonját; próza-redakció és backup-retention külön ellenőrzendő. Shared-adatos public snapshot más tagot általánosít; identifiable multiparty kiadás csak S7 consenttel.

[Shared integráció és elfogadások](../SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) · [Változatlan forrás](../plans/README.md).

## S2 implementációs kiegészítés

S2 completed input rögtön törlődik; deleting marker a failed/cancelled snapshots/checkpointot is scrubolja, korábbi left tag alapján is. Receipt csak hash/token/model/meta. Retained shared prose redakciója, teljes Auth/AI deletion és moderation továbbra S3 kapu; négy flag false. [Részletes riport](../SHARED_CONTEXT_S2_REPORT_HU.md).


## S3 személyes integráció — 2026-10-05

Új saját memória RLS/anon/authenticated tiltással, own exporttal és account cascade-del. Másik tag privát input/intent nem exportálható. Retained szabad próza/PII és moderation teljes ellenőrzése továbbra kiadási kapu; a korábbi left tag fizikai törlésének túl széles job-cancellationje javítandó a 009 átírása nélkül. [Részletes bizonyíték és korlátok](../SHARED_CONTEXT_S3_REPORT_HU.md).


## Shared S3: Connections és biztonság — 2026-10-05

Angol Connections, block/report/moderáció és 011/012 elkészült; ezek dátumozott korábbi bizonyítéka megmarad. A későbbi privacy/Auth szelet felülírja az akkori „megjelenítési döntés/full Auth még hiányzik” státuszt: S0–S2 és S3 személyes/time/Connections/safety/privacy implementált; teljes kétfiókos Auth/Shared AI/saját AI/export/törlés/recovery sikeres. 001–013 alkalmazva, normál Shared flag-ek false. Nyers/backup-retention, régi személyes próza, billing/grace/deadline és friend release még kapu; P09–P13 és S4–S7 megmarad. A felhasználó az érintett közös szöveg elrejtését, a dátum és eredmény megtartását választotta. Új 013 stale-input cancellation és explicit friss retry; a P09 előnézet külön Shared privacy review-t kér. [Részletes megvalósítás, költség és korlát](../SHARED_CONTEXT_S3_PRIVACY_AUTH_REPORT_HU.md).


## 2026-10-05: P09 privát AI-review

[P09 operatori pre-screen](../PUBLIC_AI_REVIEW_REPORT_HU.md): zárt angol copy, minimális problémakategória, 014 privát RLS-tábla, hash/revision/policy/receipt kötés és egyszeri futás. Saját olvasási API, account export/cascade törlés és régi DB-export kompatibilitás ellenőrzött; Shared-előzmény tiltva. 311 helyi teszt, 44 schema (42 korábbi változatlan), egy valódi Sol-negatív kontroll öt jelzéssel. A privát Privacy/Content Preview kész; fizetett scan-job, curator/Publication/Confirm és public release még külön kapu.


## 2026-10-05: szerkeszthető privát Privacy/Content Preview

A [privát angol szerkesztő](../PUBLIC_PREVIEW_EDITOR_REPORT_HU.md) elkészült: saját forrásszöveg, mezőszintű ingyenes preflight, idempotens immutable mentés, legutóbbi érvényes copy visszatöltése és teljes mentett tartalomnézet. Az operatori AI-review csak a megfelelő hash/revision és mezőkészlet mellett látható; finding a javítandó mezőre mutat. Mentés/olvasás nem hív AI-t, Shared-előzmény és HU továbbra tiltott. Helyi teljes check: 314 teszt/27 fájl, 48 séma, a korábbi 44 és 001–014 változatlan. Következő a külön fizetett scan-job költségőrrel, curator/ScenarioVersion/sanitized fork-checkpoint/Publication/Confirm; majd P10–P13. Éles bekötés továbbra nincs.


## 2026-10-05: P09 review-job integráció

A felületről indítható P09 fizetett AI-review elkészült: explicit hozzájárulás, tartós queue/lease, egy attempt/immutable copy, közös projekt/user költségőr, egy pending job/user és gördülő napi kvóta. Újraolvasás/dupla kérés ingyenes, elveszett lease és provider-hiba nem indít automatikus fizetett retryt. 015 alkalmazva/ismételve a fejlesztői DB-n; English/Shared/tulajdonosi/hash/revision kapu és export/törlés integrált. Main CI sikeres: 324 teszt/28 fájl, 50 séma; a korábbi 48 és 001–014 változatlan. A normál feature false, éles allowance 0; publicationApproved false. Következő curator/ScenarioVersion/sanitized fork-checkpoint/Publication/Confirm/Official seed, majd P10–P13; S3 retention, S4–S7 és Contabo/Cloudflare élesítés megmarad. [Aktuális riport](../PUBLIC_REVIEW_JOB_REPORT_HU.md).


## 2026-10-05: P09 text-curation állapot

A P09 tulajdonosi beküldés és trusted text-curation nyilvántartás elkészült: explicit consent, aktuális immutable copy és no_findings AI-review, idempotens beküldés, védett operatori lista/döntésfájl, egyszeri változatlan döntés, English/Shared/ownership/revision/hash/expiry/törlés kapu, export/cascade és 016 RLS-migráció. Scope text_only, publicationApproved false. Teljes ScenarioVersion/sanitized fork-checkpoint és azok ellenőrzése, Publication/Confirm/Official eredetengedély/seed még hátravan; majd P10–P13. Main CI `4d66981` sikeres: 336 teszt/29 fájl, formázás, típusellenőrzés, API/worker/Next production build és 52 séma-drift. Izolált valódi PostgreSQL/TLS: 001–016 + ismétlés, párhuzamos curation-submit és versengő döntés → egy nyertes, azonos apply újrahasználata, revision/törlés/RLS/export/cascade és publication=false; minden korábbi P09/S0–S3 proof megmarad. Konténeres web/API/worker/Caddy verified HTTPS/DB TLS, üres queue és tiszta worker-leállás, nulla provider-AI/valódi CI-kulcs, egress tiltva. [Main CI](https://github.com/Muzsy/future_flow/actions/runs/37358126556). 52 séma, a korábbi 50 és 001–015 változatlan; fejlesztői DB 001–016 alkalmazva/ismételve, 19 ff_ és 36 aw_/36 RLS. Új AI-hívás nincs; a közös OpenAI/Claude keretek, S3 retention/S4–S7 és Contabo/Cloudflare kapuk megmaradnak. [Aktuális riport](../PUBLIC_TEXT_CURATION_REPORT_HU.md).


## 2026-10-05: P09 ScenarioVersion állapot

A P09 teljes angol ScenarioVersion foundation elkészült: külön zárt scenario-1 sablon, immutable/hash/verziózott saját tárolás, friss belső ID-k és teljes cél/állapot/korlát-hivatkozások, explicit indításból normál AI-job és közös kvóták, export/cascade. 017 alkalmazva/ismételve, 19 ff_ és 39 aw_/39 RLS; 354 helyi teszt/30 fájl és teljes check/build, 57 séma, a korábbi 52 és 001–016 változatlan. Két valódi szintetikus Auth/DB HTTP-fiók: ownership/anon, verzió/replay/start és három technikai időszak, export/tényleges törlés sikeres; új paid AI 0. Normál/deploy SCENARIO_VERSIONS_ENABLED=false, publicationApproved=false, saját előkészítő API, scenario UI/public permission még nincs. Következő sanitized fork-checkpoint, teljes structured preview/review, Publication/Confirm/Official seed, majd P10–P13. A három forrás minden követelménye, 50–100 élet/20–30 scenario cél, külön 5–5 USD keret, S3 retention/S4–S7 és Contabo/Cloudflare kiadási kapuk megmaradnak. [Aktuális riport](../SCENARIO_VERSION_REPORT_HU.md).
