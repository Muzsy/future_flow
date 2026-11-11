# alterward — teljes induló kínálat és külön előállítási keret

2026-10-07 · Mért tokenköltségre épülő becslés · 10 USD közös zárt béta keret jóváhagyva

## Aktuális jóváhagyott döntés

**10 USD összesen: 8 USD OpenAI + 2 USD Claude, 15 angol élet / 5 Scenario, majd legfeljebb 10 fős zárt béta.** Mind a 15 élet három fejezettel és külön Claude-audittal készül. A teljes 50–100 élet/20–30 Scenario kínálat későbbi bővítés; a teljes nyilvános indulás külön lépés. A felhasználó ezzel módosította a korábbi teljes-kínálat-minden-indulás-előtt döntését, és a korábbi 10 + 5 USD induló használati keretet is helyettesíti.

A [kikényszerítendő keret](AI_PRODUCTION_BUDGET_HU.md) seed része legfeljebb **6 USD OpenAI + 1 USD Claude**. A tesztelők számára külön fenntartott **2 USD OpenAI + 1 USD Claude** nem költhető előállításra. A számított 6,91 USD alap tartalmazza a 15 seed életet, az öt Scenario review-ját, minden seed Claude-auditját és tesztelőnként három új privát fejezetet/auditot. Ez becslés; a 10 USD a tényleges foglalás/elszámolás közös plafonja. A régi 5–5 USD fejlesztési keret megmarad külön. Runtime még nem aktivált, új paid hívás a döntés rögzítésével nem történt.

A következő szakaszok a döntéshez vezető korábbi becsléseket őrzik; ahol eltérnek a fenti aktuális kerettől vagy ütemezéstől, a fenti döntés az irányadó.

## Friss kérés: minimális keret bétatesztelőkkel együtt

A felhasználó a 30–55 USD külön előállítási változatoknál kisebb összeget szeretne, és közös induló becslést kér a bétatesztelők használatával együtt. Ez új méretezési kérés; még nem jóváhagyott költési keret és nem egyértelmű felmentés a korábban kért teljes 50–100 élet/20–30 Scenario indulási kapu alól. A korábbi becslés alább megmarad összehasonlításként.

Feltételezés: minden előre elkészített élet három angol fejezetet és saját Claude-auditot kap; a bétatesztelő első három új privát fejezetét a másik mért lánc 0,1934325 USD OpenAI + 0,038370 USD Claude költsége alapján tervezzük. Ez személyenként kb. 0,232 USD, nem korlátlan használat. Az olvasás és az ingyenes preview nem generál újra történetet. Ismeretlen válasz vagy javítás a tartalékból fogyaszt; automatikus újrapróba nincs.

| Változat | Előre elkészített kínálat | Bétatesztelők | Számított alap, seed + teszthasználat | Teljes javasolt plafon |
| --- | --- | --- | ---: | --- |
| Legkisebb zárt béta | 5 élet / 3 Scenario / 15 fejezet | 5 fő, első 3 új fejezet/fő | kb. 2,70 USD | **5 USD: 4 OpenAI + 1 Claude** |
| Kényelmesebb zárt béta | 15 élet / 5 Scenario / 45 fejezet | 10 fő, első 3 új fejezet/fő | kb. 6,91 USD | **10 USD: 8 OpenAI + 2 Claude** |
| Teljes eredeti minimum | 50 élet / 20 Scenario / 150 fejezet | 10 fő, első 3 új fejezet/fő | kb. 17,64 USD | **25 USD: 20 OpenAI + 5 Claude** |

Az első két változat a teljes kínálati cél előtt megnyitható **zárt tesztkört** javasol. Ehhez külön felhasználói döntés szükséges, mert az előző utasítás a teljes kínálatot minden éles indulás elé helyezte. A 50–100 élet/20–30 Scenario cél ezekben későbbi bővítésként maradna meg; a nyilvános teljes indulás ettől még külön kapu. A harmadik változat megtartja a most jóváhagyott teljes indulási tartalommennyiségi feltételt.

**Költségminimalizáló javaslat: az 5 USD-s, öt tesztelőre korlátozott zárt béta**, ha a felhasználó elfogadja a kisebb induló készletet. Ez már valódi angol AI-történeteket, külső auditot és valódi teszthasználatot biztosít. A nagyobb mintához és korlátlanabb teszteléshez új döntés kell. Ha a teljes induló készlet feltétele marad, a javasolt közös plafon 25 USD.

Ezek **egymást helyettesítő, teljes induló becslések**, nem a korábbi 10 + 5 USD használati kerethez automatikusan hozzáadott összegek. Jóváhagyás után a választott összkeretet seed- és teszthasználati részre bontjuk és a korábbi éles kerethez viszonyát is rögzítjük; most egyik runtime-keretet sem módosítottuk. A 0,50 USD/user korábbi plafon nem jogosít fel összesített projektplafon feletti költésre. A tesztkeretet az előállítás nem fogyaszthatja el.

A felhasználó döntése: **a teljes 50–100 Official Life és 20–30 Official Scenario kínálatnak az éles indulás előtt el kell készülnie**. Ez a [közösségi specifikáció](PUBLIC_LIVES_DISCOVERY_COMMUNITY_SPEC_HU.md) Phase 0 követelménye. A kisebb pilot bizonyíték és fejlesztési alap; önmagában nem teljesíti az indulási kaput. A korábbi P01–P13 és Shared S0–S7 terv megmarad.

## Javasolt konkrét kínálat

**25 különböző Scenario, mindegyikből három eltérő döntésekkel létrejövő Official Life: összesen 75 élet.** Életenként három hat hónapos angol fejezet, fejezetenként a jelenlegi 250–600 szavas célhosszal; ez 225 fejezet, összesen körülbelül 56–135 ezer szó. A specifikáció darabszámot kér, az induló fejezetszámot nem rögzíti: a három időszak a már működő, ténylegesen auditált láncon alapuló javaslat. Nem állítjuk, hogy ezzel egy teljes emberi élet végigszimulált története elkészül.

Minden élet valódi AI-generálást, időszakonként kánonellenőrzést, teljes kiadási review-t, szerkesztői ellenőrzést és egy független Claude-auditot kap. Minden Scenario saját teljes sablon-review-t és külön Official SCENARIO eredetengedélyt igényel. Az élet ettől külön Official LIFE engedélyt és publikálási megerősítést kap. Téma-, profil- és döntésbeli változatosság, kategóriák és a használható döntési kezdőpontok ellenőrzése a kínálat része. Teszt-fixture, kézzel írt kész próza vagy hibás audit nem számítható a kész darabszámba.

## Mért költségalap

A [valódi Official seed](OFFICIAL_SEED_REPORT_HU.md) három időszaka, sablon-review-ja és három teljes tartalom-review-ja — köztük egy blokkolt változat és annak új ellenőrzött másolata — 13 OpenAI-hívás volt: **0,2231354 USD tokenbecslés, 0,2661725 USD konzervatív elszámolás**. A külön Claude-audit **0,02748 / 0,033215 USD**. A [másik valódi háromrészes lánc](examples/AI_PUBLIC_FORK_ENGLISH_SAMPLE.md) OpenAI-elszámolása 0,1934325 USD, külső auditja 0,038370 USD. Ezek két kis minta értékei, nem garantált egységárak.

Az alábbi becslés életenként a magasabb **0,2661725 USD OpenAI és 0,038370 USD Claude** értékkel számol. Scenario-nként külön 0,0044525 USD sablon-review-t is hozzáad: ez tudatosan konzervatív, mert az élet mintaköltsége már tartalmazott egy sablon-review-t. Nem vonunk le még nem mért tömegesítési vagy cache-megtakarítást.

| Kínálat | Mért alapból számolt OpenAI | Claude: minden élet auditálva | Összesen | Javasolt külön plafon, javítási tartalékkal |
| --- | ---: | ---: | ---: | --- |
| 50 élet / 20 Scenario / 150 fejezet | 13,40 USD | 1,92 USD | 15,32 USD | 25 USD OpenAI + 5 USD Claude = **30 USD** |
| 75 élet / 25 Scenario / 225 fejezet | 20,07 USD | 2,88 USD | 22,96 USD | 35 USD OpenAI + 5 USD Claude = **40 USD** |
| 100 élet / 30 Scenario / 300 fejezet | 26,75 USD | 3,84 USD | 30,59 USD | 45 USD OpenAI + 10 USD Claude = **55 USD** |

**Javaslat: egyszeri 40 USD előállítási plafon a 75 élet / 25 Scenario kínálathoz, 35 USD OpenAI és 5 USD Claude megosztásban.** A plafon nem kötelezően elköltendő összeg. Hosszabb kontextus, elutasított történet, ismert javítás és ismeretlen válasz növelheti a költséget; a tartalék ezt fedezi. Ha a keret elfogy a minőségi darabszám előtt, a generálás megáll és új döntés szükséges. A minőségi kapu nem csökkenthető a kerethez igazítva. Az összeg API-költség, nem VPS-/domain-költség vagy adóval növelt szolgáltatói feltöltési végösszeg.

A modellek változatlanok: történet/kánon/kiadási review **gpt-6.1-sol**, független audit **claude-sonnet-5-5**. A rövid kontextusú Standard alapár mindkét modellnél 2 USD bemenet és 10 USD kimenet egymillió tokenenként; a cache-írást is fedező költségőr konzervatívabb. Ellenőrizve 2026-10-07: [OpenAI hivatalos árlista](https://developers.openai.com/api/docs/pricing), [Claude Sonnet 5.5 hivatalos árak](https://platform.claude.com/docs/en/models/sonnet-5-5/overview). Batch és olcsóbb modell későbbi, külön bizonyított optimalizálás lehet; a becslés ezek kedvezményét nem előlegezi meg.

## Elkülönítés és folytatható előállítás

Az egyszeri előállítási keret **külön** számít a korábbi 5–5 USD fejlesztési kerettől és a már jóváhagyott [első 30 nap 10 USD OpenAI + 5 USD Claude használati keretétől](AI_PRODUCTION_BUDGET_HU.md). Egyik keretből sem költünk automatikusan a másik nevében. Az új előállítási keret jóváhagyása még függőben van; a becslés elkészítése nulla új fizetett hívással történt.

Indítás előtt külön védett költségnapló, szolgáltatónkénti foglalás és összesített plafon szükséges. A munkalista témánként/életenként rögzíti a készültséget, a döntési irányt, a mentett AI-bizonylatokat és review/curation/grant/kiadás állapotát. A folytatás a mentett állapotból történik; kész fejezetet nem generál újra, bizonytalan hívást nem ismétel automatikusan. A hibás vagy elutasított példány megmarad auditként, de nem számít a kész kínálatba. A teljes kész darabszám és az olvasói/fork/személyre szabási ellenőrzés után nyitható meg a nyilvános indulás.

## Üzemeltető és további kapuk

A felhasználó az üzemeltető nevét **Müller Ákos** néven adta meg. A kapcsolattartási e-mail még hiányzik; kértük, értéket nem találunk ki. Az éles adatkezelési tájékoztató lezárása, email/Auth/backup/restore/Contabo/DNS/TLS és a [fejlesztési terv többi kiadási kapuja](NEXT_STEPS.md) továbbra szükséges. A kínálati döntés nem indítja el az éles alkalmazást vagy a 30 napos használati időszakot.
