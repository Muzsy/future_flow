# alterward — döntések és nyitott kérdések

**Aktuális állapot (2026-10-04):** P01–P05 privát v2 mag kész; valódi Auth/AI HTTP- és böngészős próba, export, Auth/DB-törlés és kontrollált megszakításból recovery sikeres. P07 új angol minta Sonnet auditja és P08 privát feedback/session-mérés kész; használói minőség kiadás után mérendő. Kizárólag angol indulás, magyar elrejtve. P09 tulajdonosi előnézeti alap kész, publishing/Discovery/Official seed/public fork tervezett. [Közös státusz és bizonyíték](../STATUS_HU.md), [indulási döntés](../ENGLISH_RELEASE_PLAN_HU.md). [Contabo-előkészítés](../CONTABO_PREPARATION_REPORT_HU.md) és teljes izolált web/API/worker/proxy CI sikeres; éles deploy, backup/restore, valós DB-kiesésből recovery és email-kézbesítés még nyitott.

2026-10-04 · Elfogadott irány és visszafordítható mérnöki választások. [Források elsőbbsége](../README.md).

## Elfogadott döntések

| Azonosító | Döntés | Eredet/státusz |
|---|---|---|
| ADR-001 | Web first, reszponzív Next.js | Meglévő alap, natív mobil később |
| ADR-002 | Külön NestJS API és worker, moduláris monolit | Meglévő alap |
| ADR-003 | PostgreSQL/Supabase Auth, migration first | Felhasználói szolgáltatóválasztás, megvalósítva |
| ADR-004 | Valódi OpenAI esemény/történet/ellenőrzés | Felhasználó elvetette az AI nélküli verziót |
| ADR-005 | Canon és determinisztikus átmenet a narratíva előtt | Mindkét terv, megvalósított v1/v2 tárolás és worker |
| ADR-006 | Immutable profil/canon, saját történeti fork nem ír szülőt | Megvalósított v1 és saját v2 történeti fork |
| ADR-007 | Tranzakciós PostgreSQL job, lease/checkpoint | Megvalósítás; felváltja a korábbi PGMQ-ajánlást |
| ADR-008 | Privát alap és ingyenes adatletöltés/törlés | Rögzített termék-/biztonsági alap |
| ADR-009 | 18+ induló webes cél | Megtartott irány; teljes age verification nem kész |
| ADR-010 | Terméknév **alterward** | Felhasználói döntés; repó/csomagazonosítók maradnak |
| ADR-011 | Angol alap és választható magyar, további nyelvekre készülve | Korábbi felhasználói döntés; induló nyelveit ADR-019 felülírja |
| ADR-012 | `Muzsy/future_flow` → közvetlen main munka | Felhasználói döntés, CI ellenőrzéssel |
| ADR-013 | Tartós rövid időszakos élet és same-branch folytatás | Pozicionálási terv; privát integráció és valós Auth-próba kész, éles ops-kapu nyitott; emberi élmény kiadás után mérendő |
| ADR-014 | Private + Official/Scenario + Community, public MVP | Közösségi terv; személyes core után P09–P13 |
| ADR-015 | Snapshot és külön sanitized fork-checkpoint | Privát előnézeti alap kész; publikáció és futtatható public checkpoint tervezett |
| ADR-016 | Feladatonkénti modellkonfiguráció, külön checker | Megvalósítva; Luna minősítendő jelölt |
| ADR-017 | OpenAI fejlesztői összkeret 5 USD | Korábbi felhasználói keret; nincs automatikus bővítés |
| ADR-018 | Claude modellek és külső történetaudit külön 5 USD kerettel | 2026-10-03 felhasználói döntés; külön titok/napi helyett összesített napló; worker-provider nem vált automatikusan |
| ADR-023 | Privát Shared Context és S0–S7; első user release valódi AI-val | 2026-10-04 új forrás és felhasználói integrációs kérés; tervezett |
| ADR-019 | Kizárólag angol béta, magyar elrejtve; AI szerkesztői döntés, kiadás utáni visszajelzés | 2026-10-03 legújabb felhasználói döntés; felülírja az ADR-011 kétnyelvű indulását és az előzetes kézi EN/HU pilotot |

## Felülírt javaslatok

| Korábbi szöveg | Aktív értelmezés |
|---|---|
| Alter Jövő / Future Flow / Branchward munkanév | alterward |
| Magyar-only MVP, soknyelvűség kizárva | Kizárólag angol indulás; magyar és további nyelv későbbi minősítés után |
| AI nélküli első demo/mock termékmód | Valódi AI kötelező; helyettesítő csak tesztben |
| Tízéves első generálás, 25–35 kötelező kérdés | V1 történeti működés; új v2 10–15 kérdés, rövid időszak |
| Minden választás új branch | V1 marad; v2 aktuális választás folytat, múltból fork külön |
| Public/social csak későbbi opcionális réteg, komment először | Public MVP személyes core után; Save/Share/Fork első, social/komment később |
| anonymous_community mint külön privacy szint | private/unlisted/public; szerző anonimitása külön megjelenítési beállítás |
| Privacy vagy adatletöltés prémium | Privát alap/export/törlés ingyenes; csak extra narratív formázás lehet prémium |
| Kötelező PGMQ/ORM/Docker/Flutter/protected-main/PR | Meglévő pg SQL/job és pnpm stack; infrastruktúra/mobil később, felhasználó main döntése érvényes |
| 18/20 siker elég export/törléshez | Auth/canon/privacy/export/törlés minden esetben hibamentes gate |

## Induló munkadöntések

Hat hónap alap, szerződés tizenkettőt is enged; egy 250–600 szavas fejezet/2–5 esemény/egy végső nyitott döntés. Első 12 lépéses rövid kérdőív, egy fő cél, mai magyar földrajzi környezet angol történetekkel. Egyszerű public ranking és fix taxonómia. Ezek mért tapasztalat alapján visszafordíthatók, nem lezárt felhasználói termékpreferenciák.

## Nyitott döntések és függőségek

Domain/védjegy; csomagár és ingyenes generálási limitek; későbbi payment; Contabo-élesítés időpontja/kerete; v2 period/fejezethossz értékelése; nemzetközi környezetsablonok; angol Official seed mérete és költsége; további nyelvek; számszerű pilot-küszöb és sessionablak; végleges privacy/retention/backup és public másolatok takarítása. Ezeket konkrét mérés/előnézet alapján tisztázzuk, nem blokkolják P01-et.

2026-10-04-re a Supabase admin-kulcs védett környezetben beállítva; a valódi szintetikus Auth/DB-törlés sikeres. A–G termékhipotézisek és a public növekedési hurok még nem bizonyított. Modellcseréhez új angol teljeslánc-próba kell, külön keretfoglalással. A tömeges seed/pilot szükség esetén új pénzügyi döntést kér, a szolgáltatónként külön engedélyezett 5 USD nem léphető túl.

## ADR-020 · Helyi fejlesztés, későbbi Contabo

2026-10-04 · Felhasználói döntés: meglévő Contabo szerver, domain később. Most helyi fejlesztés/teszt és GitHub main; élesítés kijelölt későbbi időben. Render-javaslat elvetve. [Telepítési terv](../DEPLOYMENT_HU.md).

## ADR-021 · Angol béta visszajelzés és mérési definíció

2026-10-04 · P08 megvalósítás: privát, önkéntes feedback; szerveridős 30 perces aktivitási munkamenet, fejezetszintű olvasási jel, kérés/job közötti attribution. Kattintás, siker és későbbi visszatérés külön. A 30 perc induló technikai definíció; nincs ebből bizonyított retenció. [Részletek](../BETA_FEEDBACK_AND_METRICS_HU.md).

## ADR-022 · Kipróbált kulcsos SSH és jelszavas tiltás

2026-10-04 · A felhasználó megerősítette, hogy más nem használ jelszavas SSH-t. Új, checkouton kívül védett Ed25519 kulcs telepítve, korábbi kulcs megmaradt. Időzített visszaállítás és konfigurációellenőrzés mellett az SSH-jelszavas belépés kikapcsolva; friss kulcsos kapcsolat sikeres, jelszavas kapcsolat elutasított. Root kulcsos belépés megmarad; csak SSH reload történt. [Végrehajtási bizonyíték és nyitott ops](../CONTABO_PREPARATION_REPORT_HU.md). Karbantartási időpont és a használt meglévő domainek listája még tisztázandó; reboot, tűzfal- vagy proxyaktiválás ezek nélkül nem következik automatikusan.

## ADR-023 · Shared Context a privát életmotorhoz

2026-10-04 · Felhasználói kérés: az új [Shared Context implementációs ZIP](../plans/README.md) teljes tartalma épüljön a tervbe és dokumentációba. [Aktív értelmezés](../SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md). Új privát aggregátum kapcsolja a valós felhasználók saját életágait, egy közös canonnal és jogosult személyes impactokkal; aw_lives/branches egytulajdonosú marad. Öt típus és tiermodell: Free 0, Explorer 1 friend, Connected 3 friend/romantic/work/hobby, World 5 minden típus. Árak/billing és grace nyitott; alapprivacy/export/törlés ingyenes.

S0–S7 külön szál, első helyi szelet S0. A forrás S0/S1 AI nélküli javaslata csak foundation/izolált teszt; friend béta csak S2 valódi Shared AI + S3 személyes integráció és biztonsági kapu után. PR-javaslat main commit-szelet, EN/HU minta angol kiadás. DM/chat/realtime/public shared továbbra későbbi; a korábbi általános multiplayer/social-halasztás nem zárja ki ezt az aszinkron privát funkciót.

Globális user UUID-sort → context → member/invite/event → branch lock-sorrend irányít, a blueprint invite-first példája ennek megfelelően átírandó. Személyes fork nem örököl live tagságot. Account-törlés tagreferenciákat/profilt leválaszt, mások minimális shared canonját nem cascade-törli; retained prose PII-redakciója/retentionje külön kiadási kapu. Shared személyes public snapshot más tagot általánosít, multiparty azonosítható snapshot S7 consenttel.

Grace és downgrade-context választás, deadline/quorum, eltérő időpontú ágak materializálása, billing és redakció/retention a függő implementációs szelet előtt konkretizálandó. Nincs még shared kód, alkalmazott új migráció vagy fizetett shared próba. Helyi fejlesztés folytatódik; dokumentációintegráció nem változtat szervert, keretet vagy alapmodellt.

## ADR-024 · Shared S0 minimális megosztás és fail-closed foundation

2026-10-04 · Visszafordítható technikai munkadöntések: owner invite 7 nap/20 per context/24h, hash-only HMAC token dedikált szerverkulccsal és POST preview, targeted-only decline, pontos napegyezés a későbbi időadapterig; nincs automatikus személyes adatprofil-kivonat. Az owner távozása/törlése admin-handovert ad a legrégebbi megmaradt aktív (ennek hiányában paused) tagnak, történetbeli szerep nélkül. Ended/archived romantikus slotot context_live trigger felszabadítja, paused megtartja. S0 008/009 és az API implementált, 008/009 a fejlesztői Supabase-on alkalmazva és ismétléssel ellenőrizve, mind a négy flag false. [S0 megvalósítás és korlátok](../SHARED_CONTEXT_S0_REPORT_HU.md). Billing, időadapter, downgrade/grace, retained prose és teljes canon-export/moderáció nem tekinthető ezzel késznek.
