# alterward — adatmodell és migráció

**Aktuális állapot (2026-10-04):** P01–P05 privát v2 mag kész; valódi Auth/AI HTTP- és böngészős próba, export, Auth/DB-törlés és kontrollált megszakításból recovery sikeres. P07 új angol minta Sonnet auditja és P08 privát feedback/session-mérés kész; használói minőség kiadás után mérendő. Kizárólag angol indulás, magyar elrejtve. P09 tulajdonosi előnézeti alap kész, publishing/Discovery/Official seed/public fork tervezett. [Közös státusz és bizonyíték](../STATUS_HU.md), [indulási döntés](../ENGLISH_RELEASE_PLAN_HU.md). [Contabo-előkészítés](../CONTABO_PREPARATION_REPORT_HU.md) és teljes izolált web/API/worker/proxy CI sikeres; éles deploy, backup/restore, valós DB-kiesésből recovery és email-kézbesítés még nyitott.

**Shared állapot:** S0–S2 implementált; S3 személyes backend/AI/időkezelés elkészült, a teljes friend kiadási kapu még nyitott; S4–S7 tervezett. 001–010 alkalmazva, Shared kikapcsolva. [S3 megvalósítás és korlátok](../SHARED_CONTEXT_S3_REPORT_HU.md) · [Integrációs terv](../SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md).

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

Angol Connections/csoport/profil/saját ág/consent/meghívó/idővonal/decision/solo és személyes pending banner implementált; block/unblock, saját privát rate-limited report és szerver-only auditált hold/release/dismiss elkészült. 011 szelektív former-member cleanup, 012 safety/moderation; 001–012 alkalmazva/ismételve, 16 Shared RLS-tábla, összesen 33 aw_ RLS-tábla. 297 teszt/26 fájl, teljes helyi check/build sikeres, 42 schema; 39 korábbi schema és 001–010 változatlan. Két valódi szintetikus Auth-fiókos izolált fixture-UI-próba, paid AI nélkül. Shared false, Contabo és AI-keretek változatlanok. Következő S3 kapu: törölt tagot érintő retained szöveg adatvédelmi megjelenítése és nyers/backup-retention, majd teljes valódi fiókos Shared AI → saját AI → export/törlés/recovery. Entitlement/billing és kiadási deadline külön döntés; üres deadline minden választ megvár, 48h nem alapérték. A retained megjelenítési kérdésre még nincs felhasználói válasz. P06 ops, P09–P13 public MVP és S4–S7 megmarad; friend release még nincs. [Megvalósítás és bizonyíték](../SHARED_CONTEXT_S3_UI_SAFETY_REPORT_HU.md).
