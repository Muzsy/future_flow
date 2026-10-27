---
status: canonical
owner: operations
last_reviewed: 2026-10-26
related:
  - ../PERSONAL_BETA_ACTIVATION_PLAN_HU.md
  - ../PERSONAL_BETA_OPERATOR_HU.md
  - ../BETA_ROLLOUT_SEQUENCE_HU.md
  - ../STATUS_HU.md
---

# Beta operations

## Aktuális kiadási fókusz — 2026-10-24

Tulajdonosi döntés: a v9 motor további finomítása helyett annak befagyasztása, technikai stabilizálása és a kis zárt béta előkészítése az elsődleges. Végrehajtás: integrált jelölt → v9-kompatibilis N09/backup/recovery → teljes tesztelői alapút → konkrét engedélyezett indulás. További editor/history-kutatás és archetípus-fejlesztés DEFERRED. A meglévő helyettesítő zártbéta-minőségkapuk érvényesek; adat-, költség-, privacy- és helyreállítási védelem nem halasztható. A konkrét lezárási feltételeket a [narratív kiadási runbook](NARRATIVE_RELEASE_HU.md#bétafókusz-és-motorbefagyasztás--2026-10-24) tartalmazza.

A #81 2026-10-25-én tulajdonosi engedéllyel beolvadt a mainbe (`4fb7b489`), a teljes diff független review-ja APPROVE. A main saját CI-je és az aktuális [célgépes előkészítés](NARRATIVE_RELEASE_HU.md#main-utáni-célgépes-előkészítés--2026-10-25) külön követett. A beolvasztás nem indított új bétaablakot vagy szolgáltatást.

## 1. Release sorrend

### Első kör — Personal beta

- legfeljebb 10 valós résztvevő;
- angol UI/történet;
- Shared minden flagje kikapcsolva;
- a 30 napos személyes AI-ablak csak a tényleges aktiváláskor indul;
- budget és participant mapping egyszeri, dokumentált operátori művelet.

### Második kör — Shared friend beta

Csak a personal beta tapasztalatainak értékelése után:

- öt baráti pár;
- legfeljebb 10 személy;
- `friend_group`;
- entitled host + targeted Free sponsored Guest;
- külön Shared activation gate.

## 2. Personal beta előfeltételek

Az első tesztelő aktiválása és valódi háromfejezetes E2E megtörtént. Az utolsó igazolt E2E 2026-10-14-i; ez a dokumentációfrissítés nem új élő health-ellenőrzés. Reader/login, friss candidate backup/izolált restore és kanonikus Linux apply/inspect sikeres. Az alkalmazott UTC ablak 2026-10-13T22:11:21Z–2026-11-12T22:11:21Z, 2 USD projekt / 0,50 USD user. Nem indul új 30 nap és nem nullázható a költés.

Új résztvevő vagy külön kiadás előtt megőrzendő sorrend:

1. végleges participant lista;
2. meghívás/első belépés;
3. email ↔ Auth UUID és reader mapping;
4. friss held/read-only megfigyelés;
5. konkrét candidate előkészítése (korábbi lejárt, alkalmazatlan reader-előkészítés esetén előbb annak archiválása);
6. candidate utáni titkosított backup és izolált restore proof; reader apply esetén a prepare, backup, restore és apply egy 15 percen belüli menet, a restore proof az adott előkészítés hash-eihez kötött;
7. pontos időablak és budget;
8. a konkrét változtatáshoz tartozó kanonikus művelet; az első egyszeri `--apply-personal` már megtörtént, nem ismételhető új ablak nyitására;
9. első valós signed-in paid AI E2E;
10. monitor és emergency-disable ellenőrzése.

## 3. Authority

Részletes végrehajtási authority:

- `../PERSONAL_BETA_OPERATOR_HU.md`
- `../PERSONAL_BETA_READER_OPERATOR_HU.md`
- `../PERSONAL_BETA_ADMISSION_OBSERVATION_HU.md`
- `../PERSONAL_BETA_ACTIVATION_PLAN_HU.md`

Ezek aktív supporting runbookok. A closure/audit reportok csak bizonyítékok.

## 4. Budget/window

A personal beta operátor elfogadott kerete. Tulajdonosi döntés, 2026-10-19: a narratív zárt béta első köre **10 USD OpenAI-keret 3 tesztelőre** (tervezett beállítás 10 USD projekt / 3,33 USD felhasználó). A kód és az operátori ellenőrzések plafonja ehhez 10 USD projekt és 3,34 USD felhasználó. A már futó, 2026-11-12-ig tartó első ablak 2/0,50 USD-s értékei változatlanok; az új keret csak új, külön jóváhagyott 30 napos ablakkal, az N09 frissítés után indulhat. A 2026-10-25-i tulajdonosi döntés engedi a régi ablak szabályos korai lezárásával történő indulás megvalósítását; a régi history és költés megmarad. A #77 elszámolási magja helyi implementáció, a teljes operátori út még fejlesztés alatt: [scope és határ](NARRATIVE_RELEASE_HU.md#új-bétaablak-korai-lezárással--77-2026-10-25).

- maximum 10 USD OpenAI runtime (az első ablakban 2 USD);
- maximum 3,34 USD/user (az első ablakban 0,50 USD);
- pontosan 30 nap;
- külön Claude audit tartalék legfeljebb 1 USD;
- nincs automatikus keret-átcsoportosítás;
- Shared nem kap budgetet ebben a körben.

Ha a kód/operátori contract ettől eltér, activation előtt konfliktusként kezelendő.

## 5. Fail-closed működés

Nem indul beta, ha:

- participant mapping nem pontos;
- backup/restore gate hiányzik;
- provider/window candidate hibás;
- pending/idegen writer vagy queue állapot nem biztonságos;
- health/post-check hibás;
- activation időablak kifut;
- előző transition/exposure állapot nincs rendezve.

A rendszer nem hosszabbítja automatikusan az ablakot és nem próbál újra vakon.

## 6. Emergency disable

A személyes operátor vészleállítása legyen elérhető akkor is, ha a funded candidate nem használható. Célja a saját szolgáltatások stop-first leállítása és az ellenőrzött owner-zero állapot visszaállítása.

Provider key exposure után a kulcs visszavonása/forgatása külön operátori kötelezettség lehet.

## 7. Shared beta extra gate

A Shared friend kör előtt minimum:

- canonical Shared spec aktuális;
- downgrade lifecycle döntés lezárva;
- raw/personal Shared prose retention privacy review;
- sponsored Guest invite E2E;
- common event + personal impact E2E;
- Shared cost/rate-limit monitoring;
- külön activation/rollback.

## 8. Nem beta-aktiválás

Nem számít betaindításnak:

- CI;
- fixture;
- seed/catalog generálás;
- owner-only deployment;
- read-only inspection;
- dokumentáció/friss audit;
- funded candidate puszta előkészítése.

## Linux operátori host

A személyes béta reader/funded és napi backup/sync/restore/monitor Linux-host támogatása, az eredeti receipt/SSH/recovery identity egyszeri titkosított migrációja és a változatlan release kapuk: [Linux operator runbook](LINUX_OPERATOR_HU.md). Az átadás nem éles aktiválás és nem helyettesíti a konkrét candidate utáni restore proofot.


## 10. Igazolt E2E és jelenlegi nyitott határ

Egy tesztelővel három paid fejezet, két continuation ciklus, mentett választások, lista/újranyitás/logout-login és friss hitelesítés utáni export ellenőrzött. Kilenc task 0,188585 USD adatbázis-elszámolással, nem provider-számlaegyeztetéssel. A következő generálást a szándékos 3/UTC-nap, 1 párhuzamos kérés limit megállította; későbbi sessionből sikeres új generálás és a megtartott fiók destruktív törlése nincs igazolva. Ez nem széles kohorsz-, Shared-, public vagy új narrative release.

A normál reader/funded/daily/fence munka Linuxon elvégezhető; O01/PR #21 átadás lezárt. Az új narratív runtime már funded környezetre frissítése külön támogatási és recovery-kapu (Issue #34, N09). A fejlesztési benchmark külön projektje/összesített 5 USD ledgere nem a fenti bétaablak része. Árjavaslat vagy docs-merge nem módosíthatja a live admissiont, költséget vagy időablakot.


## Konkrét v9 előkészítés — #75

Az aktuális [runtime-minta és próbamenet](NARRATIVE_RELEASE_HU.md#konkrét-béta-konfiguráció-és-próbamenet--75-2026-10-24) 196608 B / 300000 ms v9 konfigurációt vizsgál. Az eredeti 2/0,50 USD ablak megőrzése mellett a mért repair előfoglalása már a korábbi költéssel sem férne be; ez nem mai live maradék. A 10/3,33 USD háromfős tervhez új, auditált window/admission eljárás szükséges, amelyet az aktív funded upgrade nem biztosít. A CI-only fixture sem állít ki a célgépes digestre proofot. Az előkészítés nem bétaaktiválás; a konkrét hiányzó döntéseket/eszközöket a release runbook sorolja.


## Saját fiókos éles út mint indulási kapu — 2026-10-26

A tulajdonos új sorrendje: a korábbi bétaablak és rendelkezésre álló keret szabályos lezárása, minden történet/usage/reservation/költés megőrzésével; utána kizárólag saját fiókos, mért éles Playwright-próba. A teljes saját fiókos próba jóváhagyott költési plafonja **3 USD**, a későbbi tesztelői10USD kerettől külön. Sem a tervezett három résztvevőt, sem a10USD keretet nem szabad ehhez automatikusan aktiválni. Az operátori szerződés jelenlegi, pontosan30napos ablaka a saját próbánál is megmarad; a konkrét kezdés/lezárás az új candidate része, nem a fejlesztéskor indul. A próba sikere nem automatikus tesztelő-admission.

Kötelező böngészős út: **belépés → történet → választás → következő fejezet → kilépés → visszabelépés és ugyanazon történet újranyitása**. A felhasználói lépések Playwrighttal történnek; közvetlen DB-beírás, admin-tokenes UI-megkerülés vagy API-val létrehozott történet nem helyettesíti ezt. A bejelentkezéshez a tulajdonos szükség esetén segítséget ad; az OTP/session/token és a személyes történet privát bizonyíték marad.

Mérendő: lépésenként az indítástól a látható eredményig eltelt idő (az automatizálás többletidejét is tartalmazó E2E-idő), generálási kérés/queue/feldolgozás idői, nem várt konzol- és hálózati hibák, a kiválasztott opció tényleges mentése és a folytatás kapcsolata, kilépés utáni hitelesítési kapu, új sessionből visszatérés és a fejezetek megőrzése, valamint elszámolás/reservation/usage és a3USD plafon szerveres érvényesülése. A felhasználói tartalom csak az alkalmazás normál folyamatában kezelhető; repo-ba aggregált, anonimizált eredmény és a privát bizonyíték hash-e kerül.

**PASS csak teljes út esetén:** minden előírt lépés sikeres, nincs megmagyarázatlan hiba, nincs unknown vagy rendezetlen usage, az elszámolás és a visszatérési állapot ellenőrzött. Hiba → javítás → az érintett út sikeres újramérése. A keretváltó fixture, zöld CI, funded runtime és működő mentés önmagában nem böngészős PASS. Az éles tesztelői szakasz csak az igazolt saját fiókos PASS után jelenthető indulásra késznek; V9-5 addig PENDING.

A #91 külön `owner-e2e` tervet kezel egyetlen tényleges fiókkal,3USD projekt és3USD user plafonnal; a két korlát ugyanazokat a költségeket korlátozza, nem6USD-t biztosít. A `tester-beta` továbbra külön10/3,33USD és háromfős terv. Régi limitek nullázása kizárólag a régi allowance lezárása; accounted/history/usage nem törlődik. A Daily/replay helyi implementációja külön, parenthez kötött successor authorityt kezel; félbemaradt átállást vagy függő one-offot nem fogad el. A külön root adapter/CLI és watchdog/candidate-backup bekötés implementált, a #91 cf33ba3 main saját CI-je, teljes független forrásreview-ja és a külön71e5c2c5 image tényleges célgépes16+14 ellenőrzése/cleanupja PASS; **az éles régi ablak nem lett lezárva és az új sem indult el**. A hozzáadott belső transition-sorrend önmagában nem végrehajtható éles parancs.

A saját fiók belépése 2026-10-26-án Chrome/Playwrighttal igazolt. A pinned TLS-es, csak olvasó Auth-ellenőrzés egyetlen aktív, megerősített, korábban belépett fiókot talált; az email már az eredeti reader Access-listán szerepel, de a UUID eltér a régi finanszírozott technikai fióktól. A successor ezért az eredeti reader-határt megtartva, az explicit saját fiókhoz kötendő. Nem szabad azonosnak feltételezni a két fiókot vagy az új összeget a technikai fiókra adni. Generálás, profilbeírás és teljes E2E még nem történt.

A #91 merge és az új image célgépes próbája lezárt, az éles app/keret változatlan. A próba közbeni monitorhibák eredeti bizonyítékai megmaradtak; cleanup után az eredeti monitor új tényleges futása zöld. [Forrás, image, mért eredmények és következő éles kapu](NARRATIVE_RELEASE_HU.md#91-main-és-saját-fiókos-célgépes-próba--2026-10-26). A teljes saját fiókos böngészős út továbbra nem futott; ehhez a tulajdonos egyértelműen fiktív profilt választott.


### Saját fiókos indulási kapu teljesült — 2026-10-27 20:34UTC

A régi allowance szabályos lezárása és az új, egy saját fiókos3USD/30napos ablak éles átállítása PASS; az alkalmazás és Daily/kliens66062ec/3200b28e,schema038,v9 saját cohort. A teljes mért Playwright-alapút **PASS**: normál belépés,fiktív `/start` profil,első fejezet,egy mentett választás,második fejezet,kilépés,privát történet hitelesítési kapuja,friss normál belépés és ugyanazon két fejezet/választás. A választás typed-state hatása és a második period pontos kötése,friss Auth és változatlan canon/usage külön DB-readbackkel ellenőrzött. Minden felhasználói történetművelet a normál UI-ban történt.

A két v9-fejezet237349/283201ms backend-idő,10completed task/0.599364USD. A korábbról nyitva maradt `/futures`→`/onboarding` legacy útvonal kitérője3completed task/0.071851USD; megőrzött és a teljes saját3USD-be beleszámolt,nem v9-proof. Összesen **0.671215USD**,0unknown/unsettled,0rögzített dev-log warn/error; két új project/useraccount ugyanazt az összeget mutatja. A hosszkorlát- és locator/read-only observer korrekciók megőrzöttek,nincs újragenerálás vagy elhallgatott alkalmazáshiba. RawHAR nem támogatott; a normál UI/dev-log/szerveres readback az ellenőrzés határa. A friss normál monitor és külön runtime/timer readbackPASS.

A saját technikai indulási kapu kész,**V9-5PARTIAL**. A tesztelői szakasz előkészíthető,de tényleges új résztvevő/admission és a külön10USD-s ablak még nincs aktiválva,nincs kijelölt tesztelő. A3./6.fejezeti humán visszajelzés és hosszabb visszatérés továbbra nyitott; nincs széles minőségi/retention/terheléses PASS. A saját próba kerete nem resetelődik és nem lesz automatikusan tesztelői keret. [Teljes idő/költség/proof lezárás](NARRATIVE_RELEASE_HU.md#teljes-saját-fiókos-v9-playwright-alapút-pass--2026-10-27).
