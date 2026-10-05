# alterward — backlog és feladatok utódlása

**Aktuális állapot (2026-10-04):** P01–P05 privát v2 mag kész; valódi Auth/AI HTTP- és böngészős próba, export, Auth/DB-törlés és kontrollált megszakításból recovery sikeres. P07 új angol minta Sonnet auditja és P08 privát feedback/session-mérés kész; használói minőség kiadás után mérendő. Kizárólag angol indulás, magyar elrejtve. P09 tulajdonosi előnézeti alap, AI-pre-screen és szerkeszthető privát Privacy/Content Preview kész; fizetett scan-job, publishing/Discovery/Official seed/public fork tervezett. [Közös státusz és bizonyíték](../STATUS_HU.md), [indulási döntés](../ENGLISH_RELEASE_PLAN_HU.md). [Contabo-előkészítés](../CONTABO_PREPARATION_REPORT_HU.md) és teljes izolált web/API/worker/proxy CI sikeres; éles deploy, backup/restore, valós DB-kiesésből recovery és email-kézbesítés még nyitott.

**Shared állapot:** S0–S2 és S3 személyes/time/Connections/safety/privacy implementált; teljes kétfiókos Auth/Shared AI/saját AI/export/törlés/recovery sikeres. 001–013 alkalmazva, normál Shared flag-ek false. Nyers/backup-retention, régi személyes próza, billing/grace/deadline és friend release még kapu; P09–P13 és S4–S7 megmarad. [Aktuális bizonyíték](../SHARED_CONTEXT_S3_PRIVACY_AUTH_REPORT_HU.md).

2026-10-05 · A végrehajtás egyetlen aktív sorrendje a [NEXT_STEPS](../NEXT_STEPS.md); az eredeti AJ-ticketlista az [archívumban](../archive/alter_jovo_v0_1/17_INITIAL_BACKLOG.md) marad. Itt nem tartunk második, eltérő sprinttervet.

| Pont | Állapot és konkrét eredmény |
|---|---|
| L01 | Kész angol kiadás és HU elrejtés; minden új P-pont angol |
| P01 | Kész: 003 tárolás, immutable canon/choice/history, ownership/RLS, revision/idempotencia/lease. |
| P02 | Kész: hat hónapos valódi AI, 2–5 esemény, 250–600 szó; négy EN/HU lánc ×3 időszak. |
| P03 | Kész: aktuális választás, same-branch folytatás és saját történeti fork külön művelet. |
| P04 | Kész kód: 12 lépés, revisionös draft, visszatérés/idővonal. Valódi szintetikus fiókos UI-próba sikeres. |
| P05 | Kész: állapot/közeli canon/választás memória, egy célzott javítás, project/user és helyi közös keret. |
| P06 | Részben: valódi Auth/HTTP/UI/export/törlés és kontrollált recovery kész; email-kézbesítés, valós DB-kiesés és backup/restore/éles ops nyitott. |
| P07 | Részben: 20 determinisztikus eset ×3 időszak és négy valódi AI-lánc kész; új angol béta-minta Sonnet auditja sikeres; további generatív lefedettség és kiadás utáni használói értékelés. |
| P08 | Technikai rész kész: privát feedback, szerveroldali session/fejezetvég/folytatás kohorsz és összesítés; éles béta, 20–50 használó célkohorsz és sikerhatár nyitott. |
| P09 | Privát előnézeti alap kész; teljes Scenario/checkpoint/Publication/Official seed nyitott |
| P10 | Discovery/életoldal/Save/Share/Report, moderator és permission/cache |
| P11 | Community Publishing, preview/Confirm, unlisted/public, unpublish és adatkezelés |
| P12 | Public fork/decision start/personalize új saját privát életbe |
| P13 | Teljes public gate, 14 MVP-elem és konverziós mérés |

## Régi epicek megfeleltetése

AJ foundation/auth/questionnaire/profile/job/AI/timeline/branch epicek v1 alapjai elkészültek, de régi ticketnév alapján nem állítunk minden elképzelt enrichment/freeform/admin/CI security feladatot késznek. AI nélküli demo feladat nem aktuális. V2 továbbépítés P01–P05, valós e2e/ops P06, quality P07, analytics P08, community P09–P13. Export/privacy nem halasztott prémium feladat.

## Ready és Done

Minden szelet célja konkrét viselkedés és elfogadási példa; schema/API/migration/ownership/locale/AI-költség hatás ismert. Done: működő kód, releváns ellenőrzés, kompatibilis migráció/séma, friss implementáció/státusz/backlog és megfelelő CI. Könyvtári séma nem teljes tárolási vagy UI-feature. Public gate nem csak a 14 checkbox, hanem privacy/permission/deletion/moderation is.

A felhasználó kérése szerint sorban haladunk. A visszafordítható technikai részleteket dokumentáljuk; valódi hiányzó döntést vagy kereten túli paid futtatást konkrét tervvel tisztázunk. Dokumentáció-only változás nem jogosít új feature vagy fizetett tesztsorozat indítására.

## Shared backlog utódlása

L01/P01–P13 változatlan azonosítók; új S0–S7 roadmap a NEXT_STEPS-ben és a Shared tervben. S0 implementáció kész, DB-alkalmazás és ismétlés sikeres; S1 motor implementált, következő helyi munka S3, user-facing friend release S2+S3 kapu után, nem AI nélküli S1 demo. S4–S6 típusbővítés, S7 advanced később; P06 ops és P09–P13 public továbbra teljesítendő. A source PR-feladatokat main commit-szeletekként követjük.

[Shared integráció és elfogadások](../SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) · [Változatlan forrás](../plans/README.md).


## S3 személyes integráció — 2026-10-05

Connections angol felület, block/report/moderáció, retained próza PII-redakció/retention és teljes valódi fiókos Shared→saját AI→export/törlés/recovery még S3 kapu. A határidő kiadási alapértéke és entitlement/billing külön döntés; üres deadline mindenkit megvár, 48h javaslat. Mind a négy Shared flag false, Contabo-élesítés később. [Részletes bizonyíték és korlátok](../SHARED_CONTEXT_S3_REPORT_HU.md).


## Shared S3: Connections és biztonság — 2026-10-05

Angol Connections, block/report/moderáció és 011/012 elkészült; ezek dátumozott korábbi bizonyítéka megmarad. A későbbi privacy/Auth szelet felülírja az akkori „megjelenítési döntés/full Auth még hiányzik” státuszt: S0–S2 és S3 személyes/time/Connections/safety/privacy implementált; teljes kétfiókos Auth/Shared AI/saját AI/export/törlés/recovery sikeres. 001–013 alkalmazva, normál Shared flag-ek false. Nyers/backup-retention, régi személyes próza, billing/grace/deadline és friend release még kapu; P09–P13 és S4–S7 megmarad. A felhasználó az érintett közös szöveg elrejtését, a dátum és eredmény megtartását választotta. Új 013 stale-input cancellation és explicit friss retry; a P09 előnézet külön Shared privacy review-t kér. [Részletes megvalósítás, költség és korlát](../SHARED_CONTEXT_S3_PRIVACY_AUTH_REPORT_HU.md).


## 2026-10-05: P09/domain aktuális kiegészítés

[P09 privát AI-review](../PUBLIC_AI_REVIEW_REPORT_HU.md) operatori szelete kész: zárt angol copy, hash/revision/policy/receipt kötés, immutable review és saját olvasási API; export/törlés, 014 alkalmazva/ismételve. Egy valódi Sol-hívás öt privacy-jelzést adott, publicationApproved false. A privát Privacy/Content Preview kész; fizetett scan-job/curator/Publication/Confirm és P10–P13 még hátravan; Shared-kapu, S3 retention és S4–S7 megmarad. Domain: alterward.com, Cloudflare aktív, DNS üres/TLS Full; éles bekötés/Contabo-indítás később, az ops kapuk után.


## 2026-10-05: szerkeszthető privát Privacy/Content Preview

A [privát angol szerkesztő](../PUBLIC_PREVIEW_EDITOR_REPORT_HU.md) elkészült: saját forrásszöveg, mezőszintű ingyenes preflight, idempotens immutable mentés, legutóbbi érvényes copy visszatöltése és teljes mentett tartalomnézet. Az operatori AI-review csak a megfelelő hash/revision és mezőkészlet mellett látható; finding a javítandó mezőre mutat. Mentés/olvasás nem hív AI-t, Shared-előzmény és HU továbbra tiltott. Helyi teljes check: 314 teszt/27 fájl, 48 séma, a korábbi 44 és 001–014 változatlan. Következő a külön fizetett scan-job költségőrrel, curator/ScenarioVersion/sanitized fork-checkpoint/Publication/Confirm; majd P10–P13. Éles bekötés továbbra nincs.
