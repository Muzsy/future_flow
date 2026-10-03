# alterward — következő lépések, sorrendben

[Dokumentációs központ](README.md) · [Közös státusz és keret](STATUS_HU.md) · [A két terv teljes visszakövetése](REQUIREMENTS_TRACEABILITY_HU.md).

2026-10-03 · A [pozicionálás](PROJECT_POSITIONING_AND_GOAL_DEFINITION_HU.md) és a [közösségi specifikáció](PUBLIC_LIVES_DISCOVERY_COMMUNITY_SPEC_HU.md) alapján átrendezett backlog. A célállapot részletes leírása az [aktív termékterv](PRODUCT_PLAN_HU.md); a meglévő működés az [implementációs dokumentumban](IMPLEMENTATION.md) szerepel. P01 első szerződés/domain-szelete elkészült; a többi pont tervezett munka.

## Kiinduló állapot

A Supabase 001/002 migrációja és ellenőrzött TLS-kapcsolata működik. V1 valódi OpenAI-esemény/történet/új ág, teljes angol/magyar felület és életnyelv-öröklés, valamint v2 könyvtári tény/időszak/korlát validátor áll rendelkezésre. Az utolsó kódellenőrzés 92 teszt, formázás/typecheck/build/sémaexport és sikeres CI. [Bizonyíték, határok és 5 USD keret](STATUS_HU.md).

A jelenlegi választás mindig új ágat nyit; ugyanannak az életágnak a következő időszaka még nem készíthető el. A rövid profil, bővebb világállapot és folytatási mérés szintén fejlesztendő. A valódi Supabase-belépés és Auth-fióktörlés ellenőrzése nyitott; a szerveroldali törlési kulcs korábban jelzett függőség.

A [modellválasztási vizsgálat](AI_MODEL_ROUTING_HU.md) történeti eredménye: külön checker-konfiguráció és modellspecifikus helyi árbecslés kész; Luna esemény + Sol narrátor/checker mérendő jelölt, nem bekapcsolt alkalmazásalap. P01 tárolási elsőbbségét nem módosítja.

A [nyelvi ellenőrzés](LOCALIZATION_HU.md) valódi EN/HU alapéletet és ágat is fed. A teljes 44 hívás és az aktuális számított maradvány egy helyen, a [státuszban](STATUS_HU.md) követhető.

## L01 — Többnyelvű alap, felhasználói elsőbbséggel

**Elkészült:** angol alapnyelv, választható magyar; teljes felület/kérdőív/API-hibák; nyelvregiszter és típusos katalógus; cookie-ban megjegyzett választás; mentett tartalomnyelv és jobnyelv; nyelvre utasított esemény/narrátor/ellenőrző. A v2 életbemenet is kötelező `locale` mezőt kapott. Régi életek magyar jelölést kapnak, canonjuk változatlan. [Megvalósítás és további nyelvek](LOCALIZATION_HU.md).

**Minden további P-pont feltétele:** teljes angol és magyar élmény; a P02 generálási és P07 minőségi próbák mindkét nyelvet fedjék le. A nyelvváltás ne módosítson választ/korábbi canont és ne indítson fizetett AI-hívást. Discovery/Scenario/snapshot/fork tartalomnyelve is külön mező legyen.

## P01 — Időszak, identitás, cél és állapot szerződése

**Elkészült első szelet:** külön v2 életbemenet/tényállapot/időszak/korlátsémák, saját/alternatív identitás, privát indulás, determinisztikus tényváltozás és scope/idő/döntés szerint érvényes korlátok. A döntésnél megálló időszak validátora még nem alkalmaz opciót; revisionellenőrzése 409. 20 új domain-teszt. [Szerződés és pontos határok](V2_SIMULATION_CONTRACT_HU.md).

**Következő szelet:** additív tárolás és perzisztencia-integráció. Az API/worker jelenleg v1; P01 teljes elfogadása még nyitott.

**Feladat:** verziózott v2-sémák rövid időszakhoz, saját/alternatív identitáshoz, a cél mezőihez, tartós szereplőkhöz, tényszerű állapotváltozásokhoz és időben érvényes korlátokhoz. Válasszuk külön a környezeti kontextust a szimulált élet állapotától. Készüljön additív `003+` migráció az időszakhoz, ág aktuális állapotához/revisionjéhez, választáshoz és folytatási jobhoz.

**Elfogadás:** a mai migráció változatlan ellenőrzőösszeggel alkalmazható. A régi életek/hash-ek változatlanul visszaolvashatók. Állásváltás és tulajdonlás megszűnése ténylegesen módosítja a megfelelő mezőt; lejárt/ágon kívüli korlát nem válik örök tiltássá. A v1-ről v2-re indulás explicit új élet/másolat, ellenőrzött kezdőállapottal.

**Függőség:** nincs; a szerződés/domain-alap elkészült, a tárolás következik. A kérdőív és a további API-k erre épülnek. A későbbi nyilvános snapshot/fork külön sanitized állapotot igényel; nem nyitjuk meg a privát v2 canont.

## P02 — Első rövid AI-időszak

**Feladat:** kezdetben hat hónap, 2–5 esemény, egy 250–600 szavas angol vagy magyar fejezet a mentett tartalomnyelven és a végén egy érdemi döntés. A domainmotor validálja a strukturált AI-javaslatokat, majd a narrátor a canonból ír. A még meg nem hozott választás utáni események nem kerülhetnek a mentett jövőbe.

**Elfogadás:** szintetikus profilból valódi AI-fejezet és választási lehetőség készül. Az események időrendje, hivatkozásai, szereplői és kemény korlátai helyesek. A feladat megáll a döntésnél; a régi tízéves generálás nem fut az új élet alatt.

**Függőség:** P01; minden fizetett próba a megmaradt kereten belüli előzetes foglalással indul.

**Modellmérés:** Luna és Sol összevetése a rövid időszakos szerződésen, azonos profil/állapot/cél mellett. Narrátor és végső ellenőr kezdetben Sol; a modellválasztási próba miatt a checker már külön beállítható.

## P03 — Döntés, folytatás és külön történeti fork

**Feladat:** külön művelet az aktuális döntéshez, ugyanazon ág folytatásához és egy korábbi döntésből másik ág indításához. Döntés és azonnali következmény egyszer, atomikusan mentendő; a következő időszak innen indul. Áganként egy aktív generálás, állapotrevision, idempotenciakulcs és folyamatos esemény/fejezetsorszám kell.

**Elfogadás:** három egymást követő időszak ugyanazon ágon marad. Függő döntés mellett nem keletkezik választás utáni canon. Dupla kérés ugyanazt a jobot adja; elavult revision 409. Újraindítás után a mentett állapot és checkpoint használható, elveszett lease nem commitol. Régi döntés másik opciója új ágat nyit, a szülő visszaolvasott hash-e változatlan.

**Függőség:** P01–P02. A régi v1 resolve jelentését verziózott API őrzi.

## P04 — Rövid onboarding és visszatérési felület

**Feladat:** 10–15 kérdés profilhoz és egy fő célhoz; strukturált mag, vezetett kérdések, opcionális szabad kontextus. Saját/alternatív identitás, nulla kapcsolat és ismeretlen opcionális adat kezelése. Piszkozat automatikus mentése revisionnel. Kezdőfelület a mentett élettel, utolsó helyzettel, függő döntéssel és „Folytatom ezt az életet” művelettel; idővonal és külön „Másik ág innen”.

**Elfogadás:** új felhasználó hosszú trait-kitöltés nélkül eljut az első történethez és folytatja. Frissítés, kijelentkezés és későbbi belépés után nincs adatvesztés vagy csendes felülírás. Alternatív élet nem módosítja a saját profilját. A 3–4 perces profil és körülbelül tízperces első élmény mérési célként látszik a használati próbában.

**Függőség:** a szerződés P01; a teljes felület elfogadásához P02–P03. A további profilrészletek fokozatosan kérdezhetők be.

## P05 — Emlékezet, célzott javítás és alkalmazásszintű költségőr

**Feladat:** a következő időszak bemenete az aktuális állapot, mentett választások, közeli események és releváns korábbi tények legyen. Canonra hivatkozó összefoglaló, legfeljebb egy automatikus célzott javítás, biztonságos manuális retry. Projektszintű/felhasználói keret, párhuzamos költségfoglalás és sikeres/hibás/ismeretlen hívások elszámolása.

**Elfogadás:** korábbi választás következménye a harmadik időszakban is megmarad; eladott vállalkozás nem kerül vissza tulajdonba. Narratívahiba megtartja a már érvényes eseményeket. Keretkimerülés vagy ismételt hiba látható és nem indít újabb fizetett próbát. A mérés nem igényli a teljes történet újraküldését vagy személyes promptok naplózását.

**Függőség:** P01–P03. A költség és retry alapvédelme már P02–P03 közben kötelező; a teljes alkalmazáskeretőr a zárt felhasználói próba előtt készül el. A helyi smoke-guard addig is minden fejlesztői AI-próbára érvényes.

## P06 — Valódi fiók és teljes böngészős folyamat

**Feladat:** Supabase email-belépés, profil, OpenAI-időszak, döntés, folytatás, visszatérés, fork, export és Auth/DB-fióktörlés ellenőrzése a valódi integrációkkal. Auth-törlés utáni adatbázishiba helyreállítása, szükséges audit és mentés/visszaállítás ellenőrzése.

**Elfogadás:** böngészőből végigvihető a teljes MVP-hurok; másik fiók adatai nem érhetők el. Export és törlés friss hitelesítést kér, törlés a teljes kapcsolódó adatgráfot érinti, aktív worker nem írhat vissza törölt fiókhoz. Az üzemeltetési helyreállítás végrehajtható.

**Függőség:** P03–P05; Auth-törléshez a hiányzó szerveroldali Supabase-kulcs. A kulcs értéke kizárólag védett helyi környezetbe kerül. A függőség az előző fejlesztési pontokat nem blokkolja.

## P07 — Technikai és angol/magyar minőségi kapu

**Feladat:** legalább 20 változatos szintetikus eset, esetenként legalább három időszak és eltérő döntések. Emberi angol és magyar értékelés: személyesség, történet, kíváncsiság, hihetőség, ismétlés. Constraint/fact consistency, promptutasítások elkülönítése, tulajdonosi hozzáférés, export/törlés, párhuzamos kérések, megszakítás és költséghatár.

**Elfogadás:** a kötelező állapot-, jogosultsági és adatkezelési ellenőrzések minden esetben sikeresek. A narratív hibák kategóriái és javítási eredményei dokumentáltak; nincs nyitott, múltat átíró hiba. Fizetett esetek fokozatosan, a tényleges új tokenfogyasztás alapján indulnak; a 20-as cél nem írja felül az 5 USD felhasználói keretet.

**Függőség:** P02–P06. A technikai tesztek fokozatosan az adott változással készülnek; ez a pont az összesített release-kapu.

## P08 — Folytatási mérés és zárt emberi pilot

**Feladat:** onboarding/első fejezet/döntés/folytatási szándék/sikeres folytatás/visszatérés/fork események adatminimalizált mérése. Külön a **Continuation Rate** és a **Continued Life Sessions**. Induló cél 20–50 résztvevő, angol és magyar felületen is, részletes élmény-visszajelzéssel és a valós generálási költséghez igazított hozzáférési limitekkel.

**Elfogadás:** kattintás és sikeres folytatás külön mérhető; technikai hiba látszik a kohorszban. A pilotból megállapítható, miért folytatnak vagy hagyják abba, és visszatérnek-e ugyanahhoz az élethez. Számszerű sikerhatárt a következő értékelt kohorsz előtt rögzítünk. Nincs előre bizonyítottnak tekintett megtartási állítás.

**Függőség:** P04–P07. A műszerezést már P04 során beépítjük. A pilot külön felhasználói költségkeretet igényelhet: a résztvevői generálásokat nem indítjuk el a fejlesztői keretet meghaladó összeggel.

## P09 — Publikálható snapshot, Official Scenario és kurált seed

**Feladat:** külön Publication/PublicSnapshot/ScenarioVersion modul és additív tárolás. Allowlist alapján anonimizált idővonal/fejezet/állapot, fork-checkpoint, Official/Community/AI-generated/user-edited jelölés. PII/tartalmi elővizsgálat és curator-jóváhagyás. Először néhány valódi AI-szintetikus Official minta az új több időszakos láncon.

**Elfogadás:** nincs raw prompt, privát memória/állapot, harmadik személy adata vagy eredeti belső referencia a public DTO-ban/checkpointban. Privát folytatás nem módosítja a kiadást. Scenario sablon és konkrét Official Life külön objektum; teszthelyettesítő nem lesz publikus AI-tartalom. Forráscél 50–100 élet/20–30 szcenárió, mért v2-költség és engedélyezett keret szerint.

**Függőség:** P01–P07; közös költségőr/modellmérés P05. A teljes seed/pilot nem lépheti túl az 5 USD fejlesztői keretet.

## P10 — Read-only Discovery, public életoldal, Save/Share/Report

**Feladat:** kurált kollekciók, fix taxonómia és tartalomnyelv-szűrő, egyszerű ranking, bejelentkezés nélkül olvasható Official snapshot, Save/Share/OG és Report. Alap moderation queue/soft hide/hard remove/figyelmeztetés/rate-limit. Snapshot-cache mellett aktív publication/permission ellenőrzés; indexelés külön engedély szerint.

**Elfogadás:** olvasás/újratöltés nem indít AI-hívást. Anon/másik fiók csak engedett snapshotot kap; private/unlisted nincs Discoveryben. Save hitelesített és idempotens. Rejtett/visszavont élet nem olvasható, Report nem jelent ellenőrizetlen ranking-tiltást. Olvasás/mentés/megosztás mérhető.

**Függőség:** P09; moderáció/visszavonás az Official public próba előfeltétele is. Kis kurált seed-pilot elég a fejlesztés indításához, tömeges generálás nem szükséges.

## P11 — Community Publishing és visszavonás

**Feladat:** private/unlisted/public, Privacy Preview, Content Preview, szerző/indexelés beállítás, hash/revisionhöz kötött Confirm. Unlisted titkos token, Unpublish és új snapshotverziós refresh; export/fiók-élettörlés kiterjesztése. Kezdetben zárt publish-béta.

**Elfogadás:** Confirm előtt privát; lejárt/módosított preview új ellenőrzést kér. Unlisted csak érvényes linkkel olvasható, noindex és listákból kizárt; tokencsere megszünteti a régi linket. Unpublish tiltja új olvasást/forkot, eltávolítja index/OG-t és érvényteleníti cache-t. Törlés/aktív job nem hagy tartalmat. Report/admin moderáció kliensflaggel nem kerülhető meg.

**Függőség:** P09–P10 és P06 teljes adatkezelése; hiányzó Supabase admin-kulcs a valódi fióktörlési próba függősége, nem a tervezésé.

## P12 — Fork this life, Start from this decision, Personalize scenario

**Feladat:** sanitized checkpointból új tulajdonos **privát élete**, új belső szereplő/cél/asset ID-k, választás egyszeri alkalmazása, idempotencia/generálási limit. Scenario + saját jóváhagyott profil/cél/korlát új kezdőállapota, forrásattribution törlési szabálya.

**Elfogadás:** másik felhasználó forkja nem örököl privát előzményt vagy jogot; az eredeti élet változatlan. Döntésből indulás nem másol el nem döntött jövőt. Új élet privát és három időszakon át folytatható. Visszavont/rejtett forrásból nincs új fork; forrástörlés leválasztja a public attributiont a meglévő példányról. Kattintás, létrehozás és első sikeres időszak külön mérhető.

**Függőség:** P03–P05, P09–P11. A mai saját branch API más tulajdonosi jelentésű; nem nyitjuk meg idegen privát ágakhoz.

## P13 — Nyilvános indulási kapu és közösségi mérés

**Feladat:** a [nyilvános megvalósítási terv](PUBLIC_CONTENT_IMPLEMENTATION_PLAN_HU.md) permission/privacy/cache/moderáció/törlés/fork próbái, Official minőség és olvasás→saját élet emberi tesztje. P08 mellé views/read depth/completion/save/share/publish/unpublish/report/removal és referral.

**Elfogadás:** a specifikáció 36. fejezetének 14 MVP-eleme és minden privacy/jogosultsági/törlési kapu teljesül. Anon API/fork-checkpoint nem szivárogtat privát adatot. Official kurált, induló Discovery nem üres. Költségkeret és üzemeltetési felelős/folyamat rögzített; tömeges seed és külső generálás csak elegendő engedélyezett kerettel indul.

**Függőség:** P08–P12. Ez a nyilvános indulás kapuja; a privát technikai/emberi pilot korábban végrehajtható.

## A nyilvános MVP után

Reakció/követés, majd komment/szerzői profil a működő public/fork és moderáció után. Szimulációmélység, célok/élettípusok, szabad szöveges döntés/compare mérés alapján bővül. Alkotói szcenárió/analitika, fizetés, marketplace és mobil külön terv. Meglévő compare megőrizhető; bővítése nem előzi meg a folytatást.

**A következő konkrét munka P01 tárolási szelete:** a már elkészült v2-szerződéshez additív migráció/perzisztencia, v1 megőrzéssel. Ezután valódi rövid AI-időszak, folytatás, publikálható snapshot. Márkanév alterward; a szolgáltatók, valódi AI és nyilvános rendszer elfogadott irány.
