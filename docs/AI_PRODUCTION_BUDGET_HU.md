# alterward — jóváhagyott közös zárt béta AI-költségkeret

2026-10-07 · Jóváhagyott felhasználói döntés · Az éles alkalmazás még nem fut

A legfrissebb felhasználói döntés **10 USD teljes induló keret: 8 USD OpenAI + 2 USD Claude**. Ebből 15 angol Official Life, öt Scenario és legfeljebb 10 fős zárt béta készül. A teljes 50–100 élet/20–30 Scenario kínálat későbbi bővítés; teljes nyilvános indulás külön lépés. Ez **helyettesíti** a korábban jóváhagyott 10 USD OpenAI + 5 USD Claude használati keretet; nem összeadjuk vele. A 35 + 5 USD külön előállítási javaslatot nem fogadta el a felhasználó.

| Rész | OpenAI | Claude | Összesen |
| --- | ---: | ---: | ---: |
| Előállítás: 15 élet, 5 Scenario, minden élet külön auditja | 6 USD | 1 USD | 7 USD |
| Teszthasználatra előre fenntartva, legfeljebb 10 fő | 2 USD | 1 USD | 3 USD |
| Jóváhagyott teljes plafon | **8 USD** | **2 USD** | **10 USD** |

A tesztkeret nem költhető seedre. A teszthasználati **0,50 USD felhasználói plafon közös a két szolgáltató között**, a szigorúbb szolgáltatói/projektplafon előbb megállíthatja a generálást. A tervezési cél tesztelőnként három új fejezet, nem korlátlan használat vagy garantált darabszám. A használati 30 nap a tényleges zárt béta induláskor kezdődik; az előállítás külön védett költségszakasz. Nincs automatikus megújítás/feltöltés vagy részek közötti átcsoportosítás. Kifogyáskor új fizetett hívás nem indul, a már mentett történet olvasható marad.

Ez költési plafon, nem havi előfizetési díj és nem szolgáltatói egyenleglekérdezés. A VPS, domain és más infrastruktúra költsége külön számít. A két korábbi, összesített **5–5 USD fejlesztési keret változatlan**, naplójuk megmarad. A fejlesztési maradék nem kerül át az éles keretbe, és az új éles keret nem finanszíroz további helyi kutatási próbákat.

## A méretezés alapja

A legutóbbi [három valódi angol public-fork fejezet](examples/AI_PUBLIC_FORK_ENGLISH_SAMPLE.md) kilenc OpenAI-hívása 0,1814238 USD tokenbecslés és 0,1934325 USD konzervatív elszámolás volt. A külön [Claude-audit](examples/AI_PUBLIC_FORK_CLAUDE_AUDIT_HU.md) 0,031204 USD becslés és 0,038370 USD konzervatív elszámolás. Más profil, hosszabb memória, javítás, privacy-review és ismeretlen válasz növelheti a költséget.

| Példa a mért OpenAI-lánccal | Becsült történetköltség |
| --- | ---: |
| 10 tesztelő, fejenként három új fejezet | kb. 1,81 USD OpenAI tokenbecslés |
| Ugyanez konzervatív OpenAI-elszámolással | kb. 1,93 USD |
| Mind a tíz teljes háromrészes lánc Claude-auditja, konzervatívan | kb. 0,38 USD |

Ezek tervezési példák, nem garantált darabszámok. A 2 USD OpenAI használati rész a mért háromrészes lánccal közel tíz tesztelőre elegendő, de javítás/hosszabb kontextus csökkentheti a számot. A Claude 1 USD használati rész a külső auditokra van fenntartva; a normál generálás saját kánonellenőrzője továbbra OpenAI. A [seed és teljes induló becslés](INITIAL_CATALOG_COST_ESTIMATE_HU.md) külön tartalmazza a 15 élet/öt Scenario előállítását. A 50–100 élet/20–30 Scenario cél későbbi bővítésként marad.

A használt rövid kontextusú Standard modellek árait 2026-10-07-én ellenőriztük: [OpenAI hivatalos árlista](https://developers.openai.com/api/docs/pricing), [Claude Sonnet 5.5 hivatalos árak](https://platform.claude.com/docs/en/models/sonnet-5-5/overview). A jelenlegi alap továbbra Sol, a külső auditor Sonnet 5.5; ez a döntés nem jelent automatikus modellcserét. A költségőr cache-write-ot is fedező, konzervatív bemeneti árral foglal. A Claude-kliens Standard/global és legfeljebb ötperces cache-írás mellett működik; egyórás cache-usage esetén megtartja a teljes ismeretlen foglalást.

## Alkalmazásban kikényszerített időszak

A védett éles konfigurációban a tényleges indulás UTC-időpontját és az attól számított 30 napos, kizáró záróidőpontot kell rögzíteni:

```dotenv
CLOSED_BETA_ENABLED=true
CLOSED_BETA_USER_IDS=<up to 10 distinct verified Auth UUIDs, comma-separated>
AI_PROJECT_BUDGET_USD=2
CLAUDE_PRODUCTION_BUDGET_USD=1
AI_USER_BUDGET_USD=0.50
AI_PROJECT_INITIAL_SPENT_USD=0
AI_BUDGET_WINDOW_REQUIRED=true
AI_BUDGET_WINDOW_START=<actual launch in YYYY-MM-DDTHH:mm:ssZ>
AI_BUDGET_WINDOW_END=<launch plus 30 days in YYYY-MM-DDTHH:mm:ssZ>
AI_EXPERIMENT_LEDGER_PATH=
```

A fenti dátumhelyőrzők nem használható értékek. A telepítési mintafájlban minden keret továbbra nulla és a dátumok üresek, mert a jóváhagyás nem jelent mostani éles aktiválást. A helyi `.env` kutatási konfigurációját nem emeljük meg. Az API és worker költségkonfigurációját ugyanazzal az elfogadott éles időszakkal kell telepíteni; a worker induláskor validálja, az auditfolyamat ugyanezt a két dátumot használja.

A tranzakciós adatbázis-őr külön időszakos OpenAI- és Anthropic-projektszámlát, ugyanakkor közös időszakos személyes számlát használ. Minden hívás előre lefoglalja a teljes bemeneti és maximális kimeneti plafont. Másik modell vagy másik szolgáltató nevében nem használható fel a keret. A projekt- vagy személyes plafon feletti foglalás providerhívás előtt megáll. Ismeretlen usage megtartja a foglalást; később ismertté vált válasz az eredeti időszak számlájára számolható el, egyszer.

A kezdőidőpont megengedett, a záróidőpont már nem. Az adatbázis `clock_timestamp()` óráját a projektszámla és felhasználói számla zárolása után ellenőrizzük: a lockra várakozó kérés sem foglalhat a lejárat után. Lejárt vagy még el nem kezdődött időszak nem hoz létre következő havi keretet. A már lefoglalt hívás elszámolása lejárat után is megengedett; a mentett történet olvasható marad.

Az új konfiguráció nem emeli meg a korábban eltárolt pozitív limiteket. Az alacsonyabb konfiguráció további foglalásnál szigorúbb korlátként érvényesül; nulla esetén az adott szolgáltató leáll. A tényleges működő worker konfigurációjának változtatásához újraindítás szükséges. Fióktörlés eltávolítja a személyes rekordokat, de a projektből már elköltött vagy lefoglalt összeg megmarad. Export és közvetlen kliensjogok változatlanul saját/private/RLS szerint működnek.

## Ellenőrzés és kiadási határ

A lejárati és szolgáltatói védelem 13 célzott adatbázis-/konfiguráció-/kliensintegrációs teszttel ellenőrzött, fizetett hívás nélkül. Külön izolált PostgreSQL-proof készült a végső projekt- és személyes foglalás versenyére, a két szolgáltató közös személyes keretére, a tényleges lock-várakozás alatti lejáratra, a késői elszámolásra, a törlésre/export/RLS-re. A 05e6014 pontos [CI-je](https://github.com/Muzsy/future_flow/actions/runs/37642982869) verify és container sikeres: 578/52/144, mind a nyolc új valós PostgreSQL budget-window proof, 001–034/repeat, korábbi bizonyítékok és verified HTTPS/DB TLS, új paid AI 0. Az éles keret nincs aktiválva.

Az OpenAI worker időszakos kerete implementált. A meglévő Claude-kliens a provider-specifikus adatbázis-őrrel is integrálható és technikai transporttal ellenőrzött; az éles mintavételi auditor indítását külön védett operator-folyamatba kell bekötni. Nem tettünk Anthropic-kulcsot a webbe vagy a normál workerbe, nem indult éles Claude-hívás és nincs automatikus fizetett retry. Az indulási pillanat, szolgáltatói fedezet, éles operator-konfiguráció és auditmintavételi folyamat a telepítéskor ellenőrizendő.

Az élesítés többi kapuja és a P01–P13/S0–S7 teljes terv megmarad: [következő lépések](NEXT_STEPS.md), [Contabo-telepítés](DEPLOYMENT_HU.md), [angol kiadás](ENGLISH_RELEASE_PLAN_HU.md).


## Korábbi, később felülírt 2026-10-07-i kínálati kérés

A felhasználó a teljes 50–100 élet/20–30 Scenario kínálatot az éles indulás elé helyezte. A korábbi kisebb béta lehetősége fejlesztési/pilot fázis; éles indulási engedélyként már nem alkalmazható. A [külön előállítási becslés](INITIAL_CATALOG_COST_ESTIMATE_HU.md) javaslata 75 élet/25 Scenario és egyszeri 35 + 5 USD; új keret nincs jóváhagyva vagy aktiválva. A 10 + 5 USD első 30 napos használati keret változatlan. Üzemeltető Müller Ákos, email még függőben.


## Legfrissebb döntés az előző szakasz helyett

10 USD közös keret (8 OpenAI + 2 Claude), 15 élet/5 Scenario, 10 fős zárt béta; teljes kínálat később. A fenti korábbi 35 + 5 USD javaslat és 10 + 5 USD használati keret nem aktuális engedély. Seed/audit maximum 6 + 1 USD, teszthasználat 2 + 1 USD; a tízfős API/worker admission és a tesztkeret konfigurációs védelme implementált; külön seed ledgers/window/guard még elkészítendő. Runtime nem aktivált. A fennmaradó email/ops/retention/Contabo kapuk megmaradnak.


## Tízfős meghívási és konfigurációs védelem

Bekapcsolt béta mellett legfeljebb tíz különböző, szerveroldali Auth UUID engedélyezett; a provider-foglalás is újra ellenőrzi. Hibás lista, 2 USD feletti OpenAI vagy 1 USD feletti Claude tesztplafon, 0,50 USD feletti közös user limit és hiányzó/nem pontosan 30 napos ablak elutasított. Az anonim oldalak teljes zárása külön telepítési feladat. Hat új érdemi próba és teljes 624/57/162 check sikeres, új saját CI még ellenőrizendő. [Részletek](CLOSED_BETA_ADMISSION_REPORT_HU.md).
