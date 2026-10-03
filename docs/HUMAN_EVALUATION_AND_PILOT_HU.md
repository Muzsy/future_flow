# alterward — emberi értékelés és pilot előkészítése

2026-10-03 · [Bizonyíték és keret](STATUS_HU.md) · [V2 modellek](AI_V2_ROUTING_REPORT_HU.md) · [Backlog](NEXT_STEPS.md).

P07 emberi minőségi kapuja és P08 használati pilotja még nyitott. A felhasználó először a magyar mintát értékeli; ez nem minőségi jóváhagyás. A [magyar](examples/AI_V2_HUNGARIAN_STORY.md) és [angol](examples/AI_V2_ENGLISH_STORY.md) három időszakos valódi AI-történet már rendelkezésre áll, elolvasásuk nem indít új API-hívást.

## Értékelőlap

Minden láncnál rögzítendő nyelv, dátum és eseménymodell, személyazonosító nélkül. 1–5 pont és rövid konkrét példa:

| Szempont | Mire figyeljünk? |
|---|---|
| Személyesség | Az induló helyzet/cél/korlát ténylegesen alakítja a történetet? |
| Következetesség | Megmarad a választás következménye? Van új vagy eltűnő fontos tény? |
| Hihetőség | Hétköznapi, arányos a fejlődés; nem tűnik biztos jóslatnak? |
| Döntési tét | Érthető a két opció eltérő haszna, kockázata és áldozata? |
| Érdeklődés | Kíváncsi az olvasó a következő időszakra? |
| Nyelv/ismétlés | Természetes, világos és változatos az angol/magyar szöveg? |

Minden fejezet után külön: folytatná / másik ágat próbálna / abbahagyná, és miért. Külön jelezni a súlyos canon-, PII-, megtévesztő vagy nyelvi hibát. Az AI-checker sikere nem írja felül az emberi észrevételt. Luna/Sol összehasonlításhoz később vak értékelés és több azonos kiindulású eset szükséges; a kis négyláncos mérés alapján nincs automatikus modellcsere.

## Pilot előtt

P06 valódi fiókos UI/Auth/export/törlés és backup/restore; P07 EN/HU minőség szükséges. 20–50 résztvevő a cél, az első meghívások/résztvevői futtatások még nem történtek meg. Rögzítendő az értékelt kohorsz, olvasási és munkamenetdefiníció, inaktivitási küszöb, konkrét sikerhatár, hozzáférési limitek és felelős. Ezek jelenleg nyitott mérési döntések, nem bizonyított eredmények.

A minimális technikai műszerezés kész: onboarding/life opened/chapter-end/continue/fork kattintás és külön mentett first/continuation/fork-period siker, valamint generálási hiba. `pnpm metrics:private` a generált első időszakhoz viszonyított continuationClickRate és continued_lives proxykat adja. Ezek nem a végleges olvasási kohorsz és nem későbbi munkamenetes Continued Life Sessions; az utóbbi jelenleg `null`. A fejezetvég láthatósága olvasási jel, nem bizonyított elolvasás.

A két Sol-lánc konzervatív átlagos háromidőszakos költsége ebben a kis mintában körülbelül 0,21 USD. Húsz ilyen új lánc körülbelül 4,21 USD, ötven 10,52 USD; a valós mintaváltozat/javítás/foglalási plafon eltérhet. A megmaradt 3,38 USD fejlesztői keretből nem indítunk automatikusan teljes 20–50 fős pilotot. Előbb minőség/fiókpróba, kis fokozatos pilot és szükség esetén külön jóváhagyott keret. A teljes Official seed szintén külön mért döntés.

## Külső audit a pontozás előtt

Sonnet/Opus/Fable ellenőrizte a fő EN/HU minták mindhárom időszakát. Kánon és nyelv rendben, de ismétlés/visszafogott személyesség/kíváncsiság felmerült. A modellek pontszámai nem emberi értékelés: [részletes észrevételek](examples/CLAUDE_EXTERNAL_AUDIT_HU.md). A felhasználó magyar értékelése és később az angol tovább nyitott. Eredeti történetek változatlanok.

Külön 5 USD Claude audit-/kutatási keret létezik, maradéka a státuszban; nem automatikus pilot-finanszírozás. A fenti 3,38 USD az OpenAI keretének maradéka.
