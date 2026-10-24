---
status: active-supporting
owner: operations
last_reviewed: 2026-10-24
related:
  - NARRATIVE_EVALUATION_HU.md
  - LINUX_OPERATOR_HU.md
  - ../PERSONAL_BETA_OPERATOR_HU.md
  - ../CONTABO_PRIVACY_RESTORE_PLAN_HU.md
---

# Személyes narratív és fikciós kiadás: előkészítés és fennmaradó kapuk

Ez N09 előkészítés, **nem apply engedély vagy kiadási bizonyíték**. N00–N07 és a withheld actor follow-up fejlesztési főágon kész; nyilvános/fizetős kiadáshoz a teljes paid/humán N08 mérés kötelező, zárt bétára a lent rögzített helyettesítő kapurend érvényes. Production állapotból e dokumentum nem készít új állítást, nem olvas privát operátori fájlt és nem módosít receipteket.

## Aktuális végrehajtási keret — 2026-10-23

A fejlesztési főág v8 (`a666c905`), az aktív jelölt v9 C5 (draft #66, implementáció `7bd4d42`), production utolsó igazolt állapota legacy. A review/mérés/integráció/N09/béta függőségeket a [master plan V9-1–V9-5](../DEVELOPMENT_PLAN_HU.md#21-v9-következő-végrehajtási-lépései--2026-10-23), a bizonyítékszinteket a [STATUS](../STATUS_HU.md) foglalja össze. A dátumozott korábbi költségkeretek és források történeti bizonyítékok; nem mai maradékok vagy új futtatási engedélyek. C5 paid méréshez új számszerű approval kell; a `v9-m-20261022` forráskötött engedély nem terjeszthető ki automatikusan.

## Bétafókusz és motorbefagyasztás — 2026-10-24

**Tulajdonosi döntés:** a motor további finomítása helyett a cél annak technikai stabilizálása és a kis zárt béta kiadása. Ez felülírja a C5 mérés után következőnek javasolt history-auditot és kontextuskontrollt. Ezek, az új promptminőségi iterációk, archetípusok és a 048-as fejlesztés DEFERRED. Az alábbi három munkacsomag végrehajtási sorrend; a bizonyítékok hiánya nem indít új, általános motorfejlesztést.

**Befagyasztott alap:** v9 C5 `7bd4d42`, meglévő #67–#68 dokumentációs/mérési checkpointtal. A kiadási jelölt pontos commitja csak #62, #56 és a szükséges technikai javítások integrációja után rögzíthető. A jelenlegi főág v8, ezért még nincs egyesített, kiadásra kész v9 SHA. Az ismert C5 minőségi korlátokat elfogadjuk a zárt béta visszajelzéssel vizsgálandó kockázataként; ez nem általános minőségi PASS. A szerveres minőség- és fidelity-kapuk, az egyjavításos korlát és az elszámolási védelmek megmaradnak.

### 1. Egy kiadási jelölt és a motor technikai lezárása

A függő v9 lánc, a #62 tesztjavítás és a #56 N09 alap először fejlesztői integrációs ágba kerül; `main` merge külön, a konkrét reviewed jelölt alapján történik. A végleges forráson a releváns regressziók, a teljes tesztcsomag, typecheck/build/schema/docs és Verify/Container CI szükséges. Csak a kiadást akadályozó hibát javítjuk; egy újabb novelty-vélemény vagy szebb prózára vonatkozó ötlet önmagában nem nyitja újra a motort.

2026-10-24-i előellenőrzés: `git merge-tree --write-tree --name-only c3bac469da3848147c3811adaa2c34ce785e71f6 86058385515b0d0c0b768e16a30017c9dac92237` három szöveges konfliktust jelez (`docs/DEVELOPMENT_PLAN_HU.md`, `docs/STATUS_HU.md`, e runbook); forráskódkonfliktust nem. A #62 `b39c30a` ugyanezen v9 alaphoz szövegesen tiszta. Ez objektumszintű helyi próba, nem tényleges merge, kompatibilitási teszt vagy CI. A konfliktusoknál a jelenlegi bétafókusz és a régi operátori szerződés szükséges részletei együtt maradjanak meg.

### 2. V9-kompatibilis frissítés és helyreállítás

A közvetlen implementációs feladat a #56 továbbvitele a végleges v9 jelöltre. A `8605838` forrásban a `scripts/lib/funded-runtime.ts` capability-listája v1–v8 fictiont vizsgál, a `scripts/ops/contabo-funded-upgrade.py` 18 policyt vár. A tárolt policy parse önmagában nem v9 runtime/recovery proof. Kötelező a v9 policy, artifact/szereplőállapot és a generációválasztás kezelése a target és recovery oldalon, a régi generációk megtartásával, célzott negatív ellenőrzéssel ismeretlen/inkompatibilis változatra. A compose/env/backup/monitor/fence útvonalnak is ugyanazt a generációt kell megőriznie; a compose jelenleg nem adja át a `NARRATIVE_FICTION_GENERATION` kulcsot.

A #56 runbookjának hat nyitott operátori korlátját rövid release-triage zárja: registry/receipt folytonosság, applied utáni restart, maradék one-off konténer, lejárt preparation, változó CI-metaadat hash és recovery restore-proof frissesség. A biztonságos helyreállítást vagy az igazolható célállapotot blokkoló tételt javítani kell; más tétel csak dokumentált, végrehajtható operátori eljárással maradhat. Nem általános operátori eszközújraírás a cél.

A konkrét runtime timeout/request cap és az ezekből számolt költségfoglalás ellenőrzése a kiadási konfiguráció része. A jelenlegi 100000 bájtos default a mentett javító kérések egy részéhez kevés; a lehetséges 131072 B / 300000 ms beállítás ellenőrizendő jelölt, nem alkalmazott vagy automatikusan jóváhagyott érték. Új irodalmi benchmark helyett a meglévő méretadatok, determinisztikus cap/timeout/budget próbák és az egyesített runtime/recovery fixture adja a technikai bizonyítékot. Titkosított backup, izolált restore/privacy replay, kompatibilis image-digest és drain/rollback próbák kötelezők.

### 3. Tesztelői alapút és kis zárt indulás

Egy kijelölt tesztelővel a tényleges kiadási jelölt útját kell ellenőrizni: belépés → első fejezet → választás mentése → folytatás → új munkamenetből visszatérés/újranyitás → export → visszajelzés. Elutasított generálás, timeout és keretkimerülés esetén is látható, érthető lezárás, konzisztens mentett állapot és helyes elszámolás kell; nincs rejtett újrafuttatás vagy második díj ugyanannak a commitnak a hibás ismétléséből. A meglévő budget/window/admission szabályok érvényesek. A paid lépés csak a konkrét keret és forrás jóváhagyása után indulhat; az előkészítés mock/izolált környezetben végezhető.

A bétaindítást **blokkolja** az adatvesztés/adatvédelmi rés, hibás canon/choice mentés vagy elszámolás, megkerülhető budget/admission, nem működő frissítés/helyreállítás, illetve a fenti alapút ténylegesen reprodukált megakadása. Egy quality-gate elutasítás önmagában nem adatbiztonsági hiba; ismétlődő elutasítás vagy beragadt állapot miatt használhatatlan folytatás viszont működési blokkoló. Az ilyen hibára célzott javítás és érintett regresszió kell, új craft-fejlesztési ciklus helyett.

Az első kijelölt tesztelőn ellenőrzött indulás után a korábban tervezett háromfős kis kör készíthető elő a pontos személyek/ablak/keret rögzítésével. A 2026-10-19-i 10 USD / háromfős terv továbbra tervezési alap, nem új funded aktiválás; a jelenlegi ablakot és költést nem írjuk felül. Feedback fejezetenként, rövid kérdőív a 3. és 6. fejezetnél, monitor és működő leállítás/visszaállás. A béta tapasztalatai döntik el, mely minőségi hibát érdemes később javítani.

**Lezárási szabály:** a három munkacsomag szükséges technikai bizonyítékai után konkrét candidate/cohort/window/budget/apply csomag kerül a tulajdonos elé. A biztonsági kapukat megtartjuk, új teljes paid/humán N08, editor-kalibráció, history-kutatás vagy archetípus nem kerül a zárt béta elé. Nyilvános/fizetős kiadásnak továbbra külön minőségi és termékkapui vannak.

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

`NARRATIVE_FICTION_GENERATION` (api, worker): opcionális kiválasztás, `v8` (alapértelmezés, kulcs nélkül is) vagy `v9` (élő világ, qualityPolicy 2.8.0). A `v9` csak `narrative-fiction-v2` módban érvényes, minden más érték vagy mód indításkor `NARRATIVE_CONFIG_INVALID`. A deploy compose **nem** adja át és az éles env nem kapja meg; a v9 bekapcsolása külön tulajdonosi döntés és N09-sorrend (b) szerint a Linux-helyreállítás ismerete után lehetséges. Egy v9 történet nem folytatható v8 konfigurációval (a szereplőállapot csendes befagyása helyett `NARRATIVE_CONTEXT_INVALID`). **Kérésméret-plafon:** az éles `AI_FICTION_MAX_REQUEST_BYTES` alapértelmezése 100 000 bájt. A v8 valódi prose-only repair kérése is 108 751 bájt volt (ezt a guard blokkolta), a v9 mért többlete ehhez jön (planner +8,4 KiB, author és csomagjavítás +13,4–13,6 KiB 8 releváns szereplőnél; review/fidelity/editor +0,3–0,5 KiB, mert csak a projection hash-ét kapják), ezért v9-hez (és v8-hoz is, ha a repair él) a worker értéke legalább kb. 131 072 legyen (megengedett tartomány 100000–196608); a végső szám a 5. fázis valós mérése után. **Ismert, jelölt állapot, nem tűrés:** a 100 000-es alapértéket a v8 (108 751 B, 2026-10-19) és a v9 (116 336 B, a v9-6b ch1 javító author kérése, 2026-10-20, helyi Codex-futás, nyers bájt) valódi javító kérése is átlépi. Az `tests/fiction-v9-request-bytes.test.ts` ezt rögzíti (`RECORDED_REAL_REPAIR_REQUEST_BYTES`), és a mock legrosszabb csomagjavítását a tulajdonosra váró `REQUIRED_PROD_REQUEST_CAP_PENDING_OWNER = 131072` értékhez méri, nem a 100 000-hez; az alapérték emelésekor a teszt és ez a pont együtt felülvizsgálandó. Az éles érték és a compose ebben a változtatásban nem módosul, a tulajdonosi/N09 döntés része, a release előtt.

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
