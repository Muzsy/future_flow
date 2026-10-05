# alterward — források és referenciák

**Aktuális állapot (2026-10-04):** P01–P05 privát v2 mag kész; valódi Auth/AI HTTP- és böngészős próba, export, Auth/DB-törlés és kontrollált megszakításból recovery sikeres. P07 új angol minta Sonnet auditja és P08 privát feedback/session-mérés kész; használói minőség kiadás után mérendő. Kizárólag angol indulás, magyar elrejtve. P09 tulajdonosi előnézeti alap, AI-pre-screen és szerkeszthető privát Privacy/Content Preview kész; fizetett scan-job, publishing/Discovery/Official seed/public fork tervezett. [Közös státusz és bizonyíték](../STATUS_HU.md), [indulási döntés](../ENGLISH_RELEASE_PLAN_HU.md). [Contabo-előkészítés](../CONTABO_PREPARATION_REPORT_HU.md) és teljes izolált web/API/worker/proxy CI sikeres; éles deploy, backup/restore, valós DB-kiesésből recovery és email-kézbesítés még nyitott.

**Shared állapot:** S0–S2 és S3 személyes/time/Connections/safety/privacy implementált; teljes kétfiókos Auth/Shared AI/saját AI/export/törlés/recovery sikeres. 001–013 alkalmazva, normál Shared flag-ek false. Nyers/backup-retention, régi személyes próza, billing/grace/deadline és friend release még kapu; P09–P13 és S4–S7 megmarad. [Aktuális bizonyíték](../SHARED_CONTEXT_S3_PRIVACY_AUTH_REPORT_HU.md).

2026-10-05 · Ez belső forrásjegyzék és tájékozódási linkkatalógus. Nem friss ár-, piaci vagy jogi kutatási jelentés; változó külső állítást új döntés előtt ellenőrizni kell.

## Elsődleges projektforrások

- [Pozicionálás/célmeghatározás](../PROJECT_POSITIONING_AND_GOAL_DEFINITION_HU.md), [Public Lives/Discovery/Community](../PUBLIC_LIVES_DISCOVERY_COMMUNITY_SPEC_HU.md): a két felhasználói forrás, teljes és változatlan.
- [Aktív termékterv](../PRODUCT_PLAN_HU.md), [P01–P13 backlog](../NEXT_STEPS.md), [döntési napló](16_DECISIONS_AND_OPEN_QUESTIONS.md), [követelménymátrix](../REQUIREMENTS_TRACEABILITY_HU.md): elfogadott integráció és felülírások.
- [Implementáció](../IMPLEMENTATION.md), [státusz/keret](../STATUS_HU.md), [v2 szerződés](../V2_SIMULATION_CONTRACT_HU.md), [lokalizáció](../LOCALIZATION_HU.md), [setup](../SETUP.md): kóddal összevetett tények és határok.
- [AI-ellenőrzés](../AI_VALIDATION.md), [modellvizsgálat](../AI_MODEL_ROUTING_HU.md), [minták](../examples/README.md): dátumozott mérések; a 2026-10-02-i árakat nem nevezzük újraellenőrzött aktuális ajánlatnak.
- [V0.1 archívum](../archive/README.md): az eredeti témacsomag és ZIP, történeti javaslatokkal.

## Hivatalos technikai referencia

- [Next.js App Router](https://nextjs.org/docs/app), [NestJS](https://docs.nestjs.com/), [Nest OpenAPI](https://docs.nestjs.com/openapi/introduction).
- [Supabase Auth](https://supabase.com/docs/guides/auth), [getUser](https://supabase.com/docs/reference/javascript/auth-getuser), [JWT fields](https://supabase.com/docs/guides/auth/jwt-fields).
- [PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html), [SELECT/SKIP LOCKED](https://www.postgresql.org/docs/current/sql-select.html).
- [OpenAI Responses](https://developers.openai.com/api/docs/guides/text), [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [token counting](https://developers.openai.com/api/docs/guides/token-counting), [pricing](https://developers.openai.com/api/docs/pricing).
- [OpenAPI specification](https://spec.openapis.org/oas/).

## Indulási adatkezelési felülvizsgálat kiinduló forrásai

- [European Commission — adatvédelmi elvek](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/principles-gdpr_en).
- [European Commission — AI regulatory framework](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai).

Ezek a címek az indulási felülvizsgálat kiindulópontjai, nem már elvégzett megfelelőségi ellenőrzések. A források piaci példái az ötlet hátterét adják; versenytársi bevétel, vásárlási hajlandóság, domain vagy védjegy nincs ezzel igazolva.

## Claude-méréshez ellenőrzött elsődleges források (2026-10-03)

- [Árlista](https://platform.claude.com/docs/en/about-claude/pricing)
- [Modellek](https://platform.claude.com/docs/en/models/overview)
- [Ingyenes tokenszámlálás](https://platform.claude.com/docs/en/build-with-claude/token-counting)
- [Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- [Prompt cache](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- [Thinking/effort és költség](https://platform.claude.com/docs/en/build-with-claude/thinking-steering-and-cost)

Projektbizonyíték: [Claude ár/érték riport](../CLAUDE_MODEL_EVALUATION_HU.md).

## Telepítési és üzemeltetési bizonyíték

[Contabo audit](../CONTABO_SERVER_AUDIT_HU.md), [végrehajtott előkészítés](../CONTABO_PREPARATION_REPORT_HU.md), [telepítési útmutató](../DEPLOYMENT_HU.md) és [teljes runtime CI](https://github.com/Muzsy/future_flow/actions/runs/37194453326). Külső útmutatók: [Docker Compose production](https://docs.docker.com/compose/how-tos/production/), [Docker hálózat/tűzfal](https://docs.docker.com/engine/network/packet-filtering-firewalls/), [Caddy HTTPS](https://caddyserver.com/docs/automatic-https).

## Harmadik felhasználói forrás — Shared Context

A változatlan docs/plans csomag tartalmazza az eredeti ZIP-et, 15 témadokumentumot, mastert, manifestet és SHA256SUMS-t. Mind a 17 checksum egyezik, a master a fejezetek teljes összefűzése. Alapcommit b75e61d, dátum 2026-10-04; aktív értelmezés a Shared terv és ADR-023. Az AI nélkül/PR/EN-HU/lock/retention eltérések nyíltan pontosítva, a forrást nem szerkesztjük át.

[Shared integráció és elfogadások](../SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) · [Változatlan forrás](../plans/README.md).


## Shared S3: Connections és biztonság — 2026-10-05

Angol Connections, block/report/moderáció és 011/012 elkészült; ezek dátumozott korábbi bizonyítéka megmarad. A későbbi privacy/Auth szelet felülírja az akkori „megjelenítési döntés/full Auth még hiányzik” státuszt: S0–S2 és S3 személyes/time/Connections/safety/privacy implementált; teljes kétfiókos Auth/Shared AI/saját AI/export/törlés/recovery sikeres. 001–013 alkalmazva, normál Shared flag-ek false. Nyers/backup-retention, régi személyes próza, billing/grace/deadline és friend release még kapu; P09–P13 és S4–S7 megmarad. A felhasználó az érintett közös szöveg elrejtését, a dátum és eredmény megtartását választotta. Új 013 stale-input cancellation és explicit friss retry; a P09 előnézet külön Shared privacy review-t kér. [Részletes megvalósítás, költség és korlát](../SHARED_CONTEXT_S3_PRIVACY_AUTH_REPORT_HU.md).


## 2026-10-05: P09/domain aktuális kiegészítés

[P09 privát AI-review](../PUBLIC_AI_REVIEW_REPORT_HU.md) operatori szelete kész: zárt angol copy, hash/revision/policy/receipt kötés, immutable review és saját olvasási API; export/törlés, 014 alkalmazva/ismételve. Egy valódi Sol-hívás öt privacy-jelzést adott, publicationApproved false. A privát Privacy/Content Preview kész; fizetett scan-job/curator/Publication/Confirm és P10–P13 még hátravan; Shared-kapu, S3 retention és S4–S7 megmarad. Domain: alterward.com, Cloudflare aktív, DNS üres/TLS Full; éles bekötés/Contabo-indítás később, az ops kapuk után.


## 2026-10-05: szerkeszthető privát Privacy/Content Preview

A [privát angol szerkesztő](../PUBLIC_PREVIEW_EDITOR_REPORT_HU.md) elkészült: saját forrásszöveg, mezőszintű ingyenes preflight, idempotens immutable mentés, legutóbbi érvényes copy visszatöltése és teljes mentett tartalomnézet. Az operatori AI-review csak a megfelelő hash/revision és mezőkészlet mellett látható; finding a javítandó mezőre mutat. Mentés/olvasás nem hív AI-t, Shared-előzmény és HU továbbra tiltott. Helyi teljes check: 314 teszt/27 fájl, 48 séma, a korábbi 44 és 001–014 változatlan. Következő a külön fizetett scan-job költségőrrel, curator/ScenarioVersion/sanitized fork-checkpoint/Publication/Confirm; majd P10–P13. Éles bekötés továbbra nincs.


## 2026-10-05: P09 review-job integráció

A felületről indítható P09 fizetett AI-review elkészült: explicit hozzájárulás, tartós queue/lease, egy attempt/immutable copy, közös projekt/user költségőr, egy pending job/user és gördülő napi kvóta. Újraolvasás/dupla kérés ingyenes, elveszett lease és provider-hiba nem indít automatikus fizetett retryt. 015 alkalmazva/ismételve a fejlesztői DB-n; English/Shared/tulajdonosi/hash/revision kapu és export/törlés integrált. Helyi teljes check: 323 teszt/28 fájl, 50 séma; a korábbi 48 és 001–014 változatlan. A normál feature false, éles allowance 0; publicationApproved false. Következő curator/ScenarioVersion/sanitized fork-checkpoint/Publication/Confirm/Official seed, majd P10–P13; S3 retention, S4–S7 és Contabo/Cloudflare élesítés megmarad. [Aktuális riport](../PUBLIC_REVIEW_JOB_REPORT_HU.md).
