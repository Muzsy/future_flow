# alterward — adatmodell és migráció

**Aktuális állapot (2026-10-04):** P01–P05 privát v2 mag kész; valódi Auth/AI HTTP- és böngészős próba, export, Auth/DB-törlés és kontrollált megszakításból recovery sikeres. P07 új angol minta Sonnet auditja és P08 privát feedback/session-mérés kész; használói minőség kiadás után mérendő. Kizárólag angol indulás, magyar elrejtve. P09 tulajdonosi előnézeti alap, AI-pre-screen és szerkeszthető privát Privacy/Content Preview kész; fizetett scan-job, publishing/Discovery/Official seed/public fork tervezett. [Közös státusz és bizonyíték](../STATUS_HU.md), [indulási döntés](../ENGLISH_RELEASE_PLAN_HU.md). [Contabo-előkészítés](../CONTABO_PREPARATION_REPORT_HU.md) és teljes izolált web/API/worker/proxy CI sikeres; éles deploy, backup/restore, valós DB-kiesésből recovery és email-kézbesítés még nyitott.

**Shared állapot:** S0–S2 és S3 személyes/time/Connections/safety/privacy implementált; teljes kétfiókos Auth/Shared AI/saját AI/export/törlés/recovery sikeres. 001–013 alkalmazva, normál Shared flag-ek false. Nyers/backup-retention, régi személyes próza, billing/grace/deadline és friend release még kapu; P09–P13 és S4–S7 megmarad. [Aktuális bizonyíték](../SHARED_CONTEXT_S3_PRIVACY_AUTH_REPORT_HU.md).

2026-10-05 · [001 migráció](../../database/migrations/001_foundation.sql), [002 nyelvmigráció](../../database/migrations/002_content_locale.sql), [v2 szerződés](../V2_SIMULATION_CONTRACT_HU.md).

## Tényleges v1 táblák

| Csoport | Táblák |
|---|---|
| Fiók/profil | ff_users, ff_questionnaires, ff_profile_drafts, ff_profile_versions, ff_consents |
| Élet/állapot | ff_world_versions, ff_futures, ff_branches, ff_life_states |
| Canon/döntés | ff_events, ff_decisions, ff_decision_options, ff_decision_resolutions |
| Történet | ff_chapters, ff_chapter_events |
| Job/audit | ff_jobs, ff_idempotency, ff_ai_runs |

19 foundation tábla. A migrációs nyilvántartás infrastruktúra; ez nem további domainfunkció. Profilválaszok, kapcsolatok és célok snapshot JSON-ban vannak; külön relationship/trait/goal CRUD-tábla nincs. UUID-k és ownership-FK-k, JSON-séma + SQL/tranzakció együtt védi az integritást.

Immutable profil/world/event/life-state és saját branch előzménye; gyermekág örökölt prefixet visszaolvas, nem írja át a szülőt. Minden resolve külön sor, új ág. A draft monoton revision, azonos revision csak egyszer commitolható.

`ff_futures.content_locale` a 002 migrációból: régi életek `hu`, újak alapból `en`; tartalomnyelv immutable. Jobpayload/audit explicit locale, régi nyelv nélküli job magyar. Nyelvi fordítás nem módosít régi profil/hash/canont.

## V2 perzisztencia — integrált

003 aw_lives/branches/periods/history/choices/jobs/ai_runs/drafts/metrics; 004 aw_budget_accounts/reservations; 005 aw_interactions/account_deletions; 006 aw_publication_drafts/scenario_drafts; 007 aw_feedback/activity_sessions. Összesen 17 aw_ tábla; 001–007 alkalmazva, ownership/RLS és anon/authenticated tiltás. [Pontos működés](../V2_IMPLEMENTATION_REPORT_HU.md).

Tulajdonosi FK/RLS, egy ág egy aktív periodjob, idempotencia és tranzakció. Canon eseményenként before/after, választás előtti checkpoint és cél/szereplő/asset stabil referencia. Unknown `null` megőrzendő. V1 történet változatlanul olvasható, v2 indulás explicit új élet/ellenőrzött másolat, nem automatikus append a tízéves baseline-ra.

## Public adatmodell — tervezett P09–P12

| Objektum | Tartalom és szabály |
|---|---|
| Scenario / ScenarioVersion | Kezdőidentitás/cél/környezet/állapot sablon, locale és verzió; nem kész történet |
| Publication | Belső tulajdonos/forrás, active snapshot, visibility, moderáció, revision, szerző/index/forkengedély |
| PublicSnapshot | Immutable, engedett mezős, PII-vizsgált cím/summary/timeline/chapters/decision/branch/taxonómia, locale és eredetjelölés |
| Public fork checkpoint | Külön sanitized gépi induló állapot; remappolt public szereplő/cél/asset ID-k, nincs eredeti privát FK |
| Save | Egyedi user/publication kapcsolat, idempotens |
| Report / ModerationCase | Minimális védett jelentőadat, státusz, indok és döntési audit |
| Category / Tag / Collection | Fix taxonómia, curator/szerző által jóváhagyott címkék, Discovery |
| Fork attribution | Public forráshivatkozás, törléskor leválasztható; nem privát jogosultság |

Nem elég `is_public` a privát életen. A snapshot nem ad raw profile/prompt/memory/note/state/audit vagy belső azonosítót. Unlisted token legalább 256 bites véletlen, csak hash tárolva. Privát folytatás nem módosít active snapshotot; új kiadás új preview/hash/Confirm.

## Export, törlés, migráció

Az export a teljes saját v1/v2 adatgráfot, minden tárolt nyelvet, draftot, feedbacket és sessiont tartalmazza. Valódi Auth/DB-törlés és kontrollált megszakításból admin recovery sikeres; worker lease visszavonás tesztelt. Valós DB-kiesésből recovery és backup/restore még nyitott. Public release előtt export/törlés kiterjed publication/snapshot/token/save/index/OG/cache/attribution elemekre is. Privát fork megmaradás és érzékeny másolat takarítása külön szabály. Retention/backup határ rögzítendő.

Alkalmazott 001–007 migrációt nem írunk át; checksum, tranzakciós alkalmazás és új additív migráció kötelező. Sémák a kódból exportálódnak; ORM auto-sync vagy kézi dashboard-DDL nem a fejlesztési út.

## Shared S0 tárolás és későbbi bővítések

Új social_profiles/user_entitlements és shared contexts/members/invites/events/participants/intents/resolutions/impacts/jobs/ai_runs, blocks/reports. RLS és direkt anon/auth tiltás, aktív tagsági/romantikus uniqueness, server cap lock, hashed expiring invite. Shared history nem creator-account cascade; személyes tagreferenciák nullable, immutable payload mellett mutable lifecycle. 008/009 implementált tizenhárom RLS-táblával, a fejlesztői Supabase-on alkalmazva és ismétléssel ellenőrizve; 010 személyes memória alkalmazva; 011 report/metrics későbbi, 001–007 változatlan. Romantic unique context_live mezője triggerezve szinkron, paused foglal/ended felszabadít; owner leave/delete handover és incoming invite revocation elkészült.

[Shared integráció és elfogadások](../SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) · [Változatlan forrás](../plans/README.md).

## S1 implementációs kiegészítés

S1 immutable event/intent/resolution és hash-elt pending memory payload a már alkalmazott 008/009 táblákon működik; nincs új migráció. End/leave/deleting cancelled canon, új impact nélkül. Saját export saját történeti részvételt és own impactot ad; más személyes referenciája nincs benne.


## S3 személyes integráció — 2026-10-05

010_shared_personal_memories alkalmazva: immutable owner-only snapshots, unique(branch_id,event_id), source impact FK, known_at, first_history_position és forrássorrend. Export/cascade saját adat, közös canon megtartva. Moderáció következő migrációja 011; alkalmazott SQL nem módosítható. [Részletes bizonyíték és korlátok](../SHARED_CONTEXT_S3_REPORT_HU.md).


## Shared S3: Connections és biztonság — 2026-10-05

Angol Connections, block/report/moderáció és 011/012 elkészült; ezek dátumozott korábbi bizonyítéka megmarad. A későbbi privacy/Auth szelet felülírja az akkori „megjelenítési döntés/full Auth még hiányzik” státuszt: S0–S2 és S3 személyes/time/Connections/safety/privacy implementált; teljes kétfiókos Auth/Shared AI/saját AI/export/törlés/recovery sikeres. 001–013 alkalmazva, normál Shared flag-ek false. Nyers/backup-retention, régi személyes próza, billing/grace/deadline és friend release még kapu; P09–P13 és S4–S7 megmarad. A felhasználó az érintett közös szöveg elrejtését, a dátum és eredmény megtartását választotta. Új 013 stale-input cancellation és explicit friss retry; a P09 előnézet külön Shared privacy review-t kér. [Részletes megvalósítás, költség és korlát](../SHARED_CONTEXT_S3_PRIVACY_AUTH_REPORT_HU.md).


## 2026-10-05: P09 privát AI-review

[P09 operatori pre-screen](../PUBLIC_AI_REVIEW_REPORT_HU.md): zárt angol copy, minimális problémakategória, 014 privát RLS-tábla, hash/revision/policy/receipt kötés és egyszeri futás. Saját olvasási API, account export/cascade törlés és régi DB-export kompatibilitás ellenőrzött; Shared-előzmény tiltva. 311 helyi teszt, 44 schema (42 korábbi változatlan), egy valódi Sol-negatív kontroll öt jelzéssel. A privát Privacy/Content Preview kész; fizetett scan-job, curator/Publication/Confirm és public release még külön kapu.


## 2026-10-05: szerkeszthető privát Privacy/Content Preview

A [privát angol szerkesztő](../PUBLIC_PREVIEW_EDITOR_REPORT_HU.md) elkészült: saját forrásszöveg, mezőszintű ingyenes preflight, idempotens immutable mentés, legutóbbi érvényes copy visszatöltése és teljes mentett tartalomnézet. Az operatori AI-review csak a megfelelő hash/revision és mezőkészlet mellett látható; finding a javítandó mezőre mutat. Mentés/olvasás nem hív AI-t, Shared-előzmény és HU továbbra tiltott. Helyi teljes check: 314 teszt/27 fájl, 48 séma, a korábbi 44 és 001–014 változatlan. Következő a külön fizetett scan-job költségőrrel, curator/ScenarioVersion/sanitized fork-checkpoint/Publication/Confirm; majd P10–P13. Éles bekötés továbbra nincs.


## 2026-10-05: P09 review-job integráció

A felületről indítható P09 fizetett AI-review elkészült: explicit hozzájárulás, tartós queue/lease, egy attempt/immutable copy, közös projekt/user költségőr, egy pending job/user és gördülő napi kvóta. Újraolvasás/dupla kérés ingyenes, elveszett lease és provider-hiba nem indít automatikus fizetett retryt. 015 alkalmazva/ismételve a fejlesztői DB-n; English/Shared/tulajdonosi/hash/revision kapu és export/törlés integrált. Helyi teljes check: 323 teszt/28 fájl, 50 séma; a korábbi 48 és 001–014 változatlan. A normál feature false, éles allowance 0; publicationApproved false. Következő curator/ScenarioVersion/sanitized fork-checkpoint/Publication/Confirm/Official seed, majd P10–P13; S3 retention, S4–S7 és Contabo/Cloudflare élesítés megmarad. [Aktuális riport](../PUBLIC_REVIEW_JOB_REPORT_HU.md).
