# alterward — döntések és nyitott kérdések


**Aktuális megvalósítás:** P01–P05 privát v2 mag integrált; P06–P08 valós/emberi kapu nyitott. [V2 riport](../V2_IMPLEMENTATION_REPORT_HU.md), [státusz](../STATUS_HU.md). A [P09 privát előnézeti alapja](../PUBLIC_DRAFT_FOUNDATION_HU.md) is kész; a teljes közösségi/nyilvános rész továbbra tervezett.

2026-10-03 · Elfogadott irány és visszafordítható mérnöki választások. [Források elsőbbsége](../README.md).

## Elfogadott döntések

| Azonosító | Döntés | Eredet/státusz |
|---|---|---|
| ADR-001 | Web first, reszponzív Next.js | Meglévő alap, natív mobil később |
| ADR-002 | Külön NestJS API és worker, moduláris monolit | Meglévő alap |
| ADR-003 | PostgreSQL/Supabase Auth, migration first | Felhasználói szolgáltatóválasztás, megvalósítva |
| ADR-004 | Valódi OpenAI esemény/történet/ellenőrzés | Felhasználó elvetette az AI nélküli verziót |
| ADR-005 | Canon és determinisztikus átmenet a narratíva előtt | Mindkét terv, meglévő v1 + v2 könyvtár |
| ADR-006 | Immutable profil/canon, saját történeti fork nem ír szülőt | Meglévő v1, v2 tervben is kötelező |
| ADR-007 | Tranzakciós PostgreSQL job, lease/checkpoint | Megvalósítás; felváltja a korábbi PGMQ-ajánlást |
| ADR-008 | Privát alap és ingyenes adatletöltés/törlés | Rögzített termék-/biztonsági alap |
| ADR-009 | 18+ induló webes cél | Megtartott irány; teljes age verification nem kész |
| ADR-010 | Terméknév **alterward** | Felhasználói döntés; repó/csomagazonosítók maradnak |
| ADR-011 | Angol alap, teljes választható magyar, további nyelvre regiszter | Felhasználói döntés, meglévő v1-en kész |
| ADR-012 | `Muzsy/future_flow` → közvetlen main munka | Felhasználói döntés, CI ellenőrzéssel |
| ADR-013 | Tartós rövid időszakos élet és same-branch folytatás | Pozicionálási terv; privát integráció kész, emberi/valós Auth-kapu nyitott |
| ADR-014 | Private + Official/Scenario + Community, public MVP | Közösségi terv; személyes core után P09–P13 |
| ADR-015 | Snapshot és külön sanitized fork-checkpoint | Privacy követelmény, tervezett |
| ADR-016 | Feladatonkénti modellkonfiguráció, külön checker | Megvalósítva; Luna minősítendő jelölt |
| ADR-017 | 5 USD összes fejlesztői AI-kísérletre együtt | Felhasználói keret; nincs automatikus bővítés |

## Felülírt javaslatok

| Korábbi szöveg | Aktív értelmezés |
|---|---|
| Alter Jövő / Future Flow / Branchward munkanév | alterward |
| Magyar-only MVP, soknyelvűség kizárva | EN alap + teljes HU már induláskor; további nyelv teljesítés után |
| AI nélküli első demo/mock termékmód | Valódi AI kötelező; helyettesítő csak tesztben |
| Tízéves első generálás, 25–35 kötelező kérdés | V1 történeti működés; új v2 10–15 kérdés, rövid időszak |
| Minden választás új branch | V1 marad; v2 aktuális választás folytat, múltból fork külön |
| Public/social csak későbbi opcionális réteg, komment először | Public MVP személyes core után; Save/Share/Fork első, social/komment később |
| anonymous_community mint külön privacy szint | private/unlisted/public; szerző anonimitása külön megjelenítési beállítás |
| Privacy vagy adatletöltés prémium | Privát alap/export/törlés ingyenes; csak extra narratív formázás lehet prémium |
| Kötelező PGMQ/ORM/Docker/Flutter/protected-main/PR | Meglévő pg SQL/job és pnpm stack; infrastruktúra/mobil később, felhasználó main döntése érvényes |
| 18/20 siker elég export/törléshez | Auth/canon/privacy/export/törlés minden esetben hibamentes gate |

## Induló munkadöntések

Hat hónap alap, szerződés tizenkettőt is enged; egy 250–600 szavas fejezet/2–5 esemény/egy végső nyitott döntés. Első 12 lépéses rövid kérdőív, egy fő cél, mai magyar földrajzi környezet két nyelven. Egyszerű public ranking és fix taxonómia. Ezek mért tapasztalat alapján visszafordíthatók, nem lezárt felhasználói termékpreferenciák.

## Nyitott döntések és függőségek

Domain/védjegy; csomagár és ingyenes generálási limitek; későbbi payment/hosting; v2 period/fejezethossz értékelése; nemzetközi környezetsablonok; Official seed nyelvi aránya; további nyelvek; számszerű pilot-küszöb és sessionablak; végleges privacy/retention/backup és public másolatok takarítása. Ezeket konkrét mérés/előnézet alapján tisztázzuk, nem blokkolják P01-et.

Korábban jelzett Supabase admin-kulcs a valódi Auth-törlési próbához hiányzik; értéke csak védett helyi környezetbe kerülhet. A–G termékhipotézisek és a public növekedési hurok még nem bizonyított. Modellcseréhez új EN/HU teljeslánc-próba kell, külön keretfoglalással. A tömeges seed/pilot szükség esetén új pénzügyi döntést kér, az 5 USD nem léphető túl.
