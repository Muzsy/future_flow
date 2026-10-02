# Következő lépések, sorrendben

2026-10-02 · Az [új pozicionálás](PROJECT_POSITIONING_AND_GOAL_DEFINITION_HU.md) alapján átrendezett backlog. A célállapot részletes leírása az [aktív termékterv](PRODUCT_PLAN_HU.md); a meglévő működés az [implementációs dokumentumban](IMPLEMENTATION.md) szerepel. Az alábbi pontok tervezett munka, nem elkészült funkciók.

## Kiinduló állapot

A Supabase-migráció és a TLS-kapcsolat működik. Valódi OpenAI-hívásokkal három profilból három tízéves alaptörténet és három alternatív ág készült, összesen körülbelül 0,63 USD költséggel. A 18 hívás és 59 automatizált teszt a jelenlegi technikai alapot ellenőrizte. [Eredmények és minták](AI_VALIDATION.md).

A jelenlegi választás mindig új ágat nyit; ugyanannak az életágnak a következő időszaka még nem készíthető el. A rövid profil, bővebb világállapot és folytatási mérés szintén fejlesztendő. A valódi Supabase-belépés és Auth-fióktörlés ellenőrzése nyitott; a szerveroldali törlési kulcs korábban jelzett függőség.

Utólagos [modellválasztási vizsgálat](AI_MODEL_ROUTING_HU.md): 14 új hívás, körülbelül 0,054 USD, összesített fogyasztás körülbelül 0,684 USD. Az ellenőrző külön modellbeállítása elkészült, a helyi keretőr már Sol/Luna díjakkal számol; 63 automatizált teszt és teljes build sikeres. Az első teljes láncban mérendő jelölt Luna-eseménygenerátor, Sol-narrátor és Sol-ellenőr; ez nem írja felül a P01 elsőbbségét.

## P01 — Időszak, identitás, cél és állapot szerződése

**Feladat:** verziózott v2-sémák rövid időszakhoz, saját/alternatív identitáshoz, a cél mezőihez, tartós szereplőkhöz, tényszerű állapotváltozásokhoz és időben érvényes korlátokhoz. Válasszuk külön a környezeti kontextust a szimulált élet állapotától. Készüljön additív `002+` migráció az időszakhoz, ág aktuális állapotához/revisionjéhez, választáshoz és folytatási jobhoz.

**Elfogadás:** a mai migráció változatlan ellenőrzőösszeggel alkalmazható. A régi életek/hash-ek változatlanul visszaolvashatók. Állásváltás és tulajdonlás megszűnése ténylegesen módosítja a megfelelő mezőt; lejárt/ágon kívüli korlát nem válik örök tiltássá. A v1-ről v2-re indulás explicit új élet/másolat, ellenőrzött kezdőállapottal.

**Függőség:** nincs; ez az első kódolási szelet. A kérdőív és a további API-k erre épülnek.

## P02 — Első rövid AI-időszak

**Feladat:** kezdetben hat hónap, 2–5 esemény, egy 250–600 szavas magyar fejezet és a végén egy érdemi döntés. A domainmotor validálja a strukturált AI-javaslatokat, majd a narrátor a canonból ír. A még meg nem hozott választás utáni események nem kerülhetnek a mentett jövőbe.

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

## P07 — Technikai és magyar minőségi kapu

**Feladat:** legalább 20 változatos szintetikus eset, esetenként legalább három időszak és eltérő döntések. Emberi magyar értékelés: személyesség, történet, kíváncsiság, hihetőség, ismétlés. Constraint/fact consistency, promptutasítások elkülönítése, tulajdonosi hozzáférés, export/törlés, párhuzamos kérések, megszakítás és költséghatár.

**Elfogadás:** a kötelező állapot-, jogosultsági és adatkezelési ellenőrzések minden esetben sikeresek. A narratív hibák kategóriái és javítási eredményei dokumentáltak; nincs nyitott, múltat átíró hiba. Fizetett esetek fokozatosan, a tényleges új tokenfogyasztás alapján indulnak; a 20-as cél nem írja felül az 5 USD felhasználói keretet.

**Függőség:** P02–P06. A technikai tesztek fokozatosan az adott változással készülnek; ez a pont az összesített release-kapu.

## P08 — Folytatási mérés és zárt emberi pilot

**Feladat:** onboarding/első fejezet/döntés/folytatási szándék/sikeres folytatás/visszatérés/fork események adatminimalizált mérése. Külön a **Continuation Rate** és a **Continued Life Sessions**. Induló cél 20–50 magyar résztvevő, részletes élmény-visszajelzéssel és a valós generálási költséghez igazított hozzáférési limitekkel.

**Elfogadás:** kattintás és sikeres folytatás külön mérhető; technikai hiba látszik a kohorszban. A pilotból megállapítható, miért folytatnak vagy hagyják abba, és visszatérnek-e ugyanahhoz az élethez. Számszerű sikerhatárt a következő értékelt kohorsz előtt rögzítünk. Nincs előre bizonyítottnak tekintett megtartási állítás.

**Függőség:** P04–P07. A műszerezést már P04 során beépítjük. A pilot külön felhasználói költségkeretet igényelhet: a résztvevői generálásokat nem indítjuk el a fejlesztői keretet meghaladó összeggel.

## Az MVP után

Először a szimuláció minősége és hosszabb távú emlékezete mélyül, majd a célok/élettípusok, szabad szöveges döntés és vizuális összehasonlítás. Közösség akkor következik, amikor már érdekes életutak vannak: megosztható objektum az idővonal/ág. Fizetés, mobil és platformbővítés külön tervet kap. A meglévő compare felület megőrizhető; bővítése nem előzi meg a folytatás működését.

**A következő konkrét munka P01:** időszakos v2-szerződés, tényszerű világállapot és additív adatbázismigráció. A már elfogadott szolgáltatókról és a valódi AI szükségességéről nem nyitunk új döntést.
