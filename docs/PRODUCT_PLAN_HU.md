# Aktív termék- és megvalósítási terv

2026-10-02 · A [pozicionálási és célmeghatározási dokumentum](PROJECT_POSITIONING_AND_GOAL_DEFINITION_HU.md) alapján. Ez a célállapot és az odavezető terv; a jelenleg működő kódot az [implementációs állapot](IMPLEMENTATION.md), a végrehajtás sorrendjét a [következő lépések](NEXT_STEPS.md) írják le.

## 1. Irány és dokumentumok szerepe

AI által generált, tartósan mentett, folytatható és elágaztatható alternatív életet építünk. A felhasználó egy identitással és céllal elindul, eseményeket él meg, dönt, majd ugyanabban az életben tapasztalja meg a következményeket. Később visszatérhet egy korábbi döntéshez, és kipróbálhat másik ágat.

Az elsődleges élmény a kíváncsiság, a történet és az életutak felfedezése. Az önreflexió ebből származó érték. A cél irányt ad a szimulációnak; teljesülését a rendszer nem ígéri meg. A kommunikáció lehetséges szcenáriókról beszél, és nem ad a kitalált eseményekhez megtörténési százalékot.

Tervezési elsőbbség: felhasználói döntések → új pozicionálási dokumentum → ez az aktív terv → részletes feladatlista. Az implementációs dokumentum és a kódból exportált sémák a meglévő működésről adnak számot. A `docs/alter_jovo_docs` és az eredeti ZIP változatlan történeti referencia; a tízéves első generálás és a hosszú kötelező kérdőív korábbi javaslatait ez a terv felváltja.

Megmaradó döntések: valódi OpenAI-generálás az első használható verzióban, Supabase, magyar webes indulás, 18+, munka a `Muzsy/future_flow` repó `main` ágán. AI nélküli termékváltozat nem készül. Automatizált tesztben továbbra is használható elkülönített helyettesítő.

A Branchward névjavaslat. A termék átnevezése, domain- és védjegyvizsgálata külön későbbi döntés; a fejlesztést most a `future_flow` néven folytatjuk.

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

Az adatbázis változása új, additív `002+` migrációval történik; az alkalmazott `001_foundation.sql` ellenőrzőösszege megmarad. Az új mezők és API-k a megvalósításkor részletes szerződést kapnak, most nem állítjuk, hogy már rendelkezésre állnak.

A korábbi tízéves életek verzióval jelölve visszaolvashatók maradnak. Az új hurokhoz induláskor explicit új v2-élet/másolat készül, ellenőrzött kiinduló állapotból. Az előre generált, még ki nem választott tízéves jövőre nem fűzünk rá folytatást. Az átállás nem írja újra a régi profilokat, canon-hasheket vagy történeteket; külön migrációs és visszaolvasási ellenőrzést igényel.

## 7. AI, narratíva, emlékezet és költség

Az AI készíti a kontextushoz illő eseményeket és az élő magyar történetet. A fejezet felidézi a korábbi fontos döntéseket, jelenetet és következményt mutat, majd valódi választási feszültségnél megáll. A hihető konfliktus és változatosság fontosabb a folyamatos rendkívüli drámánál. Az eredmény történetként is olvasható legyen.

Tervezett folyamat: profil/állapot → AI-eseményjavaslat → sémák és domainfeltételek → determinisztikus átmenetek → menthető canon → AI-fejezet → hivatkozás- és történethűség-ellenőrzés → atomikus időszak-commit. A szükséges tájékoztatás röviden, jól látható helyen szerepel; minden bekezdésben ismételt figyelmeztetés nem része a narratívának.

A következő időszak bemenete a rögzített állapot, a döntéstörténet, a közelmúlt eseményei és a releváns korábbi tények. Az összefoglaló eredeti eseményazonosítókra hivatkozik és a canonból újraképezhető. Eltéréskor a strukturált tény az irányadó. A teljes, folyamatosan növekvő történetet nem küldjük minden kérésben újra.

A javítás célzott: a hibás strukturált válasz vagy fejezet legfeljebb egy automatikus javítási kört kap, előre lefoglalt költségen belül. Érvényes esemény/checkpoint megmarad; narratívahiba nem indítja újra az egész világot. Ismételt hiba látható állapotot és biztonságos kézi újrapróbálást eredményez. A hibás és ismeretlen fogyasztású kérés költsége sem tűnik el a nyilvántartásból.

A felhasználói kísérleti keret 5 USD. A lezárt v1-próba becsült fogyasztása 0,6299505 USD; a későbbi, 14 hívásos [modellválasztási próba](AI_MODEL_ROUTING_HU.md) további 0,0542136 USD. Az összesített becslés 0,6841641 USD, a keretből számított maradvány körülbelül 4,32 USD; ez nem lekérdezett szolgáltatói egyenleg. A korábbi tervfrissítés önmagában nem használt API-kreditet. Az új időszakok árát új tokenmérésből számítjuk; a régi tízéves generálás költségét nem vetítjük rájuk automatikusan.

Zárt felhasználói teszt előtt alkalmazásszintű keretőr kell: kérés előtti foglalás, felhasználói/projektlimit, hibaköltség, párhuzamos foglalások és a tényleges használat elszámolása. A meglévő helyi smoke-keretőr ennek csak tesztelőzménye. Olcsóbb modellre irányítás külön mérés után következik; a működő OpenAI-integrációt megtartjuk.

A modellválasztási vizsgálat első jelöltje Luna eseményekhez, Sol narratívához és ellenőrzéshez. Változatlan régi tokenszámmal körülbelül 40% megtakarítást adhat; a teljes lánc és a v2-folytatás minőségét még igazolni kell. A checker külön konfigurálása elkészült, a modellek automatikus cseréje/fallbackje még fejlesztendő. P02-ben mérjük a rövid eseményfeladatot, P05-ben valósul meg a korlátozott routing és keretkezelés.

## 8. Fejlesztési fázisok és MVP-határ

| Fázis az új stratégiában | Konkrét cél | Kilépési feltétel |
|---|---|---|
| 0 – Termékprototípus | Rövid profil → valódi AI-fejezet → választás → folytatás | Végigvihető új hurok a meglévő technikai alapokon |
| 1 – Tartós MVP | Fiók, mentett állapot és események, visszatérés, idővonal, külön fork, mérés | Böngészős folyamat és adatkezelés működik; zárt emberi próba elindítható |
| 2 – Szimulációminőség | Mélyebb kapcsolat/pénzügy, jobb következmények, kontextus-visszakeresés, mért modellválasztás | Több időszakon át hihető, következetes és mérhető költségű élmény |
| 3 – Újrajátszhatóság | Gazdagabb élet- és célsablonok, új célok, vizuális összehasonlítás | A core loop használata indokolja a bővítést |
| 4 – Közösség | Timeline/ág megosztása, felfedezés, reakciók; később más életének forkja | Érdekes szimulációs tartalom és külön adatvédelmi/megosztási terv |
| 5 – Platform | Alkotói szcenáriók, történelmi/fiktív világok, API/plugin, mobil | Validált használat és fenntartható üzemeltetés |

Az állapotátmenetek és a minimális emlékezet már a prototípus/MVP előfeltételei; a 2. fázis ezek mélyítését jelenti. A fázisszámok nem halasztják el a helyes canon, a jogosultság vagy a költségkeret követelményét.

Az MVP-ből kimarad a közösségi háló, DM/követés, fizetés, marketplace, natív mobil, hang/kép/avatar/VR, multiplayer, habit tracker, coaching- és egészségplatform, összetett achievementek és több száz mutató. A szabad szöveges döntés, összetett compare és sokcélú optimalizálás a működő folytatás után kerül sorra. Az MVP-ben a történeti fork már kötelező.

A mentett életek alapértelmezésben privátak. Adathozzáférés és fióktörlés az indulás része, fizetéstől függetlenül. A hosszú távú monetizáció több életre, ágra, világra és mélységre épülhet. A stratégia prémiumötletei, köztük a privát élet mint prémiumfunkció, nem írják felül ezt a meglévő adatkezelési döntést; árazásról külön későbbi terv készül.

## 9. Elfogadás és mérés

Technikai MVP-elfogadás: rövid profilból valódi AI-időszak készül; a döntés állapotot módosít; a második időszak ugyanarra az ágra kerül; kijelentkezés/belépés után folytatható a harmadikkal; a korábbi döntésből másik ág indítható a szülő módosítása nélkül. Dupla kérés, megszakítás, hibás AI-válasz és elveszett lease sem okoz dupla vagy részleges canon-commitot. Jogosultság, export és Auth/DB-törlés minden esetben kötelezően hibamentes.

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

A stratégia A–G hipotézisei tesztelendők: saját vagy fiktív identitás; onboarding értéke; folytatás vagy új élet; fork és visszatérés kapcsolata; megosztási szándék; más életének fogyasztása; történet vagy analitikus riport. Először az első négyet és a történet élményét vizsgáljuk. A közösségi hipotézisek későbbi fázisban kapnak termékpróbát.

A valódi Supabase email-belépés és teljes Auth/DB/OpenAI folyamat még ellenőrzendő. A fióktörlés éles ellenőrzéséhez hiányzó szerveroldali Supabase-kulcs korábban jelzett függőség; ez a tervezést és a helyi fejlesztést nem állítja meg. Titok csak a védett helyi környezetbe kerülhet.

Az induló hat hónap, fejezethossz, kérdőívbontás és mérési definíció visszafordítható munkadöntés. Márkanév, fizetős csomag, nyilvános megosztás és új szolgáltatói költségkeret külön döntés lesz. A feladatokhoz most nem rendelünk megalapozatlan naptári határidőt.

## 11. Visszakövethetőség az új stratégiához

| Forrásfejezet | Tervben érvényesülő döntés |
|---|---|
| 2–8, 12–14, 33 | Tartós alternatív élet, hat pillér, cél mint irány |
| 15, 24, 26, 32.4 | Rövid profil, fokozatos mélyítés, rövid első időszak |
| 16–19, 21–22, 32.2–3 | Strukturált tények, AI-narratíva, validált következmények, emlékezet |
| 17, 24, 26 | Folytatás és történeti fork külön művelet |
| 23, 27, 31, 34 | Folytatási szándék, későbbi életfolytatás, tesztelendő hipotézisek |
| 20, 25, 28–30, 35 | Fázisok, közösség később, márka és monetizáció külön döntés |

A forrás piaci/versenytársi hivatkozásai háttéranyagok; ez a terv nem teszi őket külön ellenőrzött piaci tényekké.
