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

## Megoldás: négy réteg, változatlan kapukkal

### R0 – Megelőzés (hamis riasztások csökkentése)

- **Szereplő-eredet a hűségellenőrzőnek.** A kérés jelölje meg minden ismert szereplő eredetét (`user_supplied` / `branch_fiction`), és a megszólítási szabály szövege nevezze meg pontosan, kikre vonatkozik. A motor által kitalált szereplő a profiljában rögzített megszólítást kap, amit később is tart.
- **Determinisztikus előellenőrzés.** A megszólítási szabály ellenőrzése a felhasználói szereplők nevei és a prózában hozzájuk kötött névmások alapján, a fidelity-hívás előtt. Ha sérül, az olcsó `prose_only` javítás azonnal indul.
- Ez **nem lazítás**: a szabály ugyanaz, csak a hatóköre lesz egyértelmű, a valódi sértés továbbra is bukás.

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
