# alterward — az első éles AI-költségkeret

2026-10-07 · Jóváhagyott felhasználói döntés · Az éles alkalmazás még nem fut

A felhasználó az első 30 napra **10 USD OpenAI és 5 USD Claude**, összesen **15 USD éles AI-keretet** engedélyezett. A javasolt **0,50 USD felhasználói plafon közös a két szolgáltató között**. A 30 nap a tényleges éles induláskor kezdődik. Nincs automatikus megújítás vagy feltöltés; új időszak és új keret külön döntés.

Ez költési plafon, nem havi előfizetési díj és nem szolgáltatói egyenleglekérdezés. A VPS, domain és más infrastruktúra költsége külön számít. A két korábbi, összesített **5–5 USD fejlesztési keret változatlan**, naplójuk megmarad. A fejlesztési maradék nem kerül át az éles keretbe, és az új éles keret nem finanszíroz további helyi kutatási próbákat.

## A méretezés alapja

A legutóbbi [három valódi angol public-fork fejezet](examples/AI_PUBLIC_FORK_ENGLISH_SAMPLE.md) kilenc OpenAI-hívása 0,1814238 USD tokenbecslés és 0,1934325 USD konzervatív elszámolás volt. A külön [Claude-audit](examples/AI_PUBLIC_FORK_CLAUDE_AUDIT_HU.md) 0,031204 USD becslés és 0,038370 USD konzervatív elszámolás. Más profil, hosszabb memória, javítás, privacy-review és ismeretlen válasz növelheti a költséget.

| Példa a mért OpenAI-lánccal | Becsült történetköltség |
| --- | ---: |
| 20 felhasználó, fejenként három fejezet | kb. 3,63 USD |
| 30 felhasználó, fejenként három fejezet | kb. 5,44 USD |
| 50 felhasználó, fejenként három fejezet | kb. 9,07 USD |

Ezek tervezési példák, nem garantált generálási darabszámok. A 10 USD OpenAI-kerethez az első, 20–30 fős használati kör ésszerű tartalékot hagy. Az 50–100 Official Life és 20–30 Scenario eredeti tartalmi cél ettől nem szűnik meg; annak teljes előállítása és az induló kínálat külön tervezési tétel. A Claude-keret mintavételes külső auditot szolgál; a normál generálás saját kánonellenőrzője továbbra OpenAI.

A használt rövid kontextusú Standard modellek árait 2026-10-07-én ellenőriztük: [OpenAI hivatalos árlista](https://developers.openai.com/api/docs/pricing), [Claude Sonnet 5.5 hivatalos árak](https://platform.claude.com/docs/en/models/sonnet-5-5/overview). A jelenlegi alap továbbra Sol, a külső auditor Sonnet 5.5; ez a döntés nem jelent automatikus modellcserét. A költségőr cache-write-ot is fedező, konzervatív bemeneti árral foglal. A Claude-kliens Standard/global és legfeljebb ötperces cache-írás mellett működik; egyórás cache-usage esetén megtartja a teljes ismeretlen foglalást.

## Alkalmazásban kikényszerített időszak

A védett éles konfigurációban a tényleges indulás UTC-időpontját és az attól számított 30 napos, kizáró záróidőpontot kell rögzíteni:

```dotenv
AI_PROJECT_BUDGET_USD=10
CLAUDE_PRODUCTION_BUDGET_USD=5
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

A lejárati és szolgáltatói védelem 13 célzott adatbázis-/konfiguráció-/kliensintegrációs teszttel ellenőrzött, fizetett hívás nélkül. Külön izolált PostgreSQL-proof készült a végső projekt- és személyes foglalás versenyére, a két szolgáltató közös személyes keretére, a tényleges lock-várakozás alatti lejáratra, a késői elszámolásra, a törlésre/export/RLS-re. A pontos új runtime CI eredménye még ellenőrzendő.

Az OpenAI worker időszakos kerete implementált. A meglévő Claude-kliens a provider-specifikus adatbázis-őrrel is integrálható és technikai transporttal ellenőrzött; az éles mintavételi auditor indítását külön védett operator-folyamatba kell bekötni. Nem tettünk Anthropic-kulcsot a webbe vagy a normál workerbe, nem indult éles Claude-hívás és nincs automatikus fizetett retry. Az indulási pillanat, szolgáltatói fedezet, éles operator-konfiguráció és auditmintavételi folyamat a telepítéskor ellenőrizendő.

Az élesítés többi kapuja és a P01–P13/S0–S7 teljes terv megmarad: [következő lépések](NEXT_STEPS.md), [Contabo-telepítés](DEPLOYMENT_HU.md), [angol kiadás](ENGLISH_RELEASE_PLAN_HU.md).
