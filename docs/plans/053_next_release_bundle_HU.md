<!--
status: active-supporting
owner: Ákos (tulajdonosi döntések), Claude (megvalósítás)
created: 2026-11-20
-->

# 053 – A következő összevont kiadás

## Döntés (2026-11-20)

- **A tulajdonos a Minimum csomagot választotta: A + B1 + C1–C3**, a lehető legkevesebb CI-körrel és várakozással.
- **Végrehajtás:**
  - egy ág (`claude/release-053-minimum`), egy PR, benne a kiadási pinek is;
  - push előtt teljes helyi ellenőrzés;
  - a szerveres build és próba a main CI-vel párhuzamosan fut.
- A kiadási út teljes gyorsítása (054) külön, ezután következik.
- A tulajdonos jóváhagyta a főoldali és az olvasóoldali szövegeket (2026-11-20). Ugyanebbe a kiadásba került a Next.js 16.4.3 → 16.4.5 biztonsági frissítés (hét közepes súlyosságú advisory javítása).

## Miért összevont

Egy éles kiadás (izolált image-próba kb. 95 perc, karbantartási ablak, mentés és visszaállítás, fence, élesítés utáni ellenőrzés) 3–4 óra vagy több. Ezért ami most nyitva van és kiadást igényel, egy körbe kerül. Ami nem igényel image-et (operátori szkriptek, dokumentáció), azt ugyanabban az ablakban vagy előtte rendezzük.

## Kiindulás (2026-11-20)

- Élesben: `f07d604` image, 19. generáció; a main `3428767` (a #223 csak operátori szkript).
- A két mintatörténet publikálva, regisztráció nélkül olvasható, `noindex`. **Csak közvetlen linkkel érhető el**: a főoldalról nem vezet hozzájuk semmi. Ez a 051 M5 kimaradt része, és a hibám, hogy ezt nem jeleztem a publikálás lezárásakor.
- A nyilvános olvasóoldal kijelentkezve (élőben megnézve):
  - belső szakszavakat mutat: „An Official life”, „OFFICIAL LIFE”, „Decision points (0)”, „Starting a private life requires separate permission for this published copy”;
  - a nyers metaadatok listaként jelennek meg („Category”, „Goal”);
  - a végén nincs semmilyen felhívás a saját történet indítására;
  - a böngészőfül címe „A simulated life”, nem a történet címe.

## Tartalom

### A. Mintatörténetek: láthatóság és átkattintás – kötelező

| #   | Teendő                                                                                                                                                                                                                                                                                                                        | Ráfordítás |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| A1  | **Főoldali mintablokk**: két kártya (cím, egy-két mondatos leírás, „Read the story” link) a „Hogyan működik” rész után. Kijelentkezve és bejelentkezve is látszik.                                                                                                                                                            | K          |
| A2  | **Olvasóoldal rendbetétele** a hivatalos mintákra: „Sample story” fejléc az „Official life” helyett; a belső szövegek („Decision points (0)”, „separate permission”) eltűnnek; a meghozott döntés olvasóbarátan látszik („You chose: …”), a nyitott döntés is; a metaadatok rövid sorban. A böngészőfül címe a történet címe. | Kö         |
| A3  | **Felhívás a történet végén** (és egy rövid sáv az elején): „Write your own story – your first chapter is free” → `/signup`, ha a regisztráció nyitva van; különben a várólista vagy „Registration is currently closed” szöveg.                                                                                               | K          |
| A4  | **Megosztási előnézet** (Open Graph cím és leírás) a két mintatörténetre, hogy linkként megosztva is értelmes kártya jelenjen meg. A többi oldal változatlan.                                                                                                                                                                 | K          |
| A5  | **Valódi 404** az ismeretlen címekre (ma 200-as üres oldal: audit A5). Indexelés előtt ez kell, különben a kereső üres oldalakat lát.                                                                                                                                                                                         | K          |

### B. Motor – kötelező

| #   | Teendő                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Ráfordítás |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| B1  | **Névmás-folytonosság régebbi történeteknél.** Ha egy történet v10-zel indult és v11/v12-vel folytatódik, a felhasználói szereplők névmása fejezetek között átválthat („his” → „their”). Ez a Back Home-nál előjött, és a fizető felhasználók futó történeteinél is előfordulhat. Javítás: a korábbi fejezetekben már rögzült névmást az író megkapja és megtartja; ahol nincs ilyen, marad a mai semleges szabály. Teszt a Back Home esetével. Új policy-verzió (v13), a v10/v11/v12 marad. | Kö         |
| B2  | **052 K3: szerkesztői tartás és riasztás.** Ha két helyreállítás után sincs kapun átment fejezet, a felhasználó nem hibaüzenetet kap: a fejezet „szerkesztői ellenőrzés alatt” állapotba kerül, az operátor riasztást kap, a fejezet nem vész el, és a keretet nem terheli.                                                                                                                                                                                                                  | Kö         |

### C. Kiadási folyamat gyorsítása – erősen ajánlott (image nélkül)

Minden kiadásnál kézzel kellett ugyanazt megoldani; ezek együtt kb. 30–60 percet és több hibalehetőséget visznek el körönként.

| #   | Teendő                                                                                                                                                             | Ráfordítás |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| C1  | A régi `owner/funded-active-proof-capability` rekord kezelése a szkript része legyen (ma minden ablakban kézzel tesszük félre a két zár alatt).                    | K          |
| C2  | A visszaállítás és a fence maga várja meg az óránként négyszer futó `alterward-recovery` lefutását (ma külső várakozó segéd és újrapróba kell).                    | K          |
| C3  | Az átmeneti fence-terv-elutasítás (plan-encryption, observer) egyszeri, naplózott automatikus újrapróbája.                                                         | K          |
| C4  | **Daily tartós javítás**: összegző inventory a teljes manifest-lista helyett, a régi kiadási maradványok megőrzési szabálya, riasztás a 16 MiB-es határ közelében. | Kö         |

### C+. A kiadási folyamat gyorsítása – mérés és javaslat

> A részletes, rögzített terv: [054 – A kiadási út gyorsítása](054_release_path_HU.md).

**Mért idők** (az utolsó öt kiadás, 2026-11-17–19):

| Lépés                                | Idő         | Megjegyzés                                                                                      |
| ------------------------------------ | ----------- | ----------------------------------------------------------------------------------------------- |
| PR CI                                | 38–44 perc  | ebből a `container` job 41 perc; a `verify` 7 perc; az `image-rehearsal` 35 perc (párhuzamosan) |
| Main CI a merge után                 | 36–42 perc  | ugyanaz a fa, mint a PR-é, ha a main közben nem mozdult                                         |
| Külön kiadási pin-commit + CI        | 37–42 perc  | két kiadásnál kellett                                                                           |
| Szerveres build                      | 9–17 perc   |                                                                                                 |
| Szerveres izolált image-próba        | 90–107 perc | 4 CPU, 7 GB, az éles mellett                                                                    |
| Tulajdonosi engedély az auditfájlhoz | változó     | minden kiadásnál külön                                                                          |
| Karbantartási ablak                  | 26–40 perc  | öt ablakból kettőt meg kellett szakítani és újraindítani                                        |

Ez sorban **3,5–5 óra**, és benne van a hibás ablakok újrakezdése.

**Hol megy el a próba ideje** (az `f07d604` próba lépésenként):

| Eset                                            | Idő                    |
| ----------------------------------------------- | ---------------------- |
| `postcheck`                                     | 37,6 perc              |
| `success`                                       | 33,9 perc              |
| `interruption-staged`                           | 6,9 perc               |
| `image-only`, `interruption-intent/held/schema` | 1,8–2,2 perc egyenként |

A `postcheck`, a `success` és az `interruption-staged` esetek mindegyike lefuttatja a teljes successor-láncot is: a 039-es funded átállást, a 040-es registry-migrációt, a reader- és tester-béta generációkat. Ezeken az utakon az éles rendszer már rég túl van, a CI pedig minden PR-nél lefuttatja őket. Egy csak alkalmazáskódot érintő kiadásnál (a séma és az operátori szkriptek változatlanok) a próba kb. 80%-a nem a mostani változást ellenőrzi.

**Javaslatok, hatás szerint:**

| #   | Teendő                                                                                                                                                                                                                                                                                                                                                                                 | Megtakarítás              | Kockázat / döntés                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------- |
| S1  | **Párhuzamosítás, kód nélkül.** A kiadási pinek mindig a feature PR-be kerülnek (külön pin-commit nincs). A szerveres build és próba a merge után azonnal indul, a main CI-vel párhuzamosan; a main CI zöldjét az ablak kapuja várja meg, nem a próba. Az auditfájl engedélyét a kiadás jóváhagyásával együtt kérem, a pontos commitra.                                                | 40–80 perc                | nincs; csak sorrend                                                                             |
| S2  | **Egyparancsos ablak a repóban** (a C1–C3 beépítve: capability-rekord, recovery-várakozás, átmeneti fence-hibák). Az ablak kb. 25 perc felügyelet nélkül, és nem kell megszakítani.                                                                                                                                                                                                    | 15–40 perc, kevesebb hiba | nincs; a lépések ugyanazok                                                                      |
| S3  | **Kétféle próbaprofil.** Csak alkalmazáskód változott (gépi szabály: a `REVIEWED_IMAGE_CHANGES` listában nincs migráció, séma vagy operátori fájl) → rövid profil: `image-only`, a mostani sémán végzett ellenőrzések, egy megszakításos eset. Minden másnál a teljes profil. A CI minden PR-nél továbbra is a teljes láncot futtatja. A profilt a szkript választja, nem az operátor. | 60–70 perc                | kiadási kapu szűkítése, ezért tulajdonosi döntés kell                                           |
| S4  | **Egyszer építünk, a CI-ben.** A CI által épített és ott ellenőrzött image digestre kötve kerül a szerverre (privát registry, csak olvasó token a szerveren). A szerveres build és próba megszűnik; a szerver csak a digestet és a CI-bizonyítékot ellenőrzi.                                                                                                                          | kb. 2 óra                 | új hitelesítési adat és ellátási lánc, ezért külön terv és döntés kell; nagyobb munka (2–3 nap) |
| S5  | A main CI elhagyása, ha a merge-fa azonos a PR CI-ben ellenőrzött fával (a fence-kapu a fa hash-ét fogadja el).                                                                                                                                                                                                                                                                        | 40 perc                   | S1 után már alig számít; csak ha S4 nincs                                                       |
| S6  | **Kiadási ütem:** összevont kiadások, nem minden javítás külön. Sürgős javítás csak hibánál.                                                                                                                                                                                                                                                                                           | körönként a teljes idő    | szervezési döntés                                                                               |

Mellékesen: az óránkénti „external availability” GitHub-ellenőrzés hetek óta minden futáskor piros (privát health-projection). Ez elfedi a valódi riasztást, ezért javítani vagy kikapcsolni kell (C5, kicsi).

**Várható eredmény:**

| Változat     | Kiadási idő   | Operátori figyelem            |
| ------------ | ------------- | ----------------------------- |
| Ma           | 3,5–5 óra     | sok kézi lépés                |
| S1 + S2      | kb. 2,5–3 óra | egy parancs az ablakra        |
| S1 + S2 + S3 | kb. 1,5–2 óra |                               |
| S1 + S2 + S4 | kb. 1,5 óra   | ebből kb. 1 óra a CI-re várás |

Javaslatom: az S1 rögtön, ennél a kiadásnál; az S2 és a C5 a C részben; az S3 erre a kiadásra, ha jóváhagyod; az S4 külön tervként a következő körre.

### D. Felületi audit – a legnagyobb hatású maradék (választható)

A P0 és a kis P1 tételek (1–10) már élesben vannak (#205, #206, #213). Javaslat erre a körre:

| #   | Teendő                                                                                                     | Ráfordítás |
| --- | ---------------------------------------------------------------------------------------------------------- | ---------- |
| D1  | Várakozási állapot időbecsléssel és szakaszokkal (audit 11, V1). A felhasználó perceket vár egy fejezetre. | Kö         |
| D2  | Történetlista állapottal és következő lépéssel (audit 12, L1).                                             | Kö         |
| D3  | „How it works” és „Pricing” oldal (audit 18); a mintatörténetek ide is linkelhetők.                        | Kö         |

Későbbre marad: kétlépéses döntés (13), az indító tömörítése (14), egységes fejléc (15), a főoldal teljes újratervezése (16), „Privacy & my data” összevonása (19), a P2 finomítások.

### E. Konfiguráció és dokumentáció (image nélkül)

| #   | Teendő                                                                                                                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | **Keresői kitettség** (051 R3 második fele): `PUBLIC_EXTERNAL_EXPOSURE_ENABLED`, `PUBLIC_SITE_URL`, `API_INTERNAL_URL`, a két történet `index` módba a `curation:exposure` CLI-vel, utána a Cloudflare-peremen a külső API és a sitemap névtelen elérhetőségének ellenőrzése. Csak az A2–A5 után, ugyanabban az ablakban. |
| E2  | 051 és 052 állapotának frissítése, a slugok és a tanulságok rögzítése.                                                                                                                                                                                                                                                    |
| E3  | A felhasználói publikálás adatvédelmi terve (megállapodott elv: a megadott adatok eredet szerinti kezelése, az AI csak háló, nyilatkozat és eltávolítási út). Csak dokumentum.                                                                                                                                            |

## Sorrend

1. Tulajdonosi döntések (lent).
2. Fejlesztés ágakon, külön PR-ekkel: A (egy PR), B1, B2, C1–C4, a választott D-tételek. Mindegyik CI-zöld és mergelve, mielőtt a kiadás indul.
3. Kiadási pinek egyszer, a teljes csomagra.
4. Egy build és egy izolált image-próba.
5. Egy karbantartási ablak: image, Daily frissítés (C4), és ha a tulajdonos engedi, a kitettség (E1).
6. Élő ellenőrzés kijelentkezve: főoldal, mindkét történet, felhívás, 404, megosztási előnézet; telefonos szélességen is.

## Becsült ráfordítás

- A: kb. 1 nap. B1: 1–1,5 nap. B2: 1–1,5 nap. C1–C3: fél nap. C4: 1 nap.
- D1–D3: tételenként 1–2 nap.
- A kiadás maga: 4–5 óra a próbával együtt.
- Minimum (A + B1 + C1–C3): kb. 3 nap fejlesztés + egy kiadás. Ajánlott (A + B + C): kb. 5 nap. Teljes (+ D): kb. 8–10 nap.
- Fizetős AI: B1-hez és B2-höz kis mérés (kb. 0,5–1 USD), külön engedéllyel.

## Tulajdonosi döntések

| #   | Kérdés                                                                                                            | Javaslatom                                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| T1  | Melyik csomag: minimum, ajánlott vagy teljes?                                                                     | Ajánlott (A + B + C); a D egy következő körben.                            |
| T2  | Bekapcsoljuk-e az indexelést ebben az ablakban (E1)? A kereső által mentett tartalom nem vonható vissza biztosan. | Igen, a két mintatörténetre, az A2–A5 után.                                |
| T3  | A főoldali blokk és a felhívás szövege.                                                                           | Kiadás előtt jóváhagyásra elküldöm (angolul és magyarul).                  |
| T4  | Maradjon-e az „ALPHA” jelzés (audit D5)?                                                                          | Nyilvános mintáknál zavaró; javaslom kiváltani: „Early access” vagy semmi. |
| T5  | Megosztási előnézet (A4) a két történetre.                                                                        | Igen.                                                                      |
| T6  | Rövid próbaprofil a csak alkalmazáskódot érintő kiadásokra (S3).                                                  | Igen, gépi szabállyal; a CI marad teljes.                                  |
| T7  | Külön terv az egyszer, CI-ben épített image-re (S4).                                                              | Igen, a következő körre.                                                   |
