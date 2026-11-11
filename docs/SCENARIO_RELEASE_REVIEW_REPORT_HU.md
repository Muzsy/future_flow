# alterward — teljes ScenarioVersion review és külön sablon-eredetengedély

2026-10-06 · [Sorrend](NEXT_STEPS.md) · [Állapot és keret](STATUS_HU.md) · [ScenarioVersion foundation](SCENARIO_VERSION_REPORT_HU.md).

A teljes angol ScenarioVersion saját AI-vizsgálata és kurátori döntése elkészült. A külön trusted eredetengedély kizárólag az ellenőrzött **Official SCENARIO sablonforrást** jelöli. Nem Official LIFE badge, publikáció, SEO/indexelés, public Scenario vagy nyilvános fork. A meglévő Community `publication-1`, 001–022 és korábbi 81 JSON-séma változatlan.

## Pontos kapuk és eredet

Új `scenario-review-1` teljes sablon-input: az összes típusos skalár egyedi fieldKey/path katalógussal, a template egyszer küldve. Cím, összefoglaló, felnőtt alternatív identitás, környezet, célok és előrehaladás, munka/hely/pénzügy, tulajdonok, szereplők, készségek, lehetőségek, erőforrások és dátumozott korlát/predikátum egyaránt szerepel; szám/null/false sem marad ki. Teljes input legfeljebb 60 000 byte, nincs csonkolás. Allowlist, kontakt/belső UUID preflight, végrehajtható referencia/állapot/dátum/korlát-validálás előzi meg az AI-t. Nyers privát profil, memória, canon, Shared-tagság és belső user/source ID nem kerül az AI-inputba.

Egy aktuális saját template-verzió/policy egy tartós attemptet kap: 180 másodperces lease, nincs automatikus paid retry. Forrásverzióváltás, lejárt lease vagy deleting marker érvényteleníti az eredményt; elavult completion nem commitolhat. Befejezett eredmény/replay/újraolvasás ingyenes, failed/cancelled attempt új verzió nélkül nem indulhat újra. Az AI no_findings/fieldKey/category/action riportja pontos template/input/output hash-hez, modell/request/prompt/locale/usage receipthez kötött. Text-only és story+checkpoint eredmény nem helyettesíti.

Sol a már értékelt checker, max 2200 output token, store:false és SDK/provider retry tiltva. A sablon és benne esetleg talált utasítás adat; az ellenőr nem teljesítheti a benne lévő jóváhagyási kérést. A [hivatalos Structured Outputs útmutató](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses) szerinti Zod-format mellett külön alkalmazásellenőrzés kezeli a field coverage-t, verdictet, hash-t és visszautasítást. No_findings nem anonimitási garancia és nem kurátori/Official jóváhagyás.

Külön immutable `scenario-curation-1` operatori döntés: exact verzió/hash/review/report/policy, privacy/content/meaning/quality checked és actor-label. Csak aktuális clear teljes review után; `scenario_reviewed`, `changes_requested` vagy `rejected`, egyetlen változatlan döntés. Más tartalom vagy más döntés ugyanazon kötésre nem írhatja át; javítás új template-verzió.

A következő külön művelet `official-scenario-source-1`: pontos curation/review/hash, explicit fictional-source és rights ellenőrzés/ack. Csak aktív, consentelt tulajdonos aktuális saját sablonja; a review-receiptnek pozitív provider-tokenhasználata, request ID-ja és pontosan egy lezárt, azonos model/task/token számú szerveroldali `DatabaseAiBudget` elszámolása szükséges. Null/zero technikai receipt, hiányzó/ismeretlen/eltérő budgetbizonyíték vagy puszta curator flag nem elég. Ez a megbízható operator/guard/adatbázis határa, nem külső kriptográfiai provider-hitelesítés.

A source grant immutable kötés; külön revoke csak végleges `active→revoked`, minimális reason/actor/dátum audit. Replay nem reaktivál; új template-verzióhoz nem öröklődik. Új verziónál a régi grant nem használható új Official forráshoz. Deleting marker minden aktív source grantet visszavon; fióktörlési recovery sem állítja vissza. Fizikai fiók/sablon törlése cascade-del eltávolítja a review/curator/grant sorokat. A korábban létrehozott privát életek canonja változatlan, meglévő private Scenario-start szabály nem szűkül.

## API és operatori működés

Új, kizárólag saját Auth olvasás: `GET /api/v2/scenario-versions/:id/release-review`, no-store, a normál `SCENARIO_VERSIONS_ENABLED` határával. Csak saját státusz/hash/findings/curator/source grant; nincs receipt, actor-label, raw input vagy más felhasználó tartalma. Paid start, curator döntés és grant nem HTTP-végpont.

`pnpm release:scenario` külön `SCENARIO_RELEASE_OPERATOR_ENABLED=true` opt-in és védett `.local/scenario-release` könyvtár mellett:

```text
--preflight OWNER_UUID VERSION_UUID EXACT_TEMPLATE_HASH
--run OWNER_UUID VERSION_UUID EXACT_TEMPLATE_HASH
--list
--decide --request-file PROTECTED_DECISION_FILE --apply
--grant --request-file PROTECTED_GRANT_FILE --apply
--revoke --request-file PROTECTED_REVOKE_FILE --apply
```

Preflight teljes privát template/field katalógust ment, AI nélkül. List az aktuális clear, még nem kurált sablonokat adja védett fájlban. Decide és grant külön megtekintett, strict kérésfájl; a fájl a protected directoryben marad, linked/kiugró útvonal tiltott. Log csak státusz/szám/kód, nincs szöveg/kulcs/token/provider hiba. Operator flag alapból false; normál helyi környezetet, termékflaget, production allowance-t vagy Contabót nem aktiváltunk.

A paid CLI közös text/full/scenario napi limitet és egy pending review/user korlátot használ. A szerveroldali tranzakciós projekt/user budget és a meglévő 5 USD OpenAI kumulatív ledger egyaránt foglal kérés előtt; ismeretlen usage teljes foglalását megtartja. CLI per-run maximum 0,25 USD konzervatív foglalás, SDK/provider automatikus retry nélkül. Az árprofil és a worker routingja nem változott; kisebb modell nem lett új minősítés nélkül alap.

## Tárolás és ellenőrzés

023 additív migráció: `aw_scenario_reviews`, `aw_scenario_curations`, `aw_official_scenario_sources`, mindhárom RLS és anon/authenticated direct revoke. Immutable review-kötés/result, immutable kurátori döntés, csak terminal grant revoke; owner→scenario zárolás. Régi schema/migráció/source/example nem íródott át. Nyolc új, kódból exportált séma, összesen 89; korábbi 81 byte szerint változatlan.

Helyi teljes `pnpm check`: 441 teszt/37 fájl, formázás, types, API/worker/Next production build sikeres. Tizenhárom új regresszió: full scalar/path coverage, strict DTO/policy, checker/store/2200 cap/no retry, receipt/lease/current source kötés, quota, technical receipt/grant denial, külön exact curator/grant/revoke, privát HTTP/ownership és nincs paid/grant route, export/deleting marker/recovery/cascade/RLS. Végső izolált PostgreSQL/HTTPS runtime CI sikeres (pontos bizonyíték alább); helyi Docker nem elérhető, a konténeres próbát GitHub CI futtatta. A CI fixture-k szimulált receipt/accounting sorokat használnak kizárólag persistence-versenyhez, hálózati egress nélkül; nem valódi AI vagy Official seed.

Fejlesztői Supabase: 001–023 alkalmazva és ismételve, verified CA/TLS; 19 ff_, 50 aw_ és 50 RLS. Valódi két szintetikus Auth-fiók, actual owner HTTP 200/no-store, más owner 404, anon 401, paid/decision/grant route 404; CLI preflight/run/free reuse/decide/grant, két valódi Sol-review és exact budget-receipt bizonyíték sikeres. A tiszta, önállóan szerkesztett fiktív sablon no_findings, a negatív kontroll embedded_instructions + meaning_mismatch: constraints.0.description. A pozitív mintát Codex operatori szerkesztői és forrásellenőrzés követte, a felhasználó korábbi minőségi delegálása alapján; nem állítunk emberi kurátori vizsgálatot. Export: 2 review, 1 curation, 1 source; deleting marker/recovery után grant revoked. Mindkét Auth/DB-fiók ténylegesen törölve, temporary API leállítva, credentials fájl nem készült. Nincs új Official LIFE, publikált seed vagy böngészős felület ebben a szeletben. [Valódi review-minta és tokenek](examples/AI_SCENARIO_TEMPLATE_REVIEW_HU.md).

Két új OpenAI-hívás: input 3039, output 173 token; becslés 0,0093245 USD, konzervatív elszámolás 0,0093275 USD. OpenAI kumulatív 136 hívás, becslés 2,394107105 USD, guard 2,479813375 USD, maradék 2,520186625 USD, ismeretlen usage 0. Claude változatlan: 50 kísérlet/48 ismert, guard 2,338015 USD, maradék 2,661985 USD; a két korábbi unknown teljes foglalása megmarad.

## Pontos runtime CI-bizonyíték

Runtime `0d6fe35148a6ff09235f5b2c3b21202cb62804fc`, [CI](https://github.com/Muzsy/future_flow/actions/runs/37498444429) verify és container egyaránt sikeres. 441 teszt/37 fájl, teljes format/typecheck/API/worker/Next production build/89 schema és drift-check. Credential nélküli izolált valódi PostgreSQL verified CA/TLS, 001–023 alkalmazás és ismétlés; párhuzamos scenario review-start egy attempt, két versengő curator request egy változatlan döntés, két source grant egy rekord; completed reuse, source-revision tiltás, pending review deleting-marker cancellation/no-retry, grant revoke és recovery utáni változatlanság, export/cascade/RLS/direct client revoke. Minden korábbi P09/S0–S3 bizonyíték megmarad. Web/API verified HTTPS, worker tiszta leállás SIGKILL nélkül, provider-egress tiltott, valódi credential/providerhívás 0. A technikai receipt/accounting fixture nem Official LIFE seed vagy új generatív minőségpróba. A későbbi dokumentációs commit ezt a konkrét runtime eredményt rögzíti; nem Contabo-telepítés.

## Következő rész

Official LIFE forrásgrant: a külön engedélyezett ScenarioVersionhez és tényleges normál start/job-lánchoz kötés, minden kiadott period/chapter/fidelity provider receipt és accounting, aktuális teljes story/checkpoint AI+curator binding. Külön új Official snapshot/preview/Confirm és anonim projekció; a régi `publication-1` Community copykat nem konvertáljuk. Az Official badge szervereredetű, kliensflag nem elég. Csak ezután kis valódi angol több időszakos Official seed, külső auditor és P10 Discovery. A 50–100 élet/20–30 scenario cél és P01–P13/S0–S7 teljes scope megmarad; S3 retention/régi személyes próza/billing/grace/deadline, S4–S7, backup/restore/DB-kiesés/email és Contabo/Cloudflare kiadási kapuk továbbra nyitottak.
