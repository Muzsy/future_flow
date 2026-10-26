---
status: active-supporting
owner: operations
last_reviewed: 2026-10-26
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


## Új diagnosztikus célgépes próba a #84 után — 2026-10-25

A tulajdonos kifejezetten jóváhagyta a #84 `25cbb99` merge commit alapú beolvasztását és a main saját sikeres CI-je után egy új image építését/izolált diagnosztikus próbáját. Merge: `7038ae727c008ed6e885d4349acaa04d966e285a`; szülők `c3e7393` és `25cbb99`; tree `32399821b5987201fd08933caf66248bff7e5101`, a reviewzott jelölttel azonos. A független teljes diff review APPROVE (17 saját unit teszt, AST szerint az eredeti izolált menet/cleanup/proofkapuk változatlanok). A jelölt saját CI40205680887 Verify+Container sikeres: 1477 app, Python 409 PASS/11 SKIP, root 3+4+10, mindkét Docker-próba.

A main külön [CI40209173082 futása](https://github.com/Muzsy/future_flow/actions/runs/40209173082) Verify+Container SUCCESS. A külön privát `.local/verification/target-image-7038ae7-20261025/` source archive/bundle és operátori csomag a pontos mainhez kötött; az új checkout a bundle-t remote refbe fetch-eli, majd mixed reset után minden tracked fájlt összevet Gittel. A régi c3e image/eredmény/hibareceipt nem írható át vagy törölhető. Új image és saját proof csak a main CI, friss kapacitás/eszköz/nyilvános buildparaméter ellenőrzés és sikeres tényleges futás után igazolható. A 2 GiB/1 CPU buildkorlát és a standalone eredeti erőforrás-/izolációs kapui maradnak. Nincs rollout, Daily/timer update, éles DB/Auth/provider művelet, paid hívás vagy window/admission/budget módosítás.

**Build sikeres:** 2026-10-25 17:09:16–17:22:40 CET, tényleges image `sha256:39cc940eec749a8bcd8131976f37caa19219f61a3defb277da174993a34919a2`, új tag `alterward:contabo-7038ae727c00`. A builder eltávolítva, a source tiszta exact main, minden tracked bájt Githez ellenőrzött, az eredeti konténerek változatlanok. A friss 5,11 GiB memória, eredeti age 1.1.1 fájl/link/hash és publikus buildfingerprint egyezett. Source archive SHA-256: `5cc65957d819301efc2ce13c93a43de22bfbc860b26e1086d7b4a6bce98f13d6`; Git-bundle: `0c137e0b920665eb7f5cbfb2dcf85c2e20c3796aeb62050499b5c3daf4c2a778`. Az új izolált próba eredménye lent; V9-4 PARTIAL, V9-5 PENDING.


**Új próba sikertelen:** 2026-10-25 19:03:57–19:33:01 CET (29 perc 4 másodperc), exit 1. Nem készült fixture proof vagy success receipt. Az új privát failure receipt a pontos `7038ae7` source/image és `f67b5bbcf18ea78b2f33e764c9916d08b6366d801437cc06aff0c868e012b7e1` rehearsal bundle mellett `AssertionError` típust és a `scripts/ops/contabo-funded-fixture-engine.py:1223` forráshelyet őrizte meg. Ez a `checks['foreign']` ellenőrzése; a részállapotok továbbra nem jelentik a 16 check sikerét. A régi c3e futás hibája ebből utólag nem bizonyítható.

**Lokalizált fixture-hiba — [#87](https://github.com/Muzsy/future_flow/issues/87):** az induló `all_before` a valódi owner projektet kizáró `foreign_state()` eredménye, a későbbi ellenőrzés viszont a nonce fixture-re átállított PROJECT mellett fut. Így ugyanaz a változatlan valódi owner stack az első halmazból kimarad, a másodikban szerepel. Üres CI-hoston ez rejtve maradt. A helyi javítás a teljes eredeti konténerállapotot rögzíti, a futás közben kizárólag a fix nonce fixture szerepeit és a kötelező sentinel konténert veszi ki az összehasonlításból; takarítás után semmit nem zár ki. Az eredeti owner/idegen konténer eltűnése, újraindulása, cseréje, új konténer vagy hiányzó sentinel továbbra hibát okoz; eredeti konténer nem maszkolható fixture-ként. A production `foreign_state()` változatlan.

A forrásvizsgálat egy kapcsolódó, ebben a futásban **nem aktiválódott** cleanup-határt is feltárt: a korai setup-hiba még a PROJECT átállítása előtt történhet, ezért az ambient `project_ids()` a valódi owner szerepeire mutathatna. A javítás a takarítandó ID-ket is explicit, formailag ellenőrzött nonce fixture projektből olvassa; más projektnevet elutasít. A törlési, image/source/authority és sikerbizonyíték-kapuk nem lazulnak. Új forrás saját CI-je és független review-ja szükséges, új célgépes próba ebből a változásból még nem futott.

**Végső állapot, 19:33:25 CET:** mind a tíz eredeti konténer image/restart/status/start-time értéke egyezik a baseline-nal; API/web healthy, worker running, a source tiszta `7038ae7`, az image változatlan. Az outer konténerek/hálózat és scratch hiányát külön readback igazolta. A régi backup státusza zöld. A régi monitor 19:30:37 CET státusza viszont `ok=false`, `monitor_operation_failed`; oka nincs lokalizálva, ez nem tekinthető egészséges monitorbizonyítéknak. Nem indítottunk monitort és nem módosítottunk Daily/timer konfigurációt. Paid AI-hívás 0; nincs rollout, éles DB/Auth/provider vagy window/admission/budget változás. Új vak futás nem indul; a fixture-javítás és a monitor külön tisztázása következik.

**Megőrzött új evidence:** a privát `artifacts/image-rehearsal-failure.json` SHA-256 `ccb5e8c2de3b50cecc5be486261c512940450c7b801a190c0eb6369235a243a6`; `artifacts/rehearsal-result.json` `2e5e17a80a7d2a4d79227ed4fd2ecebcdd42b83dd1a03de85e05b9d6584dea82`; a teljes failure export `175a5a1cd489785702d37e608ed76bd40b60641389bdac9b0d7e60242b905379`; a végső read-only receipt `402d2e899b0afbc15f35a1527d5989a625106e6584715a116853ccfacc51343a`. Az export bájtjai/hash-ei ellenőrzöttek, 0700/0600 privát helyen; nincs nyers diagnosztika vagy credential a repóban. Ezek nem audit-PASS vagy release proof.

**Helyi #87 ellenőrzés:** 6 új, nem privilegizált regresszió PASS; teljes Python 426 teszt / 415 PASS + 11 környezeti SKIP. A tesztek valódi snapshot-/projektfilter-függvényeket használnak szintetikus Docker-válaszokkal; meglévő owner/idegen workload, scope-váltás, restart/eltűnés/csere/új konténer, sentinel és baseline-maszkolás, ambient PROJECT-től független nonce-lekérdezés, teljes cleanup-összehasonlítás és a PROJECT-patch előtti setup-hiba eredeti konténereket megőrző takarítása ellenőrzött. A teljes felfedezés első körében a tesztmock egy később újratöltött modulnévhez kapcsolódott; ezt a megtartott függvények tényleges globális névterének mockolására javítottuk. A végső teljes kör zöld; a funded upgrade/replay/Access Node-contractok 10/10 PASS. `pnpm docs:check`, `pnpm format:check`, `git diff --check` PASS. Saját CI és független review még külön kapu; új célgépes futás nincs.


## Javított fixture célgépes próbája a #88 után — 2026-10-25

A tulajdonos külön jóváhagyta a #88 `f7217d76a9e37eb290ff5f0e9097abc45211c5ac` jelöltjének merge commit alapú beolvasztását, majd a main saját sikeres CI-je után egy új image építését és egy friss izolált próbát. A teljes hatfájlos diff független review-ja APPROVE, actionable finding nélkül; a reviewer saját 6 regressziója és teljes Python 415 PASS/11 SKIP köre, diff-checkje zöld. A jelölt [CI40222451176](https://github.com/Muzsy/future_flow/actions/runs/40222451176) Verify+Container SUCCESS, mindkét tényleges Docker-próbával. Ez forrásreview/CI, nem végső operátori audit vagy célgépes PASS.

Merge: `adf2b951b3f8f584a34007570d3560e08f7fae81`; szülők `7038ae7` és `f7217d7`; tree `3c2ce2c15a374b0c9900f4409077efdb418e4823`, a reviewzott jelölttel egyező. A [main saját CI40223702770 futása](https://github.com/Muzsy/future_flow/actions/runs/40223702770) Verify+Container SUCCESS. Új, pontos forrású archive/Git-bundle és 0700/0600 privát operátori csomag: `.local/verification/target-image-adf2b95-20261025/`. A javítás nélküli két korábbi image és összes receipt változatlanul megmarad; új tag/output és tényleges immutable image kell. A fő munkakönyvtár saját/untracked fájljait nem módosítottuk.

Az engedélyezett határ változatlan: friss kapacitás/eszköz/publikus-buildparaméter ellenőrzés, ugyanaz a dedikált 2 GiB/1 CPU buildkorlát, új tiszta exact-main checkout, egy standalone szintetikus próba és független cleanup/eredeti-konténer readback. Hiba esetén diagnózis és megállás, nincs vak ismétlés. Nincs alkalmazás-rollout, Daily/timer update, éles DB/Auth/provider vagy budget/window/admission módosítás, fizetős AI-hívás. V9-4 PARTIAL, V9-5 PENDING marad.

A #88 review idején 2026-10-25 19:47:54 CET read-only ellenőrzés: 10 eredeti konténer, API/web healthy, worker running, source/image változatlan, outer próbaerőforrások eltűntek. A régi monitor 19:46:00 CET időzített futása beavatkozás nélkül `ok=true`, üres alerts; a korábbi 19:30:37 hiba megmarad ismeretlen okú megfigyelésként. Privát readback SHA-256: `aad491468b3444008a76be42744d1a7fc0a524aee21ae95b67d4840940f11284`. Ez nem Daily v4 vagy v9 release proof.

**Célgépes építés előfeltételei:** friss 5,03 GiB elérhető memória, az eredeti age 1.1.1 binárisok/linkek/hash-ek és publikus buildfingerprint egyeznek. Nem készült új eszközlink vagy package install. A main CI sikerét tényleges GET alapján külön privát receipt rögzíti; a hash-kötött új csomag feltöltése után elindult a dedikált 2 GiB/1 CPU image-build. A tényleges build eredménye lent; fixture PASS ekkor még nincs.

**Új build sikeres:** 2026-10-25 20:11:12–20:24:28 CET (13 perc 16 másodperc), immutable image `sha256:7c8d337d4d4b4228b553d774bacf78c7fa3ab8fa86097905a22f65d7c8fa5dce`, új tag `alterward:contabo-adf2b951b3f8`. A builder eltávolítva, eredeti konténerállapot egyező; a külön main checkout tiszta, minden tracked bájt a kiválasztott committed forrással egyező. Source archive SHA-256: `ad40c4814455d685f3590988499b3645aca611b416c8b4bf82c38948b7826b0b`; Git-bundle: `5a6b01b07a97b90408d7b47cc308777c75220af1fc6b450bfc2a5c4e7613bed7`. A friss izolált próba teljes eredménye lent szerepel.


**Tényleges célgépes próba PASS:** 2026-10-25 20:25:08–20:52:25 CET (27 perc 17 másodperc), exit 0. Mind a **16 check igaz**, a `foreign` is: `success`, `stale`, `postcheck`, `interruption`, `locks`, `reservations`, `leases`, `incompatibleRecovery`, `foreign`, `fundedState`, `artifactRestore`, `privacyReplay`, `frozenPolicies`, `expiredPreparationArchive`, `probeCleanup`, `fundedReplayProof`. Létrejött az eredeti committed standalone CLI saját `funded-upgrade-fixture-proof.json` és `image-rehearsal-receipt.json` fájlja. Mindkettő a fenti `adf2b95` source-hoz és `sha256:7c8d337d…c8fa5dce` tényleges image-hez kötött, az image target és recovery szerepben azonos. A rehearsal source-bundle SHA-256 `00e810c25627dfba7c9b1b0d26c8036381552827fa5dff0421a2cd69ee5ba407`; ez a release-kód/contract bundle, nem a külön Git-bundle hash-e.

**Utóellenőrzés:** mind a tíz eredeti konténer teljes ID/image/restart/status/start-time snapshotja egyezik a próba előtti állapottal. Az outer konténerek/hálózat és a scratch hiányát külön visszaolvastuk; API/web healthy, worker running. A builder korábban eltávolítva, a célgépes source továbbra tiszta `adf2b95`, az image változatlan. A két eredeti timer active/waiting; backup service success/0. A régi monitor 20:46:05 CET, tehát a teszt közbeni státusza `container_state_changed`, a 20:55:10 CET readbackben service exit 1; ez nem jelölhető zöldnek. Az eredeti konténerek külön összehasonlítása zöld. A monitorjelzés összhangban állhat a próbakonténerek cseréjével, de az okot ez nem bizonyítja, a korábbi generic monitorhibát sem magyarázza visszamenőleg. A következő rendes időzített futás olvasással ellenőrizhető; monitorindítás, reset-failed, timer- vagy Daily-módosítás nem történt.

**Privát export külön rendezése:** az első exportáló segéd saját kiegészítő `final-readback.json` fájlja 0644 móddal készült a 0700 munkakönyvtáron belül, ezért a strict export helyesen megállt. Minden committed CLI által írt teszt/proof fájl eleve 0600 volt. Külön metadata-readback után csak az új saját kiegészítő fájl eredeti root-owned regular/nlink1 és védett parent/inode/hash kötését ellenőriztük, majd fd-alapú chmoddal 0600-ra szigorítottuk; tartalma változatlan (`b41e3bfaace5001800b49709450512a6bbbe102757d978247c24aec9ccc704da`). Az első hibareceipt megmaradt, új 077 umaskos v2 export és külön reconciliation receipt készült. Nem futott újabb build vagy teszt, és a teszt eredményét/proofját nem írtuk át. Mind a 16 exportált artifact bájtja és hash-e, a source/image/bundle, fixture→receipt hash-kötés, a 16 check és a konténerbaseline helyben ismét ellenőrzött, 0700/0600 evidence-ben tárolt.

| Új privát evidence | SHA-256 |
| --- | --- |
| `funded-upgrade-fixture-proof.json` | `949588cf102ad12bb66cd94130a4ae82bd2dbd1c376e8b40044afad1e4dccda1` |
| `image-rehearsal-receipt.json` | `e8b5d1a0276b2c76fabe11f37784eb4c9c7638406ccd8bcb665206bae1434708` |
| `rehearsal-result.json` | `d32d9f267a75beb435198706210a3efffd4d44b79d9b0845aee853bf129337d3` |
| `final-readback-v2.json` | `1edb512289f5b9858a070fde0af82bed8e5453638dd2e1f2e54d9af28760ea71` |
| Teljes v2 export | `55710d52350f9d0933c3e105480cbb016879d18fc71f22718385e5e11b1964e9` |
| 20:53:32 CET read-only source/image/service/monitor receipt | `8d4e67e79abdacedbd52d5bc9895820b43029d88381feb8df05f782edc784517` |

**Lezárt részkapu:** #76 tényleges image-fixture producer és #85 build/próba teljesült. A két régi sikertelen futás bizonyítékai megmaradnak; a régi c3e hibát nem állítjuk utólag diagnosztizáltnak. Paid AI-hívás 0. V9-4 továbbra **PARTIAL**, V9-5 **PENDING**: telepített Daily v4/private monitor, éles forrásból friss titkosított backup/offsite és izolált restore/privacy replay, aktuális DB/drain/Access/Auth/reader megfigyelés, végső exact-source operátori audit, valamint a #77 kohorsz/window/admission/keret még külön kiadási tétel. A fixture host/Auth/systemd install seamek szintetikusak; ez nem production átállás, éles DB-restaurálás vagy paid/user E2E. Következő konkrét munka a Daily v4/backup/restore műveleti csomag előkészítése és eredeti privát inputjainak ellenőrzése. A v9 C5 motor, a futó app és a költség/authority nem változott.

**Rendes monitorfutás utáni ellenőrzés — 21:01:04 CET:** a telepített régi monitor 21:00:57 CET időzített futása beavatkozás nélkül `ok=true`, üres alerts. Az API/web továbbra healthy, worker running, 10 eredeti konténer; a source tiszta `adf2b95`, az image/proof/receipt változatlan, outer próbaerőforrások hiányoznak. A privát read-only receipt SHA-256 `00f42e986be0cce0e9bef416ea4417463f285bc080ed1a00fbe126e4b21c8cbe`. A korábbi riasztásokat ez nem törli és okukat nem bizonyítja; nincs manual monitor/reset-failed/timer vagy install művelet. Ez a régi monitor aktuális zöldje, nem a még telepítendő Daily v4 kiadási kapuja.


## Daily v4 műveleti csomag előkészítése — #90, 2026-10-25

Az alábbi előkészítési pillanatkép megőrzött történet; a jóváhagyott végrehajtás az [eredményszakaszban](#daily-v4-végrehajtás-és-visszaellenőrzés--90-2026-10-25) lezárt.

**Előkészítéskori engedélyhatár (történeti állapot):** a tulajdonos ekkor az előkészítést engedélyezte. Az alábbi felmérés csak olvasás: nincs timer/service/config módosítás, CLI action, archívumtörlés, backup/restore végrehajtás, DB/Auth/provider művelet vagy paid hívás. Az eredeti backup identity csak a meglévő, hash-ellenőrzött `age-keygen -y` memóriabeli bemeneteként, eredeti pinned SSH-n került felhasználásra; nem írtuk ki vagy másoltuk fájlba. A visszatérő eredmény csak recipient-egyezés. Privát evidence: `.local/verification/daily-v4-preflight-20261025/`, 0700/0600. Kilenc eredeti kliensreceipt külön privát másolatban megőrzött; az eredetiek változatlanok, secretet és archívumot nem másoltunk.

### Friss előfeltételek és talált hiány

| Ellenőrzés | 2026-10-25 21:08–21:11 CET eredmény |
| --- | --- |
| Eredeti Linux operátor | `/home/muszy/alterward-linux-operator`, 0700/saját tulajdonos, tiszta `main`, `0b57f7f316945ab97ee61985b569e6b56e5a6c8d`; nincs local job lock. Node 24.22.1. Az `adf2b95` mainre fast-forward lehetséges; még nem történt meg. |
| Eredeti privát inputok | Prepare/update-proof, backup-tool-versions, operator-config és eredeti SSH/pin/backup identity megvan, regular/0600/nlink1, védett ancestorok. A backup identity címzettje a szerver configjával egyezik. |
| Telepített forrás | `0b57f7f`; mindhárom script a configgal és az eredeti update-prooffal egyezik, a négy unit is pontosan egyezik a config/proof hash-eivel. |
| Jelölt | A már reviewzott és saját zöld CI-jű `adf2b951b3f8f584a34007570d3560e08f7fae81`. Új `contabo-daily.py` hash `23407b5ce01f8f48bd550eb6380f72a8b152a0a358ffd8090e2832ec5ab562cb`; backup_lib és daily_entry hash változatlan. A négy unit bájtja/hash-e is változatlan; az installer mind a négyet kötötten kezeli. |
| Változatlan config | Retention, recipient, PostgreSQL image és team domain a jelölttel pontosan egyezik; csak a source/script/unit metadata változhat. Pinned PostgreSQL image elérhető. |
| Timer/service | Mindkét timer enabled+active/waiting, a két service inactive, success/0. Mentés 03:15 UTC, monitor negyedóránként, a meglévő random delay mellett. |
| Erőforrások | Kb. 5,04 GiB szabad RAM, 69,05 GiB szabad szerverlemez; a restore munkakönyvtár üres tmpfs, kb. 792 MiB szabad hellyel, a 384 MiB guard felett. Nincs pending backup könyvtár. |
| Konténerek | Mind a tíz eredeti konténer teljes ID/image/restart/status/start-time snapshotja egyezik a sikeres image-próba utáni állapottal. Kilenc fut, egy eredetileg is álló; a kilences running számláló nem konténervesztés. |
| Szerveres mentés | Öt managed mentés, legújabb 2026-10-25 03:15:59 UTC; összes ciphertext kb. 6,62 MiB, legnagyobb fájl kb. 1,28 MiB. Backup/monitor zöld a régi forráson. A régi restore-record október 13-i, az új source aktiválási proofjának nem használható. |
| Linux offsite hiány | A kanonikus kliensmappában **19 managed archívum, mind 7 napnál régebbi**, a legújabb október 13-i; összesen kb. 24,58 MiB. Nincs friss helyi példány, nincs idegen/pending bejegyzés; kb. 49,70 GiB szabad hely. Másik gépen lévő példány ebből nem igazolt. |
| Rollback-archívum | Az új `previous-adf2b95…` még nem létezik; a régi `previous-0b57f7f…` már létezik. Ezért a fordított `--update` a régi commitra nem tekinthető kész rollbacknek: az archívum létrehozása ütközne, régi archívumot nem törlünk/írunk felül. |

A 19 helyi archívum mind a 38 ciphertext-fájljának mérete/SHA-256-ja egyezik a saját manifesttel, a fájllista pontos, a fájlok regular/0600/nlink1/saját tulajdonosúak; a read-only ellenőrzés receiptje `de70e528b1eae5a8b001a2cb6a80430108bc25f6ab6312023745c6f72ae996ad`. A kliens bármely normál Daily action előtt lefuttatja az `expireLocal` retenciót; a szerveres `status/inventory` pedig `clean_pending` műveletet is végezhet. Emiatt a felméréshez nem hívtuk a CLI `--status` ágát. A végrehajtandó csomagban az első `--sync` a jóváhagyott hétnapos szabály szerint eltávolíthatja a 19 lejárt managed **backup-archívumot**; az eredeti proof/evidence másolatokat nem. A változatlan szerveren lévő öt frissebb mentést hash-kötötten letölti. A sikertelen régi tesztek bizonyítékai ettől külön megmaradnak. Új retention-szabály vagy jövőbeli offsite-automatizálás nem készül ebből hallgatólagosan; a rendszeres offsite-futtatási rend a béta operátori átadásának nyitott része.

### Előkészített végrehajtási sorrend — az előkészítéskor még nem futott

1. **Friss ellenőrzés, régi offsite pótlása:** a változatlan eredeti, tiszta operátori checkoutból `node scripts/contabo-daily.mjs --sync`, explicit eredeti `ALTERWARD_SSH_SECRETS_DIR` mellett. A helyi hétnapos retenció és az öt szerveres managed másolat átvétele a konkrét műveleti csomag része. A friss sync-proof és ciphertext-hash-ek nélkül nincs timerleállítás. Deferred/lock vagy részleges letöltés nem siker.
2. **Pontos új kliensforrás:** a jóváhagyott `adf2b95` Git-bundle fetch külön remote refbe, majd a tiszta privát main `git merge --ff-only adf2b951b3f8f584a34007570d3560e08f7fae81`; minden tracked bájt és a CLI/függőségek committed hash-e ellenőrzött. Nincs reset, untracked overwrite, új dependency/credential vagy titokmásolás. A fő future_flow munkakönyvtár érintetlen.
3. **Szűk műveleti ablak:** eredeti script/unit/config/input egyezés és friss kapacitás ismételt ellenőrzése; `--disable` kizárólag a két saját timert kapcsolja ki. Mindkét service legyen inaktív. A futó alkalmazás nincs leállítva; a backup/monitor időzítése szünetel. Kezdéskor és végén saját+idegen konténerbaseline szükséges.
4. **Daily update:** `--update` a kiválasztott mainből; eredeti previousScriptHashes és változatlan immutable config mellett. Nyolc eredeti fájlt (három script, config és négy unit) új, 0700 `previous-<adf2b95 teljes SHA>` könyvtárban őriz; atomic/fsync csere és daemon-reload. Update-proof source/script/unit hash és konténeregyezés ellenőrzendő. Nincs alkalmazás-update, új window/budget/cohort vagy DB-migráció.
5. **Friss lánc:** `--backup` → `--sync` → `--restore-latest` → `--monitor`. A mentés az éles alkalmazási forrásból TLS-ellenőrzött read-only snapshot; a visszatöltés külön izolált, nem publikus PostgreSQL célba kerül, az éles DB-be nem ír. Kötelező a friss új-source manifest és offsite hash, ciphertext-tamper elutasítás, config/adapt/validate és táblák/adatok egyezése, memory-backed plaintext/key scratch és saját konténerek takarítása. Új provider/paid worker nem indul. Az új source és a jelenlegi runtime értelmezése nem írja át a régi authorityt.
6. **Időzítés visszakapcsolása:** csak a szerver által rögzített, legfeljebb hatórás és a legújabb backup runId/hash/source/unit kötésével egyező restore, friss backup/monitor és változatlan runtime után `--activate`. A proofkapu nem kerülhető meg közvetlen `systemctl enable` paranccsal. Végső readonly config/scripts/units/timer/monitor és eredeti tíz konténer összehasonlítás; a proofok az új eredményekkel együtt privátan megőrzendők.

Ez nem mért kiesési időígéret: a backup unit felső futásideje 360 s, a monitoré 120 s, a transporté/restore-é külön korlát van. A monitorozási szünet csak a 3–6. pont; az alkalmazás működik. Bármely hiba vagy drift megállítja a következő lépést; nincs vak újrafuttatás vagy régi proof átírása.

### Hibahatár és szűk visszaállítás

Az installer a fájlcsere közbeni kivételnél az eredeti nyolc fájl visszaállítását és daemon-reloadot kísérli meg. Ez nem garantált teljes rollback: a frissítés utáni konténer-egyezési hiba és a későbbi backup/restore hibája kívül esik ezen. A régi commitra fordított `--update` a létező `previous-0b57f7f…` miatt nem járható, és az archívum törlése nem megoldás.

Szükség esetén a műveleti csomag szűk rendezése: a két timer kikapcsolva, service-k inaktívak; job.lock és owner activation.lock mellett kizárólag az új `previous-adf2b95…` nyolc, eredeti hash-hez ellenőrzött regular/0600/nlink1 fájlja állítható vissza az eredeti script/config és négy unit útvonalra, atomic/fsync cserével, majd daemon-reload és teljes régi config/script/unit/konténer readback. Más fájl, archívum, alkalmazás vagy DB nem célozható. Utána a visszaállított forráshoz **új** backup/offsite/izolált restore/monitor lánc kell a normál `--activate` előtt; a régi októberi restore nem frissíthető dátumátírással. Ha az eredeti hash-kötés, lock, jogosultság, aktuális fájlazonosság vagy konténerbaseline nem igazolható, megállás és új operátori döntés szükséges, a timerek nem kapcsolhatók vissza bypassszal. Ilyenkor az alkalmazás változatlanul fut, a monitoring/backup szünetét külön jelezni kell. A kézi nyolcfájlos rendezés eljárás, nem új automatikusan kipróbált rollback-tool vagy előre kiadott PASS.

**Bizonyíték és ellenőrzés:** 37/37 Daily Python teszt, 21/21 Node archive-retention/Linux-operator teszt PASS; ezek szintetikus, nem új célgépes backup/restore próbák. A read-only előfeltétel-receipt SHA-256 `a7d95fb88a582ce49c5ccdd9d4cf18ce6b520815602013817b344a87bf3cc59e`; teljes konténeregyezés és ciphertext-méret receipt `6b196311d8a6e82de40ac84650e50310d1eb22a5f4e78c09a04e7da560c81465`; helyi offsite-inventory `d0f7356c7b567768dd848f84ab88f12fca762cb023c18eac68c644f6352e7ecb`; megőrzött kilenc kliensreceipt manifest `8ac8cfa78f45fd5b7463f151aae6c21eb09082445e35b269a0eb407fbb2461ad`. A műveleti csomag végrehajtása külön tulajdonosi jóváhagyást kér a timer/service/fájl/retenció/backup/restore hatások miatt. V9-4 PARTIAL, V9-5 PENDING; app apply és paid E2E nincs e csomagban.


## Daily v4 végrehajtás és visszaellenőrzés — #90, 2026-10-25

**Teljesült részkapu:** a tulajdonos a fenti konkrét csomagot külön jóváhagyta, beleértve a hétnapos retenciót és szükség esetén a szűk nyolcfájlos rendezést. A teljes lánc elsőre sikerült; visszaállításra nem volt szükség. A telepített Daily és az eredeti privát Linux kliens forrása **`adf2b951b3f8f584a34007570d3560e08f7fae81`**; a dokumentációs branch későbbi commitja nem runtime-proof forrás.

| Művelet | Tényleges eredmény, CET |
| --- | --- |
| Régi-source offsite sync | 21:28:58–21:29:11: öt friss szerveres archívum átvéve és hash-ellenőrizve; 19 lejárt helyi managed backup eltávolítva a meglévő hétnapos szabállyal. A `.expiry-journal` megőrzött retenciós metadata, nem hatodik backup. A helyi összesítés első könyvtárszámlálását ennek megfelelően javítottuk; sync/proof nem futott újra. |
| Privát kliens | Tiszta main fast-forward az eredeti Git-bundle-ből; mind az 1243 tracked fájl committed bájtja és az eredeti privát inputok változatlansága ellenőrzött. A fő munkakönyvtár érintetlen. |
| Timerpause és update | Disable 21:31:53–21:31:56; update 21:32:02–21:32:06 PASS. Új `previous-adf2b95…` nyolcfájlos archívum, eredeti régi script/unit hash-egyezéssel. Változatlan immutable config és recipient; új daily script hash a jelölttel egyezik. |
| Friss backup és offsite | Backup 21:32:14–21:32:29 PASS; sync 21:32:42–21:32:45 PASS. Az új-source mentés read-only/TLS snapshotból; összesen hat helyi archívum, mind a tizenkét ciphertext mérete/SHA-256-ja és védett fájlmetadata ellenőrzött. |
| Izolált restore | 21:32:58–21:33:53 PASS ugyanabból a legújabb, offsite hash-kötött runból. **97 tábla és az adatok egyeznek**, sérült ciphertext elutasítva, config visszaállítás és proxy adapt/validate sikeres. Egy tranzakcióban végzett izolált restore, éles DB-írás nélkül; identity csak memóriában, ideiglenes konténer/plaintext eltávolítva. |
| Monitor és aktiválás | Monitor 21:33:59–21:34:06 PASS, üres alerts; normál proof-bound activate 21:34:12–21:34:15 PASS. Nem közvetlen systemctl bypass. |
| Független végső readback | 21:34:21: source/config/scripts/units egyeznek, a nyolc régi fájl megőrzött és hash-kötött. Mindkét timer enabled+active/waiting, mindkét service inactive/success/0; következő backup október 26. 04:15:34 CET, monitor 21:45:20 CET. Mind a tíz eredeti konténer ID/image/restart/status/start-time állapota változatlan (kilenc fut, egy korábban is állt), API/web healthy, worker running. Nincs pending backup, restore tmpfs üres. |

A backup/monitor időzítés szünete kb. **2 perc 22 másodperc** volt a disable kezdetétől az activate végéig; az alkalmazás végig futott. Ez egyszeri mért eredmény, nem jövőbeli időígéret. Fizetős AI-hívás **0**, app-rollout/restart, éles DB-visszatöltés/migráció, új authority/window/budget/cohort/admission nem történt. A régi proofok, korábbi sikertelen próbák és retenciós journal megőrzöttek.

### Végrehajtási bizonyítékok

Privát, 0700/0600 evidence: `.local/verification/daily-v4-run-adf2b95-20261025/`; eredeti action-outputok, intentek, friss proofok és külön végső readback. A nyers backup-, adat- és credentialtartalom nem része a repónak.

| Proof | SHA-256 |
| --- | --- |
| `pre-sync` | `cad782b61bb162710f27c9553fb46f353ad49c9f3265c19745bfa0ddd911d6cd` |
| `disable` | `4ead2aab8625d45c0464b9c3b9195f94706f116296635b971876b8e6d9ba9a29` |
| `update` | `c4054f5100182a216f7a03ea16295e85d6d93c725ce27cd49201115a1ae1c5b0` |
| `backup` | `f768a01711b0ee225003df26da69ee44c25b5f98727454f4c458ce6b871588c4` |
| `post-sync` | `8d2b1fbfac9d14a44681a22e074fb3882e9f4de456cbf6586f685e8ebf5d81fe` |
| `restore` | `96dda6821afc943d16adc2b0ba3caa2e9f34583c2bb5fc2a403fb5377abd729d` |
| `monitor` | `895a687971e9aa8a65801ffba92483dd14e33accd1a2b81ed793211ad5dffd1e` |
| `activate` | `c2de1aeb1a6c7fcae4383455eb3370e81dc6c15b5e111b4cebe04f81aadd622f` |
| Végső readback | `2a08c8a3b836d1d017e31863fb720b31857756225668275b76a0e4d918ce99e4` |
| Lánc-egyeztetés | `503a6f8ba338f93c4c871e5a98b226bce4c29a3f2ada1d5027adcc7c02c6d76b` |

**További kapuk:** #90 műveleti csomag kész, de V9-4 **PARTIAL**, V9-5 **PENDING**. Következő a friss, csak olvasó DB/drain/Access/Auth/reader felmérés és az exact-source operátori audit előkészítése; éles apply külön döntés. A Daily restore a jelenlegi production forrást igazolja, nem bizonyít automatikusan minden v9 migrációs/privacy/funded replay vagy tesztelői E2E kaput. #77 kohorsz/window/admission/keret, a rendszeres Linux offsite-futtatás operátori rendje és az alkalmazás béta átállítása továbbra külön nyitott tétel. Új automatizálást ez az egyszeri sync nem hozott létre.


## Contabo telepítési felmérés és 036-os kiinduló állapot — 2026-10-26

**Aktív sorrend:** a tulajdonos az alkalmazás technikai Contabo-telepítését kérte előbb, új résztvevő és új költségkeret nélkül. A #77/#91 keretváltó fejlesztés külön drafton marad, nem feltétele ennek a telepítési csomagnak. A felmérés eredménye még nem apply-engedély vagy kész release audit.

### Friss, csak olvasó célgépes eredmény

2026-10-26 01:03–01:13 CET körül eredeti SSH-key/pin mellett: az API és web healthy, worker running; mind a tíz eredeti konténer ID/image/restart/status/start-time állapota egyezik a korábbi baseline-nal. A két Daily timer enabled+active/waiting, a service-k success/0; a legutóbbi monitor új-source zöld. Telepített Daily exact `adf2b95`, script/unit hash-egyezés; pending backup nincs, restore tmpfs üres. A futó alkalmazás továbbra `827d72a`, image `sha256:0a58ee4e…fcd2527e`, legacy és üres narratív cohort. Az `adf2b95` elkészült target image és tiszta source továbbra elérhető; a main változatlan adf, saját CI40223702770 SUCCESS. Funded-upgrade preparation/journal még nincs.

A futó API-ban végzett Node/pg megfigyelés TLS/CA/hostname és pinned DB-identity ellenőrzött, REPEATABLE READ READ ONLY tranzakció. Hat queue pending/lease számlálója, running draft/generating branch és rendezetlen reservation számlálója mind nulla. Az eredeti egy technikai funded account Auth/email/UUID kötése valid; ez nem újonnan kiválasztott bétatesztelő. A worker tényleges allowlist/window/cap értékei a védett configgal egyeznek, az eredeti négy runtime-fájl változatlan és a terms-hash az eredeti prepare-hoz kötött. A korábbi API-env alapú általános window-egyezés false volt, mert a window worker-only, a budget pedig decimal-normalizált; a külön, tényleges worker/config/eredeti fájlok vizsgálata igazolta az egyezést. Nem változtattunk értéket az egyezés érdekében.

**Konkrét blokkoló:** az éles adatbázis **001–036**, nem 037. Mind a 36 migráció neve/checksumja a committed migrációs runner `hash(sql)` értékével egyezik. A 854 oszlopos 036-os séma, valamint constraints/index/default/function/trigger/policy/sequence/rule/custom-type digestje a kizárólag verziózott 001–036 SQL-ből, izolált PGlite-on előállított baseline-nal egyezik. Az elvárt fingerprintet nem az éles DB-ből vettük át. Az eddigi funded upgrade csak 037/038-at fogadott el; ezért az `adf2b95` image korábbi 16-check PASS-a önmagában nem teszi végrehajthatóvá a jelenlegi éles átállást.

**Access-hiány rendezve, 01:37 CET:** a tulajdonos megadta a meglévő hitelesítés privát fájlját. A meglévő account-token verify aktív, az alkalmazáslista GET pontosan egy Alterward self-hosted appot talált. A kiadási eszköz változatlan `readFundedAccess` olvasója app/organization/policy GET után PASS: két explicit email, támogatott szűk policy-alak. Az eredeti Linux operátor védett secrets könyvtárában új, 0600 `cloudflare-access-read.json` input készült; a forrás credential tartalma változatlan, fájljogát 0664-ről 0600-ra szűkítettük. Nincs új token, Cloudflare-policy vagy távoli állapotmódosítás. A személyes lista/token/account-azonosítók privátak. Ez pillanatfelvétel: prepare/apply/recover előtt továbbra friss, legfeljebb 900 s-os megfigyelés kell.

### Célzott javítás — a #34 telepítési scope-ja

A `codex/funded-pre036-upgrade` külön branch az adf-kódú #89 dokumentációs ágából indul; a #91 successor-kódját nem tartalmazza. Dedikált, hardcoded 036-os funded schema/security entry point készült. A normál recovery továbbra kizárólag 038-at fogad el, a meglévő 037 és 038 baseline változatlan. Nincs caller által megadható expected catalog, új migráció vagy elfogadott tetszőleges korábbi séma.

A funded migrátor ugyanazon tranzakció és advisory lock alatt alkalmazza a hiányzó, checksum-ellenőrzött **037 + 038** forráslépést. A 037 a meglévő Shared tagsághoz subscriber defaultot/korlátot/indexet ad, nem kapcsolja be a Shared funkciót; a 038 nullable artifact oszlop. A 036-os adat-összehasonlítás a leendő `entitlement_mode=subscriber` mezőt explicit várható defaultként vetíti, így a migráció előtti és utáni teljes sorhash összevethető. A 037/038-ból induló meglévő entitlement értékek teljesen védettek; új sponsored_guest érték vagy más sor-/költség-/history-változás nem maszkolható. Hibára mindkét DDL és migrációs receipt visszagördül.

A valódi PostgreSQL/root/image CI-fixture alapját 036-ra állítottuk, hogy a következő saját CI a ténylegesen feltárt kiinduló verzió útját járja be. A régi 037 → 038 unit-mátrix megmarad. Helyi eredmény: **5 új + 10 meglévő funded DB teszt PASS**, teljes Python **426 teszt / 415 PASS + 11 környezeti SKIP**, 10 Node funded/replay/Access contract PASS; scripts TypeScript PASS. A PGlite-adaptert a több statementes 037 DDL-hez pg simple-protocol szemantikával (`exec`) illesztettük; a forrás SQL-t nem daraboljuk vagy írjuk át. Nincs helyi root/Docker PASS vagy éles migráció.

**Kiadási következmény:** a javítás saját exact-source review/CI-t, majd jóváhagyott main forrásból új image-et és ugyanahhoz kötött célgépes bizonyítékot igényel. Az adf image/Daily/restore proofjai megmaradnak, nem címkézhetők át a javításra. Az új source-hoz kötött Daily és candidate utáni mentés/restore kapu az alkalmazás tényleges átállítása előtt ellenőrzendő; a korábbi backup visszamenőleg nem lesz új candidate-proof. A jelen felmérésben nem történt service/timer/config/DB módosítás, build, új konténer, paid/provider hívás vagy új ablak/admission.

### Privát bizonyíték

0700/0600: `.local/verification/contabo-release-preflight-20261026/`. Szerveres readback SHA-256 `6d7dcbecc3b95e3125e791ffa84c69be8a05d601da369f29410146a843f244c9`; DB/catalog v2 `dd771c4e14db8a13aae0e6be3925c0cc8eae07ae5519119d98a444d2a45e8840`; worker/eredeti runtime egyezés `d864d448b84d929e47af637ba9df3570170e4ef65dddf69699fe1f78644da998`; izolált 036/037/038 baseline-manifest `19b0293ce3b0338496fb7bdbdd781b16d7ff43c6dedea0491bdfac9adafe03e3`. Az első read-only segéd nem betöltött Python-modul importjánál megállt; külön v2-ben a committed literal OWNER útvonal AST-olvasása váltotta ki a kódimportot. Az eredeti kérés/hiba megőrzött, a sikeres v2 külön receipt. A nyers Auth-, provider-, DB- vagy host-credential nem kerül a repóba.


### #92 forrásellenőrzés és következő konkrét csomag

A `91e6da5ae3165deae94947ddae429ea170b65f90` kódjelölt [CI40248511217](https://github.com/Muzsy/future_flow/actions/runs/40248511217) Verify és Container jobja SUCCESS, a tényleges izolált image/root/PostgreSQL fixture 036-ról indulva is sikeres. A külön, csak olvasó reviewer a `7fadc002` → `91e6da5` diffre **APPROVE**, nincs actionable finding; saját 4 tesztfájl / 36 teszt és diff-check PASS. A reviewer nem futtatott éles kapcsolatot vagy helyi root image-próbát. Ez forrásreview, nem végső operátori audit vagy apply-felhatalmazás. A jelen dokumentációs követés nem változtatja a reviewzott runtime-kódot.

Az Access snapshot `2026-10-26T00:37:52.179Z` időpontú, konfigurációdigestje `c6e7b381d9773de4f1efa14a8940ee837186af3b24d41db1da54f9caf0bba153`; a privát `access-snapshot.json` fájl SHA-256: `e671eb0a94ffc279fe3a3281ac558d9d0601368c5f751d87f62176be3b9104f5`. A GET-only token/app ellenőrzés külön privát receiptben megmaradt; secret nem kerül a repóba, image-be vagy SSH-ra. A forrásfile megadásából nem következik tokenrotáció vagy új jogosultság engedélyezése.

Következő engedélyezhető művelet: a teljes main-célú #92 jelölt merge committal történő beolvasztása, saját zöld main CI után új, tiszta privát exact-main checkout és image építése a korábbi 2 GiB/1 CPU korláttal, majd egy új, izolált szintetikus standalone próba és teljes cleanup/eredeti konténer readback. Korábbi evidence megmarad. Ez még nem alkalmazás-rollout, Daily/timer frissítés, éles DB-migráció, paid hívás vagy új window/admission. A későbbi source-bound Daily/candidate-backup/restore és végső apply külön konkrét kapu.


## #92 main és új célgépes image — 2026-10-26

A tulajdonos a #92 merge-jét és az új image izolált próbáját „Csinálhatod” válasszal engedélyezte. Az aktuális `992095b` jelölt teljes main-célú független review-ja APPROVE; saját [CI40250405238](https://github.com/Muzsy/future_flow/actions/runs/40250405238) Verify+Container SUCCESS. A merge commit **`6d17fda5aee4c958d90ed3102630da9aea80f728`**, szülők `adf2b951` és `992095b`; tree `9e2bf92ea177e4493c26011b46b871c481d072ef`, pontosan a jóváhagyott jelölt fája. Saját [main CI40251518673](https://github.com/Muzsy/future_flow/actions/runs/40251518673) Verify+Container SUCCESS, tényleges izolált image-próbákkal. A #89 dokumentációs története is integrálódott; #91 successor-kódja nincs benne.

### Korlátozott build — PASS

Az új, tiszta main-forrásból épített image: **`sha256:d85a92f72e33606825032e3399507181657e45cdf71236e8f93430af0381d60e`**, tag `alterward:contabo-6d17fda5aee4`; source `/root/alterward-ops/target/build-6d17fda5aee4-ac8196e8/source`. A build 2026-10-26 **01:05:53–01:18:05 UTC / 02:05:53–02:18:05 CET**, kb. 12m12s. Dedikált 2 GiB memória/swap és 1 CPU, nyilvános port nélkül; a builder eltávolítva. Mind az összes tracked forrásbájt, a main branch/HEAD és a tiszta checkout ellenőrzött. Kizárólag verziózott forrás és az eredeti publikus buildértékek kerültek át; DB/provider credential nincs a buildben.

A build után friss readonly mérés: 5,04 GiB elérhető memória, 68,23 GiB szabad lemez, pinned PostgreSQL és eredeti age1.1.1 elérhető. **Mind a tíz eredeti konténer ID/image/restart/status/start-time állapota egyezik a korábbi baseline-nal**, tehát a korábban álló tizedik konténer is védett. Az engedély nem alkalmazás-rollout, Daily/timer update, éles migráció, paid hívás vagy új window/admission; ezek nem történtek.

Az első privát előkészítő kérésben régi relatív work-directory név maradt. A `mkdir` FileExistsErrorral még a build/inputátadás előtt megállt, a meglévő könyvtárhoz nem nyúlt. A külön `prepare-v2.py` kizárólag az új kiválasztott útvonalat javította, utána a kapacitás/eszköz/publikus-input ellenőrzés PASS. Az első kérés és hibareceipt megmarad; nem sikertelen image-próba vagy éles változtatás. A friss export segéd 0077 umaskkal hozza létre a későbbi fájljait, hogy ne kelljen az előző menet metadata-only javítását megismételni.

### Izolált standalone próba — PASS

A fenti immutable image tényleges, új outputkönyvtáras próbája **2026-10-26 01:18:41–01:47:05 UTC / 02:18:41–02:47:05 CET**, **28m24s**, exit0; **16/16 check és cleanup PASS**. Exact036 kiindulásról a hiányzó037+038 út, image-only legacy/üres cohort, stale/postcheck/interruption/lock/reservation/lease/recovery, privacy/artifact/frozen-policy/funded replay, expired preparation és probe cleanup ellenőrzött. Target és recovery azonos új image, providerkulcs nélkül, paid0. A helyi külön ellenőrzés a teljes source/image/bundle kötést, mind a 16 true checket, fixture→receipt hash-t és a tíz eredeti konténer baseline-egyezését igazolta. A régi adf receipt megmarad, nem helyettesíti ezt a futást.

A külön, 01:48:33 UTC readback: API/web healthy, worker running; tíz eredeti konténer ID/image/restart/status/start-time egyezik a korábbi adf utáni baseline-nal. Tiszta exact-main source és tényleges új image ID egyezik; az izolált külső konténerek, hálózat és scratch eltávolítva. Nincs Daily/timer update, alkalmazás-rollout, éles DB-írás vagy új authority/window/admission. A régi Daily monitor 01:46:13 UTC-kor, még a próba alatt `container_state_changed` jelzést rögzített; ezt megőrizzük, nem jelöljük zöldnek. A következő rendes timerfutás 03:00:13 CET; kézi monitorindítás/reset vagy timerátállítás nincs.

Privát evidence: `.local/verification/target-image-pre036-20261026/`, eredeti request/response, külön buildsummary, exportált eredeti artifactok és helyi egyeztetés 0700/0600 védelemmel. A jóváhagyott 703-fájlos runtime bundle SHA-256: `d1bd4890bbba959aa47a16d703a70a6bb528a21e0b6d00d7a5e179884d24a8d3`.

| Új bizonyíték | SHA-256 |
| --- | --- |
| Tényleges image fixture | `cee35cf63b4eb29e76e2846924a3dac2b3c88ce5061aeae04d3d2f9da8450114` |
| Image rehearsal receipt | `d7c2c93a7a5d405147aa750c1a9b78ca67e5356513cb9b494600e9eccdbdfa14` |

| Build proof | `20800e670d18df81ce27159b0b2ad63b15cdc4f2a47bd7ed4b0c6cfb614ebc8f` |
| Próba utáni teljes readback | `4141f08112751be06ffc0dab9feccfe23c509b74d40d5ee7fe9534e9bdd84db4` |
| Független helyi hash-egyeztetés | `4608f156c3803a79f9577723b08de21ae8c0d4f3fef54d338a3ad801064a21f0` |

Az eredeti védett Linux operátor továbbra tiszta adf main, nem frissítettük hallgatólagosan. Eredeti CI-read credentialje a kiválasztott main saját sikeres futását GET-tel visszaigazolta. Az offsite-könyvtár hat archívumának mind a tizenkét ciphertext hash-e egyezik; 01:50:56 UTC-kor lejárt archívum0, a legrégebbi mentés október19.03:15:33 UTC. A meglévő hétnapos retenció csak a későbbi rendes műveleti csomag engedélyezett végrehajtásakor futhat; az akkori lejárt darabszám friss mérés tárgya. E felmérés nem hívott CLI status/sync/retention ágat, semmit nem törölt.


### Következő éles műveleti csomag — előkészítve, nem végrehajtva

A következő engedély tárgya a fenti **`6d17fda` / `sha256:d85a92f7…0381d60e`** konkrét kiadás. A kiválasztás csak `target` és `recovery` mezőt tartalmaz: nincs benne opcionális narrative `runtime`. Tehát az image/source frissülne és az exact036 DB a meglévő037+038 migrációval038-ra lépne; a régi legacy mód/üres cohort, a résztvevők, az eredeti budget/window/terms és minden korábbi történet/elszámolás változatlan maradna. C5-cohort bekapcsolása, #77/#91 új10USD ablak, új felhasználó és paid E2E külön későbbi tétel.

1. **Friss read-only kapuk:** exact source/image/CI, hostkapacitás, eredeti tíz konténer, telepített Daily/hash/timerek, eredeti authority/négy aktív fájl; TLS/CA/DB identity, checksummed036 catalog, Auth/reader/Access, üres queue/lease/reservation/drain. A prepare/apply saját megfigyelése továbbra kötelező, korábbi pillanatfelvétel nem frissíthető át. Eltérésre nincs rollout.
2. **Eredeti kliens és Daily source:** a védett Linux operátor tiszta mainjének ff-only frissítése a jóváhagyott6d17fda bundle-ből, minden tracked bájt ellenőrzésével. Eredeti credential/pin/backup identity marad. Csak a két saját timer szünetel; normál Daily `--update`, a nyolc régi fájl külön `previous-6d17fda…` archívumával. Source/helper/unit/config/recipient és a szűk visszaállítási alap visszaolvasása kötelező. Az alkalmazás ekkor még változatlanul fut.
3. **Egyetlen új candidate:** a külön privát release/audit/actual-fixture inputok validálása után normál `--prepare` az eredeti funded authorityból. Új target/recovery fájlok és immutable preparation, legfeljebb900s érvényesség; még nincs éles migráció vagy app-stop. Félkész állapotot nem törlünk, elutasítást nem kerülünk meg.
4. **Candidate utáni tényleges mentés:** backup → offsite sync → izolált restore ugyanahhoz a legújabb runhoz. Ciphertext/config/összes tábla/adat egyezés, tamper/fence/TLS/cleanup; az aktuális candidate fájlhash-ei szerepelnek az archívumban. Restore-proof kizárólag a tényleges runId/preparedSha/image/fixture kötésből készülhet. A normál kliens hétnapos managed-backup retenciója az engedély része kell legyen; a lejárt készletet a végrehajtáskor újra mérjük, eredeti proofokat/hibareceipteket nem törlünk.
5. **Feltételes apply:** csak a teljes, friss és változatlan kapulánc után normál `--apply`. Az alkalmazás három saját konténere kontrolláltan cserélődne; a migráció a meglévő tranzakció/advisory lock alatt, teljes védett adat/elszámolás-egyezéssel. Hoston más projekt, Access-policy, provider-konfiguráció vagy költségkeret nem változhat. Részleges transitionnél kizárólag az eredeti candidate és azonos forrás/image auditált `--recover` útja jöhet szóba; nincs régi image-re erőltetés vagy éles DB-visszatöltés. Biztonságos folytatás hiányában a megőrzött állapotnál megállunk.
6. **Zárás:** tényleges source/image/env/network/DB/data/authority readback, health és monitor, normál proof-bound timeraktiválás, majd végső eredeti/idegen workload ellenőrzés és repo-dokumentáció. Paid AI-hívás0; új bétaablak/tesztelő/admission nincs ebben a csomagban.

Ez a műveleti terv nem már kiadott apply-felhatalmazás. Az eddigi jóváhagyás a #92 merge-jére, a fenti buildre és izolált próbára szólt; új engedély nélkül a telepített Daily/client, a futó app és az éles DB nem módosul.


### Záró rendes monitor és validált privát csomag

A külön **2026-10-26 06:31:32 UTC / 07:31:32 CET** readback mind a tíz eredeti konténer változatlanságát, API/web healthy és worker running állapotot, a tiszta6d17fda source/new-image egyezését és az izolált külső konténer/hálózat hiányát ismét igazolta. Az akkor legfrissebb **06:30:08 UTC / 07:30:08 CET rendes monitor zöld, alerts[]**, a **03:15:52 UTC / 04:15:52 CET ütemezett backup sikeres**. Kézi monitortrigger, reset, timer vagy service művelet nem történt. Ez a külön későbbi megfigyelés zárja a próba alatt rögzített jelzést; nem állítunk nem olvasott02:00UTC futásra eredményt, az eredeti piros receipt megmarad. A normál mentés továbbra a telepített adf forrásé, nem az új, még nem létező candidate mentése.

A privát release-packet elkészült, és a változatlan committed `releaseEvidence()` elfogadta a valós CI GET, source/image/bundle/fixture/receipt és a tényleges független review operátori értelmezése mellett. A source-audit finding kritikus/magas/közepes0; ez nem új éles apply-engedély. A kiválasztás két szerepe ugyanaz az immutable image, opcionális narrative `runtime` nélkül. A külön auditértelmezés rögzíti a teljes adf→992095b független APPROVE review-t, 36/36 regressziót és az ezzel azonos merge tree-t; a régi adf image-proofot nem használja újként. A packet csak a privát evidence-könyvtárban van, az eredeti védett Linux operátor továbbra adf/tiszta main. Tényleges candidate/preparation és új restore run még nincs, így ilyen proof sem készülhetett.

Záró ütemezett readback SHA-256: `00d317904e700f075f30217ca1eb9afaee0a8e6b48defe7a602af96dca94a8bb`.

Privát release-input validálás SHA-256: `0ca59d28f03675504248c901cf61d328e20b20e9e4b2d14cdc130f45e4252953`.

A záráskori helyi readonly retenciós felmérés: 6 meglevő offsite-archívum, ebből 1 lejárt a hétnapos szabály szerint; ebben a munkában semmit nem töröltünk. A későbbi engedélyezett normál Daily-kliens ezt a managed archívumot eltávolíthatja, az eredeti proof/hibareceipt megőrzése mellett. Az aktuális készletet a végrehajtás előtt ismét ellenőrizni kell.
