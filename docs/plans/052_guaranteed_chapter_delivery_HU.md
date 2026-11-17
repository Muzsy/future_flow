---
status: active-supporting
owner: narrative-engine
related:
  - 051_official_v10_sample_stories_HU.md
---

# 052 – Garantált fejezetkézbesítés változatlan minőségi kapukkal

Tulajdonosi döntés: 2026-11-17. Tervező: Claude.

## Tulajdonosi követelmények

1. **Kifizetett fejezet mindig elkészül**, a felhasználó saját választására. Nem kérhetjük, hogy mást válasszon, és nem hagyhatjuk fejezet nélkül.
2. **A minőség nem romolhat.** Egyetlen kapu sem lazul, és kapun át nem ment fejezet nem jut ki.
3. **A felhasználónak nincs teendője.** Nem kap hibaüzenetet és újrapróba-gombot; a helyreállítás a mi dolgunk és a mi költségünk.

## Kiinduló helyzet (mérés)

- Fikciós fejezetenként 5–9 AI-hívás: terv, írás, tervreview, hűségellenőrzés, szerkesztő. **Egyetlen javítókör** van, utána a job véglegesen `failed` (`NARRATIVE_QUALITY_FAILED`).
- `lifeJobRetryAvailable` ezt szándékosan nem engedi újrapróbálni. A felület hibaüzenetet mutat, gomb nélkül, és a történet elakad. A kredit visszakerül, az AI-költség nálunk elvész.
- Official életnél még rosszabb: a bizonyíték csak a gyökérágat fogadja el (`parent_branch_id` → elutasítás), `failed` ágból pedig nem készülhet kiadási vázlat. Marad az elölről írás.
- Fizetős v10-mérések: 27 fejezetből 4-nél volt javítókör (~15%), végleges minőségi bukás 0. Éles (051 minták): 6 fejezetből 1 végleges bukás.

### Az éles bukás anatómiája (051, The Promotion, 3. fejezet)

1. Az első változat tervreview-ja `choiceStakes` major hibát talált (a döntés kizárólagossága nem volt megindokolva). Ez jogos; a teljes csomag javítása (`author_package`) indult.
2. A javított változat tervreview-ja `pass` lett.
3. A hűségellenőrző `hard_boundary_violation`-t jelzett: nemre utaló névmások Benre és Rosára. A szabály (`packages/core/src/story-direction.ts`) azonban csak a **felhasználó által megadott** szereplőkre vonatkozik („supplied people without an address rule”). Bent és Rosát a motor találta ki az 1–2. fejezetben. **A végleges bukást hamis riasztás okozta**, nem valódi hiba.
4. A javítókör már elfogyott, ezért a job véglegesen elbukott. Ezt egy kizárólag a prózát érintő, a kánont byte-ra megőrző javítás (`prose_only`) is megoldotta volna.

Tanulság: a végleges bukás nem jelent rossz történetet. Jellemzően egy rossz időpontban érkező, szűk (vagy téves) kapujelzésről van szó, amelyre nincs második, célzott javítás.

### Miért tévedett a motor (gyökérok)

A megkülönböztetés szándékos és marad: a 049-es terv adatvédelmi szabálya szerint a felhasználó által megadott, akár valós szereplőknek (házastárs, szülő, kolléga) a motor nem tulajdoníthat nemet vagy identitást, ha a felhasználó nem adott meg megszólítást. A kitalált szereplőkről a motor szabadon dönthet. Nem a szabály a hiba, hanem az, ahogy a motor a szereplőket a hűségellenőrzőnek átadja:

- **Az 1. fejezetben** Ben új szereplőként, a fejezet saját `actor_add` eseményével jelent meg; az ellenőrző látta, hogy kitalált, és a „he” névmást elfogadta.
- **A 3. fejezetre** Ben és Rosa bekerült a mentett állapot szereplőlistájába (`state.actors`), pontosan olyan alakban, mint a felhasználó szereplői: címke és kapcsolat, **eredetjelölés nélkül**.
- **A szabály szövege** („For supplied people without an address rule …”) nem mondja meg, kik a „supplied people”. Az eredet ugyan ott van a kérésben, a szereplőprojekció `kind: "fictional"` / `"supplied"` mezőjében, de a szabály szóhasználata ehhez nem kapcsolódik.
- Az ellenőrző ezért ugyanazt a helyzetet hol jónak, hol sértésnek ítéli. A döntés a véletlenen múlik: ez motorhiba, nem írói hiba.

## Megoldás: négy réteg, változatlan kapukkal

### R0 – A gyökérok javítása a motorban

- **Minden szereplőnek saját megszólítási sor, általános mondat nélkül.** Az általános „supplied people” mondat helyett a szerver minden kéréshez determinisztikusan, a pillanatnyi szereplőkből állítja össze a listát, ahol **mindenkinek** van saját sora: a felhasználóiaknak és a kitaláltaknak is. Az ellenőrzőnek így senkit nem kell besorolnia vagy kikövetkeztetnie.
  - Felhasználói, megszólítás nélkül: `Actor {id} ({label}) — supplied by the reader, no address given: use the label, a name or neutral wording.`
  - Felhasználói, megadott megszólítással: a mai `cast` sor.
  - Kitalált, rögzített megszólítással: `Actor {id} ({name}) — introduced by the story: {she/her · he/him · they/them} (established in chapter N).`
  - Kitalált, rögzítés nélkül (régi életek): `Actor {id} ({name}) — introduced by the story: choose a form of address and keep it.`
- **A kitalált megszólítás rögzítése.** A motor által bevezetett szereplő profilja (`addedProfiles`) kap egy `addressForm` mezőt, amelyet a bevezető fejezet tölt ki. A későbbi fejezetek ezt tartják. Ez szerződésbővítés, ezért a régi profiloknál opcionális.
- **Eredetjelölés az állapotban.** A kérésekben a `state.actors` elemei is kapjanak `origin: user_supplied | story_fiction` jelölést (szerveroldali projekció a meglévő `characterProjection.kind` és a kezdő bemenet alapján). A tárolt adat nem változik.
- **Determinisztikus előellenőrzés.** A felhasználói szereplők nevei és a hozzájuk kötött névmások ellenőrzése a fidelity-hívás előtt. Valódi sértésnél az olcsó `prose_only` javítás azonnal indul.
- **Mérés a megvalósítás előtt (~0,05–0,10 USD, tulajdonosi engedéllyel).** A bukott fejezet hűségellenőrzése újra az új szabálysorokkal: az eredeti szöveggel (a téves riasztásnak el kell tűnnie) és egy szándékosan hibás változattal, ahol a házastársra „she” áll (a sértésnek továbbra is buknia kell).
- **Visszatérő mérés.** Az éles bukás bemenete (a 051-es 3. fejezet) regressziós esetként: az ellenőrzőnek a kitalált szereplők névmásait el kell fogadnia, a felhasználói szereplőkre írt nemre utaló névmást pedig továbbra is el kell utasítania (negatív próba).
- Ez **nem lazítás**: a szabály ugyanaz, csak a hatóköre lesz egyértelmű; a valódi sértés továbbra is bukás.

### R1 – Célzott második javítás (prózai hibákra)

- A hibák osztályozása: **prózai** (megszólítás, megfogalmazás, ismétlés, nyelvi) vagy **szerkezeti** (kánon, ok-okozat, döntési tét, állapot).
- Ha az egyetlen javítókör után csak prózai hiba marad, engedélyezett egy második, **kizárólag prózai** javítás. Ez a meglévő `prose_only` mechanizmus: a jelölt, a terv és a tények byte-ra azonosak maradnak, csak a fejezet címe és szövege változik. Utána ugyanazok a kapuk futnak újra.
- Költség: 2–3 hívás. A kánont nem érinti, ezért a minőséget nem rontja.

### R2 – Helyreállító próbálkozás (szerkezeti hibákra)

- A job nem bukik el, hanem `recovery` állapotba kerül (checkpoint-szinten, a branch `generating` marad):
  - **friss teljes próbálkozás** ugyanarra a választásra, ugyanabból az állapotból;
  - az előző kapujelzések szerkesztői iránymutatásként mennek a tervezőnek;
  - **külön kérésplafon** a helyreállításra (pl. +9), a felhasználói 9-es plafontól elkülönítve;
  - legfeljebb **2 helyreállító próbálkozás**; minden próbálkozás ugyanazokon a kapukon megy át.
- A korábbi próbálkozások receiptjei archív próbálkozásként maradnak (`attempts[]`). A periódus bizonyítéka csak a sikeres próbálkozást köti, így a `validateOfficialFictionPeriod` 5–9 receipt-szabálya változatlan.
- A költséget mi viseljük, külön szolgáltatási helyreállítási kerettel és riasztással. A felhasználó fejezetkreditje foglalva marad, és csak sikeres mentéskor fogy el (a meglévő tartós mentéskori fogyasztás szerint), nem kétszer.

### R3 – Szerkesztői tartás (végső biztosíték)

- Ha a helyreállítás után sincs kapun átment fejezet (várhatóan nagyon ritka), a job `editorial_hold` jelölést kap, operátori riasztással és SLA-val (pl. 24 óra).
- Az operátor eszközei, mind ugyanazokkal a kapukkal:
  - emelt beállítású helyreállítás (nagyobb kimeneti keret, alternatív modellútvonal);
  - prózai hibánál rögzített szerkesztői javítás a kiadási mintára, külön bizonyítékkal.
- Kapun át nem ment szöveg soha nem kerül a felhasználóhoz. A felhasználót nem kérjük meg semmire.

## Felhasználói élmény

- A hibaüzenet és az újra gomb helyett: „A fejezeted még készül – egy extra minőségi kört kapott.” Nincs teendő.
- Tartás esetén: „A fejezeted egy szerkesztői ellenőrzésen megy át; amint kész, itt megjelenik.” Értesítés a meglévő csatornán, ha van.
- A korábbi (már elbukott) jobok egyszeri helyreállítása: a fikciós szabályzatú, `NARRATIVE_QUALITY_FAILED` jobok automatikusan R2-be kerülnek a kiadás után, ugyanazon a gyökérágon. Így a 051-es The Promotion is folytatható elölről írás nélkül.

## Adat és szerződés

- Lehetőleg **séma nélkül**: az állapot a job checkpointjaiban él (`recovery: {attempt, reason, startedAt}`, `attempts[]`, `editorialHold`), a job státusza `queued`/`running`, a branch `generating`. Ha a meglévő CHECK-megszorítások vagy a worker-claim logika ezt nem engedi, kis migráció kell, restore/schema guardokkal együtt (AGENTS.md §5).
- `lifeJobRetryAvailable` és a felhasználói `retry` útvonal a minőségi esetekre megszűnik; helyette automatikus helyreállítás fut.
- `narrativeProcessingBlock` és a lease-helyreállítás figyelembe veszi a helyreállítási plafont.

## Költség

- Megfigyelt arány: javítókör ~15%, végleges bukás ~0–3%. Egy helyreállítás ≈ egy fejezet ára (0,3–0,6 USD).
- Várható többletköltség fejezetenként átlagosan 0,01–0,02 USD, külön helyreállítási kerettel és riasztással.

## Mérés és monitor

- Fejezetenként rögzítve: javítókör, R1, R2, R3, költség, kapujelzés típusa.
- Belső monitor: R3-tartás → azonnali riasztás; R2-arány küszöb fölött → riasztás.
- Heti kivonat: kapujelzések típus szerint; a hamis riasztások visszavezetése R0-ba.

## Ellenőrzés

- Offline tesztek rétegenként:
  - R0: helyes hatókörű megszólítási szabály, és a valódi sértés továbbra is bukás;
  - R1: csak prózai hiba után engedett második javítás, és a kánon byte-ra azonos;
  - R2: friss próbálkozás külön plafonnal, receipt-archívum, Official bizonyíték a sikeres próbára;
  - R3: tartás és riasztás, a kapun át nem ment szöveg nem kerül ki;
  - kredit: egyszer fogy.
- Izolált image-próba, majd éles mérés: a 051-es elbukott fejezet helyreállítása az első valódi eset.
- `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm schemas`.

## Kiadási sorrend

| Lépés | Tartalom                                                                   |
| ----- | -------------------------------------------------------------------------- |
| K1    | R0 + R1: legkisebb kockázat, a megfigyelt bukást önmagában megelőzte volna |
| K2    | R2 + felhasználói állapotszöveg + korábbi bukások helyreállítása           |
| K3    | R3 + operátori eszközök + monitor                                          |

Minden lépés külön PR, image-kiadás és tulajdonosi jóváhagyás. Fizetős mérés csak tulajdonosi engedéllyel.

## Kockázatok

- **Végtelen ciklus vagy költségelszállás:** szigorú, külön plafonok (R1: 1, R2: 2 próbálkozás), külön keret és riasztás.
- **Bizonyíték-keveredés:** a próbálkozások receiptjei elkülönítve; az Official validáció csak a sikeres próbát köti, ezt tesztek fedik.
- **Rejtett minőségromlás:** a kapuk változatlanok; R0 csak a szabály hatókörét pontosítja, és ehhez negatív teszt kell (a valódi sértés bukik).
