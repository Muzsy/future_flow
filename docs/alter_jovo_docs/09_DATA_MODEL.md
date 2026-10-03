# alterward — adatmodell és migráció


**Aktuális megvalósítás:** P01–P05 privát v2 mag integrált; P06–P08 valós/emberi kapu nyitott. [V2 riport](../V2_IMPLEMENTATION_REPORT_HU.md), [státusz](../STATUS_HU.md). A [P09 privát előnézeti alapja](../PUBLIC_DRAFT_FOUNDATION_HU.md) is kész; a teljes közösségi/nyilvános rész továbbra tervezett.

2026-10-03 · [001 migráció](../../database/migrations/001_foundation.sql), [002 nyelvmigráció](../../database/migrations/002_content_locale.sql), [v2 szerződés](../V2_SIMULATION_CONTRACT_HU.md).

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

003 aw_lives/branches/periods/history/choices/jobs/ai_runs/drafts/metrics; 004 aw_budget_accounts/reservations; 005 aw_interactions/account_deletions. Mind alkalmazva, ownership/RLS és anon/authenticated tiltás. [Pontos működés](../V2_IMPLEMENTATION_REPORT_HU.md).

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

V1 export a saját adatgráf/nyelvek; Auth/DB-törlés és worker lease visszavonás már kódban, valódi admin kulcsos próba/ops helyreállítás még függőség. Public release előtt export/törlés kiterjed publication/snapshot/token/save/index/OG/cache/attribution elemekre is. Privát fork megmaradás és érzékeny másolat takarítása külön szabály. Retention/backup határ rögzítendő.

Alkalmazott 001/002 migrációt nem írunk át; checksum, tranzakciós alkalmazás és új additív migráció kötelező. Sémák a kódból exportálódnak; ORM auto-sync vagy kézi dashboard-DDL nem a fejlesztési út.
