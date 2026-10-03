# alterward — backlog és feladatok utódlása

2026-10-03 · A végrehajtás egyetlen aktív sorrendje a [NEXT_STEPS](../NEXT_STEPS.md); az eredeti AJ-ticketlista az [archívumban](../archive/alter_jovo_v0_1/17_INITIAL_BACKLOG.md) marad. Itt nem tartunk második, eltérő sprinttervet.

| Pont | Állapot és konkrét eredmény |
|---|---|
| L01 | Kész v1 EN/HU alap; minden új P-pont nyelvi előfeltétele |
| P01 | Könyvtári v2 schema/validator kész; **következő: 003+ tárolás/head/revision/period** |
| P02 | Tervezett rövid valódi AI-generálás, döntésnél megálló canon |
| P03 | Tervezett egyszeri aktuális választás, same-branch continuation, külön history fork |
| P04 | Tervezett 10–15 kérdés és mentett élet visszatérési felület |
| P05 | Tervezett canonmemória, célzott javítás, app projekt/user költségfoglalás |
| P06 | Valódi Auth/DB/OpenAI böngészős flow, export/törlés és helyreállítás; admin kulcs függőség |
| P07 | Legalább 20 eset/3 period, EN/HU emberi minőség, minden integritási gate |
| P08 | Folytatási mérés és 20–50 résztvevős EN/HU pilot |
| P09 | Scenario/snapshot/checkpoint/Official kis seed és minőség |
| P10 | Discovery/életoldal/Save/Share/Report, moderator és permission/cache |
| P11 | Community Publishing, preview/Confirm, unlisted/public, unpublish és adatkezelés |
| P12 | Public fork/decision start/personalize új saját privát életbe |
| P13 | Teljes public gate, 14 MVP-elem és konverziós mérés |

## Régi epicek megfeleltetése

AJ foundation/auth/questionnaire/profile/job/AI/timeline/branch epicek v1 alapjai elkészültek, de régi ticketnév alapján nem állítunk minden elképzelt enrichment/freeform/admin/CI security feladatot késznek. AI nélküli demo feladat nem aktuális. V2 továbbépítés P01–P05, valós e2e/ops P06, quality P07, analytics P08, community P09–P13. Export/privacy nem halasztott prémium feladat.

## Ready és Done

Minden szelet célja konkrét viselkedés és elfogadási példa; schema/API/migration/ownership/locale/AI-költség hatás ismert. Done: működő kód, releváns ellenőrzés, kompatibilis migráció/séma, friss implementáció/státusz/backlog és megfelelő CI. Könyvtári séma nem teljes tárolási vagy UI-feature. Public gate nem csak a 14 checkbox, hanem privacy/permission/deletion/moderation is.

A felhasználó kérése szerint sorban haladunk. A visszafordítható technikai részleteket dokumentáljuk; valódi hiányzó döntést vagy kereten túli paid futtatást konkrét tervvel tisztázunk. Dokumentáció-only változás nem jogosít új feature vagy fizetett tesztsorozat indítására.
