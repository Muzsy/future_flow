---
status: active-supporting
owner: operations
last_reviewed: 2026-10-25
related:
  - NARRATIVE_EVALUATION_HU.md
  - LINUX_OPERATOR_HU.md
  - ../PERSONAL_BETA_OPERATOR_HU.md
  - ../CONTABO_PRIVACY_RESTORE_PLAN_HU.md
---

# Személyes narratív és fikciós kiadás: előkészítés és fennmaradó kapuk

Ez N09 előkészítés, **nem apply engedély vagy kiadási bizonyíték**. N00–N07 és a withheld actor follow-up fejlesztési főágon kész; nyilvános/fizetős kiadáshoz a teljes paid/humán N08 mérés kötelező, zárt bétára a lent rögzített helyettesítő kapurend érvényes. A production megfigyelések határát és időpontját a célgépes előkészítési szakasz külön rögzíti; a korábbi fejlesztési bizonyítékok nem éles állapotigazolások.

## Main-integráció — 2026-10-25

A tulajdonos jóváhagyta a #81 `bc77cc9` jelölt merge commit alapú beolvasztását. Main integráció: `4fb7b48906235384b78617c807fb3995655842bc`; szülők `a666c905` és `bc77cc9`, tree `382f4fcc2d5e958fb79d964487b1a37e86bf17b0` (a reviewed jelölttel azonos). A húsz komponens-PR feje Git-ős, a stacked review-felületek integráltként lezárva, branch-/commit-/adattörlés nélkül. A teljes független review APPROVE; a [main saját CI-je](https://github.com/Muzsy/future_flow/actions/runs/40195596461) sikeres: 1477 app-teszt, Python 403 PASS/11 SKIP, root 3+4+10 és mindkét Docker-próba. V9-3 DONE; V9-4 PARTIAL és V9-5 PENDING. A korábbi PR/CI/image-proof továbbra a saját forrásához kötött.

A következő nyitott kapu a V9-4 célgépes bizonyíték. A merge-engedély nem szerveres parancs, telepítés, Daily-újratelepítés, admission/window/budget módosítás vagy paid hívás engedélye. A következő szakasz ezekhez konkrétan előkészített átadás.

## Történeti végrehajtási keret — 2026-10-23

A 2026-10-23-i checkpointban a fejlesztési főág v8 (`a666c905`), az aktív jelölt v9 C5 (akkor draft #66, implementáció `7bd4d42`); a jelenlegi main-integráció fent szerepel. Production utolsó igazolt állapota legacy. A review/mérés/integráció/N09/béta függőségeket a [master plan V9-1–V9-5](../DEVELOPMENT_PLAN_HU.md#21-v9-következő-végrehajtási-lépései--2026-10-23), a bizonyítékszinteket a [STATUS](../STATUS_HU.md) foglalja össze. A dátumozott korábbi költségkeretek és források történeti bizonyítékok; nem mai maradékok vagy új futtatási engedélyek. C5 paid méréshez új számszerű approval kell; a `v9-m-20261022` forráskötött engedély nem terjeszthető ki automatikusan.

## Bétafókusz és motorbefagyasztás — 2026-10-24

**Tulajdonosi döntés:** a motor további finomítása helyett a cél annak technikai stabilizálása és a kis zárt béta kiadása. Ez felülírja a C5 mérés után következőnek javasolt history-auditot és kontextuskontrollt. Ezek, az új promptminőségi iterációk, archetípusok és a 048-as fejlesztés DEFERRED. Az alábbi három munkacsomag végrehajtási sorrend; a bizonyítékok hiánya nem indít új, általános motorfejlesztést.

**Befagyasztott alap:** v9 C5 `7bd4d42`, meglévő #67–#68 dokumentációs/mérési checkpointtal. A kiadási jelölt pontos commitja csak #62, #56 és a szükséges technikai javítások integrációja után rögzíthető. A #80/#81 csomag 2026-10-25-én beolvadt; a végső operátori kiadási audit és a tényleges célgépes proof még nyitott. Az ismert C5 minőségi korlátokat elfogadjuk a zárt béta visszajelzéssel vizsgálandó kockázataként; ez nem általános minőségi PASS. A szerveres minőség- és fidelity-kapuk, az egyjavításos korlát és az elszámolási védelmek megmaradnak.

### 1. Egy kiadási jelölt és a motor technikai lezárása

A függő v9 lánc, a #62 tesztjavítás és a #56 N09 alap először fejlesztői integrációs ágba kerül; `main` merge külön, a konkrét reviewed jelölt alapján történik. A végleges forráson a releváns regressziók, a teljes tesztcsomag, typecheck/build/schema/docs és Verify/Container CI szükséges. Csak a kiadást akadályozó hibát javítjuk; egy újabb novelty-vélemény vagy szebb prózára vonatkozó ötlet önmagában nem nyitja újra a motort.

2026-10-24-i előellenőrzés: `git merge-tree --write-tree --name-only c3bac469da3848147c3811adaa2c34ce785e71f6 86058385515b0d0c0b768e16a30017c9dac92237` három szöveges konfliktust jelez (`docs/DEVELOPMENT_PLAN_HU.md`, `docs/STATUS_HU.md`, e runbook); forráskódkonfliktust nem. A #62 `b39c30a` ugyanezen v9 alaphoz szövegesen tiszta. Ez objektumszintű helyi próba, nem tényleges merge, kompatibilitási teszt vagy CI. A konfliktusoknál a jelenlegi bétafókusz és a régi operátori szerződés szükséges részletei együtt maradjanak meg.

### 2. V9-kompatibilis frissítés és helyreállítás

A közvetlen implementációs feladat a #56 továbbvitele a végleges v9 jelöltre. A `8605838` forrásban a `scripts/lib/funded-runtime.ts` capability-listája v1–v8 fictiont vizsgál, a `scripts/ops/contabo-funded-upgrade.py` 18 policyt vár. A tárolt policy parse önmagában nem v9 runtime/recovery proof. Kötelező a v9 policy, artifact/szereplőállapot és a generációválasztás kezelése a target és recovery oldalon, a régi generációk megtartásával, célzott negatív ellenőrzéssel ismeretlen/inkompatibilis változatra. A compose/env/backup/monitor/fence útvonalnak is ugyanazt a generációt kell megőriznie. A 2026-10-24-i integrációs jelölt már átadja a generációkulcsot (default v8), és az explicit privát selection.runtime blokkot mindkét image-re köti; részletes szerződés az [N09 runbookban](FUNDED_RUNTIME_UPGRADE_HU.md#explicit-v9-kiadási-konfiguráció--2026-10-24). Ez fejlesztési implementáció, nem éles beállítás.

A #56 runbookjának hat dokumentált operátori korlátját rövid release-triage zárja (a változó CI-metaadat hash hibája az integrációs jelöltben javítva): registry/receipt folytonosság, applied utáni restart, maradék one-off konténer, lejárt preparation, változó CI-metaadat hash és recovery restore-proof frissesség. A biztonságos helyreállítást vagy az igazolható célállapotot blokkoló tételt javítani kell; más tétel csak dokumentált, végrehajtható operátori eljárással maradhat. Nem általános operátori eszközújraírás a cél.

A konkrét runtime timeout/request cap és az ezekből számolt költségfoglalás ellenőrzése a kiadási konfiguráció része. A jelenlegi 100000 bájtos default a mentett javító kérések egy részéhez kevés; a korábbi 131072 B javaslatot a C5 mérés felülírta, a #75-ben 196608 B / 300000 ms az ellenőrizendő jelölt, nem alkalmazott vagy automatikusan jóváhagyott érték. Új irodalmi benchmark helyett a meglévő méretadatok, determinisztikus cap/timeout/budget próbák és az egyesített runtime/recovery fixture adja a technikai bizonyítékot. Titkosított backup, izolált restore/privacy replay, kompatibilis image-digest és drain/rollback próbák kötelezők.

A 2026-10-24-i kiadási előellenőrzés a hosszabb held állapot melletti restore-frissítés meglévő útját tíz célzott teszttel igazolta a szintetikus határok között. A registry/receipt kérdés viszont konkrét kódoldali akadály: a legacy replay dependency-guardja a v9 jelöltet 41 védett fájl eltérése miatt elutasítja, és a régi owner-only stage/build receipt nem az új funded runtime bizonyítéka. Következő ezért kompatibilis schema-038/v9 capture/replay és funded aktív proof, külön exact-source audit/CI/célgépes restore-próbával. Nem elegendő egy új image-párt a registrybe felvenni. [Részletes reprodukció és megőrzött recovery-kapuk](FUNDED_RUNTIME_UPGRADE_HU.md#kiadási-előellenőrzés-hosszabb-hold-és-legacy-replay--2026-10-24).

### 3. Tesztelői alapút és kis zárt indulás

Egy kijelölt tesztelővel a tényleges kiadási jelölt útját kell ellenőrizni: belépés → első fejezet → választás mentése → folytatás → új munkamenetből visszatérés/újranyitás → export → visszajelzés. Elutasított generálás, timeout és keretkimerülés esetén is látható, érthető lezárás, konzisztens mentett állapot és helyes elszámolás kell; nincs rejtett újrafuttatás vagy második díj ugyanannak a commitnak a hibás ismétléséből. A meglévő budget/window/admission szabályok érvényesek. A paid lépés csak a konkrét keret és forrás jóváhagyása után indulhat; az előkészítés mock/izolált környezetben végezhető.

A bétaindítást **blokkolja** az adatvesztés/adatvédelmi rés, hibás canon/choice mentés vagy elszámolás, megkerülhető budget/admission, nem működő frissítés/helyreállítás, illetve a fenti alapút ténylegesen reprodukált megakadása. Egy quality-gate elutasítás önmagában nem adatbiztonsági hiba; ismétlődő elutasítás vagy beragadt állapot miatt használhatatlan folytatás viszont működési blokkoló. Az ilyen hibára célzott javítás és érintett regresszió kell, új craft-fejlesztési ciklus helyett.

Az első kijelölt tesztelőn ellenőrzött indulás után a korábban tervezett háromfős kis kör készíthető elő a pontos személyek/ablak/keret rögzítésével. A 2026-10-19-i 10 USD / háromfős terv továbbra tervezési alap, nem új funded aktiválás; a jelenlegi ablakot és költést nem írjuk felül. Feedback fejezetenként, rövid kérdőív a 3. és 6. fejezetnél, monitor és működő leállítás/visszaállás. A béta tapasztalatai döntik el, mely minőségi hibát érdemes később javítani.

**Lezárási szabály:** a három munkacsomag szükséges technikai bizonyítékai után konkrét candidate/cohort/window/budget/apply csomag kerül a tulajdonos elé. A biztonsági kapukat megtartjuk, új teljes paid/humán N08, editor-kalibráció, history-kutatás vagy archetípus nem kerül a zárt béta elé. Nyilvános/fizetős kiadásnak továbbra külön minőségi és termékkapui vannak.



### Egyesített kiadási jelölt — #80, 2026-10-25

Az aktív `codex/v9-beta-release-candidate` ág a #79 végső `1c8c3de5c1158f62f5fb49df2e910f81a23d26a1` forrásából indul, `main` célú, egyesített review-csomag. A 2026-10-25-én lekért távoli `main` továbbra `a666c905ef953cc696d5d8a0faa4f9169ec01824`; ez a jelölt őse, a `git merge-tree` konfliktusmentes és a jelölt fáját adja. A fő munkakönyvtár helyi `main` ága más operátori történetet tartalmaz; azt nem reseteltük és nem használtuk kiadási alapnak.

A #56, #57–#61, #62–#71, #73, #74, #78 és #79 jelenlegi fejei mind valódi Git-ősök a jelöltben (a sorban #72, #75–#77 Issue, nem PR). A #56 és #62 integrációs merge-je `01b18b7`, illetve `8cc667e`. Az `apps/` és `packages/` teljes committed tartalma **bájtazonos a befagyasztott C5 `7bd4d42` állapottal**. A `c68ab037` konszolidáció csak a kiadási dokumentációt rendezte; a teljes review utáni célzott operátori javítások alább külön követettek, új motor-, séma- vagy költségszabály nélkül.

A #79 pontos forrásának [CI-je](https://github.com/Muzsy/future_flow/actions/runs/40177172040) Verify+Container SUCCESS: 1477 alkalmazásteszt; Python 393 PASS / 11 SKIP és külön root csoportok 3+4+9 PASS; mindkét tényleges Docker-próba sikeres. Külön read-only review APPROVE a `cdb8bb8 → 1c8c3de` diffre, 21/21 saját célzott teszttel. A két P2 cleanup-hiba javítva. **Ez a review nem a teljes `main → jelölt` diff auditja.** Az egyesített jelölt teljes CI-jét, pontos végső SHA-ját és review-eredményét a #80-hoz kapcsolt PR rögzíti; a korábbi rész-PR eredményeit nem címkézzük át.

A `main` merge, a teljes kiadási diff független review-ja és a célgépes proof továbbra nyitott. A régi PR-k nem kerülnek külön squash/rebase integrációba: a jóváhagyott, teljes jelölt egyszeri beolvasztása után rendezhető a beolvadt vagy helyettesített stack GitHub-állapota. Addig mindegyik megmarad eredettörténetként. A majdani `main` pontos commitjához friss CI/audit/build/image/fixture kell; dokumentációs commit vagy merge után sem írható át régi proof.

#### Következő konkrét operátori átadás

| Sorrend | Előkészített elem / még szükséges eredmény | Megállási feltétel |
| --- | --- | --- |
| 1 | Egyetlen `main` célú jelölt, a teljes diff független review-ja és saját zöld CI; ezután a konkrét main merge tulajdonosi engedélye. | Rész-PR review-ja, eltérő SHA, közben megváltozó main vagy új finding. |
| 2 | Jóváhagyott mainből clean, privát Linux checkout és tényleges build. A target/recovery ugyanaz az immutable image lehet; image ID és bundle valódi mérésből kerül a privát selectionbe. | Kitalált digest/útvonal, fejlesztési branchre átírt main-őr vagy más source-ból származó image. |
| 3 | Külön jóváhagyott célgépes standalone próba a #76 eljárása szerint. Előtte kapacitás és cached függőségek felmérése; utána 16 check, privacy replay, cleanup és eredeti idegen workload egyezés. | Hiányzó erőforrás, más image-re érvényes CI-artifact vagy sikertelen cleanup; utóbbinál privát intent megőrzendő. |
| 4 | Tényleges Daily/private-monitor telepítési és readback terv, eredeti titkosított mentés + offsite + izolált restore/fence/TLS bizonyíték, friss Access/Auth/reader/DB megfigyelés. | Nem ellenőrzött installált source, régi restore, ismeretlen költés/reservation vagy identity-drift. |
| 5 | A #77 szerint konkrét résztvevők, dátumok, új-window/admission eljárás és számszerű paid engedély. A 10 USD a tervezett bétafeltöltés; a megadott 4,77 EUR nem új kiadási limit. | Régi ablak/ledger resetje, allowance nélküli hívás vagy pusztán a runtime selectionbe írt új user. |
| 6 | Külön jóváhagyott prepare/restore/apply/active-proof, majd egy tesztelő teljes belépés–választás–folytatás–új session–export útja; csak ezután a kis kör. | Nem igazolt recovery/monitor vagy hibás mentés/elszámolás. |

A runtime-minta továbbra v9 / fiction-v2 / 196608 B / 300000 ms; a benne lévő UUID szintetikus és nem admission. A későbbi privát csomag helye a meglévő `.local/contabo-release/`: release selection, tényleges operator-interpreted audit, source/image fixture, prepare/restore/active proof. A történeti receiptek és ledger változatlanok; sem üres, sem szintetikus audit-PASS fájlt nem állítunk elő. A célgépes próba eredménye az új root outputkönyvtárban marad, a repóba csak titok- és személyesadat-mentes összesítés kerül.

## Történeti v6 bizonyíték és költési határ — 2026-10-18

PR #50 mért checkpointként beolvadt (`f755a57`, production nélkül) / quality2.5, mért forráscb8b539 (CI340 SUCCESS); későbbi docs-only56062a8 CI341 SUCCESS. Legutóbbi friss B:15/18 elfogadott, alkotói8+fork és munkahelyi6; munkahelyi7–8/fork hiányzik, a következő author teljes előfoglalását budget guard állította meg API előtt. Nincs teljes kétprofilos vagy emberi PASS. V6 összesen22.7396675/23 USD, maradék0.2603325 USD; eredeti globális ledger652/33.4716975 USD, kumulatív plafon33.732030 USD. Minden unknown teljes foglalása megtartva, aktív/hozzárendeletlen0. Új paid futás nem indul. A korábbi keret- és eredményszakaszok dátumhoz/forráshoz kötött történeti checkpointok, nem mai engedélyek. [Aktuális státusz](../STATUS_HU.md), [részletes v6 terv](../plans/045_fiction_v6_earned_life_evolution.md).

## Zárt narratív béta: kapurend — tulajdonosi döntés, 2026-10-19

**Státusz: a tulajdonos 2026-10-19-én jóváhagyta.** A zárt narratív bétában az alábbi staging-sorrend 1. pontját (teljes paid+human N08 PASS) e szakasz helyettesítő kapui váltják ki. Nyilvános, fizetős vagy szélesebb kiadásra a teljes N08 kapu változatlanul kötelező. A döntés nem rollout-engedély, nem módosít ablakot, keretet, cohortot vagy production állapotot; az éles apply továbbra külön engedélyt kíván.

Kérdés: kiadható-e az új narratív pipeline egy kis, zárt tesztelői körnek úgy, hogy az irodalmi minőség még nem végleges, és a valódi használat adja a béta-visszajelzést.

**Visszajelzéssel nem helyettesíthető kapuk** (változatlanok): Linux funded-runtime upgrade (Issue #34); 038 migráció kompatibilis alkalmazás- és recovery image-dzsel, titkosított backup, izolált restore és privacy replay; a runtime határidő és request-envelope kifejezett beállítása; drain és legacy visszaállás; explicit cohort és költségkeret; éles post-check és külön apply engedély. Ezek adat-, költség- és működési biztonságot védenek, nem irodalmi minőséget.

**Zárt bétában helyettesített kapuk:**

- A teljes kétprofilos, 18 célos paid benchmark helyett a már mért, forráshoz kötött checkpoint (v6 vagy a később kiválasztott jelölt Stage A+B eredménye) és a minden fejezetre futó szerveres gépi minőségkapuk. A kapuk küszöbei nem lazulnak; elutasított fejezet nem jut el az olvasóhoz.
- A független emberi sorozatértékelés helyett a tesztelők saját, valódi életének értékelése: fejezetenkénti alkalmazáson belüli visszajelzés és egy rövid kérdőív a 3. és a 6. fejezet után (lent). Ez valódi emberi bizonyíték, de nem vak összehasonlítás, ezért nyilvános vagy fizetős kiadásra nem elegendő.
- Árazás, csomag, billing és latency-SLA nem feltétele a zárt, előre keretezett bétának; a mért latency és fejezetköltség a béta eredménye.

**Kiválasztott fejlesztési generáció — 2026-10-20-i döntés:** a zárt béta előtt a **v9 élő világ** készül el, a v8 befagyott baseline. A korábbi v7/v8 kiadási javaslatot ez felváltja. A C5 draft #66 nem kiadási engedély: a végleges forrás kiválasztása, mért checkpointja, független review-ja és v9-kompatibilis N09 target/recovery bizonyítéka még szükséges. Az éles jelölt, cohort, window és budget az apply előtt explicit egyeztetendő.

**Korábban jóváhagyott béta-keret — tulajdonosi döntés, 2026-10-19:** első körben 10 USD OpenAI-keret 3 tesztelőre (tervezett 10 USD projekt / 3,33 USD felhasználó). Kb. 0,40–0,43 USD-s elfogadott fejezetenkénti költséggel ez tesztelőnként kb. 7–8 fejezet, tehát a 6. fejezet utáni kérdőív elérhető. A plafon a `DatabaseAiBudget`-ben, a személyes policyban, a napi monitor `personal_runtime_policy` ellenőrzésében és a Linux operátori receipt-ellenőrzésben 10 / 3,34 USD; a Claude audit plafonja változatlan. A napi monitor a szerverre telepített példányból fut, ezért az új plafon csak a reviewed újratelepítés után él. A keret a visszajelzések után módosulhat; minden módosítás újabb tulajdonosi döntés. A worker egyszerre egy jobot dolgoz fel (kódból kiolvasva, élesben nem mérve), így egyidejű kérésnél a tesztelők sorban várnak.

A fenti döntés nem igazolja a keret production alkalmazását vagy mai maradékát, és nem indít új funded ablakot. A v9 kiadásnál az eredeti béta-elszámolást megőrizve kell a konkrét alkalmazható keretet és tesztelőket rögzíteni; a v9 offline/API mérés ettől külön költségengedély.

### Tesztelői visszajelzés

Csatornák: az alkalmazás meglévő fejezetenkénti visszajelzése (`POST /api/v2/feedback`: kategória, folytatná-e, rövid megjegyzés; összesítés `pnpm feedback:report`) és egy rövid, alkalmazáson kívüli kérdőív a 3. és a 6. elfogadott fejezet után. A kérdőív a [mérési runbook](NARRATIVE_EVALUATION_HU.md) sorozatkérdéseinek tesztelői változata; a választ AI nem töltheti ki és nem egészítheti ki.

1. Elolvasnád a következő fejezetet? (igen / talán / nem)
2. Ha ez fizetős lenne, folytatnád ezt az életet? (igen / talán / nem)
3. Melyik jelenet növelte a legjobban a kedvedet a folytatáshoz?
4. Melyik jelenet csökkentette a legjobban?
5. Úgy érzed, a korábbi döntéseid érdemben megváltoztatták a későbbi fejezeteket? (1–5)
6. Mennyire érzed magadénak a főszereplőt? (1–5)
7. Vannak a mellékszereplőknek saját életük, vagy csak a főszereplőt szolgálják? (1–5)
8. Ismétlődött valami zavaróan (jelenet, mondat, fordulat, név)? Mi?
9. Volt olyan változás, ami indokolatlanul vagy túl korán történt? Melyik?
10. Volt olyan szakasz, ahol túl sokáig nem történt semmi? Hol?
11. Elárulta-e egy fejezet vége túl nyíltan a következő döntés lehetőségeit? (igen / néha / nem)
12. Mennyire volt zavaró a fejezet elkészülésére várás? (1–5)
13. Egyéb megjegyzés

Mérendő a bétából: elfogadott/elutasított fejezetek aránya, fejezetenkénti accounted költség a béta ledgeréből, P50/P95 elkészülési idő, visszatérés és folytatás aránya. Ezek a későbbi árazási és kiadási döntés bemenetei.

## Narratív runtime konfiguráció — 2026-10-19

A deploy compose a következő kulcsokat adja át; mind default-off vagy a meglévő runtime értéken marad, így a meglévő szerver-env módosítása nélkül a viselkedés változatlan:

| Kulcs | Szolgáltatás | Default | Megengedett |
|---|---|---|---|
| `NARRATIVE_PIPELINE_MODE` | api, worker | `legacy` | `legacy`, `context`, `narrative-v1`, `narrative-fiction-v2` |
| `NARRATIVE_COHORT_USER_IDS` | api, worker | üres | legfeljebb 100 egyedi Auth UUID |
| `AI_FICTION_TIMEOUT_MS` | worker | 180000 | 1000–300000 |
| `AI_FICTION_MAX_REQUEST_BYTES` | worker | 100000 | 100000–196608, csak `narrative-v1`/`narrative-fiction-v2` jobokra |

`NARRATIVE_FICTION_GENERATION` (api, worker): opcionális kiválasztás, `v8` (alapértelmezés, kulcs nélkül is) vagy `v9` (élő világ, qualityPolicy 2.8.0). A `v9` csak `narrative-fiction-v2` módban érvényes, minden más érték vagy mód indításkor `NARRATIVE_CONFIG_INVALID`. A 2026-10-24-i integrációs jelölt deploy compose-a átadja `v8` defaulttal, az éles env itt nem módosul; a v9 bekapcsolása külön tulajdonosi döntés és N09-sorrend (b) szerint a Linux-helyreállítás ismerete után lehetséges. Egy v9 történet nem folytatható v8 konfigurációval (a szereplőállapot csendes befagyása helyett `NARRATIVE_CONTEXT_INVALID`). **Kérésméret-plafon:** a default továbbra 100000 B. A 2026-10-24-i C5 mérés 139370 B raw repairt tartalmaz; a 4096 B budget-tartalékkal 143466 B szükséges, ezért a korábbi 131072 B javaslat nem elegendő. A [#75 konkrét előkészítése](#konkrét-béta-konfiguráció-és-próbamenet--75-2026-10-24) 196608 B capet vizsgál; a `tests/fiction-v9-request-bytes.test.ts` pending-owner tesztértéke ehhez igazodik, a régi 108751 B v8 és 116336 B v9 mérések történeti adatai változatlanok. A budget cap az egész serialized kérés + 4096 B összege. A generic default, az éles env és a költségkeret nem változik; külön N09 selection/apply és tényleges foglalási headroom kell.

A korábbi compose ezeket nem adta át, ezért a cohort productionben nem volt bekapcsolható, és a narratív jobok a 100000 bájtos envelope-pal futottak volna. A tulajdonosi owner-konfiguráció ellenőrzése (`validate_owner_configuration`) nem-legacy módot vagy nem üres cohortot elutasít. A compose változása miatt a következő éles frissítés már nem tisztán image-only: az N09 funded-runtime upgrade-nek ezeket a kulcsokat a fenti defaultokkal kell elfogadnia, minden más funded env-bájt változatlansága mellett. Konkrét éles értéket csak a külön jóváhagyott N09 apply állíthat be.

## Kiadási manifest, csak igazolt értékekkel

A kiadáskor rögzítendő: pontos clean main SHA; Verify és Container CI run+SHA; audit scope+sourceSHA+eredmény; build proof és immutable image digest; actual root/Linux fixture proof ugyanazon source/helper hash-ekkel; target schema/catalog fingerprint; 038 előtt és után friss titkosított backup/offsite hash és izolált restore+privacy replay proof; engedélyezett upgrade útvonal; runtime/env/Access/CA/network/proxy/cost/window/reader baseline hash; cohort explicit Auth UUID-lista privát operátori inputként; rövid érvényességű prepare, lock/journal/post-check/recovery igazolás. A hiányzó image digest vagy target proof nem helyettesíthető szöveges „kész” értékkel.

## Sémakompatibilitás

`database/migrations/038_narrative_artifacts.sql` egy nullable `aw_periods.narrative_artifact` JSONB oszlopot ad, default/index/backfill nélkül. Tényleges migrációt csak reviewed recovery/upgrade eljárás végezhet. A 001–038 izolált fejlesztési fingerprint: columns 856 / 37519bd15ef5d42b9ea1ef6486dc00a3ddf43582c589d718a01355701de1b31c. A pontos source guard az authority; kézi hash-javítás tiltott. A kapcsolódó executable catalog és privát éles readback egyezése szükséges.

**Régi pre-038 recovery image az új séma ellen zár.** Nem módosítunk guardot azért, hogy elfogadja az ismeretlen oszlopot. Előbb kompatibilis recovery/replay image és annak audit/restore próbája kell, utána új séma. A helyi regressziós próba backupban tárolt narrative artifact és később törölt life/account prune-ját vizsgálja, nem valódi hosztolt restore-proof.

## Linux és az aktív funded béta

A `LINUX_OPERATOR_HU.md` kifejezetten reader/funded/daily/writer-fence portot ad; owner-image deployment és scheduler-migráció nem része. A `scripts/contabo-owner-upgrade.mjs` win32-ra és original-zero tulajdonosi image-only állapotra kötött. A `scripts/ops/contabo-personal-beta.py` reader/original image baseline-ból indított funded átmenetet ellenőriz. Ezek egyike sem jogosít fel a már aktív funded window alatt schema+image+cohort átírására.

Az Issue #34 implementációs jelöltje a dedikált Linux **funded-runtime upgrade**; végrehajtási szerződése a [funded runtime runbook](FUNDED_RUNTIME_UPGRADE_HU.md). Meg kell tartania az aktuális window kezdő/vég időpontját, összes és user keretet, ledger/reservation/usage összegét, napi/concurrent limitet, reader/access/CA/hostpint, jelenlegi worker-fence-t és idegen konténereket. A támogatott transition, rollback és candidate schema/recovery páros explicit szerződés legyen; existing receipt hand-edit vagy initial activation újrajátszása tiltott. Source audit, target fixture és CI kapuit ugyanazon candidate SHA-n kell igazolni. A feladatot az [Issue #34](https://github.com/Muzsy/future_flow/issues/34) követi; külön PR-review és exact-source audit szükséges; nem ezen benchmark scriptből végzett SSH művelet.

## Izolált staging sorrend

1. Teljes N08 paid+human release gate PASS, a költség/idő plafon tulajdonosi döntése rögzített. Zárt narratív bétában helyette a [2026-10-19-i kapurend](#zárt-narratív-béta-kapurend--tulajdonosi-döntés-2026-10-19) helyettesítő kapui érvényesek.
2. Kompatibilis alkalmazás- és recovery image ugyanahhoz a reviewed source-hoz, builder/CI digest readback. Független source audit nem helyettesíthető szerzői összefoglalóval.
3. Szintetikus staging 001–037 DB-ről 038 apply; old legacy chapter olvasás, új narrative nullable export/DTO és négyhívásos commit, quality stop/retry, fork és privacy withheld regresszió. További, titokmentes staging credential és költés engedélye külön szükséges, ha valódi provider része a próba.
4. Encrypted backupból izolált 001–038 restore, aktuális deletion/revocation replay, catalog guard és consumer API ellenőrzés; hálózat/publikált port és production AI nélkül. Failed replay esetén kiszolgálás zárt marad.
5. Aktív funded-runtime fixture: sikeres image csere, hibás post-check, megszakadt apply, competing lock, slot/reservation megőrzés, ismert inkompatibilis rollback elutasítása, sikeres recovery. Eredeti window/ledger before/after byte/logical comparison kötelező.
6. Csak ezután konkrét éles prepare csomag és külön apply jóváhagyás, rövid lejáratú friss target readbackkel.

## Drain és visszatérés legacy módba

A `NARRATIVE_MODE=legacy`/üres cohort csak az **új queue** policy-ját változtatja. A már snapshotolt narrative-v1 job továbbra narrative-v1-ként dispatcholhat; ezért flag-off önmagában nem drain. A kanonikus writer-fence/pause után queue és folyamatban lévő reservation/lease állapotát fel kell mérni, a bound ready jobot engedélyezett free commit útvonalon befejezni, minden más jobot a reviewed recovery/cancel eljárás szerint rendezni. Canon/checkpoint/admission count kézzel nem írható át.

Rollbackhez post-038 kompatibilis alkalmazás+recovery image és explicit legacy/default-off konfiguráció szükséges. Az oszlop ismerete önmagában nem elég: a cél- és recovery image-nek a már tárolt artifactok és queue-jobok összes befagyasztott promptverzióját is támogatnia kell, ideértve a planner v1/v2/v3, writer v1/v2/v3 és az új planReviewer marker/report policyt. Egy v3-at nem értő régebbi post-038 image nem automatikusan kompatibilis rollback. A 038 oszlopot és már tárolt artifactot nem töröljük; régi pre-038 API image esetleges `p.*` projekciója sem fogadható el privacy readback nélkül. Régi DB snapshot nem szolgálható automatikusan; aktuális deletion/revocation replay kötelező. Image/config visszaállítás nem nulláz AI költséget vagy windowt.

## Éles post-check

Minden engedélyezett módosítás után visszaolvasni: actual image digest/source, mindhárom saját szolgáltatás health/env, explicit cohort és a nem engedélyezett account legacy útja, Access/CA/anon tiltások, schema/catalog, queue/fence/journal, változatlan window+ledger+limit, normál life/public DTO-ból a privát artifact kizárása, saját exportban a meglévő privát artifact-szerződés megőrzése. Egy már engedélyezett tesztelő új fejezete csak külön költési engedély és maradék eredeti keret mellett indulhat. A literary minőség kapuját a benchmark igazolja, egy éles smoke nem helyettesíti.

Nyitott kapuk: teljes paid/human benchmark nyilvános/fizetős kiadáshoz, illetve a fenti helyettesítő minőségkapuk zárt bétához; Linux funded upgrade implementáció/audit; candidate immutable image+Container CI; célgépes migration/recovery/backup/staging proof; explicit éles apply és readback. Az adott kiadásra érvényes kapuk lezárásáig a narratív pipeline production bekapcsolása tilos.


Az új queue max8 policyja csak a kötelező tervellenőri markerrel és az annak megfelelő hash/receipt/provenance ellenőrzéssel kompatibilis; a régi max7 snapshot nem alakítható át kézzel. A recovery/rollback image-nek az új artifact review mezőit is kezelnie kell, még ha a DB oszlopséma nem változott is. Capability hiányában az új munka az első fizetett hívás előtt zár.


Issue #43 kompatibilitási kiegészítés: ha a kiadott forrás már readiness policyt tartalmaz, a target és recovery image-nek a planner v4 / reviewer v2 markert és az 1.1.0 readiness-reportot is ténylegesen értelmeznie kell, a régi policyk mellett. A csak v1–v3/v1 review-t ismerő korábbi image nem elegendő. A PR #42 más forráshoz kötött fixture/CI bizonyítéka nem igazolja automatikusan ezt az új kombinációt: az egyesített pontos forráson új kompatibilitási fixture és review kell. A meglévő ablak/ledger és minden paid/human/operátori kiadási kapu változatlan.


## Creative v2 kompatibilitás

A `narrative-fiction-v2` új mode/policy öt normál/max9 fizikai hívást, author utáni végső tervellenőrzést, artifact 2.0.0-t, StoryFact-réteget és új receipt/checkpoint kötést használ. A régi v1 parser nem elegendő. Új JSONB-oszlop nem szükséges a 038-on túl, de a target/recovery image-nek az új artifact, context és policy értelmezését, valamint az opcionálisan explicit user-constraintként szereplő `available_hours_at_most` predikátumot is támogatnia kell.

Kikapcsoláskor új creative job nem indul, v2 history legacy folytatása nem engedett; olvasás/export a kompatibilis image-dzsel megmarad. A jelenlegi budget/window/cohort alapértékek változatlanok. Feltétel továbbra a teljes technikai, paid/human és operátori proof; e dokumentum nem rollout-engedély és nem a nyitott Linux-upgrade feladat helyettesítése.


A qualityPolicy 2.1.0 kiadásához a target és recovery image-nek a creative planner/author/reviewer v3, editor v2 és report 1.1.0 sequenceReview, valamint az opcionális sequenceHistory context értelmezését is támogatnia kell. A v1/v2 promptok és reportok mellett értendő; a korábbi forrás proofja nem igazolja ezt automatikusan. A további minőségmérés keretengedélye nem éles rollout-engedély.

## Human-quality v4 evidence boundary — 2026-10-17

A qualityPolicy 2.2.0 technikai készültsége nem release PASS. Offline negatív editor-fixture csak a szerver elutasítását és javítási útját igazolja. A valódi editor hibafelismerése külön kalibráció, a történetélmény külön vak emberi mérés. H1: két profil legalább három-három fejezete és alternatív fork; H2: két profil hat-hat egymást követő fejezete és fork, a 4–6. részre külön visszajelzéssel. A H1 nem helyettesíti a H2-t, és a hat fejezet sem korlátlan garancia. Az elsődleges mérce az elmerülés, folytatási kedv, szereplőhitelesség és érdemi fejlődés; AI-gyanú másodlagos. Diagnostic-ai értékelés nem emberi bizonyíték.

A creative sequence értékelés kezdetben diagnosztika: nem módosítja a korábbi 34 vak párból álló benchmarkot vagy a release-küszöböket. A reviewer-létszámot és új esetleges release-küszöböt külön owner-döntés rögzíti. Új paid méréshez külön engedély/költségterv kell. A production cohort/default, funded ablak és béta-ledger változatlan; PR #42/N09 exact-target recovery/rollout bizonyítéka továbbra külön feladat.

A v4 későbbi kiadásához a target és recovery image-nek a befagyasztott v1–v3 mellett planner/author/reviewer v4, editor v3/report 1.2.0 és a sequenceSignature/sequenceSignatureHistory mezők értelmezését is támogatnia kell. Egy régi, csak v3-at értő post-038 image nem automatikusan kompatibilis rollback. Az új JSON-mezők nem SQL-migrációt jelentenek; exact-source runtime/recovery bizonyítékuk külön N09 feladat.


## V5 candidate boundary — work package 045

QualityPolicy 2.3.0 selects planner/author/reviewer v5 and editor v4 while retaining report 1.2.0 and signature 1.0.0. Target/recovery compatibility must include all frozen v1–v4 plus v5 tuples before any later separately authorized rollout. Synthetic local rejected-attempt traces are development evidence only, not production retention or reader-visible content. A 14-text real corpus and its model gates still do not imply independent human quality acceptance or production release. Current cohort, funded window and production ledger remain unchanged.

045 tényleges minőségi kimenet: nyolc elfogadott szöveg, egy kizárt munkahelyi második fejezet, öt nem generált cél. A teljes kétprofilos kapu nincs teljesítve. A szigorú retorikai kapu és az egy javítás limit megmarad; a részletes negatív bizonyíték a 045 tervben. Nincs quality release vagy operátori rollout-engedély.

## V6 candidate boundary

A target/recovery image-nek a quality2.5 korai editor-gyűjtést, max9/four-slot fallback és cache/receipt kötéseit is kezelnie kell; a csak2.4-et ismerő image nem elegendő az új jobokhoz. A fejlesztési300s/192KiB nem production default és nem rollout-bizonyíték.

V6 target/recovery support must recognize planner/author/reviewer v6, editor v5, selected quality2.5.0 AND frozen quality2.4.0 alongside frozen v1–v5; report 1.2.0 and signature 1.0.0 remain unchanged. There is no new SQL, routine stage, repair allowance or production retention of rejected prose. Implementation and paid model-gate success are not independent human quality approval. The original v5 negative evidence remains valid. Eight main chapters form an evaluation window only, without a story schedule or a newly invented release threshold. This task authorizes no production/cohort/window/billing change, deployment or v6 self-merge. [V6 plan](../plans/045_fiction_v6_earned_life_evolution.md).


### V6 kiadási kapu — Stage B részleges

A v6 18-célos valódi próba 11 elfogadott, 2 elutasított, 5 nem generált szöveggel zárult; mindkét ismétlődő lezárás editor-elutasítása után a javító transportot a lokális méretkorlát blokkolta. A fejlesztési envelope-korrekció offline igazolása nem új paid vagy human PASS. Nincs teljes B8 olvasói anyag vagy retention bizonyíték. A production DatabaseAiBudget alapértelmezése továbbra 100000 bájt, így annak v6 repair-határát rollout előtt külön kell kezelni/igazolni. PR #50 draft, F05/F06/N08 PARTIAL; nincs merge vagy élesítés ebből. Esetenkénti bizonyíték a [v6 tervben](../plans/045_fiction_v6_earned_life_evolution.md#stage-b-actual-result--2026-10-18-partial-not-release-evidence).


### Javított v6 Stage B lezárása — 2026-10-18, technikai részleges eredmény

A javított friss B is részleges:6 elfogadott/1 technikai failure/11 nem generált; a hetedik három180s author-timeoutja miatt sem teljes nyolcas ablak, sem fork/második profil nincs. Független humán minőség továbbra nyitott. A development-fiction300s/capture-timeout korrekció offline munka, nem runtime aktiválás. A production100000 bájtos repair-envelope és runtime határidő külön rollout-bizonyítékot igényel. PR#50 draft, nincs merge vagy élesítés; a részleges automatikus pontok nem release-proofok. Részletes forrás/költség/eset/olvasási bizonyíték a [v6 tervben](../plans/045_fiction_v6_earned_life_evolution.md).


### Új numerikus v6 authority — összesen17 USD, 2026-10-18

A tulajdonos a konkrét deadline-javítás és a részleges mérés megismerése után további legfeljebb5 USD-t engedélyezett: **összesen17 USD v6**, nem újraindított keret. Változatlan nyitó305/10.732030 USD, új kumulatív plafon **27.732030 USD**. Aktuális eredeti ledger443/19.946540 USD, eddigi v6 **9.214510 USD**, rendelkezésre álló authority **7.785490 USD**. A hét unknown teljes2.2399275 USD foglalása továbbra benne marad; sem a régi maradékot, sem a régi elutasításokat nem nullázzuk/adjunk hozzá újra. Új cap és negatív pénzügyi ellenőrzések után sikeres exact-source CI szükséges. Ezután friss három career-main/no-fork előpróba, és csak elfogadható eredménye után külön friss18-célos mérés. Várható összköltség6–7 USD, nem garantált szolgáltatói siker. Nincs modell-, minőségkapu-, repair-, runtime-, production- vagy merge-engedély. A korábbi12 USD-re vonatkozó mondatok és keretfüggő leállás történeti állapotok; a már lefutott mérések eredménye/forrása változatlan.


### Deadline-javított friss Stage A lezárása — 2026-10-18

A deadline-javított friss háromfejezetes előpróba3/3 kapu-PASS,16 transport/egy300s timeout. Root olvasása hosszabb diagnózisra alkalmas, a második lezárás konkrét kockázatával; ez nem teljes nyolcas ablak vagy emberi minőségi bizonyíték. A hosszabb development timeout nem bizonyított runtime megbízhatóság/latency elfogadás. N08/N09/production kapuk változatlanul nyitottak, PR#50 draft. Részletes bizonyíték: [v6 terv](../plans/045_fiction_v6_earned_life_evolution.md).


### V6 hosszú mérés utáni release-határ — 2026-10-18

A deadline-javított friss B13/18 elfogadott,1 elutasított,4 hiányzó; munkahelyi8+fork kész, alkotói negyedik ismétlődő lezárás miatt elutasított. Ez nem teljes többprofilos release-evidence. A quality2.5 offline koordinált fidelity/editor-feedback korrekció még nem valódi provider-/humán minőségi bizonyíték;2.4 snapshot megmarad, max9/repair1 és küszöbök változatlanok. Friss tiszta source/checks/CI, friss elfogadható A majd külön teljes B, független humán olvasás és konkrét Linux runtime/recovery proof továbbra szükséges; régi receipt/source adoptálása tilos. Teljes v6 accounted14.810610 USD, maradék2.189390 USD a17-ből, új teljes paid csomag további numerikus authority nélkül nem indul. N09: production100000B repair guard és180s deadline külön feloldatlan runtime-határ, a development192KiB/300s siker nem rollout-engedély. Nincs merge, funded/béta/billing/entitlement vagy production módosítás. [Részletes v6 terv](../plans/045_fiction_v6_earned_life_evolution.md).


### Új numerikus authority — összesen23 USD v6, 2026-10-18

A tulajdonos a quality2.5 javítás és a teljes sikeres CI338 (c2ac1cb,101 fájl/1091 teszt, Verify+Container SUCCESS) után további legfeljebb6 USD-t engedélyezett, vagyis **összesen legfeljebb23 USD v6 fogyasztást**. A változatlan eredeti baseline305 hívás/10.732030 USD; új kumulatív ceiling **33.732030 USD**. Indulás előtt az eredeti ledger536 hívás/25.542640 USD, teljes v6 **14.810610 USD**, fennmaradó authority **8.189390 USD**. Minden korábbi hiba és kilenc lezárt unknown teljes foglalása benne marad; nincs reset, másolt ledger vagy hozzáadott régi headroom. Ez nem igazolt provider-wallet egyenleg.

A keretkorrekció célzott tesztjei és exact-source CI után friss tiszta forrásból három career-main/no-fork valódi előpróba indulhat; csak elfogadható eredménynél külön friss kétprofilos18-célos mérés. Becsült új összköltség6–7 USD, az eltérésre előfoglalási tartalék marad. Korábbi terminális korpusz/receipt nem adoptálható új forráshoz. Modell/prompt/max9/repair1 és minőségi küszöb változatlan, quality2.5 technikailag ellenőrzött, valódi irodalmi eredménye még nincs. F05/F06/N08 PARTIAL, N09/human/retention/production továbbra nyitott; PR#50 draft, nincs self-merge. A korábbi17 USD-s korlátra és hiányzó további authority-re vonatkozó mondatok történeti checkpointok.


### Quality2.5 valódi előpróba lezárása — 2026-10-18

Friss `2c4e9c8` (CI339 SUCCESS) Stage A **3/3 elfogadott,17 hívás,0 tartalmi javítás**,1.4336775 USD. Két válasz nélkül zárt author-kérés teljes0.668350 USD foglalása megtartva; harmadik próbálkozás sikeres. P50 413464/P95 856182ms, nem elfogadott terméklatencia. Globális ledger553/26.9763175 USD, teljes v6 **16.2442875 USD**, remaining **6.7557125 USD** a23-ból,11 lezárt unknown/0 aktív vagy hozzárendeletlen. Root+teljes háromrészes kiegészítő AI-kritika szerint alkalmas hosszabb diagnózisra, a második opcióközeli mondat fenntartásával; nincs human PASS vagy új tiltás. Feltételes ajánlat megszületik, a jelenlegi állást nem írja felül user döntés előtt. Következő: docs checkpoint+CI/preflight után külön friss18-célos B, becslés5–6 USD, eredeti ledgerből. F05/F06/N08 PARTIAL, N09/human/ár/retention nyitott; PR#50 draft, production változatlan. Részletek a [v6 tervben](../plans/045_fiction_v6_earned_life_evolution.md).


### Quality2.5 hosszú mérés — részleges, 2026-10-18

15/18 elfogadott: alkotói8+fork, munkahelyi6; munkahelyi7–8 és fork hiányzik. A következő author teljes előfoglalását a budget guard API előtt megtagadta, nem irodalmi elutasítás történt. B99 valódi hívás/5 repair/6.495380 USD, négy unknown teljes1.3534425 USD foglalással. Globális652/33.4716975 USD; teljes v6 **22.7396675 USD a23-ból**, remaining0.2603325 USD, aktív/hozzárendeletlen0. Új paid futás nem indul. A valós korai editor-gyűjtés4 esetben működött, de mind PASS: kettős hiba kijavítását nem igazolja. A teljes kiérdemelt állásváltás és alkotói/baráti fejlődés mellett ismétlődő túlmagyarázás/hétköznapi NPC-megszakítás és opcióközeli penultimák nyitottak; a gépi PASS nem emberi minőség. F05/F06/N08 PARTIAL, N09/human/retention/ár nyitott; PR#50 draft. Részletek és a forráshoz kötött következő lépések a [v6 tervben](../plans/045_fiction_v6_earned_life_evolution.md).


## V9 integrációs jelölt — 2026-10-24

A `codex/v9-beta-integration` ág a #69 bétafókusz fölé egyesítette a #56 `8605838` N09 alapot (`01b18b7` merge) és a #62 `b39c30a` tesztjavítást (`8cc667e` merge). A három docs-konfliktus a jelenlegi bétafókusz megtartásával rendezett; az N09-ből a saját export privát artifact-szerződésének pontosítása megmaradt. Main/production továbbra változatlan.

Az integrációs módosítások: v9 capability + tárolt artifact/delta ellenőrzés, explicit és boundolt runtime-kiválasztás már admitted cohortból, API/worker/monitor egyezés, Compose default-kompatibilitás, stabil CI-bizonyítékhash. A motor promptja, policyja és minőségkapuja változatlan. Az akkori 131072 B / 300000 ms szintetikus fixture-beállítást a C5 méretmérése után a #75 196608 B / 300000 ms jelöltje váltja fel; egyik sem production apply. A lejárt preparation explicit archiválása implementált, saját CI/review szükséges; a one-off intent/cleanup is implementált, saját CI/review szükséges; a registry/restore-frissesség fennmaradó operátori korlátai a [kiadási triage-ban](FUNDED_RUNTIME_UPGRADE_HU.md#kiadási-triage-az-integráció-után--2026-10-24) nyitottként követettek. A jelölt ezért még nem élesítésre kész bizonyíték.

Lokális integrációs ellenőrzés: 127 fájl / 1465 alkalmazásteszt, 99 Node ops teszt, 351 Python ops tesztből 340 PASS / 11 SKIP; typecheck/build/schemas/format/docs PASS. A teljes root/Docker recovery rehearsal és az egyesített commit független auditja/CI-je külön követendő. Részletes ellenőrzési korlátok és a végső Python-hardening: [N09 ellenőrzési napló](FUNDED_RUNTIME_UPGRADE_HU.md#integrációs-ellenőrzések--2026-10-24).


## #72 v9 funded replay fejlesztési folytatás

A legacy replay-guard által jelzett akadályra külön funded proof/capture/replay út készült; nincs általános guardlazítás vagy eredeti receipt-átírás. Az aktív, befejezett upgrade root- és image-bizonyítékát a szerver újraellenőrzi, a karantén ugyanennek a v9 image-nek a 038 katalógusát és stored artifact/karakterállapot validatorát használja. A célzott 28 DB-teszt PASS, az új root/Docker fixture és PostgreSQL companion az exact-source CI része. Független audit és a konkrét célgépes új funded módok E2E-je továbbra kötelező; ez az implementáció önmagában nem aktiválás. [Parancsok és határok](FUNDED_RUNTIME_UPGRADE_HU.md#v9-funded-capturereplay-út--72-fejlesztési-implementáció-2026-10-24).


## Konkrét béta-konfiguráció és próbamenet — #75, 2026-10-24

Ez az aktuális, offline előkészített végrehajtási csomag a #74 fölött; nem új motorfejlesztési terv. A [szintetikus runtime-minta](../../deploy/narrative-beta-runtime.example.json) a `selection.runtime` blokkja, nem teljes kiadási input. A korábbi 131072 B példa a C5 139370 B raw repairjéhez kevés; e csomag **196608 B** értéket vizsgál, a default és a live env megváltoztatása nélkül.

### Kiválasztott jelölt és még hiányzó kötések

| Elem | Előkészített érték / szükséges kötés |
| --- | --- |
| Motor | Befagyasztott v9 C5, qualityPolicy 2.8.0; változatlan promptok, kapuk, egy globális repair és max9 fizikai kérés. |
| Mód | `narrative-fiction-v2`, generáció `v9`, azonos API/worker konfiguráció. |
| Cohort | Első műszaki alapút: egy, már felvett tesztelő; kizárólag az eredeti funded admission részhalmaza. A minta UUID szintetikus. A tényleges személy/Auth UUID privát selectionbe kerül, soha Gitbe. A későbbi háromfős kör külön admission és finanszírozás után. |
| Kérés és idő | Worker `AI_FICTION_MAX_REQUEST_BYTES=196608`, `AI_FICTION_TIMEOUT_MS=300000`; target és recovery egyező. A 300 s hívásonkénti plafon, nem teljes fejezet-SLA. A worker a meglévő lease harmadánál heartbeatet küld; a 180 s lease nem egyenlő teljes feldolgozási határidővel. |
| Modellút | Meglévő OpenAI / `gpt-6.1-sol` planner/author/check útvonal, 12000 author / 6500 egyéb life output maximum. A futó model env tényleges egyezése még kiadás előtti readback. Az upgrade nem módosíthatja a modellt/providert. |
| Service tier | A termék transportja nem állít `service_tier` mezőt; a projektbeállítás az irányadó. **Standard/default ellenőrzendő, jelenleg nem igazolt**; nincs production Flex-ENV kapcsoló. A korábbi Flex-eval adapter explicit Flexet és 900 s hívási timeoutot használt; annak ára/latencyje nem a jelen konfiguráció működési bizonyítéka. |
| Futtatási budget | Meglévő 2 USD projekt / 0,50 USD user, eredeti `2026-10-13T22:11:21Z–2026-11-12T22:11:21Z` ablak és ledger változatlan. Mai maradék ismeretlen. 10/3,33 USD háromfős terv még nem alkalmazható ezzel az upgrade-del. |
| Napi/párhuzamos korlát | Eredeti 3/UTC-nap, userenként 1 párhuzamos; egy worker sorban dolgozik. A 3./6. fejezet ellenőrzése több napra eshet, nem lazítunk kvótát a próba kedvéért; 3,33 USD sem garantál hat fejezetet, a következő hívás előfoglalásához is kell maradék. |
| Forrás/image | #74 `ab9eb3f` sikeres CI és független fejlesztési review; a mostani előkészítés és a későbbi tiszta main külön forrás. Végleges SHA, target/recovery digest és forráskönyvtár csak tényleges buildből. |
| Kizárt scope | Shared és publikus funkciók OFF, nincs archetípus/rotáció/choice tuning, nincs fizetős benchmark vagy új paid engedély. |

A [hivatalos Flex-leírás](https://developers.openai.com/api/docs/guides/flex-processing) szerint Flexet explicit kérési mező választ, nagyobb latency és kapacitáshiány előfordulhat. A repository `packages/ai/src/index.ts` és `scripts/lib/narrative-evaluation-runner.ts` forrása igazolja a termék és a mérőadapter fenti eltérését. Flex termékbe emelése külön technikai változás és jóváhagyás; a korábbi „Sol-flex” tesztkérés önmagában nem állította át a bétát. Ez a csomag a meglévő termékútvonalat készíti elő, nem választ új modellt.

### Előkészített végrehajtási sorrend

Az alábbi menetet most **nem futtattuk le**. Az éles műveletek előtt a konkrét forrás, image-ek, friss bizonyítékok, szükséges leállás és paid cap kerülnek operátori jóváhagyásra. A 900 s a prepare lejárata; nem becsült kiesés. A szükséges kiesés időtartama a célgépes dry/izolált mérésig ismeretlen.

| Fázis | Művelet és elfogadási feltétel | Megállási feltétel |
| --- | --- | --- |
| 0. Offline csomag | Runtime-minta validálása; valódi budget-guard negatív/pozitív próbák; exact-source Verify+Container; reviewer által ellenőrzött forrás. | Hibás cap, hiányzó teszt vagy audit; fejlesztői önellenőrzést nem nevezünk végső operátori auditnak. |
| 1. Kiadási forrás | Reviewed PR-lánc és külön jóváhagyott main merge; clean, védett Linux main checkout. Tényleges target/recovery build, source/bundle/image binding és final audit. | Fejlesztési branch, régi vagy más commit CI-je, kitalált digest, privát state hiánya. A CLI main-őrét nem kerüljük meg. |
| 2. Friss felmérés | Telepített Daily/source/monitor, három saját szolgáltatás, Access/reader/Auth mapping, modell/projekttier, ablak/kvóta/budget/reservation, queue/lease és idegen workload readonly ellenőrzése. `--inspect` csak journalt igazol, ehhez önmagában kevés. | Drift, pending/unknown költség, lejárt ablak, új probe, nem átlátható admission vagy nem biztosítható foglalás. |
| 3. Izolált célgépes bizonyíték | A tényleges digesthez kötött v9 capability és config; titkosított mentés/offsite és külön PostgreSQL restore/privacy replay, hálózat/secret/TLS/cleanup ellenőrzéssel. Target és recovery kompatibilis. | Csak más image-re érvényes CI-proof, hiányzó cleanup, ismeretlen policy/karakterállapot vagy eltérő védett adatok. |
| 4. Konkrét átállás | Jóváhagyás után friss Access + release/audit/fixture; `--prepare`, candidate utáni backup/sync/restore és `--apply` a 900 s kapun belül, a [funded runbook](FUNDED_RUNTIME_UPGRADE_HU.md) szerint. A védett DB/accounting/authority nem változhat. | Lejárt preparation nem hosszabbítható. Ha már held állapot: csak a dokumentált restore-frissítés/recovery; nincs vaktában új start vagy dump visszatöltés. |
| 5. Futó v9 ellenőrzése | Aktuális source-ból `--active-proof`, majd `--funded-plan`; külön jóváhagyott drill/rehearsal friss saját plan/audit/CI alapján. Image/source/schema038/cohort/cap/timeout egyezik; TLS, origin, monitor, idegen workload és cleanup rendben. | Régi owner receipt, rossz image, plusz one-off, v9 történethez v8 rollback vagy romló monitor. |
| 6. Tesztelői alapút | Külön jóváhagyott paid cap és megfelelő tényleges allowance után egy tesztelő: belépés → első fejezet → választás mentése → folytatás → új munkamenetben visszatérés → újabb folytatás → export → feedback. Frissítés/dupla kattintás nem hozhat létre kettős commitot/elszámolást. | Beragadt job, elveszett vagy rossz ághoz mentett választás, félrevezető hiba, nem elszámolható hívás. |
| 7. Kis kör | Külön végrehajtható 3 fős admission/window/budget eljárás után fokozatos nyitás; 3./6. fejezetnél kérdőív, meglévő privát monitor és működő vészleállítás. | Csak a régi tesztelő szűk kerete áll rendelkezésre, nincs tényleges mapping vagy leállási út. |

A 6. fázis hibaágai izoláltan előkészítendők: minőségkapu-elutasítás, hívási timeout/unknown usage, budget denial, lejárt ablak és ismételt kérés. Ezeket productionben nem szándékos többletköltéssel idézzük elő. A valódi normál út és új sessionből folytatás paid/user bizonyítéka külön kerül rögzítésre; az offline kapu nem tesztelői PASS.

### Még szükséges döntések és eszközök

1. **Tényleges keret és résztvevők — [#77](https://github.com/Muzsy/future_flow/issues/77):** a régi userlimit mellett a mért nagy repair nem finanszírozható a korábbi költés megőrzésével ([számítás és SQL-próba](FUNDED_RUNTIME_UPGRADE_HU.md#konkrét-konfiguráció-és-próbamenet-előkészítése--75-2026-10-24)). A háromfős 10 USD tervhez végrehajtható, auditált új-window/admission út kell; a jelen eszköz csak az eredeti ablakot őrzi. Nincs automatikus emelés vagy ledger-reset. A későbbi paid capet és a tényleges tesztelőket a tulajdonos rögzíti.
2. **Célgépes fixture-eszköz — [#76](https://github.com/Muzsy/future_flow/issues/76):** a jelen `contabo-funded-upgrade-fixture.py` kizárólag CI/root és szintetikus host/Auth környezetet enged. Nem célgépes runner, a CI/GITHUB_ACTIONS env kézi megadása nem támogatott megoldás. A #76 új standalone image-futtatója a közös tesztmotorból állít elő tényleges image/source proofot, egy image mindkét szerepére; a fejlesztési implementáció elkészült, saját CI és a konkrét célgépes futás külön igazolandó. [Eljárás és határok](FUNDED_RUNTIME_UPGRADE_HU.md#önálló-kiadási-image-próba--76-2026-10-25). A CI artifact mezőinek átírása tiltott.
3. **Telepítés és monitor:** a reviewed mainhez tartozó Daily és privát monitor pontos telepítési/rollback eljárása és célgépes readbackja szükséges; a kódban szereplő új policy nem bizonyítja a szerverre telepített példányt. A Standard projekttier ellenőrzése is itt zárul.
4. **Kiadási engedély:** a fennmaradó technikai tételek és friss bizonyítékok után konkrét main/source/image + cohort/window/budget + kiesés + recovery terv. A végső szolgáltatásleállítás és fizetős E2E előtt a tulajdonos jóváhagyása kell; az offline előkészítéshez most nincs szükség újabb engedélyre.

Megőrzendő privát bizonyítékok: új release selection; tényleges audit/CI és target fixture; prepare/restore/apply/active-proof; saját funded-plan/drill/rehearsal; Daily/private monitor readback; paid alapút és accountolt költség; tényleges emberi feedback. Eredeti zero/reader/personal és korábbi ledger/corpus változatlan. Nyilvánosan csak személyes adat és titok nélküli összesítés kerül a PR-ba.


Helyi ellenőrzés e konfigurációs csomagra: **38/38 célzott Vitest**, **102/102 Node ops**, **383 Python / 372 PASS + 11 környezeti SKIP**; typecheck, teljes build, sémaexport, format/docs/diff sikeres, generált contract nem változott. A teljes regressziót és a 192 KiB beállítással futó root/Docker átmeneteket az új exact-source CI külön igazolja; a korábbi #74 CI-t nem nevezzük az új forrás saját futásának.


A #81 teljes `main → c68ab037` review két P2 hibája célzott operátori javítást kapott: a capability-konténernek production oldalon is saját durable cleanup kell, és az image-only módhoz is működő funded replay authority. Daily v4 és a javított exact source telepítése új előfeltétel; a teljes CI és független re-review saját SHA-ra kötött. [Működés és regressziós bizonyítékhatár](FUNDED_RUNTIME_UPGRADE_HU.md#teljes-kiadási-review-javításai--8081-2026-10-25). A C5 termékkód változatlan; a régi zöld jelölt nem a javítások proofja.


## Main utáni célgépes előkészítés — 2026-10-25

**Státusz:** a #82 beolvadt (`c3e7393b62c3a8f9cd4e7bd8385c979966ccb993`); a tulajdonos „Haladj tovább” utasítása alapján a #83 csak olvasó célgépes felmérése elkészült. A későbbi #85 build és sikertelen izolált próba eredménye lent szerepel; alkalmazás-átállítás nem futott. A mainbe olvasztás kész; a #81 main CI-je zöld, a #82 utáni `c3e7393` saját [Verify/Container futása](https://github.com/Muzsy/future_flow/actions/runs/40198316929) szintén sikeres. A további main commitokhoz a saját forrás/CI/image bindingot kell választani, nem a korábbi merge SHA-ját kézzel az új HEAD-re átírni.

### 1. Csak olvasó célgépes előellenőrzés — elvégezve, #83

A meglévő eredeti SSH-kulccsal és szigorúan ellenőrzött eredeti hostpinnel, SSH-config/agent/forwarding nélkül történt a felmérés. A következő parancsok a minimális kapacitásellenőrzést mutatják; a tényleges bounded Python-kérés emellett csak kiválasztott Docker/systemd/Daily mezőket olvasott. Nem kell teljes environmentet, Docker-inspectet vagy credentialfájlt reportba másolni.

```sh
uname -sr
id -u
command -v docker git node openssl age age-keygen
docker version --format '{{.Server.Version}}'
docker compose version --short
awk '/^MemAvailable:/ {print}' /proc/meminfo
df -Pm /tmp
docker image inspect --format '{{.Id}}' postgres@sha256:3645570cccdfa447589da9f57dd740faa29b30938e861289a5574b6ca6b03826
```

Elvárt eredmény: támogatott Linux/root Docker műveleti környezet, Compose és valamennyi előre telepített függőség, cached pinned PostgreSQL, legalább 3 GiB tényleges szabad memória és 2 GiB scratch. A teljes host CPU/memória-korlát és más alkalmazások terhelése külön operátori értékelés. Az alábbi mérés pillanatfelvétel; közvetlenül a későbbi próba előtt ismét ellenőrizendő. Elégtelen kapacitásnál külön Linux/Docker host szükséges, nem automatikus csomagtelepítés vagy a limit lazítása.

### 2. A forrás és a build rögzítése

Jóváhagyott, tiszta, privát main checkout szükséges. A fő helyi munkakönyvtár eltérő main ágát nem reseteljük; a célgépes release source saját checkout. Rögzítendő a tényleges `git rev-parse HEAD`, tiszta `git status --porcelain`, az ehhez a SHA-hoz tartozó Verify/Container CI, source bundle és a tényleges build után `docker image inspect` image ID. A felméréskor az image-hash még ismeretlen volt; a #85 tényleges build eredménye lent szerepel. A build/függőség-cache/erőforrás és az output új útvonala a célgépes engedély konkrét csomagja; régi image/fixture/audit receipt nem örökíthető át. A standalone producer egyetlen tényleges image-et támogat target és recovery szerepre.

### 3. Izolált image-próba és utána az operátori kapuk

A [#76 standalone parancs](FUNDED_RUNTIME_UPGRADE_HU.md#előfeltétel-és-későbbi-célgépes-használat) az új, tényleges digest és új root outputkönyvtár mellett futtatható majd. Saját TLS/PostgreSQL/internal-network és szintetikus adatok; nincs providerkulcs vagy valódi generation worker. Kötelező a 16 check, image-only és v9 replay, production capability timeout/SIGKILL cleanup, idegen workload egyezés és teljes cleanup. Hibánál nincs PASS; pending intent és privát munkakönyvtár megőrzendő.

Az image-próba sikere után a telepített Daily v4/private-monitor/readback, az eredeti titkosított mentés/offsite és izolált restore/fence/TLS, a friss Access/Auth/reader/DB állapot és a tényleges operator-interpreted audit szükséges. A #77 dátumok/résztvevők/successor-window/admission és paid cap még külön tétel. V9 apply és a valódi tesztelői alapút a meglévő konkrét jóváhagyási kapuk után jön. A mostani előkészítés nem hosszabbítja a régi ablakot, nem resetel ledgert és nem használja fel a megmaradt provider-egyenleget.


### Megfigyelt célgépes állapot — #83, 2026-10-25 14:42 CET

| Ellenőrzés | Tényleges eredmény és határ |
| --- | --- |
| Kapacitás | Linux/root elérhető; 4 CPU, kb. 7,76 GiB Docker-memória; 5,15 GiB elérhető hostmemória, 71,63 GiB `/tmp` szabad hely. A 3 GiB/2 GiB minimum teljesül; terhelés alatti tartalékot ez nem igazol. |
| Docker és függőségek | Docker 29.1.3, Compose 5.1.4; git/node/openssl/python3 elérhető; a runbook pinned PostgreSQL image-e cache-elt. `age` és `age-keygen` a runner fix PATH-ján hiányzik. A külön read-only ellenőrzés az eredeti `/root/alterward-ops/tools/usr/bin/` alatt mindkettőt root-tulajdonú, regular, nem symlink, 0755 fájlként megtalálta; új telepítés szükségessége nincs igazolva. A runner előfeltétele jelenleg még nem teljesül. |
| Saját alkalmazás | Három saját konténer fut: API és web healthy; worker fut, nincs Docker-healthcheck eredménye. Hét más projektbeli konténer is jelen van; állapotukat nem módosítottuk. A kiválasztott env-mezők olvasása mindhárom saját konténernél sikeres. |
| Runtime/budget | API és worker env: projekt 2 USD / user 0,50 USD; explicit v9/pipeline/byte/timeout env nincs a kiválasztott mezők között. Ez nem DB-ledger-, mai maradék-, modell- vagy tier-ellenőrzés. A régi owner manifest forrása `827d72aceabd7360c9cfbc120166d87cc11e2425`; a mostani main v9 target-image még nincs megépítve vagy igazolva. |
| Telepített Daily | `sourceCommit=0b57f7f316945ab97ee61985b569e6b56e5a6c8d`; mindhárom telepített script hash-e egyezik a saját configjával. Az új funded archive-policy konstans nincs benne: ez nem Daily v4. Nincs `funded-runtime-upgrade` könyvtár. |
| Mentés és monitor | A backup és monitor timer active/waiting; a legutóbbi service-kilépés mindkettőnél success/0. Backup státusz 04:16 CET, monitor 14:30 CET: `ok=true`, üres alerts, régi Daily-forrás. A restore státusz 2026-10-14 00:02 CEST, ebből a felmérés nem olvasott igazolt friss sikerállapotot. A régi zöld monitor nem az új v9/Daily kapu PASS-a. |

**Bizonyíték:** privát 0700 `.local/verification/target-preflight-20261025/`, 0600 request/response fájlokkal. A `response-v2.json` SHA-256: `0d9664c96ad48d3b6b25ca75110d96d74c6d52fa3d53b5bbadd85399341dcf8c`; a hozzá kötött request SHA-256: `ade5c5cdab776000fe1c2c97584e874500e56e30524bfda17b78ee9cddd02f5d`. A `response-tools.json` a két eredeti privát eszköz metadata/hash megfigyelése. Az első kérés Docker Go-template hibánál megállt; az eredeti kérés/hibareceipt megőrzött, a javított v2 teljes, inspect-hiba nélkül. Ez a helyi receipt utólagos sérülését felismerhetővé teszi, de nem független kiadási audit vagy image-fixture.

**Határ:** nem futott DB-lekérdezés, backup/monitor program, Docker pull/build/run, package install, service/timer állapotváltoztatás, paid hívás, admission/window/budget módosítás. Access/Auth/reader mapping, queue/lease/reservation és tényleges maradék nincs frissen igazolva. V9-4 PARTIAL, V9-5 PENDING marad.

### A #83 után jóváhagyott műveleti csomag — a #85 eredménye lent

1. **Próbakörnyezet előfeltétele:** a meglévő privát `age` binárisok eredetének/verziójának és biztonságos parentjeinek ellenőrzése, majd külön jóváhagyott, célzott hozzáférhetővé tétel a runner fix PATH-ján; vagy külön előkészített Linux/Docker host. A hívó PATH átírása nem oldja meg a runner belső fix PATH-ját. Nincs automatikus apt-install vagy védelmi feltétel lazítása.
2. **Exact main és build:** külön tiszta/root-private checkout a kiválasztott main SHA-ról, saját zöld Verify/Containerrel; a runtime-forrás és a három új Daily-script hashének rögzítése. A Dockerfile nyilvános Supabase/API build-argumentumait a létező alkalmazás megfelelő értékeiből kell ellenőrzötten választani; provider/DB/Auth secret nem kerül buildbe. Új tag, tényleges immutable image ID és build-erőforráskorlát szükséges. A többi workload megfigyelése és kapacitásfrissítés előfeltétel.
3. **Csak izolált image-próba:** az előző pont tényleges digestjével, új `/root/alterward-ops/image-rehearsal-<run-id>` outputtal a fenti standalone CLI. A futó három app marad a régi image-en; a runner csak saját szintetikus erőforrásokat indít/takarít. Sikert csak a 16 check és teljes cleanup után szabad rögzíteni. Hiba/pending intent esetén megállás és scoped egyeztetés, nem újabb vak futtatás.
4. **Daily v4 külön műveleti ablak:** a meglévő `contabo-daily.mjs --update` út a három scriptet/config-source-t és a négy saját unitot frissíti; előtte kizárólag a két saját timer kikapcsolása és az inaktív service-k ellenőrzése kell. A kód az előző privát prepare/update-proof script-hashét és változatlan configot kéri; a kliens eredeti privát inputjainak megléte még ellenőrizendő. Korábbi fájlokat `previous-<candidateCommit>` alatt megőriz, hiba esetén fájlvisszaállítást kísérel meg; ez nem teljes, automatikus operátori rollback-igazolás. Friss backup → offsite sync → izolált restore → monitor → proofhoz kötött timer-aktiválás szükséges, a rövid monitorozási szünet és hiba esetén a rendezés előre rögzítendő. Az alkalmazáskonténerek változatlanságát readbackkel kell igazolni.

Az **1–3. pontot a tulajdonos külön jóváhagyta**, a #85 alatt végrehajtott build és sikertelen próba eredménye lent szerepel. A külön felhatalmazás Docker-erőforrások és új operátori fájlok létrehozására terjedt ki. A 4. pont, az éles apply és a paid teszt továbbra külön kiadási kapu. A megmaradt provider-egyenleg most egyik feladathoz sem szükséges.


### Engedélyezett image-építés és izolált próba — #85, 2026-10-25

A tulajdonos külön jóváhagyta a `c3e7393b62c3a8f9cd4e7bd8385c979966ccb993` mainből a privát checkoutot, új image-et, az eredeti age-eszközök ellenőrzött elérhetővé tételét és a szintetikus image-próbát. A Daily/timer frissítése, az alkalmazás átállítása és a paid alapút továbbra későbbi kapu.

Az eredeti age/age-keygen binárisok root-owned, nem írható idegen parentjei, regular/0755/nlink1 fájljai, a #83-ban megfigyelt SHA-256 és a korábban rögzített 1.1.1 verzió egyeztek. Új `/usr/local/bin/age` és `/usr/local/bin/age-keygen` link készült az eredeti privát binárisokra; meglévő fájl nem lett felülírva, package install nem történt. A runner fix PATH-ján a két verziót frissen visszaellenőriztük. A publikus buildparaméterek ujjlenyomata `b05cce6f129bd4450b68b03b1024572c337c8f4b9aba3f69bc3bc670f031faab`, a korábbi builddel egyező; kizárólag nyilvános URL/publishable- vagy anon-kulcs és `/api/v1` használható, privát credential nem kerül buildbe.

A pontos committed `contabo-target.py` build-függvénye az eredeti `contabo-backup.py` könyvtárral fut, izolált új munkaterületen, a Linux SSH-transporton; a régi Windows CLI platformőrét nem módosítottuk. Az eredeti helper 2 GiB memória/swap és 1 CPU korlátú, saját néven indított Buildx buildert használ, egyszerre egy buildlépéssel. A tényleges Docker HostConfig visszaolvasása igazolta a határokat. Új source archive SHA-256: `b490dcfc9bfe2c515d310b333767660801e2fc696bb7812c023b658392c444cc`; a külön Git-bundle ugyanazon `origin/main` commitot köti, a build után csak `.git` kerül a source mellé, minden tracked bájt Githez ellenőrzött. A futtatás 0700/0600 privát evidence könyvtára `.local/verification/target-image-c3e7393-20261025/`.

**Build sikeres:** tényleges image `sha256:79b0b85b5d7efa8efe5688c25d4cf30071101b96a6b52c4c2209f09b418628e8`, új tag `alterward:contabo-c3e7393b62c3`. A builder eltávolítva; az eredeti futó konténerek ID/status/restart állapota egyezik a build előtti baseline-nal. A teljes build és takarítás körülbelül 13 perc volt; ez nem éles kiesési becslés.

Az operátori wrapper első checkout-lépése a megnyitott unborn mainbe fetch-elt, amit a Git helyesen elutasított. Az eredeti hibareceipt megmaradt; külön egyeztetés a bundle-t remote refbe fetch-elte, majd mixed resettel csak a main indexét/HEAD-jét állította elő. Minden tracked regular fájl bájtja és a tiszta main státusz utána Githez ellenőrzött; az image tag/digest és a konténerbaseline újra egyezett. Nem futott második build, nem módosult committed forrás, és az eredeti failed receipt nem lett PASS-ra átírva. A külön `build-result-reconciled.json` igazolja a befejezést.

**Izolált próba sikertelen:** 2026-10-25 15:29:50–15:56:29 CET (26 perc 39 másodperc), exit 1. Nem keletkezett `funded-upgrade-fixture-proof.json` vagy `image-rehearsal-receipt.json`; a 16 check teljes sikerét nem igazoltuk. A részállapotban megfigyelt healthy/staged/recovered/closed nem teljes PASS. Mind a tíz eredeti konténer image/restart/status/start-time állapota egyezett a próba előtti baseline-nal. Az outer nonce-konténerek és hálózat hiányát, a scratch eltűnését külön readback igazolta. A 16:05 CET végső ellenőrzéskor a source tiszta `c3e7393`, az image azonos, az eredeti 10 konténer megvan, API/web healthy, worker running; a régi mentés és a 16:00 CET monitor `ok=true`. Paid AI-hívás: 0. Nem történt rollout, Daily/timer frissítés vagy éles DB/authority módosítás.

**Ismert hiány és következő kapu — #86:** a CLI csak általános hibamondatot őrzött meg. A belső engine stderrje memóriába irányított, a sikeres cleanup a részletes szintetikus diagnosztikát is eltávolította; a konkrét kivétel/assertion helye nem nyerhető vissza. A Docker-események lekérdezése sem adott használható eseményt. A kiváltó ok ismeretlen: nem nevezhető igazolt motor-, adatbázis-, host- vagy timinghibának. Vak újrafuttatás helyett előkészítettük a kizárólag hibánál írt, 0600 `image-rehearsal-failure.json` naplót az új saját outputban. Kivételtípus, source/bundle/image és korlátozott repo-relatív forráshelyek, kivétellánc, subprocess program/exit code kerül bele; üzenet, locals, nyers argv/stdout/stderr nem. A cleanup változatlan, naplózási hiba nem fedheti el az eredeti kivételt, meglévő output/receipt nem írható felül; ez nem release proof. A javított forrás saját CI-je és független review-ja után új, pontos source/image-hez kötött diagnosztikus próba kell. A javítás önmagában nem oldja meg az ismeretlen teszthibát. V9-4 PARTIAL, V9-5 PENDING marad; Daily és apply nem indul.

**Megőrzött evidence:** privát `artifacts/rehearsal-result.json` SHA-256 `d8421b7be3db0712696fe8029b7c6b51163f9a2f9d8d86afa991851bc4784177`; a teljes privát failure export `d0973efd81977f4cea7339dc085444872e4f646dc7b2e712b070d0803068c966`; végső read-only receipt `83da3b7950b87c4d803bc333148d4a812141d18d23d74820befc936dc4750187`. Az eredeti build/checkout hibareceiptek és a külön egyeztetés változatlanul megmaradnak. Új napló vagy sikeres eredmény nem készült utólag a régi futáshoz.

**Helyi ellenőrzés a diagnosztikai változásra:** 17/17 célzott image-rehearsal unit teszt; teljes Python 420 teszt / 409 PASS + 11 környezeti SKIP. Hat új teszt igazolja az érzékeny kivétel-/subprocess-adatok kizárását, a takarítási kivétellánc és eredeti source location megőrzését, a régi output/symlink/nyilvános könyvtár elutasítását, a logginghiba melletti eredeti kivételt és KeyboardInterruptot, valamint a sikerág failure-receipt mentességét és a ciklikus kivétellánc/típusnév méretkorlátját. Ezek nonprivileged, szintetikus határtesztek; a javított forrás saját Container CI-je és új célgépes futása külön bizonyíték.
