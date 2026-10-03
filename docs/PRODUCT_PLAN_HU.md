# alterward — aktív termék- és megvalósítási terv

2026-10-03 · A [pozicionálási és célmeghatározási dokumentum](PROJECT_POSITIONING_AND_GOAL_DEFINITION_HU.md) és a [nyilvános életutak, Discovery és közösség specifikációja](PUBLIC_LIVES_DISCOVERY_COMMUNITY_SPEC_HU.md) alapján. Ez a célállapot és az odavezető terv; a jelenleg működő kódot az [implementációs állapot](IMPLEMENTATION.md), a végrehajtás sorrendjét a [következő lépések](NEXT_STEPS.md) írják le.

## 1. Irány és dokumentumok szerepe

AI által generált, tartósan mentett, folytatható és elágaztatható alternatív életet építünk. A felhasználó egy identitással és céllal elindul, eseményeket él meg, dönt, majd ugyanabban az életben tapasztalja meg a következményeket. Később visszatérhet egy korábbi döntéshez, és kipróbálhat másik ágat.

Az elsődleges élmény a kíváncsiság, a történet és az életutak felfedezése. Az önreflexió ebből származó érték. A cél irányt ad a szimulációnak; teljesülését a rendszer nem ígéri meg. A kommunikáció lehetséges szcenáriókról beszél, és nem ad a kitalált eseményekhez megtörténési százalékot.

Tervezési elsőbbség: felhasználói döntések → két stratégiai alapdokumentum → ez az aktív terv → részletes feladatlista. A közösségi specifikáció felváltja a korábbi közösségi funkciók későbbre halasztását; a személyes szimuláció elsőbbségét a 42. fejezet kifejezetten megtartja. Az implementációs dokumentum és a kódból exportált sémák a meglévő működésről adnak számot. A `docs/alter_jovo_docs` és az eredeti ZIP változatlan történeti referencia; a tízéves első generálás és a hosszú kötelező kérdőív korábbi javaslatait ez a terv felváltja.

Megmaradó döntések: valódi OpenAI-generálás az első használható verzióban, Supabase, angol alapnyelv és választható magyar, 18+, munka a `Muzsy/future_flow` repó `main` ágán. AI nélküli termékváltozat nem készül. Automatizált tesztben továbbra is használható elkülönített helyettesítő.

A termék neve **alterward**, a felhasználó 2026-10-03-i döntése alapján. A repó és a projektkönyvtár `future_flow` marad. A belső csomagnevek, régi sémaazonosítók és védett titokkönyvtárak megtartása technikai kompatibilitás, nem márkanév-döntés. A forrásdokumentumok korábbi munkanevei történeti szövegek. Domainválasztás és fizetős csomag továbbra sincs eldöntve.

A termék három összekapcsolt rétege: **Private Personal Simulation**, **Official Lives / Scenarios** és önként publikált **Community Lives**. Discoveryben már az induláskor lesznek kurált, valódi AI-val generált életutak. Az olvasás meglévő snapshotból történik; a „Fork this life” vagy személyre szabás új, saját privát szimulációhoz vezet.

A felhasználó új döntése szerint a teljes felület, kérdőív, események, döntések és AI-fejezetek angolul és magyarul szükségesek, további nyelvekkel bővíthető szerkezettel. A [nyelvi alap](LOCALIZATION_HU.md) a meglévő v1 prototípusba is bekötve. Felületnyelv és egy élet mentett tartalomnyelve külön adat; nyelvváltás nem fordítja át automatikusan a korábbi canont és nem indít fizetett generálást. A magyar környezet földrajzi kiindulás, nem kizárólagos felület- vagy történetnyelv.

## 2. A jelenlegi alap és a szükséges változás

| Terület | Jelenlegi működés | Új cél |
|---|---|---|
| Első élmény | 29 kérdéses profil, tízéves alapforgatókönyv | 10–15 fontos kérdés, rövid első időszak, döntés |
| Generálás | 5–10 esemény, 2–3 fejezet egy teljes horizontra | 2–5 esemény időszakonként, döntésnél megálló történet |
| Döntés | A választott opció mindig új gyermekágat nyit | Aktuális döntés az életet viszi tovább; külön művelet a múltból elágazás |
| Állapot | Profilpillanatkép, semleges környezet, főként számszerű életállapot | Időhöz kötött tények, szereplők, célok, lehetőségek és következmények |
| Visszatérés | Elmentett történet és ágak megtekintése | Mentett döntés és állapot alapján következő időszak ugyanazon az ágon |
| Minőségbizonyíték | Három szintetikus profil, három alap és három ág | Több egymást követő időszak konzisztenciája és emberi folytatási igény |
| Költség | A helyi AI-próbához mérés és keretőr | Alkalmazásszintű keret, hibaköltség és költség/folytatás mérés |
| Nyilvános tartalom | Nincs publikálás vagy Discovery | Külön anonimizált snapshot, Official/Community jelölés, böngészés és saját privát fork |

A hitelesítési, adatbázis-, verziózási, jogosultsági, háttérfeladat- és elágazási alapokat újrahasználjuk. A folytatható MVP még nincs kész. A [korábbi AI-próba](AI_VALIDATION.md) a meglévő generálás működését bizonyítja, a megtartási hipotézist nem.

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

A kezdő kérdőív 10–15 kérdése közösen tartalmazza a profilt és a célt. Az első tervezett bontás 12 lépés: identitásmód/korcsoport; hely és költözési lehetőség; lakhatás; munka; pénzügyi mozgástér; képzettség/készségek; fontos kapcsolatok; idő/energia; vállalható kockázat; fő cél és időtáv; motiváció és vállalható áldozatok; kizárt áldozatok/korlátok. Opcionális szabad kontextus egészítheti ki; a lépések érthetőségét és idejét a prototípusban ellenőrizzük.

Az indulás nem követel meg minden személyiségskálát vagy két kapcsolatot. A felhasználó megadhat nulla közeli kapcsolatot, álneveket és ismeretlen opcionális adatokat. Az ismeretlen érték külön jelölést kap; a semleges szám nem válik a személyről állított ténnyé. A további részleteket később, releváns helyzetben kérjük be, menthető és folytatható módon.

A cél verziózott szerződésének mezői: `category`, `description`, `priority`, `horizon`, `motivation`, `acceptable_tradeoffs`, `unacceptable_tradeoffs`, `current_progress`, `constraints`. Az első élményben egy fő célt veszünk fel; az opcionális mezők nem teszik kötelezővé a hosszú kitöltést. A cél előrehaladása szimulációs állapot, nem a történetből kitalált sikerszázalék.

A saját profil és a szimulált identitás külön állomány. Az alternatív identitás/élethelyzet felülírásait az adott élet pillanatképe tárolja; a saját profil korábbi verziója változatlan marad. Az indulás a mai, magyar környezetre épül. Történelmi és összetett fiktív világok később jönnek.

Valós profilhoz 18+ korcsoport és a szimulációban eltelt idő tartozik. Ebből nem képezünk kitalált pontos születési dátumot. Pontos fiktív életkor külön megadható, 18+ határral.

## 5. Tartós világ és állapotátmenetek

A termékbeli `WorldState` a teljes szimulált helyzet. A jelenlegi `ff_world_versions` csak semleges környezeti kontextus, a `ff_life_states` részleges életállapot. Az új szerződésben külön kezeljük a környezetet és a személy/élet állapotát; együttes nézetük adja a termék világállapotát.

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

Tervezett változások, még nem létező funkciók:

- Verziózott időszak-/állapotszerződés, időszakot tároló rekordok, ág aktuális állapota/revisionje és az aktuális/történeti választások elkülönítése.
- Külön API-művelet a jelenlegi döntéshez, az ág folytatásához és a történeti forkhoz. A mai `/api/v1/decisions/:id/resolve` mindig gyermekágat nyit; új szerződés/API-verzióval kerüljük el a régi jelentés csendes átírását.
- A jobok időszakot és induló állapotrevisiont kapnak. A jelenlegi `future | branch` feladattípus mellé folytatás kerül. Kezdeti állapot csak élet/ág létrehozásakor készül; a sorszámok az ágon belül folyamatosak.
- Áganként egyszerre egy generálás: idempotenciakulcs, revisionellenőrzés és tranzakció. Dupla kattintás ugyanazt a feladatot adja vissza, elavult állapot 409-et kap. Elveszett worker-lease mellett nincs új esemény vagy fejezet commit.

Az adatbázis változása új, additív `003+` migrációval (a `002_content_locale.sql` már az életek nyelvét vezette be) történik; az alkalmazott `001_foundation.sql` ellenőrzőösszege megmarad. A v2 időszak-/tényállapot-szerződés és tiszta domain-validátor első szelete elkészült; [pontos határai](V2_SIMULATION_CONTRACT_HU.md) külön dokumentáltak. Az új adatbázis, API és worker bekötése még nem áll rendelkezésre.

A korábbi tízéves életek verzióval jelölve visszaolvashatók maradnak. Az új hurokhoz induláskor explicit új v2-élet/másolat készül, ellenőrzött kiinduló állapotból. Az előre generált, még ki nem választott tízéves jövőre nem fűzünk rá folytatást. Az átállás nem írja újra a régi profilokat, canon-hasheket vagy történeteket; külön migrációs és visszaolvasási ellenőrzést igényel.

## 7. AI, narratíva, emlékezet és költség

Az AI készíti a kontextushoz illő eseményeket és az élet létrehozásakor választott angol vagy magyar történetet. A fejezet felidézi a korábbi fontos döntéseket, jelenetet és következményt mutat, majd valódi választási feszültségnél megáll. A hihető konfliktus és változatosság fontosabb a folyamatos rendkívüli drámánál. Az eredmény történetként is olvasható legyen.

Tervezett folyamat: profil/állapot → AI-eseményjavaslat → sémák és domainfeltételek → determinisztikus átmenetek → menthető canon → AI-fejezet → hivatkozás- és történethűség-ellenőrzés → atomikus időszak-commit. A szükséges tájékoztatás röviden, jól látható helyen szerepel; minden bekezdésben ismételt figyelmeztetés nem része a narratívának.

A következő időszak bemenete a rögzített állapot, a döntéstörténet, a közelmúlt eseményei és a releváns korábbi tények. Az összefoglaló eredeti eseményazonosítókra hivatkozik és a canonból újraképezhető. Eltéréskor a strukturált tény az irányadó. A teljes, folyamatosan növekvő történetet nem küldjük minden kérésben újra.

A javítás célzott: a hibás strukturált válasz vagy fejezet legfeljebb egy automatikus javítási kört kap, előre lefoglalt költségen belül. Érvényes esemény/checkpoint megmarad; narratívahiba nem indítja újra az egész világot. Ismételt hiba látható állapotot és biztonságos kézi újrapróbálást eredményez. A hibás és ismeretlen fogyasztású kérés költsége sem tűnik el a nyilvántartásból.

A felhasználói kísérleti keret 5 USD. A lezárt v1-próba becsült fogyasztása 0,6299505 USD; a későbbi, 14 hívásos [modellválasztási próba](AI_MODEL_ROUTING_HU.md) további 0,0542136 USD. A nyelvi próba előtti összesített becslés 0,6841641 USD, akkori maradvány körülbelül 4,32 USD; ez nem lekérdezett szolgáltatói egyenleg. A korábbi tervfrissítés önmagában nem használt API-kreditet. Az új időszakok árát új tokenmérésből számítjuk; a régi tízéves generálás költségét nem vetítjük rájuk automatikusan.

A nyelvi próba 12 új valódi OpenAI-hívást használt (6 angol, 6 magyar), további 0.3352520 USD becsült költséggel. A teljes 44 hívás összesített tokenbecslése 1.0194161 USD; az 5 USD keretből számított maradvány körülbelül 3.98 USD. Ez nem lekérdezett szolgáltatói egyenleg. Ismeretlen fogyasztású hívás nincs. [Nyelvi ellenőrzés](LOCALIZATION_HU.md).

Zárt felhasználói teszt előtt alkalmazásszintű keretőr kell: kérés előtti foglalás, felhasználói/projektlimit, hibaköltség, párhuzamos foglalások és a tényleges használat elszámolása. A meglévő helyi smoke-keretőr ennek csak tesztelőzménye. Olcsóbb modellre irányítás külön mérés után következik; a működő OpenAI-integrációt megtartjuk.

A modellválasztási vizsgálat első jelöltje Luna eseményekhez, Sol narratívához és ellenőrzéshez. Változatlan régi tokenszámmal körülbelül 40% megtakarítást adhat; a teljes lánc és a v2-folytatás minőségét még igazolni kell. A checker külön konfigurálása elkészült, a modellek automatikus cseréje/fallbackje még fejlesztendő. P02-ben mérjük a rövid eseményfeladatot, P05-ben valósul meg a korlátozott routing és keretkezelés.

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

Az MVP-ből kimarad a kommentrendszer, DM/chat, követési gráf, reakciók, alkotói monetizáció, marketplace, fizetés, natív mobil, hang/kép/avatar/VR, multiplayer, habit tracker, coaching- és egészségplatform, összetett achievementek és több száz mutató. A szabad szöveges döntés, összetett compare és sokcélú optimalizálás a működő folytatás után kerül sorra. A részletes [nyilvános megvalósítási terv](PUBLIC_CONTENT_IMPLEMENTATION_PLAN_HU.md) rögzíti az adatmodell, jogosultság, visszavonás és moderáció elfogadását.

A mentett életek alapértelmezésben privátak. Adathozzáférés és fióktörlés az indulás része, fizetéstől függetlenül. Discovery, olvasás, mentés, megosztás és publikálás az új specifikáció szerint ingyenes; saját generálás/fork/személyre szabás limitálható. Prémiumérték lehet több aktív élet, több generálás és mélyebb szimuláció. Pontos limitek és árak később, mért költség alapján készülnek. Privát működés nem kerül fizetési feltétel mögé.

## 9. Elfogadás és mérés

A személyes technikai alap elfogadása: rövid profilból valódi AI-időszak készül; a döntés állapotot módosít; a második időszak ugyanarra az ágra kerül; kijelentkezés/belépés után folytatható a harmadikkal; a korábbi döntésből másik ág indítható a szülő módosítása nélkül. Dupla kérés, megszakítás, hibás AI-válasz és elveszett lease sem okoz dupla vagy részleges canon-commitot. Jogosultság, export és Auth/DB-törlés minden esetben kötelezően hibamentes.

Legalább 20 különböző szintetikus eset ellenőrzi a három egymást követő időszakot, az alternatív választásokat, korlátokat, kapcsolati és tulajdonlási tényeket, promptba rejtett utasításokat és költséghatárokat. Ez technikai/minőségi próba. Ettől külön 20–50 résztvevős magyar zárt használati teszt méri az élményt és a visszatérést; a létszám induló cél, nem statisztikai bizonyító erejű mintaméret.

| Metrika | Első mérési definíció |
|---|---|
| Onboarding Completion | Első szimulációt sikeresen elindítók / onboardingot elkezdő egyedi felhasználók |
| First Simulation Completion | Első fejezet végén olvasás-befejezést jelzők / első fejezetet megnyitó egyedi felhasználók; a kijelzés külön szerepel a tényleges olvasásról |
| First Decision Rate | Első döntést sikeresen mentők / első döntést megjelenítve látó egyedi felhasználók |
| **Continuation Rate** | Első fejezetet befejezők közül „Folytatom” műveletet indítók aránya; külön szám a következő időszak sikeres commitja |
| **Continued Life Sessions** | Későbbi munkamenetben legalább egyszer folytatott egyedi életek száma; mellette külön a sikeres folytatási munkamenetek száma |
| Return D1/D7/D30 | Első AI-fejezetet megnyitó kohorsz visszatérése az adott napon; időzóna és megfigyelési ablak előre rögzítve |
| Branch Rate | Történeti döntésből sikeres új ágat készítők / legalább egy elmentett döntéssel rendelkező egyedi felhasználók |
| Költség | AI-költség/aktív felhasználó, sikeres időszak és folytatás; hibák és javítások költségével együtt |

A „Folytatom” kattintás szándék, a sikeres commit működési eredmény: együtt mutatjuk őket. Technikai hibát nem zárunk ki csendben a megfelelő kohorszból; generálási sikerarány és várakozási idő külön is látszik. Az élet/munkamenet azonosító és az inaktivitási küszöb a mérési szerződés része lesz, tartalom vagy személyes cél analitikai naplózása nélkül.

Az elsődleges kérdés: **az első eredmény után akarja-e folytatni ugyanazt az alternatív életet?** A visszatérés kíváncsiságból és nyitott eseményekből épüljön; mesterséges napi streak nem szükséges. Emberi visszajelzésben mérjük, mi személyes, hihető, érdekes, és miért szeretné tudni, „mi történik ezután”.

Retenciós küszöbértéket még nem igazoltunk. A pilot tapasztalatai alapján, a következő értékelt kohorsz előtt rögzítjük a számszerű célt és az összehasonlítást. Egyetlen jó AI-minta vagy sikeres technikai teszt nem jelent validált terméket.

## 10. Nyitott hipotézisek és függőségek

A stratégia A–G hipotézisei tesztelendők: saját vagy fiktív identitás; onboarding értéke; folytatás vagy új élet; fork és visszatérés kapcsolata; megosztási szándék; más életének fogyasztása; történet vagy analitikus riport. Először a személyes core loopot vizsgáljuk; a nyilvános indulási kapu előtt a Discovery → fork → első saját időszak konverzió és a publikálási bizalom is külön próbát kap.

A valódi Supabase email-belépés és teljes Auth/DB/OpenAI folyamat még ellenőrzendő. A fióktörlés éles ellenőrzéséhez hiányzó szerveroldali Supabase-kulcs korábban jelzett függőség; ez a tervezést és a helyi fejlesztést nem állítja meg. Titok csak a védett helyi környezetbe kerülhet.

Az induló hat hónap, fejezethossz, kérdőívbontás és mérési definíció visszafordítható munkadöntés. Márkanév és önkéntes nyilvános megosztás elfogadott irány. Domain, fizetős csomag, végleges keretek és új szolgáltatói költségkeret külön döntés lesz. A feladatokhoz most nem rendelünk megalapozatlan naptári határidőt.

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
