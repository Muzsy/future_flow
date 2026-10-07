# alterward — aktív termék- és megvalósítási terv


## Aktuális: saját élet nyilvános döntési pontból

P12 nyilvános, teljesen ellenőrzött döntési pontból külön saját privát élet indítása elkészült. A választás egyszer alkalmazódik, friss saját azonosítók és normál AI-job/kvóta készül; három technikai időszakban megmarad a döntés emlékezete. Az eredeti élet változatlan, Official eredetengedély és élő Shared-tagság nem öröklődik. Visszavonás leállítja az új indításokat; fizikai forrástörlés csak a hivatkozást választja le. Saját élet törlése után a régi kérés nem hozhatja újra létre. Teljes helyi check 560 teszt/49 fájl/build, 143 séma; dev 001–034 és ismétlés, 73 aw_/73 RLS; 50 valódi Auth/HTTP/TLS ellenőrzés és fióktakarítás, új paid AI 0. A 033 33bcd8a verify/container CI sikeres; az új 034 pontos CI és valódi generatív fork-minőség még ellenőrizendő. Scenario személyre szabás, P13, P11 privacy/retention, Shared és üzemeltetési kapuk megmaradnak; Contabo élesítés még nem történt. [Bizonyíték és határ](PUBLIC_FORK_START_REPORT_HU.md).

[Dokumentációs központ](README.md) · [Közös státusz és keret](STATUS_HU.md) · [A három forrás visszakövetése](REQUIREMENTS_TRACEABILITY_HU.md).

2026-10-05 · A [pozicionálási és célmeghatározási dokumentum](PROJECT_POSITIONING_AND_GOAL_DEFINITION_HU.md), a [nyilvános életutak, Discovery és közösség specifikációja](PUBLIC_LIVES_DISCOVERY_COMMUNITY_SPEC_HU.md) és az új [Shared Context csomag](plans/README.md) alapján. Ez a célállapot és az odavezető terv; a jelenleg működő kódot az [implementációs állapot](IMPLEMENTATION.md), a végrehajtás sorrendjét a [következő lépések](NEXT_STEPS.md) írják le.

## 1. Irány és dokumentumok szerepe

AI által generált, tartósan mentett, folytatható és elágaztatható alternatív életet építünk. A felhasználó egy identitással és céllal elindul, eseményeket él meg, dönt, majd ugyanabban az életben tapasztalja meg a következményeket. Később visszatérhet egy korábbi döntéshez, és kipróbálhat másik ágat.

Az elsődleges élmény a kíváncsiság, a történet és az életutak felfedezése. Az önreflexió ebből származó érték. A cél irányt ad a szimulációnak; teljesülését a rendszer nem ígéri meg. A kommunikáció lehetséges szcenáriókról beszél, és nem ad a kitalált eseményekhez megtörténési százalékot.

Tervezési elsőbbség: felhasználói döntések → két stratégiai alapdokumentum és az új Shared Context specifikáció → ez az aktív terv → részletes témák és feladatlista. A közösségi specifikáció előrébb hozza a nyilvános MVP-t, miközben a személyes szimuláció elsőbbségét megtartja. A kódból exportált sémák és az implementáció a meglévő működést írják le. A [21 témadokumentum](alter_jovo_docs/00_README.md) már az aktív 0.2 terv; az eredeti anyag/manifest és ZIP az [archívum](archive/README.md) történeti referenciája. A tízéves első generálás/hosszú kötelező profil a v1 működése, a megvalósított v2 rövid profilt/időszakot használ.

Megmaradó döntések: valódi OpenAI-generálás az első használható verzióban, Supabase, kizárólag angol induló felület és történetek; magyar halasztva, 18+, munka a `Muzsy/future_flow` repó `main` ágán. AI nélküli termékváltozat nem készül. Automatizált tesztben továbbra is használható elkülönített helyettesítő.

A termék neve **alterward**, a felhasználó 2026-10-03-i döntése alapján. A repó és a projektkönyvtár `future_flow` marad. A belső csomagnevek, régi sémaazonosítók és védett titokkönyvtárak megtartása technikai kompatibilitás, nem márkanév-döntés. A forrásdokumentumok korábbi munkanevei történeti szövegek. Domain, pontos csomagár és billing nincs eldöntve; az új Shared Context tervezett tier- és jogosultsági modelljét a 13. szakasz rögzíti.

A termék három összekapcsolt rétege: **Private Personal Simulation**, **Official Lives / Scenarios** és önként publikált **Community Lives**. A teljes közösségi MVP-ben kurált, valódi AI-val generált életutak lesznek Discoveryben; a technikailag kész privát életmotor korlátozott angol bétája korábban is indulhat. Az olvasás meglévő snapshotból történik; a „Fork this life” vagy személyre szabás új, saját privát szimulációhoz vezet.

A legújabb felhasználói döntés szerint kizárólag angol felület és angol AI-történetek indulnak. A magyar rész elrejtve, további nyelvek később kapcsolhatók be. A felhasználó az angol szerkesztői döntést az AI-ra bízza; indulás előtti emberi EN/HU pilot helyett korlátozott éles béta és valódi visszajelzések következnek. A [részletes indulási terv](ENGLISH_RELEASE_PLAN_HU.md) felülírja a korábbi kétnyelvű kiadási és kézi nyelvi jóváhagyási követelményt. [Technikai nyelvi policy](LOCALIZATION_HU.md).

## 2. A jelenlegi alap és a hátralévő munka

| Terület | Megőrzött v1 | Megvalósított v2 / következő kapu |
|---|---|---|
| Első élmény | 29 kérdés, tízéves baseline | 12 angol lépés, hat hónap, nyitott döntés; valódi fiókos UI-próba sikeres |
| Generálás | 5–10 esemény, 2–3 fejezet | 2–5 esemény és egy 250–600 szavas fejezet időszakonként |
| Döntés | Mindig új gyermekág | Aktuális choice ugyanazt az ágat módosítja; folytatás és saját történeti fork külön művelet |
| Állapot/visszatérés | Számszerű mutatók, mentett archívum | Tényállapot, cél/szereplő/korlát, revision, mentett választás és következő időszak |
| Minőségbizonyíték | Korábbi szintetikus baseline/ág minták | 159 automatizált teszt, 20 determinisztikus eset ×3 időszak; négy valódi generatív lánc és új angol minta külső auditja; használói élmény kiadás után mérendő |
| Költség/mérés | Közös fejlesztői napló | Projekt/user foglalás, hibaköltség, feedback, session/fejezetvég/folytatás összesítés; éles allowance még nulla |
| Shared Context | S0–S2 privát alap, friend motor és AI | Szerződés/tárolás/meghívás/intent/canon/pending memória implementált, kikapcsolva; valódi Shared AI implementált, személyes/time S3 implementált, Connections/privacy/Auth még kapu |
| Nyilvános tartalom | Nincs publikálás/Discovery | Privát snapshot/szcenárió-előnézet kész; teljes PII, Publication/Official seed, Discovery és public fork még tervezett |

A valódi szintetikus Supabase/Auth/DB/OpenAI HTTP-hurok, böngészős onboarding/visszatérés/export, Auth/DB-törlés és kontrollált recovery sikeres. Backup/restore, valós DB-kiesésből helyreállítás, email-kézbesítés és Contabo-élesítés még kapu. [Aktuális bizonyíték](BETA_IMPLEMENTATION_REPORT_HU.md), [státusz](STATUS_HU.md). Emberi élmény és megtartás a korlátozott angol béta után mérendő.

## 3. Az első végigvihető élmény

1. **Új élet:** saját vagy alternatív önmagam, rövid kiinduló profil, egy fő cél és a fontos vállalások/korlátok. A célzott kitöltési idő 3–4 perc; ezt használati próbával mérjük.
2. **Kiinduló világ:** rövid, szerkeszthető összefoglaló az induló helyzetről és a szimuláció feltevéseiről. Jóváhagyás után a profil és a kiinduló állapot verziózott pillanatkép.
3. **Első időszak:** valódi AI-generálás, 2–5 összefüggő esemény, olvasható fejezet. A történet egy érdemi döntési ponton megáll. Az első olvasás és döntés célzottan az első körülbelül tíz percben elérhető; ez élménycél, nem garantált generálási idő.
4. **Döntés:** néhány érthető opció, látható vállalásokkal. A választást és az azonnali állapotváltozást mentjük; a tartós következmények a további időszakokban jelennek meg.
5. **Folytatás:** a következő időszak ugyanahhoz az életághoz kerül, az utolsó elfogadott állapotból. Bezárás, újratöltés és későbbi belépés után ugyaninnen indulhat.
6. **Másik ág:** egy korábbi döntési pontból másik választással új életág keletkezik. Az eredeti ág és annak későbbi története megmarad.

Kezdő megvalósítási alapérték: **hat hónap időszakonként, egy 250–600 szavas fejezet, egy lezáratlan döntés az időszak végén**. Az új stratégia hat hónapot vagy egy évet enged; a hat hónap és az egy fejezet visszafordítható induló választás. Az éves időszakot később külön mérjük. A többéves célhorizont több egymás után megélt időszakon keresztül érvényesül.

Az események dátuma az időszakon belül rendezett. A választásig csak a döntés előtti események és állapotok válnak canonként elfogadottá. A rendszer nem rögzít előre választás utáni történetet. Függő döntés mellett a folytatás először a választást kéri; a változatlan irány csak külön, egyértelmű opcióként választható.

A kezdőfelület a mentett életeket, az utolsó helyzetet és a következő döntést mutatja. Fő műveletek: „Új élet”, „Folytatom ezt az életet”, „Másik ág innen”. Az idővonal a múlt és az állapotváltozások megértését segíti.

## 4. Profil, identitás és cél

A kezdő kérdőív 10–15 kérdése közösen tartalmazza a profilt és a célt. Az integrált bontás 12 lépés: identitásmód/korcsoport; hely és költözési lehetőség; lakhatás; munka; pénzügyi mozgástér; képzettség/készségek; fontos kapcsolatok; idő/energia; vállalható kockázat; fő cél és időtáv; motiváció és vállalható áldozatok; kizárt áldozatok/korlátok. Opcionális szabad kontextus egészítheti ki; a lépések végigvihetősége böngészőben ellenőrzött, érthetőségük és kitöltési idejük valódi használókkal mérendő.

Az indulás nem követel meg minden személyiségskálát vagy két kapcsolatot. A felhasználó megadhat nulla közeli kapcsolatot, álneveket és ismeretlen opcionális adatokat. Az ismeretlen érték külön jelölést kap; a semleges szám nem válik a személyről állított ténnyé. A további részleteket később, releváns helyzetben kérjük be, menthető és folytatható módon.

A cél verziózott szerződésének mezői: `category`, `description`, `priority`, `horizon`, `motivation`, `acceptable_tradeoffs`, `unacceptable_tradeoffs`, `current_progress`, `constraints`. Az első élményben egy fő célt veszünk fel; az opcionális mezők nem teszik kötelezővé a hosszú kitöltést. A cél előrehaladása szimulációs állapot, nem a történetből kitalált sikerszázalék.

A saját profil és a szimulált identitás külön állomány. Az alternatív identitás/élethelyzet felülírásait az adott élet pillanatképe tárolja; a saját profil korábbi verziója változatlan marad. Az indulás a mai, magyar környezetre épül. Történelmi és összetett fiktív világok később jönnek.

Valós profilhoz 18+ korcsoport és a szimulációban eltelt idő tartozik. Ebből nem képezünk kitalált pontos születési dátumot. Pontos fiktív életkor külön megadható, 18+ határral.

## 5. Tartós világ és állapotátmenetek

A termékbeli `WorldState` a teljes szimulált helyzet. A megőrzött v1 `ff_world_versions` semleges környezeti kontextus, a `ff_life_states` részleges életállapot. Az integrált v2 életbemenet és állapotszerződés külön kezeli a környezetet és a személy/élet állapotát; együttes nézetük adja a termék világállapotát.

| MVP-állapot | Minimális tartalom |
|---|---|
| Idő és identitás | Szcenáriónap, eltelt idő, profilverzió, aktív ág és állapotrevision |
| Munka és készségek | Foglalkoztatás, munka/szerep azonosítható tényei, ismert készségek |
| Pénzügy és lakhatás | Induló mozgástér, vállalt terhek, lakhatás/hely; bizonytalan összeg külön jelölve |
| Kapcsolatok | Tartós szereplőazonosítók, kapcsolat típusa és releváns változásai |
| Célok és lehetőségek | Cél előrehaladása, nyitott/lezárt lehetőségek, korlátok érvényessége |
| Emlékezet | Elfogadott események, választások, fontos tények és hivatkozásaik |

A számszerű mutatókat kategorikus és tényszerű mezők egészítik ki. Állásváltáskor az új munkaviszony, költözéskor a hely, vállalkozás eladásakor a tulajdonlás is megváltozik. Egy későbbi történet nem kezelheti a már eladott céget továbbra is sajátként. A részletes egészségügyi, hírnév-, pénzügyi és társas modellek külön minőségi fázisba kerülnek; az MVP-ben megjelenő tények következetessége már kötelező.

Az AI strukturált esemény- és hatásjavaslatot készít. A domainmotor ellenőrzi az időrendet, a szereplőket, a tények előfeltételeit és a korlátokat, majd engedélyezett átmenetekből képezi az új állapotot. A szöveg önmagában nem módosít adatot. Minden állapotváltozásnak esemény- vagy döntéshivatkozása van.

A kemény korlát géppel ellenőrizhető feltételhez, élet/ág hatókörhöz és időbeli érvényességhez kötött. Például „maradjon a jelenlegi állásban az új ajánlat elfogadásáig” nem örök állásváltási tilalom. A puha preferencia a generálást irányítja; az elfogadott kemény korlát megsértése megakadályozza a commitot.

## 6. Folytatás, elágazás és adatátállás

**Folytatás:** az aktuális ág végén a választás egyszer kerül rögzítésre, az állapotrevision növekszik, a következő időszak ugyanarra az ágra kerül. A múlt eseményei változatlanok. **Elágazás:** egy történeti döntés előtti állapotból és a választott másik opcióból új gyermekág indul, a közös előzmények öröklésével. A régi választás és a szülőág későbbi eseményei megmaradnak.

Megvalósított v2 működés:

- Verziózott időszak-/állapotszerződés, időszakot tároló rekordok, ág aktuális állapota/revisionje és az aktuális/történeti választások elkülönítése.
- Külön API-művelet a jelenlegi döntéshez, az ág folytatásához és a történeti forkhoz. A mai `/api/v1/decisions/:id/resolve` mindig gyermekágat nyit; új szerződés/API-verzióval kerüljük el a régi jelentés csendes átírását.
- A külön `aw_jobs` jobok időszakot és induló állapotrevisiont kapnak; első generálás, folytatás és történeti fork ugyanazt az időszakos feldolgozót használja. A v1 `future | branch` queue megmarad. Kezdeti állapot csak élet/ág létrehozásakor készül; a sorszámok az ágon belül folyamatosak.
- Áganként egyszerre egy generálás: idempotenciakulcs, revisionellenőrzés és tranzakció. Dupla kattintás ugyanazt a feladatot adja vissza, elavult állapot 409-et kap. Elveszett worker-lease mellett nincs új esemény vagy fejezet commit.

A 001–007 migráció alkalmazva; az alkalmazott fájlok ellenőrzőösszege változatlan. A 003 a v2 életet, 004 a költségőrt, 005 az interakció/recovery alapot, 006 a privát előnézetet, 007 a feedback/session tárolást adja. A domain, adatbázis, API és worker együtt integrált. [Pontos v2 szerződés](V2_SIMULATION_CONTRACT_HU.md), [megvalósítás](V2_IMPLEMENTATION_REPORT_HU.md).

A korábbi tízéves életek verzióval jelölve visszaolvashatók maradnak. Az új hurokhoz induláskor explicit új v2-élet/másolat készül, ellenőrzött kiinduló állapotból. Az előre generált, még ki nem választott tízéves jövőre nem fűzünk rá folytatást. Az átállás nem írja újra a régi profilokat, canon-hasheket vagy történeteket; külön migrációs és visszaolvasási ellenőrzést igényel.

## 7. AI, narratíva, emlékezet és költség

Az AI készíti a kontextushoz illő eseményeket és kizárólag angol történetet. A fejezet felidézi a korábbi fontos döntéseket, jelenetet és következményt mutat, majd valódi választási feszültségnél megáll. A hihető konfliktus és változatosság fontosabb a folyamatos rendkívüli drámánál. Az eredmény történetként is olvasható legyen.

Megvalósított folyamat: profil/állapot → AI-eseményjavaslat → sémák és domainfeltételek → determinisztikus átmenetek → menthető canon → AI-fejezet → hivatkozás- és történethűség-ellenőrzés → atomikus időszak-commit. A szükséges tájékoztatás röviden, jól látható helyen szerepel; minden bekezdésben ismételt figyelmeztetés nem része a narratívának.

A következő időszak bemenete a rögzített állapot, a döntéstörténet, a közelmúlt eseményei és a releváns korábbi tények. A jelenlegi memória determinisztikus, canonból képezett kivonat: aktuális állapot, két közeli időszak és legfeljebb tíz választás. Önálló AI-memóriaösszefoglaló későbbi bővítés lehet. Eltéréskor a strukturált tény az irányadó. A teljes, folyamatosan növekvő történetet nem küldjük minden kérésben újra.

A javítás célzott: a hibás strukturált válasz vagy fejezet legfeljebb egy automatikus javítási kört kap, előre lefoglalt költségen belül. Érvényes esemény/checkpoint megmarad; narratívahiba nem indítja újra az egész világot. Ismételt hiba látható állapotot és biztonságos kézi újrapróbálást eredményez. A hibás és ismeretlen fogyasztású kérés költsége sem tűnik el a nyilvántartásból.

A két felhasználói kísérleti keret külön összesített 5 USD OpenAI és 5 USD Claude kutatás/audit. A naplók korábbi fogyasztása megmarad; az aktuális összegeket egy helyen, a státuszban vezetjük. Ezek tokenalapú becslések, nem lekérdezett szolgáltatói egyenlegek. A dátumozott bontás és a közös guard szabályai a [státuszban](STATUS_HU.md) vannak. Az új időszakok árát új tokenmérésből számítjuk; a régi tízéves generálás költségét nem vetítjük rájuk automatikusan. Ez a dokumentációfrissítés nem indított paid AI-hívást.

Az angol és magyar generálás külön valódi AI-próbán átment; a [nyelvi jelentés](LOCALIZATION_HU.md) az eredményeket és a történeti mérés és a mostani angol kiadás határait is leírja.

Az alkalmazásszintű keretőr elkészült: kérés előtti foglalás, felhasználói/projektlimit, hibaköltség, párhuzamos foglalások és a tényleges használat elszámolása. A helyi smoke-keretőr ettől külön megőrzött kísérleti napló; a worker opcionálisan ezt is használja. A nulla env-keret meglévő pozitív DB-limit mellett is tilt új költést. Olcsóbb modellre irányítás külön mérés után következik; a működő OpenAI-integrációt megtartjuk.

A modellválasztási vizsgálat első jelöltje Luna eseményekhez, Sol narratívához és ellenőrzéshez. A kis v2 teljeslánc-próbában 46–63% kisebb költséget mértünk, az angol lánc egy célzott fejezetjavításával. Ez nem általános megtakarítási garancia; további angol hibakategóriás próba és minősítés kell az átállításhoz. A három szerep és a checker külön konfigurálható, alkalmazáskeret és célzott javítás kész; automatikus modell/provider fallback nincs. A jelenlegi alap minden szerepnél Sol, Claude külön auditor. [Dátumozott routing-riport](AI_V2_ROUTING_REPORT_HU.md).

## 8. Fejlesztési fázisok és MVP-határ

| Fázis az új stratégiában | Konkrét cél | Kilépési feltétel |
|---|---|---|
| 0 – Termékprototípus | Rövid profil → valódi AI-fejezet → választás → folytatás | Végigvihető új hurok a meglévő technikai alapokon |
| 1 – Tartós személyes alap | Fiók, mentett tényállapot, visszatérés, idővonal, saját történeti fork, emlékezet, minőség és költségőr | Három időszak, privát jogosultság és adatkezelés működik; zárt személyes próba |
| 2 – Publikálható tartalom és Official seed | Külön snapshot, privacy/minőségi ellenőrzés, verziózott Scenario és belőle készülő Official Life | Kurált, valódi AI-tartalom, forkra alkalmas nyilvános checkpointok; kereten belüli pilot |
| 3 – Read-only Discovery | Kategóriák/kollekciók, nyilvános életoldal, mentés, megosztás, jelentés, szabályozott indexelés | Bejelentkezés nélkül olvasható Official tartalom, olvasás nem indít AI-hívást |
| 4 – Community Publishing | Private/unlisted/public, két preview, explicit megerősítés, visszavonás és moderáció | Másik fiók sem privát adatot, sem visszavont snapshotot nem kap; kezdetben zárt béta |
| 5 – Nyilvános életből saját élet | Fork this life, Start from this decision, Personalize scenario | Anonimizált snapshotból saját privát élet, eredeti ág és privát előzmény érintetlen |
| 6 – Social Layer | Reakció, követés, később komment és szerzői profil | A publikus alap és moderáció működik; mérés indokolja a bővítést |
| 7 – Creator Platform | Alkotói szcenáriók, sablonok, analitika, később monetizáció/marketplace | Validált használat és fenntartható üzemeltetés |

Az állapotátmenetek, minimális emlékezet, több időszakos minőség és költségvédelem már a prototípus/személyes alap előfeltételei; mélyítésük fokozatos. A nyilvános fázisok nem halasztják el a helyes canon, jogosultság vagy költségkeret követelményét.

A nyilvános induló MVP az 1–5. fázis együtt: a személyes core loop mellé Official/Community tartalom, három láthatóság, publikálás, Privacy Preview és Content Preview, snapshot, életoldal, Discovery, Save/Share/Fork, Report, Unpublish és alap taxonómia tartozik. A közösségi specifikáció saját Phase 0–3 jelölése ennek 2–5. fázisát bontja ki; a privát technikai pilot hamarabb is futhat.

Az MVP-ből kimarad a kommentrendszer, DM/chat, követési gráf, reakciók, alkotói monetizáció, marketplace, billing, natív mobil, hang/kép/avatar/VR, realtime multiplayer, habit tracker, coaching- és egészségplatform, összetett achievementek és több száz mutató. A szabad szöveges döntés, összetett compare és sokcélú optimalizálás a működő folytatás után kerül sorra. A részletes [nyilvános megvalósítási terv](PUBLIC_CONTENT_IMPLEMENTATION_PLAN_HU.md) rögzíti az adatmodell, jogosultság, visszavonás és moderáció elfogadását.

A mentett életek alapértelmezésben privátak. Adathozzáférés és fióktörlés az indulás része, fizetéstől függetlenül. Discovery, olvasás, mentés, megosztás és publikálás az új specifikáció szerint ingyenes; saját generálás/fork/személyre szabás limitálható. Prémiumérték lehet több aktív élet, több generálás és mélyebb szimuláció. Személyes generálási limitek és pontos árak később, mért költség alapján készülnek; a Shared Context saját tervezett slot/típus entitlementet kap. Az egyszemélyes privát alap és a privacy nem kerül fizetési feltétel mögé.

## 9. Elfogadás és mérés

A személyes technikai alap elfogadása: rövid profilból valódi AI-időszak készül; a döntés állapotot módosít; a második időszak ugyanarra az ágra kerül; kijelentkezés/belépés után folytatható a harmadikkal; a korábbi döntésből másik ág indítható a szülő módosítása nélkül. Dupla kérés, megszakítás, hibás AI-válasz és elveszett lease sem okoz dupla vagy részleges canon-commitot. Jogosultság, export és Auth/DB-törlés minden esetben kötelezően hibamentes.

A meglévő 20 determinisztikus szintetikus eset ellenőrzi a három egymást követő időszakot, az alternatív választásokat, korlátokat, kapcsolati és tulajdonlási tényeket, promptba rejtett utasításokat és költséghatárokat. A valódi generatív minták és auditok ettől külön bizonyítékok; a generatív esetkészlet további bővítése a megmaradt kereten belül történik. Ettől külön a korlátozott éles angol béta méri az élményt és a visszatérést, valódi visszajelzésekkel. A 20–50 használó célkohorsz, nem indulás előtti kötelező zárt pilot és nem statisztikai bizonyító erejű mintaméret.

| Metrika | Első mérési definíció |
|---|---|
| Onboarding Completion | Első szimulációt sikeresen elindítók / onboardingot elkezdő egyedi felhasználók |
| First Simulation Completion | Első fejezet végén olvasás-befejezést jelzők / első fejezetet megnyitó egyedi felhasználók; a kijelzés külön szerepel a tényleges olvasásról |
| First Decision Rate | Első döntést sikeresen mentők / első döntést megjelenítve látó egyedi felhasználók |
| **Continuation Rate** | Első fejezetvég-jellel rendelkező gyökéréletek közül később sikeresen folytatottak aránya; a kattintási szándék külön proxy |
| **Continued Life Sessions** | Későbbi munkamenetben legalább egyszer folytatott egyedi életek száma; mellette külön a sikeres folytatási munkamenetek száma |
| Return D1/D7/D30 | Első AI-fejezetet megnyitó kohorsz visszatérése az adott napon; időzóna és megfigyelési ablak előre rögzítve |
| Branch Rate | Történeti döntésből sikeres új ágat készítők / legalább egy elmentett döntéssel rendelkező egyedi felhasználók |
| Költség | AI-költség/aktív felhasználó, sikeres időszak és folytatás; hibák és javítások költségével együtt |

A „Folytatom” kattintás szándék, a sikeres commit működési eredmény: együtt mutatjuk őket. Technikai hibát nem zárunk ki csendben a megfelelő kohorszból; generálási sikerarány és várakozási idő külön is látszik. Az élet/munkamenet azonosító és a szerveroldali 30 perces inaktivitási küszöb már a [mérési szerződés](BETA_FEEDBACK_AND_METRICS_HU.md) része. A continuationRate aktuális operatív értéke a fejezetvég-jellel rendelkező gyökéréletek sikeres folytatási aránya; a kattintási szándék külön proxy. Tartalom vagy személyes cél nem kerül analitikai naplóba.

Az elsődleges kérdés: **az első eredmény után akarja-e folytatni ugyanazt az alternatív életet?** A visszatérés kíváncsiságból és nyitott eseményekből épüljön; mesterséges napi streak nem szükséges. Emberi visszajelzésben mérjük, mi személyes, hihető, érdekes, és miért szeretné tudni, „mi történik ezután”.

Retenciós küszöbértéket még nem igazoltunk. A pilot tapasztalatai alapján, a következő értékelt kohorsz előtt rögzítjük a számszerű célt és az összehasonlítást. Egyetlen jó AI-minta vagy sikeres technikai teszt nem jelent validált terméket.

## 10. Nyitott hipotézisek és függőségek

A stratégia A–G hipotézisei tesztelendők: saját vagy fiktív identitás; onboarding értéke; folytatás vagy új élet; fork és visszatérés kapcsolata; megosztási szándék; más életének fogyasztása; történet vagy analitikus riport. Először a személyes core loopot vizsgáljuk; a nyilvános indulási kapu előtt a Discovery → fork → első saját időszak konverzió és a publikálási bizalom is külön próbát kap.

2026-10-04: valódi szintetikus Supabase-jelszavas Auth/DB/OpenAI HTTP-hurok és tényleges Auth/DB-törlés sikeres; admin kulcs védett környezetben. [Béta-riport](BETA_IMPLEMENTATION_REPORT_HU.md). Email-kézbesítés, backup/restore és valós DB-kiesésből admin recovery még külön üzemeltetési kapu. Élesítés a meglévő Contabo szerveren később, domain: alterward.com (Cloudflare), bekötés később.

Az induló hat hónap, fejezethossz, kérdőívbontás és mérési definíció visszafordítható munkadöntés. Márkanév és önkéntes nyilvános megosztás elfogadott irány. Domain, pontos csomagár/billing, végleges generálási keretek és új szolgáltatói költségkeret külön döntés lesz. A feladatokhoz most nem rendelünk megalapozatlan naptári határidőt.

## 11. Visszakövethetőség az új stratégiához

| Forrásfejezet | Tervben érvényesülő döntés |
|---|---|
| 2–8, 12–14, 33 | Tartós alternatív élet, hat pillér, cél mint irány |
| 15, 24, 26, 32.4 | Rövid profil, fokozatos mélyítés, rövid első időszak |
| 16–19, 21–22, 32.2–3 | Strukturált tények, AI-narratíva, validált következmények, emlékezet |
| 17, 24, 26 | Folytatás és történeti fork külön művelet |
| 23, 27, 31, 34 | Folytatási szándék, későbbi életfolytatás, tesztelendő hipotézisek |
| 20, 25, 28–30, 35 | Új közösségi specifikációval felülírt fázisok; márka alterward, árazás külön döntés |

A forrás piaci/versenytársi hivatkozásai háttéranyagok; ez a terv nem teszi őket külön ellenőrzött piaci tényekké.

## 12. Visszakövethetőség a közösségi specifikációhoz

| Közösségi forrásfejezet | Tervben érvényesülő döntés |
|---|---|
| 1–6, 31–33, 42 | Private + Official + Community, olcsó olvasásból saját AI-élet, központi fork |
| 7–10, 22–24, 29–30 | Három láthatóság, explicit preview/consent, külön snapshot, visszavonás és törlés |
| 11–17, 34–35, 38 | Discovery/életoldal, Scenario és Life külön, valódi AI-seed és hitelességi jelölések |
| 18–21, 36 | Fork/decision start/personalize a saját privát állapotba, jogosultság és generálási limit |
| 25–28, 37, 40–41 | Fix taxonómia, egyszerű rangsorolás, Save/Share/Fork első körben, moderáció, modulhatárok |
| 39 | Views/read depth/save/share/fork/publish/unpublish és moderációs mérés a folytatási metrikák mellett |

A seed célja a forrás szerint **50–100 Official Life és 20–30 Scenario a publikus indulás előtt**. Először néhány szintetikus, több időszakos mintán ellenőrizzük a minőséget és a költséget. A célmennyiség nem jogosít az 5 USD keret túllépésére; a méretezéshez mért költség és szükség esetén külön jóváhagyott keret kell. Ez a tervfrissítés nem indít új fizetett AI-hívást.

## 13. Shared Context — privát többfelhasználós életkapcsolatok

A [2026-10-04-i új specifikáció](plans/alterward_shared_context_implementation_docs/MASTER_SHARED_CONTEXT_SPEC_HU.md) hozzáadja az aszinkron közös szimulációt: valós felhasználók egy-egy saját ágával egy privát contextet alkotnak. A közös eseménynek egy canonja van; a személyes történet csak a jogosult, saját döntéssel engedett hatást kapja. A privát élet egytulajdonosú marad. Ez külön képesség a Private/Official/Community tartalomrétegek mellett; nem változtatja a csoportot publikussá.

Típusok: friend 2–10, romantic pontosan 2 és max 1 aktív/user, work/hobby max 10, sport max 20. Tervezett aktív slotszám: Free 0, Explorer 1 friend, Connected 3 friend/romantic/work/hobby, World 5 minden típus; minden tag saját entitlementje szükséges. Inviting/active/paused slotot fogyaszt, ended/archived nem. A tiermodell megvalósítandó; árak/billing és downgrade grace még konkretizálandók, a privacy/export/törlés ingyenes.

Az S0 foundation, S1 friend motor és S2 valódi Shared AI elkészült; S3 személyes memória/AI/időkezelés implementált; következő Connections és privacy/Auth friend kiadási kapu. S4–S6 fokozatos típusbővítés, S7 split/group fork/sponsored/public többfél-consent később. A P09–P13 public MVP nem törlődik; annak PII/preview/fork kapuja a shared történetek más felhasználóit is védi.

Biztonságos meghívó, explicit részvétel/consent, minimális InteractionProfile, saját intent, deterministic resolution, rendezett user/context/branch lock, revision/lease/idempotencia és lazy személyes impact kötelező. Személyes fork nem örököl live tagságot. A törölt tag adata leválasztandó, más tagok története nem cascade-törlendő; próza-redakció/retention ellenőrzése nélkül nincs kiadás.

A [részletes integrációs terv](SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) tartalmazza a szerződést, táblákat/API-kat, AI-inputot és költségviselést, UX-t, S0–S7 elfogadásokat és a forrás ellentmondásainak feloldását. S0 contract/tárolás/profil/entitlement/meghívási alap implementálva kikapcsolt feature mögött, a fejlesztői DB-n 001–009 alkalmazva; [S0 megvalósítás és korlátok](SHARED_CONTEXT_S0_REPORT_HU.md). S1 canon/intent/pending memória implementált; [S1 megvalósítás és korlátok](SHARED_CONTEXT_S1_REPORT_HU.md). S2 Shared AI implementált; [S2 riport](SHARED_CONTEXT_S2_REPORT_HU.md). S3 személyes/time implementált; S3 UI/privacy/Auth és S4–S7 még tervezett; nincs AI nélküli friend release, és a helyi fejlesztés nem jelent Contabo-telepítést.


### 2026-10-05-i személyes Shared pontosítás

A saját történet függő közös döntés mellett is folytatható. A később lezárt esemény eredeti effectiveAt dátuma és az ág knownAt dátuma külön marad; a következő saját mutation egyszer veszi át, régi fejezetet/futó vagy retryolt jobot nem módosít. Fork csak a forkpontig ismert saját memóriát kap, élő tagság nélkül. Új közös generálás és accept azonos naptári hónap/latest-anchor szabályt használ; eltérő hónap elutasítva, személyes catch-up nincs. [S3 megvalósítás és kiadási korlátok](SHARED_CONTEXT_S3_REPORT_HU.md).


## Shared S3: Connections és biztonság — 2026-10-05

Angol Connections, block/report/moderáció és 011/012 elkészült; ezek dátumozott korábbi bizonyítéka megmarad. A későbbi privacy/Auth szelet felülírja az akkori „megjelenítési döntés/full Auth még hiányzik” státuszt: S0–S2 és S3 személyes/time/Connections/safety/privacy implementált; teljes kétfiókos Auth/Shared AI/saját AI/export/törlés/recovery sikeres. 001–013 alkalmazva, normál Shared flag-ek false. Nyers/backup-retention, régi személyes próza, billing/grace/deadline és friend release még kapu; P09–P13 és S4–S7 megmarad. A felhasználó az érintett közös szöveg elrejtését, a dátum és eredmény megtartását választotta. Új 013 stale-input cancellation és explicit friss retry; a P09 előnézet külön Shared privacy review-t kér. [Részletes megvalósítás, költség és korlát](SHARED_CONTEXT_S3_PRIVACY_AUTH_REPORT_HU.md).


## 2026-10-05: P09 AI-ellenőrzés és megvásárolt domain

[Privát AI-pre-screen](PUBLIC_AI_REVIEW_REPORT_HU.md): kizárólag az előkészített angol copy, immutable hash/revision/policy és receipt, egyszeri operatori futás és saját olvasási API, export/törlés. Egy valódi Sol-negatív kontroll öt privacy-jelzést adott; nincs publikálási/Official jóváhagyás. A 014 migráció a fejlesztői Supabase-on alkalmazva és ismételve. Az alterward.com aktív Cloudflare-domain; a DNS még üres, TLS Full, éles bekötés nem történt. Következő: fizetett scan-job és curator/Publication/Confirm, majd P10–P13; S3 retention és S4–S7 továbbra megmarad.


## 2026-10-05: szerkeszthető privát Privacy/Content Preview

A [privát angol szerkesztő](PUBLIC_PREVIEW_EDITOR_REPORT_HU.md) elkészült: saját forrásszöveg, mezőszintű ingyenes preflight, idempotens immutable mentés, legutóbbi érvényes copy visszatöltése és teljes mentett tartalomnézet. Az operatori AI-review csak a megfelelő hash/revision és mezőkészlet mellett látható; finding a javítandó mezőre mutat. Mentés/olvasás nem hív AI-t, Shared-előzmény és HU továbbra tiltott. Helyi teljes check: 314 teszt/27 fájl, 48 séma, a korábbi 44 és 001–014 változatlan. Következő a külön fizetett scan-job költségőrrel, curator/ScenarioVersion/sanitized fork-checkpoint/Publication/Confirm; majd P10–P13. Éles bekötés továbbra nincs.


## 2026-10-05: felületről indítható privát AI-review

A felületről indítható P09 fizetett AI-review elkészült: explicit hozzájárulás, tartós queue/lease, egy attempt/immutable copy, közös projekt/user költségőr, egy pending job/user és gördülő napi kvóta. Újraolvasás/dupla kérés ingyenes, elveszett lease és provider-hiba nem indít automatikus fizetett retryt. 015 alkalmazva/ismételve a fejlesztői DB-n; English/Shared/tulajdonosi/hash/revision kapu és export/törlés integrált. Main CI sikeres: 324 teszt/28 fájl, 50 séma; a korábbi 48 és 001–014 változatlan. A normál feature false, éles allowance 0; publicationApproved false. Következő curator/ScenarioVersion/sanitized fork-checkpoint/Publication/Confirm/Official seed, majd P10–P13; S3 retention, S4–S7 és Contabo/Cloudflare élesítés megmarad. [Megvalósítás és pontos korlátok](PUBLIC_REVIEW_JOB_REPORT_HU.md).


## 2026-10-05: tulajdonosi beküldés és text-curation

A P09 tulajdonosi beküldés és trusted text-curation nyilvántartás elkészült: explicit consent, aktuális immutable copy és no_findings AI-review, idempotens beküldés, védett operatori lista/döntésfájl, egyszeri változatlan döntés, English/Shared/ownership/revision/hash/expiry/törlés kapu, export/cascade és 016 RLS-migráció. Scope text_only, publicationApproved false. Teljes ScenarioVersion/sanitized fork-checkpoint és azok ellenőrzése, Publication/Confirm/Official eredetengedély/seed még hátravan; majd P10–P13. Main CI `4d66981` sikeres: 336 teszt/29 fájl, formázás, típusellenőrzés, API/worker/Next production build és 52 séma-drift. Izolált valódi PostgreSQL/TLS: 001–016 + ismétlés, párhuzamos curation-submit és versengő döntés → egy nyertes, azonos apply újrahasználata, revision/törlés/RLS/export/cascade és publication=false; minden korábbi P09/S0–S3 proof megmarad. Konténeres web/API/worker/Caddy verified HTTPS/DB TLS, üres queue és tiszta worker-leállás, nulla provider-AI/valódi CI-kulcs, egress tiltva. [Main CI](https://github.com/Muzsy/future_flow/actions/runs/37358126556). 52 séma, a korábbi 50 és 001–015 változatlan; fejlesztői DB 001–016 alkalmazva/ismételve, 19 ff_ és 36 aw_/36 RLS. Új AI-hívás nincs; a közös OpenAI/Claude keretek, S3 retention/S4–S7 és Contabo/Cloudflare kapuk megmaradnak. [Kurátori szövegellenőrzés és pontos korlátok](PUBLIC_TEXT_CURATION_REPORT_HU.md).


## 2026-10-05: teljes ScenarioVersion foundation

A P09 teljes angol ScenarioVersion foundation elkészült: külön zárt scenario-1 sablon, immutable/hash/verziózott saját tárolás, friss belső ID-k és teljes cél/állapot/korlát-hivatkozások, explicit indításból normál AI-job és közös kvóták, export/cascade. 017 alkalmazva/ismételve, 19 ff_ és 39 aw_/39 RLS; 354 helyi teszt/30 fájl és teljes check/build, 57 séma, a korábbi 52 és 001–016 változatlan. Két valódi szintetikus Auth/DB HTTP-fiók: ownership/anon, verzió/replay/start és három technikai időszak, export/tényleges törlés sikeres; új paid AI 0. Normál/deploy SCENARIO_VERSIONS_ENABLED=false, publicationApproved=false, saját előkészítő API, scenario UI/public permission még nincs. Következő sanitized fork-checkpoint, teljes structured preview/review, Publication/Confirm/Official seed, majd P10–P13. A három forrás minden követelménye, 50–100 élet/20–30 scenario cél, külön 5–5 USD keret, S3 retention/S4–S7 és Contabo/Cloudflare kiadási kapuk megmaradnak. [Részletes megvalósítás](SCENARIO_VERSION_REPORT_HU.md).


## 2026-10-05: sanitized döntési checkpoint foundation

A P09 sanitized döntési checkpoint foundation elkészült: külön fork-checkpoint-1, teljes típusos állapot/korlát/előfeltétel/hatás és helyettesítő kulcskatalógus, exact canon/copy/opció binding, minden opció végrehajtható, új ID-s privát kezdőállapot motor. Saját candidate/save/read API, immutable hash/dedupe/default-off és privacy-fail-closed, export/cascade, 018 alkalmazva/ismételve; 19 ff_ és 40 aw_/40 RLS. Teljes helyi check/build: 372 teszt/32 fájl, 62 séma; a korábbi 57 és 001–017 változatlan. Valódi kétfiókos Auth/DB HTTP-próba: három párhuzamos save egy rekord, source-advance tiltás, három technikai időszak, export/tényleges Auth/DB cleanup; új paid AI 0. A régi coarse readyForFork=false változatlan, új record publicationApproved=false/readyForPublicFork=false/full review required. Következő teljes strukturált Privacy/Content Preview UI és új teljes-scope hash/AI/curator, majd Publication/Confirm/Official seed és P10–P13. A külön 5–5 USD keret, a három forrás teljes scope-ja és 50–100 élet/20–30 scenario cél, S3 retention/S4–S7 és Contabo/Cloudflare/backup/email kapuk megmaradnak. [Megvalósítás és pontos korlátok](PUBLIC_FORK_CHECKPOINT_REPORT_HU.md).


## 2026-10-06: döntési előnézet és leírásszerkesztő

Az angol saját döntési előnézet és leírásszerkesztő elkészült: tényleges választás előtti állapot/cél/korlát/előfeltétel/hatás, egyértelmű objektumsorszámok, forráskötés mellett javítható prose, immutable saját mentés/verziómegtekintés és ingyenes visszatöltés. Helyi teljes check: 375 teszt/32 fájl, API/worker/Next build; végleges textarea-címkézés után format/Next build ismét sikeres. 62 schema és 001–018 változatlan. Valódi Auth-böngésző/DB próba: két mentés, régi verzió/reload/azonos reuse/dirty-copy elrejtés, export és tényleges cleanup; új paid AI 0. A megtekintett verzió még nem kiadási pontlista. Következő immutable szöveg+választott checkpoint tartalomcsomag/közös hash, új teljes-scope AI/curator, majd Publication/Confirm/Official seed és P10–P13. A korábbi 5d29fcf CI-jobok indítás előtt cancelled, ezért az új 017/018 konténeres proof még nyitott. A teljes korábbi P/S-terv, 50–100 élet/20–30 scenario cél, külön 5–5 USD keret és Contabo/Cloudflare/backup/email kapuk megmaradnak. [Aktuális bizonyíték](PUBLIC_FORK_PREVIEW_REPORT_HU.md).


## 2026-10-06: teljes előnézeti tartalomcsomag

Elkészült a teljes angol immutable történet+explicit kiválasztott checkpoint tartalomcsomag, közös hash, külön tulajdonosi pontlista és teljes tartalom-visszatöltés. Új public-content-1 és public-content-review-1 zárt input/report, minden típusos skalár bevonva, belső UUID/nyers privát forrás nélkül. 019 additív/immutable/RLS és export/cascade, default PUBLIC_CONTENT_BUNDLES_ENABLED=false; üres pontlista olvasható történet továbbindítás nélkül. Helyi check 390 teszt/33 fájl, 68 séma, a korábbi 62 és 001–018 változatlan; fejlesztői DB 001–019 alkalmazva/ismételve, 19 ff_ és 42 aw_/42 RLS, verified TLS. A korábbi 02b6838 verify+container CI sikeres, így a 017/018 izolált PostgreSQL/HTTPS proof lezárult; az új 019 runtime CI külön ellenőrizendő. Új teljes-scope AI-job/worker/curator még következik, majd Publication/Confirm/Official eredetengedély/kis valódi AI seed/P10–P13. PublicationApproved továbbra false. Új paid AI 0; külön kumulatív 5–5 USD keret, a kombinált P01–P13/S0–S7, S3 retention/S4–S7, 50–100 élet/20–30 scenario és Contabo/Cloudflare/backup/email kapuk megmaradnak. [Megvalósítás és határ](PUBLIC_CONTENT_BUNDLE_REPORT_HU.md).

Valódi kétfiókos Supabase Auth/HTTP: párhuzamos három csomagmentés egy rekord, story-only új hash, ownership/anon/hash/source-advance tiltás, export és tényleges Auth/DB cascade-törlés sikeres. Valódi böngésző: explicit mentett pontválasztás/teljes részletek, azonos reuse, pontcsere és pontelhagyás három immutable csomaghoz, régi változat/reload, dirty-copy mindkét panel elrejtése, forrás-visszatöltés és kilépés sikeres. A teszt során talált azonos React sibling-key javítva, az érintett böngészős próba megismételve; végleges format/Next production build is sikeres. Export 3 csomag/2 kiválasztási sor, tényleges Auth/DB cleanup, ideiglenes credential fájl eltávolítva, 3200/4200 leállítva. A forrás kizárólag technikai fixture, nem Official vagy valódi AI seed; új providerhívás 0.

### Teljes csomag CI-lezárás — 2026-10-06

[Main CI](https://github.com/Muzsy/future_flow/actions/runs/37412306422), runtime `8868a34cc079fccbc1df42dc767e4c65cd4666dd`: verify és container sikeres. 390 teszt/33 fájl, format/types/API/worker/Next production build és 68 séma-drift. Izolált valódi PostgreSQL/TLS: 001–019 és ismétlés, három párhuzamos csomagmentés egy rekord, immutable/free reuse/source-advance/törlési marker/export/cascade/RLS; minden korábbi P09/S0–S3 proof megmarad. Web/API/Caddy verified HTTPS, üres négy queue és worker tiszta leállás, nulla paid AI/valódi CI-kulcs, hálózati egress tiltva. A 019 runtime-kapu lezárult; teljes-scope AI-job/worker/curator és kiadás továbbra következik. Ez nem éles Contabo-telepítés.


## 2026-10-06: teljes tartalom AI-job és költségőr

Elkészült a külön public-content-review-1 teljes történet+explicit checkpoint AI-job, tartós egyszeri attempt, worker ötödik fair queue, receipt/hash/source/owner/lease guard és angol hozzájárulás/eredménypanel. Text-only eredmény nem öröklődik; nincs automatikus fizetős retry. Közös text/full napi/pending/projekt/user korlát, max 2200 output token és 70 000 byte teljes scan-input. 020 additív/RLS, export/cancel/cascade; default PUBLIC_CONTENT_REVIEW_JOBS_ENABLED=false. Helyi check 402 teszt/34 fájl, 70 séma; régi 68 és 001–019 változatlan. Supabase 001–020 alkalmazva/ismételve, 19 ff_ és 43 aw_/43 RLS, verified TLS. Valódi Auth/HTTP és tényleges cleanup kész; angol böngészős consent/finding/csomagváltás/dirty/source-reload/reuse/export/tényleges cleanup kész; e1067dd verify/container CI sikeres, 001–020 és ismétlés/konkurencia/source/deletion/export/RLS/TLS/HTTPS proof, paid AI 0. Egyetlen valódi checkerhívás a meglévő angol mintán: checkpoint embedded-instruction észlelve, 11 finding/review_required, 0,036611 USD becslés; OpenAI guard 2,470485875 USD, maradék 2,529514125 USD; Claude guard 2,338015 USD változatlan. Következő a külön teljes-scope curator, majd Publication/Confirm/Official source grant/kis valódi AI seed/P10–P13. PublicationApproved=false. P01–P13/S0–S7, S3 retention/korábbi személyes próza, S4–S7, 50–100 élet/20–30 scenario és Contabo/Cloudflare/backup/email kapuk megmaradnak. [Riport és következő kapuk](PUBLIC_CONTENT_REVIEW_JOB_REPORT_HU.md).


## 2026-10-06: teljes tartalom AI-job CI-bizonyítéka

[Main CI](https://github.com/Muzsy/future_flow/actions/runs/37447883609), runtime `e1067ddbb958f2402b88f84b7c2206c3ac8efc69`: verify és container sikeres. 402 teszt/34 fájl, format/types/API/worker/Next production build és 70 séma-drift. Izolált PostgreSQL/TLS: 001–020 és ismétlés, párhuzamos teljes-scope enqueue/claim egy attempt, immutable receipt/result, nincs automatikus paid retry, source-change/törlési marker/export/cascade/RLS; minden korábbi P09/S0–S3 proof megmarad. Web/API/Caddy verified HTTPS, üres review queue-k és tiszta worker-leállás, nulla paid AI/valódi CI-kulcs, egress tiltva. A 020 runtime-kapu lezárult; külön full-scope curator és kiadási kapuk következnek. Ez nem éles Contabo-telepítés.
