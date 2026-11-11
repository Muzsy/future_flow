# alterward — Scenario személyre szabás: privát összeállítási alap

2026-10-07 · P12 részeredmény · A nyilvános személyre szabási funkció még nincs megnyitva

A Scenario és a felhasználó saját, jóváhagyott profilja már összeállítható egy új angol, privát élet teljes kezdőállapotává. Ez könyvtári alap: új nyilvános Scenario-olvasó, jogosultság, API, mentett előnézet vagy felületi indítás még nincs hozzá. A meglévő saját ScenarioVersion-indítás és public-fork változatlanul működik. A valódi AI-generálást továbbra a normál élet-job és költségőr végzi.

## Mit tartalmaz az előnézet?

A külön `scenario-personalization-1` szerződés teljes, UUID nélküli saját identitást, célokat, induló állapotot, tulajdont, kapcsolatokat, lehetőségeket és korlátokat fogad. Nem olvas automatikusan profilt vagy másik életet, nem fogad privát előzményt, profile-version ID-t, Shared-memóriát, kiadási flaget vagy forrásjogot. Az adatokat később a tulajdonosi API-n kell saját, explicit hozzájárulással előkészíteni; a mostani tiszta függvény önmagában nem jogosultsági ellenőrzés.

Az összeállítás szabálya, amelyet a felületi előnézetnek pontosan meg kell mutatnia:

- A saját identitás, dátum, ország, munka, pénz, tulajdon, szereplők, készségek, lehetőségek és erőforrások helyettesítik a mintaszereplő teljes induló állapotát.
- A saját jóváhagyott elsődleges cél marad az elsődleges cél. Legfeljebb négy saját cél mellé a Scenario elsődleges témacélja új, másodlagos célként kerül. A többi Scenario-cél nem öröklődik.
- A Scenario korlátai nem változnak észrevétlenül személyes kötelezettséggé. Az új élet kizárólag a teljes saját, jóváhagyott korlátlistát kapja; a forrásból kihagyott korlátok és objektumok száma az előnézet része.
- A Scenario semleges környezeti leírása és az opcionális saját kontextus együtt látható. Túl hosszú szöveget visszautasítunk, nem vágunk le a jóváhagyott tartalomból. A nyilvános Scenario kiadásakor külön ellenőrizendő, hogy a leírás személyre szabható témát tartalmazzon, ne a mintaszereplő rejtett tényállításait.

Az új élet mindig privát, `baseProfileVersionId=null`; nincs automatikus Official LIFE-jog, publikálás vagy Shared-tagság. Saját asset/actor/goal/constraint referenciák új belső azonosítókat kapnak. A példaszereplő stúdiója, pénze vagy kapcsolatai nem jelentenek személyes tulajdont.

## Jóváhagyás és érvényesség

A szerveroldali összeállításra szánt függvény a teljes forrást és profilt külön hash-sel, a teljes előnézetet közös `previewHash`-sel köti. A materializáláskor ismét az eredeti forrásból és az aktuális saját adatokból számoljuk az előnézetet; kliens által visszaküldött ténygráfot nem fogadunk el. Kötelező az `acknowledged=true` és az azonos előnézethash. Módosított forrásszöveg, saját pénz, kontextus vagy korlát új előnézetet és jóváhagyást kíván.

Ugyanaz a domain-ellenőrzés vizsgálja a saját tényeket, hivatkozásokat, időpontokat és hard constraintet, mint a normál privát életeknél. Hibás vagy ütköző korlátot nem törlünk automatikusan. A személyes nevek és kontextus privát adatok maradnak; ezeket nem a public-PII szűrőn próbáljuk átengedni. A nyilvános forrássablon teljes privacy preflightja továbbra kötelező.

## Ellenőrzés

Kilenc célzott teszt ellenőrzi a teljes adatcserét, saját cél elsőbbségét, forrástéma megtartását, determinisztikus kötést, tiltott mezőket, privát/public adatkezelési különbséget, friss referenciákat, érvénytelen vagy jövőbeli korlátokat és méretkorlátot. Egy további integrációs próba három normál technikai időszakon át őrzi a saját állapotot és korlátokat, ellenőrzi a forrás változatlanságát, az Official-provenance hiányát, exportot és törlést. A technikai AI teszthelyettesítő nem valódi történet vagy minőségi bizonyíték.

Négy új JSON-séma külön könyvtárba kerül; a korábbi 144 séma és 001–034 migráció változatlan. Nincs új feature-aktiválás, éles allowance vagy fizetett providerhívás. A teljes helyi ellenőrzés és az új commit pontos CI-je az alábbi lezárási bejegyzésben követhető.

## Következő P12 szeletek

1. Külön, explicit kiadott és visszavonható public Scenario snapshot, jelenlegi review/curator/provider-bizonyíték és forrásengedély ellenőrzésével. A Scenario source grant önmagában nem publikálás vagy személyre szabási consent.
2. Saját fiókhoz kötött, lejáró és immutable személyes előnézet; profil- és forrásmódosítás, withdrawal/revoke/moderáció/törlés ellenőrzése. Privát profilt vagy előnézetet anonim olvasó nem kaphat.
3. A teljes megtekintett előnézet megerősítéséből idempotens saját élet/egy normál AI-job. Tulajdonosi sorrendelt lockok, kvóta/budget, törölt kérés tombstone és leválasztható public attribution; nem öröklődhet Official LIFE-jog.
4. Angol Scenario-olvasó és „Try this with your own life” útvonal: login, adult/privacy és külön AI-hozzájárulás, szerkeszthető saját adatok, teljes változáselőnézet, explicit indítás. Három valódi AI-időszak és auditor csak a megmaradó kutatási keretből és új kísérleti bizonyíték szükségessége esetén.
5. P13 külön kattintás/létrehozás/első sikeres időszak, referral és kiadási folyamatpróbák. A teljes eredeti 50–100 élet/20–30 Scenario cél, P11/Shared/retention és üzemeltetés megmarad.

## Lezárt költségkapu

A jóváhagyott első éles 30 nap **10 USD OpenAI + 5 USD Claude**, közös felhasználói **0,50 USD**; az induláskor kezdődik, nincs automatikus megújítás. Az ehhez tartozó `05e6014` [pontos CI](https://github.com/Muzsy/future_flow/actions/runs/37642982869) verify és container sikeres: 578 teszt/52 fájl, build, 144 változatlan séma, 001–034 és repeat, mind a nyolc új valós PostgreSQL költségablak-próba, korábbi bizonyítékok, verified HTTPS/DB TLS és fizetett hívás 0. Ez nem éles aktiválás vagy Contabo-telepítés.

[Keret részletei](AI_PRODUCTION_BUDGET_HU.md) · [Teljes következő lépések](NEXT_STEPS.md) · [P12 követelmény](PUBLIC_CONTENT_IMPLEMENTATION_PLAN_HU.md) · [Forráskövetés](REQUIREMENTS_TRACEABILITY_HU.md)


## 2026-10-07: foundation pontos CI és következő szelet

A 89a7cf54d1e149fe9873c1a894cf8fe87316a20e [pontos CI-je](https://github.com/Muzsy/future_flow/actions/runs/37663653592) verify/container sikeres: 588/53/148, 001–034/repeat, korábbi PG/HTTPS/TLS proofok és 0 paid AI. Az első következő P12 szelet, a [külön public Scenario snapshot/Confirm/consent/reader API](PUBLIC_SCENARIO_PUBLICATION_REPORT_HU.md) implementált; own tartós személyes preview/start/attribution és angol UI még következik. Ez nem Contabo-deploy vagy éles activation.
