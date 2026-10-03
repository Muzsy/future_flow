# alterward — backlog és feladatok utódlása


**Aktuális megvalósítás:** P01–P05 privát v2 mag integrált; P06–P08 valós/emberi kapu nyitott. [V2 riport](../V2_IMPLEMENTATION_REPORT_HU.md), [státusz](../STATUS_HU.md). A [P09 privát előnézeti alapja](../PUBLIC_DRAFT_FOUNDATION_HU.md) is kész; a teljes közösségi/nyilvános rész továbbra tervezett.

2026-10-03 · A végrehajtás egyetlen aktív sorrendje a [NEXT_STEPS](../NEXT_STEPS.md); az eredeti AJ-ticketlista az [archívumban](../archive/alter_jovo_v0_1/17_INITIAL_BACKLOG.md) marad. Itt nem tartunk második, eltérő sprinttervet.

| Pont | Állapot és konkrét eredmény |
|---|---|
| L01 | Kész v1 EN/HU alap; minden új P-pont nyelvi előfeltétele |
| P01 | Kész: 003 tárolás, immutable canon/choice/history, ownership/RLS, revision/idempotencia/lease. |
| P02 | Kész: hat hónapos valódi AI, 2–5 esemény, 250–600 szó; négy EN/HU lánc ×3 időszak. |
| P03 | Kész: aktuális választás, same-branch folytatás és saját történeti fork külön művelet. |
| P04 | Kész kód: 12 lépés, revisionös draft, visszatérés/idővonal. Valódi fiókos UI-próba P06. |
| P05 | Kész: állapot/közeli canon/választás memória, egy célzott javítás, project/user és helyi közös keret. |
| P06 | Részben: export/delete/recovery kód és teszt kész; valódi email/admin kulcs és backup/restore nyitott. |
| P07 | Részben: 20 determinisztikus eset ×3 időszak és négy valódi AI-lánc kész; emberi EN/HU minőség nyitott. |
| P08 | Részben: minimális click/success mérés és összesítés kész; 20–50 emberi pilot/sikerhatár nyitott. |
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
