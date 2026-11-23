---
status: implemented
owner: personal-simulation
---

# 049/08 – A politikai irány kérdései altípusonként

## Kiinduló helyzet (2026-11-23)

A politikai irány élesben van: v13, 1.1.0-s katalógus, 24 kezdőügy. A „Story focus” lépésben négy altípus közül lehet választani: helyi közélet, szervezeten belüli politika, tanácsadó vagy stáb, civil kezdeményezés.

**Mit vált ma az altípus?**

- **A kezdőügyeket:** altípusonként más hat katalógusügy jelenik meg. Ez az altípus valódi hatása.
- **Egy mondatot a motor utasításában.**
- **A kérdéseket nem:** a négy politikai kérdés mind a négy altípusnál ugyanaz. Ezért értelmetlennek tűnik a választás.

**A kérdések átfednek az altípussal, és ellent is mondhatnak neki:**

| Kérdés                                                                   | Gond                                                                                                                                 |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Szerep (szabad szöveg)                                                   | Altípusonként nagyon más szerepek jönnek szóba, a szabad szöveg a motornak bizonytalan jelzés.                                       |
| A történet léptéke (`stakes`: helyi, szervezeten belüli, országos súlyú) | A „helyi” és a „szervezeten belüli” megismétli az altípust; az „országos súlyú” ütközik a helyi altípussal és a helyi kezdőügyekkel. |
| Cselekvés módja (`style`: nyíltan, alkukkal, a háttérből)                | A „háttérből” lényegében a tanácsadói altípus.                                                                                       |
| Kitalált nevek                                                           | Rendben van.                                                                                                                         |

A kérdések csak az altípus kiválasztása után nyílnak ki. Ez az űrlap közös viselkedése; más irányoknál az altípus valóban szűri a kérdéseket. A politikánál most nem szűr semmit, ezért a kinyílás céltalannak hat. Ha a kérdések altípusonként mások lesznek, a viselkedés értelmet kap, és maradhat.

## Döntés (tulajdonos, 2026-11-23)

A kérdések altípusonként mások legyenek, és maradjon ki, amit az altípus és a kezdőügy már eldönt.

| Altípus             | Kérdések                                                        |
| ------------------- | --------------------------------------------------------------- |
| Helyi közélet       | szerep · cselekvés módja · kitalált nevek                       |
| Szervezeten belül   | a szervezet fajtája · szerep · cselekvés módja · kitalált nevek |
| Tanácsadó vagy stáb | kinek dolgozik · szerep · kitalált nevek                        |
| Civil kezdeményezés | a csoport fajtája · szerep · cselekvés módja · kitalált nevek   |

- A **lépték** kérdés mindenhonnan kikerül: a léptéket az altípus és a kezdőügy adja.
- A **cselekvés módja** a tanácsadónál kimarad, mert ott a háttérben dolgozás eleve adott.
- A **szerep** választható lista lesz, „Egyéb” lehetőséggel, amely mellé rövid szabad szöveg írható.
- Minden kérdésnél választható a „Nincs megadva”, ahogy most is.

## A válaszlehetőségek

Kulcsok angolul a szerződésben, címkék angolul és magyarul a felületen.

**Helyi közélet**

- Szerep (`position`): `new_councillor` (New councillor / Új képviselő), `long_serving_councillor` (Long-serving councillor / Régi képviselő), `candidate` (Candidate / Jelölt), `committee_chair` (Committee chair / Bizottsági elnök), `other` (Other / Egyéb).
- Cselekvés módja (`style`): `open` (In the open / Nyíltan), `dealmaking` (Through deals and alliances / Alkukkal és szövetségekkel), `behind_scenes` (From the background / A háttérből).

**Szervezeten belül**

- A szervezet fajtája (`institution`): `party_branch` (Party branch / Pártszervezet), `trade_union` (Trade union / Szakszervezet), `professional_chamber` (Professional chamber / Szakmai kamara), `association` (Association / Egyesület).
- Szerep (`position`): `member` (Member / Tag), `officer` (Office holder / Tisztségviselő), `candidate` (Candidate for office / Jelölt), `other`.
- Cselekvés módja (`style`): mint a helyi közéletnél.

**Tanácsadó vagy stáb**

- Kinek dolgozik (`institution`): `elected_leader` (An elected leader / Választott vezető), `appointed_official` (An appointed official / Kinevezett tisztviselő), `governing_body` (A governing body / Testület).
- Szerep (`position`): `adviser` (Adviser / Tanácsadó), `communications` (Communications / Kommunikáció), `policy_staff` (Policy staff / Szakpolitikai munkatárs), `other`.

**Civil kezdeményezés**

- A csoport fajtája (`institution`): `residents_group` (Residents' group / Lakossági csoport), `campaign` (Campaign / Kampány), `advocacy_organisation` (Advocacy organisation / Érdekvédelmi szervezet).
- Szerep (`position`): `organiser` (Organiser / Szervező), `spokesperson` (Spokesperson / Szóvivő), `volunteer` (Volunteer / Önkéntes), `other`.
- Cselekvés módja (`style`): mint a helyi közéletnél.

## Szerződés és verziózás

- **Új katalógusverzió: 1.2.0.**
  - Átveszi az 1.1.0 24 kezdőügyét és a tervezői új ügyet változatlanul.
  - A `POLITICAL_CATALOG_VERSION` 1.2.0 lesz; az 1.1.0-s út (`v13`) ehhez is ugyanígy kapcsolódik.
- **`politicsEmphasis`:** két új, nullázható mező: `position` és `institution`. A meglévő `role`, `stakes` és `style` megmarad, mert a már létrejött életek és vázlatok ezeket hordozzák.
- **Az 1.2.0-s szabályok** (a szerződésben és a `story-direction.ts` irány-ellenőrzésében):
  - a `stakes` csak `null` lehet;
  - a `position` és az `institution` értéke csak az altípus saját listájából jöhet;
  - a helyi közéletnél az `institution` `null`;
  - a tanácsadónál a `style` `null`;
  - a `role` szabad szöveg csak akkor lehet kitöltve, ha a `position` `other`.
- **Az 1.0.0 és az 1.1.0 változatlan:** a régi életek ugyanúgy olvashatók és folytathatók; a régi válaszokat a motor ugyanígy kapja.
- **Prompt:** a v13-as szöveg nem változik. A kérdések válaszai a kérésben adatként mennek, ezért nem kell új prompt-azonosító.

## A motor

A `storyDirectionProjection` a politikai válaszokat olvasható sorokként adja át a tervezőnek, a többi irányhoz hasonlóan. Például:

- „Role: new councillor.”
- „Organisation: trade union; role: office holder.”
- „Works for: an elected leader; role: communications.”

A „Nincs megadva” válasz kimarad. Az „Egyéb” a szabad szöveggel együtt megy, és szöveg nélkül is kimarad. Új szabályt nem kap a motor: ezek a válaszok ugyanúgy hangsúlyt adnak, mint a többi irány válaszai.

## Felület

- **A „Story focus” választás után az altípus saját kérdései nyílnak ki,** a mostani elrendezésben.
- **Altípusváltáskor** a csak a korábbi altípushoz tartozó válaszok törlődnek; a meglévő mechanizmus ezt már tudja.
- **Az „Egyéb” szerep** mellé egy rövid szövegmező nyílik.
- **Régi vázlat** (1.1.0, `stakes`, szabad szöveges `role`) megnyitásakor:
  - a lépték eldobódik;
  - a szabad szöveges szerep „Egyéb” lesz, a szöveggel együtt;
  - a tanácsadói vázlat cselekvési módja eldobódik.

  A többi válasz megmarad. A szerver az indításkor újra ellenőriz.

## Ellenőrzés

- **Szerződéses tesztek** altípusonként: elfogadott és elutasított kombinációk, a `stakes` tiltása 1.2.0-ban, az „Egyéb” szöveg szabálya, és hogy az 1.0.0 és az 1.1.0 életek továbbra is érvényesek.
- **Régi vázlat átvitele:** egy 1.1.0-s vázlat 1.2.0-ra.
- **A motor bemenete:** a vetület sorai altípusonként.
- **Worker-teszt:** egy 1.2.0-s politikai profil végigfut a fejezetmentésig (offline).
- **Felület:** böngészős próba a fejlesztői szerveren mind a négy altípussal, váltással és egy régi vázlattal.
- **Fizetős próba nem szükséges:** a promptszöveg nem változik. Ha a tulajdonos kéri, négy nyitófejezet (altípusonként egy) kb. 1,5 USD, külön jóváhagyással.

## Élesítés

Migráció nincs; egy szokásos kiadás a `ship.py` kártyájával. A politikai kapcsoló és a kohorszlista változatlan.

## Becsült munka

Fél–egy nap: szerződés, ellenőrzés, vetület, felület, címkék, tesztek, kiadás.
