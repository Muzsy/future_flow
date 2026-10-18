---
status: active-supporting
owner: product
last_reviewed: 2026-10-16
related:
  - ../product/MONETIZATION_HU.md
  - ../product/PRODUCT_HU.md
  - ../operations/NARRATIVE_EVALUATION_HU.md
---

# Alterward – történetgenerálás, érdeklődés és gazdaságosság

2026. október 15. | Konkrét termékjavaslat és végrehajtási terv

**Státusz: döntésre előkészített javaslat. A dokumentum nem kapcsol be árazást, előfizetést, új limitet vagy éles költést.** A fejlesztési mérés külön, összesített 5 USD keretből történik. A személyes béta operátori kerete ettől független.

## 1. A javasolt induló modell

**Egy személyes csomag: havi 8 új, minőségileg elfogadott fejezet, rugalmas felhasználással; további 4 fejezet külön megvásárolható csomagban.** A fejezetek főág és alternatív ág között szabadon eloszthatók. Mindenki ugyanazt a legjobb, igazolt minőségű történetgenerálást kapja. A többet fizető több történetet kap; az alapcsomag története sem lehet gyengébb.

Az induló számítási feltételezés fejezetenként **0,70 USD teljes AI-költség**, a sikertelen próbák és javítások ráosztásával. Ez óvatos tervezési forgatókönyv, nem mért felső korlát vagy garantált üzemi ár. Ezen a költségszinten az alapcsomagnak **havi 18 USD vállalkozásnál maradó bevételre** van szüksége ahhoz, hogy a lent megadott egyéb változó költségfeltételezéssel kb. 60% hozzájárulási fedezetet adjon. A vevő által fizetendő ár ennél magasabb lehet az adók és a szolgáltatói levonások miatt; ezeket még nem választottuk ki.

Kezdetben egy csomagot teszteljünk, ne sok mesterséges árszintet. A jelenlegi Explorer/Connected/World nevek Shared-jogosultságok, nem személyes fejezetcsomagok. Ezeket nem szabad hallgatólagosan átértelmezni.

Az ajánlás feltételes: előbb többfejezetes, emberileg is megfelelő történet kell. A jelenlegi kis minta még nem bizonyítja sem a szükséges minőséget, sem a fizetési hajlandóságot, sem a fenntartható egységköltséget.

## 2. Mit jelent egy felhasználható fejezet?

Egy egység egy új időszak teljes narratívája és az abból következő döntési pont, tartósan mentve a felhasználó ágán. A jelenlegi személyes queue hat hónapos szimulációs időszakot készít; a contract tágabban 6/12 hónapot ismer. A havi valós felhasználási keret nem változtatja meg ezt az időmodellt.

| Művelet | Javasolt fejezetfogyasztás |
|---|---:|
| Új élet első sikeresen elkészült fejezete | 1 |
| Meglévő ág következő sikeresen elkészült fejezete | 1 |
| Másik döntésből létrehozott ág első új fejezete | 1 |
| Ág létrehozása, régi fejezetek öröklése | 0 |
| Olvasás, újranyitás, régi választások áttekintése | 0 |
| Már mentett fejezet visszaadása, hálózati újrapróba | 0 |
| Sikertelen generálás, belső javítás, minőségkapu-elutasítás | 0 a felhasználónál; költség a szolgáltatónál |
| Export, törlés és más szükséges adatkontroll | 0 |

A generálás alatt az egység ideiglenesen foglalt. Csak a sikeres, authoritative commit fogyasztja el. A megismételt kérés ugyanahhoz az eredményhez tér vissza, nem indít új fizetést vagy költést. A felhasználó által kért teljesen új változat új generálás; ehhez előre jelezni kell az egy egység fogyasztását. Igazolt rendszerhiba rendezése nem lehet fizetős újravásárlás.

Egy technikai pass nem bizonyít önmagában jó történetet. A termékben a kapun átment, mentett fejezet a számlálható kézbesítési egység; a minőség megfelelőségét ettől külön emberi mintával és valódi olvasói visszajelzéssel kell ellenőrizni. Egyedi panaszok rendezési szabálya a billing fejlesztés része, nem korlátlan ingyenes újragenerálás.

## 3. Hogyan tartsa fenn az érdeklődést?

A nyolc fejezet heti kb. két új olvasási alkalmat tesz lehetővé, de nem kötelező heti menetrend. A felhasználó az első napon is elolvashat több fejezetet. A napi biztonsági korlát külön operatív védelem; nem helyettesíti a havi csomagot. A kvóta nem eszköz arra, hogy egy érdekes jelenet közepén mesterségesen várakoztassunk.

**Az értékarány külön kockázat.** A jelenlegi 650–950 szavas céltartomány mellett nyolc fejezet kb. 5200–7600 új szó havonta; rövidebb, még elfogadható fejezeteknél ennél kevesebb is lehet. Ez nem nagy mennyiségű regényanyag. Az ajánlat értékét a személyességnek, a következményeknek és az alternatív utaknak kell adniuk. Ha az olvasók ezt kevésnek tartják, meg kell mérni a 12 fejezetes változatot is: 0,45 USD teljes egységköltségnél 17,25 USD, 0,70 USD-nél 24,75 USD megtartott bevétel kell ugyanahhoz a 60%-os célhoz. A 8-as kezdőkeret gazdasági hipotézis, nem bizonyítottan megfelelő tartalommennyiség. A fejezetek mesterséges darabolásával nem növeljük a számot.

**Az első alkalomra három fejezetnyi lehetőség kell**, hogy az olvasó legalább egy saját döntésének későbbi következményét lássa. Ez a havi nyolcból szabadon használható, nem három kötelezően előre legenerált szöveg. A következő fejezet csak a tényleges választás után készüljön. A lehetséges ágak előzetes legenerálása növelné a kidobott tartalom költségét, és nem biztosítana jobb élményt.

Egy jó visszatérési ciklus az Alterwardban:

1. A szereplő valami konkrétat akar, cselekszik, és kap egy látható választ a világtól.
2. A fejezet lezár egy kisebb kérdést, miközben egy valódi következő dilemmát nyit.
3. A felhasználó választ; a választás mentve marad akkor is, ha most nem folytatja.
4. Visszatéréskor a már tárolt cél, korábbi választás és rövid összefoglaló segít felvenni a fonalat. Ehhez ne legyen kötelező új AI-hívás.
5. A következő fejezet megmutatja, mit változtatott a döntés. Ne ugyanazt a próbát vagy engedélykérést nevezze át.

Az érzékelhető részleges lezárás és életváltozás a felhalmozott kánonból következzen, fejezetszámhoz kötött ütemezés nélkül. Kapcsolat, szerep, rutin, célirány vagy élethelyzet is változhat; a helyszín és a szereplők megtartása önmagában nem stagnálás. Nincs 3–4 fejezetes fejlődési kötelezettség vagy csomagonkénti fordulat. Ne gyorsítsuk mesterségesen az életkort vagy a drámát a havi keret kedvéért.

Az alternatív ág értékét a már meghozott, érdemi döntés adja. Példa a nyolc egységre: 6 főági fejezet + 2 alternatív következmény; vagy 8 főági fejezet. Nem szükséges külön olcsóbb, gyengébb minőségű mellékág.

Induló rollover-javaslat: legfeljebb 4 fel nem használt havi egység vihető át a következő számlázási időszakra; a havi keretből egyszerre legfeljebb 12 legyen használható. Ez külön elfogadandó termékszabály, amelyet pontos lejárati idővel kell megjeleníteni. A külön vásárolt csomag lejárata külön feltétel; a kalkuláció nem számol a fel nem használt vásárlásokból származó nyereséggel.

## 4. Mit tudunk tényleges mérésből?

A PR #37 utáni checkpointban az összes fejlesztési mérés **75 API-hívás, 1,632 USD konzervatív elszámolás**, 1,5093987 USD használati árbecslés. Nincs ismeretlen használat vagy hozzárendeletlen foglalás. A fejlesztési összeg tartalmaz régi és új változatokat, összehasonlításokat és hibafeltárást is; nem osztható egyszerűen a felhasználói fejezetek számával.

| Forrásváltozat | Teljes új narratív próbák | Automatikusan elfogadott | Összes ilyen próba költsége / elfogadott fejezet |
|---|---:|---:|---:|
| PR #36 utáni változat | 2 | 1 | 0,345410 USD |
| PR #37 utáni változat | 3 | 1 | 0,450140 USD |

Mindkét sor tartalmazza az elutasított teljes narratív próbák költségét. A külön fix-kánon író-összehasonlítás és a régebbi kutatási költés nem keveredik ebbe az egységárba. Ezek kis, eltérő forrású minták: az eltérés nem bizonyít tartós drágulási trendet. A passzok sem független emberi minőségjóváhagyások.

A következő forrás, a PR #38, a tervet még a próza megírása előtt ellenőrzi, és javítja a szereplő saját szándékának megjelenítését. Ez öt normál, legfeljebb nyolc fizikai hívással működik; a régi befagyasztott munkák négy/maximálisan hét hívásos policyje megmarad. A plusz ellenőrzés akkor gazdaságos, ha az elkerült rossz prózák és javítások költsége és az elért minőségnövekedés indokolják. A hívások száma önmagában nem mutatja ezt.

A dokumentum végén található friss mérési kiegészítés elsőbbséget élvez a legutóbbi összesített költésnél. A fenti sorok történeti, forrásonként megőrzött adatok.

## 5. A számítás és a döntési tartomány

Jelölések:

- `c`: az összes üzemi generálás költsége / megfelelően kézbesített fejezetek száma. Elutasítás, javítás és szolgáltatói hiba költsége is szerepel. Nullás siker esetén nincs véges egységköltség.
- `n`: ténylegesen kézbesített új fejezet/felhasználó/hó.
- `h`: egyéb változó kiszolgálási költség/fizető/hó; most **feltételezett 1,50 USD** infrastruktúra-, tárolási és ügyfélszolgálati ráosztás, később mérendő.
- `r`: vállalkozásnál maradó havi bevétel az adók, fizetési levonások és visszatérítések után, az AI és `h` levonása előtt.
- Havi hozzájárulás: `r − n × c − h`.
- Hozzájárulási arány: `(r − n × c − h) / r`.
- Javasolt tervezési cél: 60%; ehhez `r ≥ (n × c + h) / 0,40`.

Ez hozzájárulás, **nem végső profit**. Fejlesztési munkabér, fix költségek és ügyfélszerzés ebből finanszírozandók. Az 1,50 USD nem mérés; ha a valós ráosztás nagyobb, a szükséges bevétel emelkedik.

| Fejezet/hó | AI-költség 0,35 USD/fejezetnél | 0,45 USD-nél | 0,70 USD-nél | 1,00 USD-nél | 60%-os fedezethez szükséges `r`, 0,70 USD és 1,50 USD mellett |
|---|---:|---:|---:|---:|---:|
| 4 | 1,40 | 1,80 | 2,80 | 4,00 | 10,75 |
| 8 | 2,80 | 3,60 | 5,60 | 8,00 | 17,75 |
| 12 | 4,20 | 5,40 | 8,40 | 12,00 | 24,75 |
| 16 | 5,60 | 7,20 | 11,20 | 16,00 | 31,75 |
| 24 | 8,40 | 10,80 | 16,80 | 24,00 | 45,75 |

Minden összeg USD. A teljes keret elhasználásával számolunk; a modell nem támaszkodik az inaktív előfizetők kihasználatlanságára.

**A havi 8 fejezet / 18 USD megtartott bevétel viselkedése:**

| Teljes fejezetköltség | AI + feltételezett egyéb változó költség | Havi hozzájárulás | Arány |
|---|---:|---:|---:|
| 0,35 | 4,30 | 13,70 | 76,1% |
| 0,45 | 5,10 | 12,90 | 71,7% |
| 0,70 | 7,10 | 10,90 | 60,6% |
| 1,00 | 9,50 | 8,50 | 47,2% |

Ha a jó minőségű történet valóban 1 USD-ba kerül, a 8 fejezet megtartásához a 60%-os cél mellett 23,75 USD megtartott bevétel kell. A helyes döntés lehet magasabb ár vagy más előre közölt csomag. A rosszabb történet nem elfogadható költségkorrekció.

Fordítva: 18 USD bevétel és 1,50 USD `h` mellett a 60%-os célhoz legfeljebb `floor((0,4 × 18 − 1,5) / c)` fejezet fér bele. Ez 0,45 USD-nél 12, 0,70 USD-nél 8, 1 USD-nál 5. A már eladott nyolcas csomagot nem szabad menet közben ötre csökkenteni; az eltérés üzleti tartalékot vagy következő ajánlatmódosítást igényel.

**Kiegészítő 4 fejezet:** legalább 8 USD megtartott bevétellel tesztelném. 0,70 USD egységköltség és feltételezett 0,40 USD külön ügyletre jutó egyéb változó költség mellett a hozzájárulás 4,80 USD, 60%. Az adó/fizetési levonások utáni összegről van szó, nem kész bruttó listaárról. A 0,40 USD szintén mérendő feltételezés. Nincs automatikus utánvásárlás.

## 6. Ingyenes kipróbálás és ügyfélszerzési költség

Javaslat: egyszeri **3 személyes próbafejezet**, hogy a választás és következmény élményét is megismerje az olvasó. Ez csak globális, előre elfogadott akvizíciós kerettel indulhat. Több fiókkal ismételt próbát kezelni kell, de privacy-védelmeket nem szabad megkerülni.

0,70 USD teljes költséggel három kipróbált fejezet **2,10 USD egy teljes próbára**. Ha 100 ilyen próba indul, az AI-költség 210 USD. Ez forgatókönyv, nem most engedélyezett költés.

| Próbából fizetővé válás, feltételezés | Próbák AI-költsége egy fizetőre, minden próba költségével | Megtérülés 10,90 USD havi hozzájárulásból |
|---|---:|---:|
| 5% | 42,00 USD | 3,85 fizetett hónap |
| 10% | 21,00 USD | 1,93 fizetett hónap |
| 20% | 10,50 USD | 0,96 fizetett hónap |

Ez csak a próbafejezetek ára: marketing, visszaélés, próbázók egyéb kiszolgálása és fix költségek nincsenek benne. A konverziók nem mért adatok. Tízszázalékos konverziónál két fizetett hónap 21,80 USD hozzájárulása alig fedezi a 21 USD próbaköltséget; rövid életű előfizetés esetén ez nem elég jó üzlet. Négy fizetett hónap 43,60 USD hozzájárulást adna, de ez sem retention-előrejelzés.

Ha a háromfejezetes próba nem térül meg, először a bemutatás és a célközönség illeszkedését mérjük. Alternatív teszt egy ingyenes személyes fejezet + kis, fizetős induló csomag; ez viszont gyengébben mutatja meg a döntés későbbi következményét. A meglévő Official történetek később csökkenthetik a személyre szabott kipróbálás költségét, de a kurált tartalom előállítása és release-je sem nulla költségű, és nem helyettesíti a saját döntés élményét.

## 7. Minőségi és érdeklődési kapuk

Az alábbi számok **előzetes pilot-döntési célok**, nem iparági tények és nem statisztikai garanciák:

1. Legalább 8 eltérő kitalált profil, profilonként 3 egymásból következő fejezet és célzott alternatív ág. Ne csak a legsikeresebb első fejezet maradjon a mintában. Rögzített forrás- és promptverzió szükséges.
2. A minőségi értékelésben legyen legalább két egymástól független emberi olvasó, a változat neve nélkül. Okság, egyediség, szereplői szándék, érzelmi hatás, döntés értelme és folytatási kedv: 1–5 skála. Kritikus kánon- vagy privacy-hiba nem átlagolható ki.
3. Első döntési cél: a fejezetek legalább 80%-át mindkét olvasó megfelelőnek tartsa; a háromfejezetes sorozatok többségénél legyen tényleges folytatási kedv. A nézeteltéréseket olvasni kell, nem csak átlagolni.
4. Korlátozott valódi pilot: például 20–30 olvasó, legalább 4 hét. Ez tanulási minta, nem biztos piacbecslés. Minden visszatérési aránynál szerepeljen a nevező és az eltelt megfigyelési idő.
5. Mérjük külön: első fejezet végére jutás, második/harmadik fejezet kérése, valódi másnapi/másheti visszatérés, `wouldContinue`, ismétlődési panaszok, fizetési hajlandóság, teljes keret kihasználása és hibák miatti elakadás. A gombkattintás nem kézbesített fejezet; a fejezet vége esemény nem bizonyított figyelmes olvasás.
6. A fejezetköltséget hosszú előzményű és alternatív ágas életeknél is mérjük, profilcsoportonként és összesítve. Külön átlag/p95 várakozás, végleges hibaarány és kézbesítésig szükséges próbák. A mostani kis minta p95 értéke nem szolgáltatási ígéret.

Induló döntési fa: jó minőség + megfelelő folytatás + tartható költség → fizetős ajánlat tesztelése. Jó minőség + gyenge visszatérés → ritmus/onboarding/értékajánlat javítása. Jó minőség + drága működés → ár/keret és azonos minőségű technikai optimalizálás. Gyenge történet → írói és tervezési javítás; ilyenkor a számlázás optimalizálása nem oldja meg a fő problémát.

## 8. Alkalmazásra épülő megvalósítás

A vizsgált alap PR #38 főági merge-je: `fd10b8563ab487b19577947ef94ef5b001caf437`. A forráshelyek repository-relatív hivatkozások; az alábbiak tervet írnak le, nem már elkészült billinget.

| Meglévő alap | Felhasználás / szükséges külön fejlesztés |
|---|---|
| `packages/database/src/lives.ts` – queue, pending decision, idempotens interakció, fork-öröklés | A jelenlegi napi/concurrent védelem marad. A havi fejezet-egyenleg új, külön szerveroldali admission; az ágöröklésért ne számoljon új tartalmat. |
| `packages/database/src/ai-budget.ts` | Valós USD költés, foglalás és projekt/felhasználói költségvédelem. Ez nem előfizetési fejezet-egyenleg; a két főkönyv külön marad. |
| `packages/database/src/life-jobs.ts`, `life-job-state.ts`; `apps/worker/src/narrative-processor.ts` | Egy jobhoz legfeljebb egy termékegység-foglalás; a meglévő policy szerinti belső javítás nem új ügyfélterhelés. Lease/recovery és költségbizonyíték megmarad. |
| `packages/contracts/src/life-v2.ts` – `lifeInteractionV2Schema` | Már van `chapter_end_reached`, `continuation_clicked`, `fork_clicked`, `life_opened`. Szerveroldali commitadatokkal és munkamenetekkel együtt használjuk őket; a kliensesemény nem billing-authority. |
| `packages/contracts/src/beta.ts`, `packages/database/src/beta.ts` | Meglévő `wouldContinue` és experience/repetition/consistency/decision visszajelzések. A fejezethez kötött értékelés alapja megvan; a vak irodalmi pontozás ettől külön benchmark. |
| `scripts/lib/narrative-evaluation-costs.ts` | A fejlesztési minta már számol a sikertelen teljes narratív próbákkal. Az üzemi dashboard ugyanezt az elvet alkalmazza; a fejlesztési kutatást külön tartsa. |
| `docs/product/MONETIZATION_HU.md` | A Shared entitlements és a személyes fejezetcsomag külön fogalom. Billing provider, subscription és webhook még nincs kész. |

Javasolt új, auditálható termékfőkönyv: vásárolt/havi/próba jogosultság, foglalás, fogyasztás, felszabadítás és visszatérítés külön idempotens eseménnyel. Az adatmodell konkrét nevei külön tervben rögzítendők; ne alakítsuk át az USD-budget ledgerét fejezetszámlálóvá.

**Tranzakciós követelmények:** a worker által sikeresen mentett új period és az egyetlen egység elfogyasztása együtt történjen. Ha ez ugyanabban az adatbázisban megoldható, egy tranzakció legyen; külső billing-egyeztetéshez idempotens outbox szükséges. Crash után előbb a commitot kell visszaolvasni, nem vakon visszaadni az egységet. Végleges sikertelen, nem commitolt job felszabadítja a termékfoglalást, a már felmerült USD-költség viszont megmarad.

Tesztelendő: dupla kattintás, párhuzamos ágak az utolsó egységnél, worker összeomlása commit előtt/után, lejárt foglalás, ismételt webhook, visszatérítés, havi forduló, időzóna, downgrade/cancel, adatvédelmi törlés. A törlés minimális pénzügyi auditjának adatkezelését külön felül kell vizsgálni; személyes szöveg ne kerüljön a billing eseményekbe.

## 9. A fejlesztés sorrendje és elfogadási feltételei

**A. Minőség és költség bizonyítása.** PR #38 kétprofilos diagnózisa, majd javított változaton többfejezetes és elágazási benchmark. Ember által jóváhagyandó döntéspárosítást nem helyettesítjük automatikus választással. Ugyanaz az összesített fejlesztési ledger; új kísérlet nem új 5 USD keret.

**B. Pilot-mérés.** A meglévő aktivitás/feedback és szerveres commitadatokból készülő privát kimutatás: kézbesített fejezet, hibával elakadt kérés, folytatás, D7/D30 visszatérés, költség és várakozás. Visszatéréshez a megfelelő napig megfigyelhető felhasználók legyenek a nevezőben. Rögzített pilot-költési plafon kell, külön jóváhagyva.

**C. Termékdöntés.** A mért minőség, használat és fizetési hajlandóság alapján elfogadni vagy módosítani: 8 havi fejezet, 4-es kiegészítő, 3-as próba, rollover, nettó bevételi igény. Bruttó ügyfélár, pénznem, adó és provider csak ekkor véglegesíthető. A jelen dokumentum számai nem válnak automatikusan éles feltétellé.

**D. Fejezet-egyenleg.** Külön Issue/branch/PR: szigorú contract, migráció, szerveres admission, jobhoz kötött foglalás, atomi sikeres fogyasztás, recovery és privacy. A fejlesztői tesztkeret maradjon elkülönítve a vásárlástól. Migrációnál recovery/schema guard és export/delete viselkedés együtt frissítendő.

**E. Billing és felület.** A választott provider checkoutja, ellenőrzött/idempotens webhookjai, subscription lifecycle, cancel/grace/refund és entitlement projection. A kliens nem adhat magának egységet. UI: „8 új fejezet”, következő forduló, rollover/lejárat, külön vásárlás pontos ára. Generálás előtt egyszerű „Ez 1 fejezetet használ fel”; hiba után egyértelmű visszaadás és választás az újrapróbáról. A háttér USD-budget és tokenár nem felhasználói feladat.

**F. Korlátozott kiadás.** Független forrásellenőrzés, CI, kanonikus funded-upgrade és recovery proof, explicit operator apply/readback, kis cohort. Ez nem kerüli meg a már nyitott N08/N09 és Linux operátori kapukat. A billing bevezetése nem indít új bétaablakot és nem nullázza a korábbi költést.

## 10. Költségcsökkentés, amely nem a történet rovására megy

Elsőként az elvesztegetett munkát csökkentsük: tartós részeredmények újrafelhasználása crash után, pontos idempotencia, rossz terv korai megállítása, változatlan fejezet újragenerálásának elkerülése. A nem választott ágakat ne készítsük el előre. Újranyitás és összefoglaló megjelenítés használja a már mentett anyagot.

Másodikként mérjük a bemeneti kontextus és a szerepenkénti modellválasztás hatását. A releváns memória tömörítése nem dobhatja el a választások következményeit vagy a privacy-jelöléseket. Olcsóbb modell csak ugyanazon vak minőségi mérésen megfelelő eredménnyel kerülhet be. Kisebb költség önmagában nem siker.

A szolgáltatói prompt cache csak igazolt egyezéseknél és tényleges usage-adatok alapján számolható megtakarításnak. A cache olvasási és írási díjait a választott modellre külön kell ellenőrizni; a jelen gazdasági terv nem ígér automatikus cache-megtakarítást. Forrás: [OpenAI prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching), [hivatalos API-árak](https://developers.openai.com/api/docs/pricing), ellenőrizve 2026-10-15.

Az irodalmi minőség nem az összes modellre ugyanazt a „jóváhagyva” jelzést kiadó ellenőrzés. Ha a plusz review nem hoz jobb történetet, azt a mért szövegek alapján újra kell tervezni. Ha jobb történetet hoz magasabb áron, a termékajánlatot kell ehhez igazítani.

## 11. Javasolt döntés most

**A havi 8 fejezetet és a rugalmas felhasználást használjuk tervezési alapnak; 0,70 USD teljes fejezetköltséggel és havi 18 USD megtartott bevétellel teszteljük a gazdaságosságot.** A 4-es kiegészítő és az egyszeri 3-as próba külön, mérhető eszköz. A történetminőség és a valódi tovább olvasási kedv legyen a belépési feltétel; az ár és a keret a mért költséghez igazodjon.

Ha ezt az ajánlatot az olvasók nem akarják megfizetni, vagy nyolc fejezet nem tartja fenn az érdeklődést, a hipotézist módosítani kell. Nem tekinthető megoldásnak rosszabb minőségű vagy mesterségesen szétdarabolt történetet adni.


## 12. Friss mérési kiegészítés – PR #38 után

A tiszta `fd10b856` forráson futó kétprofilos, egyidőszakos diagnózis lezárult. **Mindkét teljes új első fejezet átment az automatikus kapukon, öt-öt hívással, belső javítás nélkül.** A tényleges szövegek olvasása is konkrétabb cselekvést és következményt mutatott. Ez két első fejezet, nem teljes többidőszakos, leágazási vagy független emberi minőségbizonyíték.

Az új teljes narratív próbák összes költsége 0.267463 USD; a két kapun átment fejezetre vetítve **0.133731 USD/fejezet**. A korábbi változatok elutasított próbái a történeti ledgerben megmaradtak, de nem kerülnek át egy új forrás üzemi egységköltségébe. A kis minta miatt az alacsonyabb érték alapján nem ígérünk olcsóbb csomagot vagy több fejezetet.

A teljes új diagnózis 26 hívás / 0.526755 USD konzervatív elszámolás; ebben a legacy és azonos-kánon összehasonlítások is benne vannak. **Összes fejlesztési költés: 101 hívás / 2.158755 USD**, használati árbecslés 1.998099 USD. Az eredeti összesített 5 USD keretből 2.841245 USD maradt; minden használat ismert, hozzárendeletlen foglalás nincs. A teljes fejlesztési számla nem azonos a termék fejezetköltségével.

A fix-kánon összehasonlításban továbbra is volt minőségi elutasítás; a történetfejlesztés nem lezárt. A 0,70 USD-s tervezési forgatókönyvet és az érzékenységi táblát ezért megtartjuk. Részletes új szövegek és értékelés: [Issue #24 mérési eredményei](https://github.com/Muzsy/future_flow/issues/24).

**A kisebb költségből több olvasnivaló is lehet.** Ha hosszabb történeteken, elágazásokkal és sikertelen próbákkal együtt, megfelelő emberi minőség mellett legfeljebb 0,20 USD teljes fejezetköltség igazolódik, akkor más ajánlat is fenntartható lehet:

| Havi fejezet | Teljes AI-költség 0,20 USD mellett | 60%-os fedezethez szükséges megtartott bevétel, 1,50 USD egyéb változó költséggel |
|---|---:|---:|
| 12 | 2,40 USD | 9,75 USD |
| 24 | 4,80 USD | 15,75 USD |
| 40 | 8,00 USD | 23,75 USD |

Ezek feltételes érzékenységi számok, nem új árígéretek. A havi 8 fejezet ezért induló, óvatos pilot-feltevés. Az érdeklődéshez szükséges mennyiséget a 12-es vagy 24-es változattal is érdemes összevetni, amikor a megfelelő minőség és a teljes egységköltség már igazolt. A jobb technika hasznát nem indokolt automatikusan csak magasabb fedezetté alakítani: több olvasnivaló vagy kedvezőbb ár is szolgálhatja a megtartást.


## 13. Alkotói v2 mérés — 2026-10-16

A modell változatlan; jelenleg nincs szerepenkénti olcsóbb modellkísérlet. A korábbi modellválasztási javaslat nem új engedély erre. Az új szerzői folyamat a végső fikció megalkotása után vizsgálja a tervet, hűséget és prózaminőséget.

A 5f8ffbd forrás négy teljes, automatikusan elfogadott fejezete összesen 0,8917025 USD accounted, **0,222925625 USD/fejezet**, javítás nélkül. A három egymást követő munkahelyi és egy alkotói fejezet ideje 213648–237389 ms, körülbelül 3,6–4,0 perc. A részleges, pénzügyileg megállított forkot is tartalmazó diagnózis teljes költsége 1,1249425 USD; ezt a négy elfogadott fejezetre osztva **0,281235625 USD** adódik. Ez utóbbi átlátható mintaterhelés, nem becsült végleges üzemi egységár: a fork befejezetlen, a két alkotói folytatás hiányzik, a választások szintetikusak, emberi elfogadás még nincs.

A teljes fejlesztési ledger **190 hívás / 4,81984 USD accounted / 4,476067 USD usage-becslés**, maradék 0,18016 USD az eredeti 5-ből. Nincs ismeretlen usage vagy hozzárendeletlen foglalás. A régi kutatási és összehasonlítási költés nem keveredik automatikusan a mostani fejezetegységárba, de a ledgerben megmarad.

A 0,70 USD-s óvatos tervezési forgatókönyvet ezért továbbra megtartjuk; a négy jó automatikus eredmény alapján nem véglegesítünk csomagárat vagy mennyiséget. A következő mérésben a sikertelen generálás, javítás, fork és várakozás teljes költségét is számolni kell. Az olvasói kedv és a várakozási idő elfogadhatósága külön döntési adat.


## 14. Szekvenciális minőségjavítás — 2026-10-16

A szigorúbb 04cee85 folyamat két profil hat teljes új fejezetét fogadta el öt-öt hívással, javítás nélkül. Accounted összköltség 1,4672925 USD, átlag **0,24454875 USD/fejezet**, usage-becslés összesen 1,3610067 USD; p95 generálási idő **295560 ms** (kb. 4,9 perc). A végső e5e7ed2 forrás külön, dokumentált régi prefixből induló ordering-forkja 0,288855 USD, öt hívás/javítás nélkül. A hét elfogadott új fejezet többforrású kis mintás átlaga 0,2508782 USD; az eredeti technikai fork-hiba két planner-hívását is számolva 0,2723329 USD. Az editor-kalibráció külön kutatási költség, nem generált új fejezet. A kontroll felismerése és ügynöki olvasás mellett is hiányzik a független emberi elfogadás.

A tulajdonos az összesített dedicated development keretet **10 USD-ra** bővítette, az addigi hívások és költés megőrzésével. Aktuális ledger **229 hívás / 6,79395 USD accounted / 6,3036081 USD usage-becslés**, maradék **3,20605 USD**; nulla ismeretlen usage/hozzárendeletlen foglalás. A 39 új hívás teljes kutatási költsége 1,97411 USD. A standard short-context árakat 2026-10-16-án a [hivatalos árlistán](https://developers.openai.com/api/docs/pricing) visszaellenőriztük; a konfigurált árak nem változtak.

A 0,70 USD-s óvatos üzemi forgatókönyv megmarad. Sem a mért alacsonyabb átlag, sem a keretbővítés nem döntés a havi csomagról, az árról, a várakozási idő elfogadhatóságáról vagy az éles funded ablakról. A további mérésben a javításokat, sikertelen kézbesítéseket és valódi olvasói elfogadást is figyelembe kell venni; a modell marad.

## V6 megtartási vizsgálat

A nyolc főági fejezet azt vizsgálja, hogy a kiinduló életből okságilag hiteles, tovább olvasásra érdemes új helyzet alakult-e. Nem ír elő szereplő-/helyszínkvótát, kötelező nagy változást, ütemezést vagy számszerű release-küszöböt. A fejlődés az alapminőség része; nincs csomagpozíció a modellbemenetben. A mérésbe az elutasítások és javítások költsége is beleszámít. A v5 részleges/negatív bizonyíték megmarad; v6 üzemi egységár és retention csak tényleges mérés/emberi olvasás után állítható. [V6 terv](045_fiction_v6_earned_life_evolution.md).


### V6 Stage B tényleges részleges költség — 2026-10-18

A 18 célból 11 elfogadott szöveg, két elutasított próbálkozás és öt nem generált folytatás lett. Összes munka 3.472645 USD accounted, ebből elutasított munka 0.603925 USD; **0.315695 USD/elfogadott** a hibás munka költségét is tartalmazza. Usage-becslés 2.9520691 USD; sikeres generálás P50 262101 / P95 289852 ms. Ez részleges fejlesztési minta, nem havi fedezetgarancia. Mindkét repair a transport byte guardon állt meg, ezért a mért 0/11 elfogadott repair nem javításmentes általános működést jelent; 2/13 próbálkozás javítást igényelt. A 8 fejezetes megtartási hipotézis nincs igazolva, árazás/billing nem aktivált. A+B együtt 4.214590 USD a jóváhagyott v6 8-ból; maradék 3.785410 USD. Részletes mérés és további kapuk: [v6 terv](045_fiction_v6_earned_life_evolution.md#stage-b-actual-result--2026-10-18-partial-not-release-evidence).


### Aktuális v6 keretbővítés — 2026-10-18

A tulajdonos a részleges Stage B és a konkrét javítás után **összesen legfeljebb 12 USD v6 fogyasztást** engedélyezett (az eredeti 8 + további 4; nem újraindított keret). A nyitó eredeti 305 / 10.732030 USD ledgerhez tartozó új kumulatív plafon **22.732030 USD**. Jelenleg változatlanul 385 hívás / 14.946620 USD accounted, új v6 fogyasztás 4.214590 USD; fennmaradó authority **7.785410 USD**. A korábbi 3.785410 USD maradék az emelés előtti állapot; a v5 régi maradékát nem adjuk hozzá. Új hívás csak a javított tiszta forrás ellenőrzése után: friss három munkahelyi főági/no-fork előpróba, és csak elfogadható eredménye után külön friss 18-célos mérés. Az eredeti negatív korpusz és költsége megmarad; nincs source-adoption, automatikus reroll, modellváltás vagy production engedély.


Javított forrás friss Stage A: 3 elfogadott /18 hívás /1 typed-state repair; **0.9418175 USD**, javítással együtt **0.31393917 USD/elfogadott**. P95 331250 ms. Ez kis munkahelyi előpróba, nem 8-fejezetes fogyasztási/fedezeti garancia. A teljes v6 most 5.1564075 USD a 12-ből; fennmaradó authority 6.8435925 USD. A korábbi negatív költség változatlanul szerepel.


### Javított v6 Stage B lezárása — 2026-10-18, technikai részleges eredmény

Javított B:6 elfogadott/1 technikai failure/11 hiányzó,40 transport,4.0581025 USD accounted. Minden próbát és hét timeout teljes2.2399275 USD foglalását tartalmazó költség0.67635042 USD/elfogadott; az ismert usage1.5116671 USD nem teljes költségbecslés. P50 324373.5/P95 613812ms. Ebből fenntartható havi árat vagy jó latencyt nem állíthatunk. Teljes v6 elszámolás9.214510 USD, maradék2.785490 USD a jóváhagyott12-ből; nincs ledger-reset, ár/billing-változás vagy retention bizonyíték. A következő offline technikai fix300s development-fiction deadline; új teljes paid méréshez további headroom szükséges. Részletes forrás/költség/eset/olvasási bizonyíték a [v6 tervben](045_fiction_v6_earned_life_evolution.md).
