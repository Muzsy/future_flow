---
status: canonical
owner: project
last_reviewed: 2026-10-24
related:
  - ROADMAP_HU.md
  - DEVELOPMENT_PLAN_HU.md
  - product/PRODUCT_HU.md
  - architecture/ARCHITECTURE_HU.md
---

# Alterward — aktuális projektállapot

Ez a dokumentum a fejlesztési főág állapotát és az utolsó igazolt operatív eredményt külön kezeli. A dokumentációfrissítés nem production deployment és nem friss élő health-ellenőrzés.

## Kiadási és bétaállapot

Az első személyes tesztelő reader-hozzáférése, első belépése és a 30 napos funded ablak kanonikus Linux-operátori aktiválása megtörtént. Az alkalmazott UTC ablak **2026-10-13T22:11:21Z–2026-11-12T22:11:21Z**, a projektmaximum 2 USD, a felhasználói maximum 0,50 USD. Nincs automatikus hosszabbítás vagy újraindított költségkeret.

Az utolsó igazolt böngészős E2E (2026-10-14) három valódi fejezetet, két folytatási ciklust, mentett választásokat, újranyitást, visszabelépést és friss hitelesítés utáni exportot ellenőrzött. A kilenc provider-task elszámolt összege 0,188585 USD; ez a béta adatbázis-elszámolása, nem szolgáltatói számla. A következő generálást a 3/UTC-nap, 1 párhuzamos kérés korlát megállította. A későbbi új-munkamenetes sikeres folytatás nem igazolt. A megtartott fiók destruktív törlése nem volt része a próbának.

A webhely továbbra zárt személyes béta; Shared és nyilvános/community launch nincs engedélyezve. A főág új narratív kódja még nem került productionbe: a default legacy/üres narrative cohort megmarad. A régi operátori kiadást dokumentációfrissítés vagy új fejlesztési commit nem cseréli le.

## Termékterületek

| Terület | Állapot | Következő határ |
|---|---|---|
| Private Personal Simulation | implementált és egy tesztelővel valódi E2E-ben ellenőrzött | irodalmi minőség, későbbi visszatérés és szélesebb pilot |
| Új személyes narratív pipeline | N00–N07 kész; N08/N09 nyitott | teljes paid/human benchmark és külön operátori rollout |
| Official Lives / Scenario | technikai alap és angol katalógus létezik | nem általános publikus launch-engedély |
| Community / Public | jelentős foundation kész, release-gated | privacy/moderation/cohort és explicit launch |
| Shared Context | foundation kész, első személyes körben OFF | owner downgrade kontroll és kétfős friend beta |
| Sponsored Guest | targeted friend részvétel implementált | host/participant és privacy feltételek megtartása |
| Előfizetés / billing | nincs kész fizetési rendszer | B01: provider, lifecycle és szerveres entitlement |
| Magyar termékkiadás | halasztott | angol UI és történet az induló scope |

## Történetminőség — aktuális fejlesztési jelölt, 2026-10-23

Három külön állapotot kell követni:

| Szint | Utolsó ellenőrzött állapot | Jelentése |
| --- | --- | --- |
| Távoli `main` | `a666c905ef953cc696d5d8a0faa4f9169ec01824`, v8 / qualityPolicy 2.7.0 | Beolvadt fejlesztési alap; nem production aktiválás. |
| V9 fejlesztési jelölt | [draft PR #66](https://github.com/Muzsy/future_flow/pull/66), C5; implementáció `7bd4d42`, a #65 fölött | Planner/author/reviewer/editor v9, fidelity v1, qualityPolicy 2.8.0; explicit opt-in. A függő PR-lánc még nincs a főágon. |
| Production | Utolsó igazolt állapot: legacy, üres narrative cohort, zárt személyes béta | Friss szerveres állapotfelmérés nem történt; a fejlesztési vagy CI-eredmény nem deployment-bizonyíték. |

A v9 lánc sorrendje: #57 → #58 → #59 → #60 → #61 → #63 → #64 → #65 → #66. A #62 tesztjavítás és a #56 Linux funded-runtime upgrade külön, `main` alapú ág. A #56 eddigi v1–v8 kompatibilitása önmagában nem igazolja a v9 target/recovery alkalmasságát. A pontos végrehajtás és elfogadási feltételek a [master planben](DEVELOPMENT_PLAN_HU.md#21-v9-következő-végrehajtási-lépései--2026-10-23) vannak.

### Mi készült el, és mire van bizonyíték?

A v9 contract, szereplőállapot-fold/projection, pipeline és determinisztikus karakter-audit implementált a draft láncban. A 0–5. offline szakasz korábbi köre 2026-10-21-én lezárult; C5 új review-/mérési feladatot nyitott. A későbbi C2–C4 körök a fidelity-first javítást, a v9 editort, az ismétléskezelést, a kérésméretet és a szűkített javítási módokat érintik. A v8 baseline befagyasztott; az új munkák nem írják át a régi policykat.

A C5 a kilenc editor-kiváltott javítás offline elemzésére épül. A kiváltók: négy rendszermechanikai próza, három ismétlődő oksági szerkezet, egy ismétlődő lezárás és egy elégtelen döntési tét. A planner/author/review/editor v9 utasításai ezek megelőzését és teljesebb első ellenőrzését célozzák. Fidelity-, schema-, minőségkapu-, hívás-, budget- vagy cohortváltozás nincs. [Részletes scope és kompatibilitás](plans/CREATIVE_FICTION_IMPLEMENTATION_HU.md#v9-első-változat-és-oksági-ismétlés--c5-2026-10-23).

A `7bd4d42` implementáció [Verify + Container CI-je](https://github.com/Muzsy/future_flow/actions/runs/39938341781) sikeres: 125 tesztfájl / 1446 teszt, valamint a repository ellenőrzései és a 19 ellenőrzéses closed-site HTTP próba. Ez az adott commit technikai ellenőrzése; a későbbi dokumentációs vagy egyesített forrást saját ellenőrzéshez kell kötni. A `75fdda0 → 7bd4d42` diff külön, csak olvasó ügynökkel végzett független statikus review-ja 2026-10-23-án APPROVE eredményű, actionable finding nélkül. A hat célzott tesztfájl újrafuttatása 92/92 PASS. A C5 utáni korlátozott Codex-smoke lezárt; eredménye lent, a hasznosság továbbra nem igazolt.

### Meglévő mérési bizonyíték és korlát

A C5 előtti S1–S4 Codex-diagnosztika 20 próbált fejezetből 20 elfogadottat és hét editoros javítást tartalmaz. A két fizetős v9-m futás négy fejezetpróbájából három elfogadott, kettő editoros javítással. A kilenc kiválasztott javításból nyolc végül átment, egy másik editor-dimenzióban elbukott. Codex-forrás: `55f1df3`; paid-forrás: `796f591`. A futások eltérő végrehajtásúak és kis mintájúak: nem összevonható általános sikerráta és nem kontrollált C5 előtti/utáni összehasonlítás.

A mentett szövegek, ítéletek és trace-ek offline elemzése elkészült; ez ügynöki olvasás, nem független emberi PASS. A C5 implementációjakor nem indult modellhívás; a később külön elindított smoke eredménye a következő bekezdésben szerepel. A kevesebb javítás, jobb irodalmi minőség, elfogadható egységköltség és késleltetés továbbra mérendő. A régi v6/v7/v8 eredmények a verziótervekben és a [mérési runbookban](operations/NARRATIVE_EVALUATION_HU.md) történeti bizonyítékok; korábbi ledger-maradék nem mai költési engedély vagy wallet-egyenleg.

### C5 utáni korlátozott próba — 2026-10-23

Azonos `career-transition` profil, seed és választásrotáció, három tervezett periódus, fork nélkül: kontroll `75fdda0` **3 elfogadott / 0 javítás / 15 hívás**; C5 `7bd4d42` **1 elfogadott / 1 javítás után elutasított / 1 nem indult / 14 hívás**. A jelölt második fejezetének eredeti oksági ismétlés-kifogása két ügynöki olvasat szerint vitatható; a teljes átírás után új döntésmagyarázó zárási probléma keletkezett. Az eredeti és javított csomag fidelity-valid; a végső kapu helyesen elutasított és nem adott második repairt. A sikertelen javítást is beleszámoltuk; az elfogadott sample-ekre szűkített `repairRate=0` nem a teljes jelöltfutás javítási aránya.

A kis, nem vak próba nem bizonyít C5-javulást vagy általános regressziót; a történetek már az első döntésnél szemantikailag eltérnek. Következő a mentett eset és a novelty-/zárási rubrika alkalmazásának célzott elemzése. Új generálás nem indult: záró kvóta 20% ötórás / 88% heti, az új sorozat ötórás indulási minimuma 30%. Nincs paid API-költés vagy USD-becslés. [Pontos források, trace-ek, korlátok és továbbhaladási döntés](operations/NARRATIVE_EVALUATION_HU.md#c5-független-review-és-első-korlátozott-próba--2026-10-23).

### Célzott folytatás — 2026-10-24

A mentett eredeti/javított eset statikus elemzése lezárt, egyszerűen hiányzó rubrika vagy history-réteg nem azonosítható. A feltételezett tévespozitív tisztázására három verziózott, szintetikus, rögzített bemenetű editor-eset készült: vitatott eredeti, korábban ismétlés miatt kifogásolt szerkezet és legitim visszatérés. A javításban létrejött closing-briefing offline referencia marad. A két forrás editorpromptjával, két ismétlésben 12/12 valid kvótás hívás lezárt (`f3eaf3c`): mindkét editor mindkét körben novelty=3/structure=false/revise ítéletet adott a vitatott és ismétléses esetre, novelty=4/structure=true/pass ítéletet a legitim visszatérésre. A főítélet stabil, más részdiagnózisok ingadoztak; a C5 visszajelzésében kevesebb biztosan félbeszakadt mező volt, általános hatás vagy tévespozitív nem igazolt. Induló/záró kvóta 66→47% ötórás, 80→77% heti; nincs újrafuttatás vagy paid hívás. A befagyasztott bemenetek, 12 nyers válasz, kvótanapló, hash-ek és független ügynöki olvasat a [#68 draft PR-ben](https://github.com/Muzsy/future_flow/pull/68) követhető. A korábban javasolt history-audit és új kontextuskontroll a későbbi bétafókusz-döntéssel DEFERRED. Új termékprompt, küszöb, 048/archetípus vagy production változtatás nincs. [Protokoll és értelmezési határok](operations/NARRATIVE_EVALUATION_HU.md#rögzített-bemenetű-c5-editorkalibráció--2026-10-24).

### Bétafókusz és motorlezárás — tulajdonosi döntés, 2026-10-24

Elsődleges cél a kis zárt béta kiadása. A v9 C5 motoralapot befagyasztjuk; az editor/história további finomítása, az archetípusok és új minőségkutatási körök DEFERRED. A mért elutasításokat és ingadozó részdiagnózisokat megőrizzük ismert korlátként. Nem követelünk igazolt általános C5-javulást vagy teljes irodalmi benchmarkot a zárt béta elé; a szerveres kapukat nem lazítjuk.

A `codex/v9-beta-integration` ág már egyesítette a v9/#69, #56 (`01b18b7`) és #62 (`8cc667e`) forrásokat, a docs-konfliktusok feloldva. A v9 capability, artifact/delta-ellenőrzés, explicit runtime-kiválasztás és generációt ellenőrző monitor fejlesztési implementációja elkészült; lokális 127 fájl / 1465 alkalmazásteszt és 99 Node ops PASS, Python 340 PASS / 11 SKIP, typecheck/build/schemas/format/docs PASS. A motor promptja nem változott. A [#70 integrációs PR](https://github.com/Muzsy/future_flow/pull/70) `98ae2db` forrásán a [Verify + Container CI sikeres](https://github.com/Muzsy/future_flow/actions/runs/40086092008). Az ezt követő lejárt-preparation archiválási kiegészítés implementált: 345 Python PASS / 11 SKIP, 99 Node ops PASS; a `d9ad91e` [Verify + Container CI-je sikeres](https://github.com/Muzsy/future_flow/actions/runs/40099566826), 9/9 root funded fájlteszttel és Docker-archiválási próbával. A következő one-off cleanup implementált: intent és immutable ID alapján takarít, unknown konténert elutasít, 352 Python PASS / 11 SKIP és 99 Node ops PASS; saját CI/review szükséges. A registry/receipt és restore-frissesség operátori lezárása, a független exact-source review és a célgépes proof nyitott. A #56 `8605838` forrása v1–v8 fiction capabilityt sorol, Python-oldalon 18 policyt vár; az integrációs jelölt ezt 19 policyra és v9 karakterállapotra egészíti ki. A korábbi integráció target/recovery útját a fenti CI/root fixture ellenőrizte; az új archiválási forrás saját bizonyítékát a #70 követi. A `c3bac46` ↔ #56 helyi `git merge-tree` próbája három dokumentációs konfliktust jelzett (master plan, STATUS, narrative release), forráskódkonfliktust nem; #62 szövegesen tisztán egyesíthető. Az előellenőrzés önmagában nem futási proof; a helyi integráció és tesztek eredménye fent szerepel. [Konkrét kiadási lezárás és blokkolók](operations/NARRATIVE_RELEASE_HU.md#bétafókusz-és-motorbefagyasztás--2026-10-24).

A felhasználó külön C5 API-próbát kér Flex feldolgozással: 3 előpróba, majd siker esetén külön 8+1 szöveg. A fejlesztői mérőfuttató opcionális Flex támogatása implementált, offline 3/3 és 9/9 szöveg sikeres; a motor és az éles konfiguráció változatlan. A felhasználó külön összesen 7 USD keretet engedélyezett; a source-bound új approval ezt a két szakaszra együtt érvényesíti, az eredeti ledgeren. A `a44d659` forráson a valódi próba lezárt: **3 + 8 + 1 = 12 elfogadott szöveg, 81 igazolt Flex-hívás, 6 javított fejezet, 0 végleges elutasítás**. Flex használati becslés **2,25795565 USD**, konzervatív accounted **5,3705 USD**, a közös 7 USD cap alatt. Az alternatív döntés eltérő eseményeket hozott, de csak egy fejezeten vizsgáltuk. A mintában 9 szöveg 2, 3 szöveg 3 opciót adott. A tulajdonos a 2–4 tartományt elfogadta: a kötelező három opció nem bétafeladat; az alternatívák érdemi tartalmi különbsége az elvárás ([termékspecifikáció](product/PRODUCT_HU.md#5-első-személyes-user-flow)). Ez egyprofilos, ügynök által olvasott diagnosztika, nem emberi/N08 vagy production PASS. Az exact-source Verify + Container CI sikeres (128 fájl / 1472 alkalmazásteszt). [Eredmény és megőrzött korlátok](operations/NARRATIVE_EVALUATION_HU.md#c5-flex-fizetős-eredmény--2026-10-24). [Mérési protokoll](operations/NARRATIVE_EVALUATION_HU.md#c5-flex-tesztsorozat-előkészítése--2026-10-24).

### Kiadási előellenőrzés — 2026-10-24, a Flex próba után

A választási opciók rendezettek a jelen scope-ban: a 2–4 tartomány elfogadott, a 12 planner/final döntés ügynöki ellenőrzése nem talált puszta átfogalmazású alternatívát; új motorfeladat nincs. A `5be123b` integrációs jelölt teljes [Verify + Container CI-je](https://github.com/Muzsy/future_flow/actions/runs/40101366458) sikeres, tehát a one-off kiegészítés korábban függő CI-je lezárt. A meglévő held restore-frissítési út tíz új célzott teszttel ellenőrzött: 373 Python / 362 PASS / 11 SKIP és 99 Node ops PASS, a crypto/Docker/root határ szintetikus. A régi capture/replay guard viszont ténylegesen elutasítja a v9 jelöltet (41 védett fájl, köztük 038); egy registry-bejegyzés nem elég. Következő a schema-038/v9-kompatibilis capture/replay és a funded aktív runtime-proof út, eredeti receipt/authority megőrzésével. A mért legnagyobb C5 kérés 139370 B, budget-tartalékkal 143466 B, ezért a korábbi 131072 B selection-példa nem elég; a már engedett 196608 B-os jelölt konkrét költség/runtime próbája szükséges. Független exact-source audit, új source CI, célgépes backup/restore és telepített monitor továbbra nyitott; éles módosítás nem történt. [Konkrét vizsgálat, határok és recovery-sorrend](operations/FUNDED_RUNTIME_UPGRADE_HU.md#kiadási-előellenőrzés-hosszabb-hold-és-legacy-replay--2026-10-24).

### #72 — v9 funded capture/replay implementáció

A v9-kompatibilis operátori út fejlesztési implementációja elkészült: külön aktív funded proof az eredeti root candidate/journal/readback/authority és az actual image alapján; külön `--funded-plan/--funded-drill/--funded-rehearsal`, változatlan legacy guard és régi receiptek mellett. A karantén az igazolt v9 image-et használja, a strict policy/artifact/karakterállapot ellenőrzés capture és replay előtt/után fut. A két célzott DB-fájl 28 tesztje PASS, megtartott/törlendő v9 artifact és hibás karakterdelta elutasításával. A teljes új forrás CI-je, a root/Docker companion, a független audit és a célgépes funded fence E2E külön igazolandó; nincs production változás vagy paid hívás. [Működés, parancsok és kiadási határok](operations/FUNDED_RUNTIME_UPGRADE_HU.md#v9-funded-capturereplay-út--72-fejlesztési-implementáció-2026-10-24).

### #75 — konkrét béta-konfiguráció és próbamenet, 2026-10-24

Előkészített runtime: v9 C5 / fiction-v2, **196608 B / 300000 ms**, szintetikus [selection.runtime minta](../deploy/narrative-beta-runtime.example.json). A #74 `ab9eb3f` Verify+Container CI-je és külön fejlesztési review-ja sikeres; új forrás és majdani main külön bizonyítékot kér. A konfiguráció SQL-budget próbája a mért nagy repairre 0,478665 USD előfoglalást igazol, ami a korábbi 0,188585 USD költés után nem fér a régi 0,50 USD userkeretbe. Mai live maradék nem lett lekérdezve. Az upgrade nem emelhet budgetet, nem adhat új admissiont és nem nyithat új ablakot. A termék nem választ explicit Flexet; a korábbi Flex mérőadapter nem production tier/latency proof. A 3 fős 10 USD kör végrehajtható új-window/admission útja, a tényleges target image-hez való fixture-producer és a reviewed Daily/monitor telepítési/readback út még kiadási feladat. V9-3/4 és V9-5 továbbra PARTIAL/PENDING. [Konkrét fázisok és megállási pontok](operations/NARRATIVE_RELEASE_HU.md#konkrét-béta-konfiguráció-és-próbamenet--75-2026-10-24). Nincs live művelet, paid hívás vagy main merge.


**#76 — önálló image-próba, 2026-10-25:** implementált a Linux/root standalone CLI és a közös CI/standalone tesztmotor. Egy pontos image-et igazol target/recovery szerepre, saját TLS/PostgreSQL/belső hálózattal és szintetikus adatokkal; nem örököl CI/provider/DB envet, proofot csak ellenőrzött forrás, 16 check és sikeres cleanup után ír. Tíz új unit teszt PASS; teljes Python 382 PASS / 11 SKIP, Node102 PASS. Új exact-source CI és tényleges célgépes futás még külön szükséges; V9-4 PARTIAL marad. [Futtatás és korlátok](operations/FUNDED_RUNTIME_UPGRADE_HU.md#önálló-kiadási-image-próba--76-2026-10-25). Nincs production/paid/ablakváltozás. A tulajdonos a béta előtt 10 USD feltöltést tervez; ehhez a feladathoz nincs szükség fizetős hívásra. A `b665934` CI-je sikeres, a független review P2 one-off timeout-cleanup hibát talált. Javítása tartós, forkok között is látható helper intent/név/label/image/ID nyilvántartás; nyolc új unit regresszió és két tényleges Docker hibaág került a próbába. Új exact-source CI és független re-review még külön szükséges.

## Következő fejlesztési és kiadási kapuk

F05/F06/N08 és N09 továbbra **PARTIAL**. A következő sorrend: befagyasztott v9 motor és meglévő mérési checkpoint → kiadási integráció és technikai stabilizálás → v9-kompatibilis N09 target/recovery és runtime bizonyíték → tesztelői használati út ellenőrzése → külön engedélyezett kis zárt béta. Az N09 előkészítése most közvetlen kiadási feladat; a célgépes proof a végleges, egyesített jelöltre kell. [Feladatok, függőségek és teljesülési feltételek](DEVELOPMENT_PLAN_HU.md#21-v9-következő-végrehajtási-lépései--2026-10-23).

Tulajdonosi döntés (2026-10-20): az élő világ **v9 a zárt béta elé került**, a v8 befagyott. A zárt béta 2026-10-19-i helyettesítő minőségkapui megmaradnak: a teljes N08/humán benchmarkot mért checkpoint, szerveres gépi kapuk és valódi tesztelői visszajelzés helyettesítheti. Nyilvános vagy fizetős kiadáshoz a teljes N08 továbbra kötelező. A technikai, privacy-, recovery- és budget-kapuk zárt bétában sem helyettesíthetők visszajelzéssel.

A korábbi 10 USD / 3 tesztelős béta-döntés nem indít új ablakot vagy keretet. A v9 konkrét jelöltjét, kohorszát, funded ablakát és költségkeretét az éles apply előtt egyeztetni kell. Új C5 paid méréshez új számszerű jóváhagyás kell; a régi `v9-m-20261022` engedély nem terjeszthető ki hallgatólagosan. A Codex/agy diagnosztikára a meglévő kvóta- és naplózási szabályok érvényesek. [Mérési eljárás](operations/NARRATIVE_EVALUATION_HU.md#c5-ellenőrzés-az-editoros-javítások-offline-elemzése-után--2026-10-23), [kiadási kapuk](operations/NARRATIVE_RELEASE_HU.md).

Az átadás szerint az external availability workflow privát health-projection ellenőrzése 2026-10-14 óta hibás, a publikus része sikeres volt. Friss futás/szerverdiagnózis itt nem történt; az ok és a helyreállítás igazolása az N09 előtt nyitott feladat.

Az árazás, havi fejezetmennyiség, billing és szélesebb pilot külön döntés. Shared és nyilvános launch nincs engedélyezve.

## Részletes források

- [Master plan](DEVELOPMENT_PLAN_HU.md): végrehajtási sorrend, státusz és acceptance gate-ek.
- [Creative terv](plans/CREATIVE_FICTION_IMPLEMENTATION_HU.md), [élő világ terv](plans/alterward_v8_living_world_feasibility_audit_2026-10-20.md), [ADR-009](decisions/ADR-009-character-state-artifact-fold.md): technikai scope és döntések.
- [Mérési runbook](operations/NARRATIVE_EVALUATION_HU.md), [kiadási runbook](operations/NARRATIVE_RELEASE_HU.md), [Linux-operátor](operations/LINUX_OPERATOR_HU.md): végrehajtható eljárások.
- [Architektúra](architecture/ARCHITECTURE_HU.md), [AI routing](AI_MODEL_ROUTING_HU.md), [gazdaságossági javaslat](plans/PERSONAL_STORY_ECONOMICS_PROPOSAL_HU.md).
