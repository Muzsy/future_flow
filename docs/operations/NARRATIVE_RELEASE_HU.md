---
status: active-supporting
owner: operations
last_reviewed: 2026-10-19
related:
  - NARRATIVE_EVALUATION_HU.md
  - LINUX_OPERATOR_HU.md
  - ../PERSONAL_BETA_OPERATOR_HU.md
  - ../CONTABO_PRIVACY_RESTORE_PLAN_HU.md
---

# Személyes narratív és fikciós kiadás: előkészítés és fennmaradó kapuk

Ez N09 előkészítés, **nem apply engedély vagy kiadási bizonyíték**. N00–N07 és a withheld actor follow-up fejlesztési főágon kész; a fizetett/független emberi N08 mérés még kötelező. Production állapotból e dokumentum nem készít új állítást, nem olvas privát operátori fájlt és nem módosít receipteket.

## Aktuális v6 bizonyíték és költési határ — 2026-10-18

PR #50 mért checkpointként beolvadt (`f755a57`, production nélkül) / quality2.5, mért forráscb8b539 (CI340 SUCCESS); későbbi docs-only56062a8 CI341 SUCCESS. Legutóbbi friss B:15/18 elfogadott, alkotói8+fork és munkahelyi6; munkahelyi7–8/fork hiányzik, a következő author teljes előfoglalását budget guard állította meg API előtt. Nincs teljes kétprofilos vagy emberi PASS. V6 összesen22.7396675/23 USD, maradék0.2603325 USD; eredeti globális ledger652/33.4716975 USD, kumulatív plafon33.732030 USD. Minden unknown teljes foglalása megtartva, aktív/hozzárendeletlen0. Új paid futás nem indul. A korábbi keret- és eredményszakaszok dátumhoz/forráshoz kötött történeti checkpointok, nem mai engedélyek. [Aktuális státusz](../STATUS_HU.md), [részletes v6 terv](../plans/045_fiction_v6_earned_life_evolution.md).

## Zárt narratív béta: javasolt kapurend — vázlat, 2026-10-19

**Státusz: javaslat, tulajdonosi jóváhagyásra vár.** Amíg a tulajdonos nem fogadja el, az alábbi staging-sorrend 1. pontja (teljes paid+human N08 PASS) érvényes. A javaslat nem rollout-engedély, nem módosít ablakot, keretet, cohortot vagy production állapotot.

Kérdés: kiadható-e az új narratív pipeline egy kis, zárt tesztelői körnek úgy, hogy az irodalmi minőség még nem végleges, és a valódi használat adja a béta-visszajelzést.

**Visszajelzéssel nem helyettesíthető kapuk** (változatlanok): Linux funded-runtime upgrade (Issue #34); 038 migráció kompatibilis alkalmazás- és recovery image-dzsel, titkosított backup, izolált restore és privacy replay; a runtime határidő és request-envelope kifejezett beállítása; drain és legacy visszaállás; explicit cohort és költségkeret; éles post-check és külön apply engedély. Ezek adat-, költség- és működési biztonságot védenek, nem irodalmi minőséget.

**Zárt bétában helyettesíthető kapuk** (javaslat):

- A teljes kétprofilos, 18 célos paid benchmark helyett a már mért, forráshoz kötött checkpoint (v6 vagy a később kiválasztott jelölt Stage A+B eredménye) és a minden fejezetre futó szerveres gépi minőségkapuk. A kapuk küszöbei nem lazulnak; elutasított fejezet nem jut el az olvasóhoz.
- A független emberi sorozatértékelés helyett a tesztelők saját, valódi életének értékelése: fejezetenkénti alkalmazáson belüli visszajelzés és egy rövid kérdőív a 3. és a 6. fejezet után (lent). Ez valódi emberi bizonyíték, de nem vak összehasonlítás, ezért nyilvános vagy fizetős kiadásra nem elegendő.
- Árazás, csomag, billing és latency-SLA nem feltétele a zárt, előre keretezett bétának; a mért latency és fejezetköltség a béta eredménye.

**Javasolt kiadandó verzió:** a v7, amely mért checkpointként, élesítés nélkül beolvadt a mainbe (PR #51, `466ed29`); ha a v8 jelölt a N09 munka lezárásáig fizetősen mért és jobb, kiadás előtt arra váltunk. A verzióválasztás az N09 folyamatát nem változtatja meg.

**Tulajdonosi döntést igénylő nyitott pont — költségkeret:** a futó kód a zárt béta windowját legfeljebb 2 USD projekt- és 0,50 USD felhasználói keretre és pontosan 30 napra korlátozza (`packages/database/src/ai-budget.ts` `DatabaseAiBudget`, a Linux operátori receipt-ellenőrzés `scripts/contabo-personal-beta.mjs` és a személyes policy). A legutóbbi mérés minden próbálkozással kb. 0,43 USD-t adott elfogadott fejezetenként, így a jelenlegi keret tesztelőnként kb. egy fejezetre elég. Magasabb keret külön, kifejezett termék- és költségdöntés, a hozzá tartozó kód-, teszt- és runbook-módosítással; ez a vázlat nem emeli.

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

A korábbi compose ezeket nem adta át, ezért a cohort productionben nem volt bekapcsolható, és a narratív jobok a 100000 bájtos envelope-pal futottak volna. A tulajdonosi owner-konfiguráció ellenőrzése (`validate_owner_configuration`) nem-legacy módot vagy nem üres cohortot elutasít. A compose változása miatt a következő éles frissítés már nem tisztán image-only: az N09 funded-runtime upgrade-nek ezeket a kulcsokat a fenti defaultokkal kell elfogadnia, minden más funded env-bájt változatlansága mellett. Konkrét éles értéket csak a külön jóváhagyott N09 apply állíthat be.

## Kiadási manifest, csak igazolt értékekkel

A kiadáskor rögzítendő: pontos clean main SHA; Verify és Container CI run+SHA; audit scope+sourceSHA+eredmény; build proof és immutable image digest; actual root/Linux fixture proof ugyanazon source/helper hash-ekkel; target schema/catalog fingerprint; 038 előtt és után friss titkosított backup/offsite hash és izolált restore+privacy replay proof; engedélyezett upgrade útvonal; runtime/env/Access/CA/network/proxy/cost/window/reader baseline hash; cohort explicit Auth UUID-lista privát operátori inputként; rövid érvényességű prepare, lock/journal/post-check/recovery igazolás. A hiányzó image digest vagy target proof nem helyettesíthető szöveges „kész” értékkel.

## Sémakompatibilitás

`database/migrations/038_narrative_artifacts.sql` egy nullable `aw_periods.narrative_artifact` JSONB oszlopot ad, default/index/backfill nélkül. Tényleges migrációt csak reviewed recovery/upgrade eljárás végezhet. A 001–038 izolált fejlesztési fingerprint: columns 856 / 37519bd15ef5d42b9ea1ef6486dc00a3ddf43582c589d718a01355701de1b31c. A pontos source guard az authority; kézi hash-javítás tiltott. A kapcsolódó executable catalog és privát éles readback egyezése szükséges.

**Régi pre-038 recovery image az új séma ellen zár.** Nem módosítunk guardot azért, hogy elfogadja az ismeretlen oszlopot. Előbb kompatibilis recovery/replay image és annak audit/restore próbája kell, utána új séma. A helyi regressziós próba backupban tárolt narrative artifact és később törölt life/account prune-ját vizsgálja, nem valódi hosztolt restore-proof.

## Linux és az aktív funded béta

A `LINUX_OPERATOR_HU.md` kifejezetten reader/funded/daily/writer-fence portot ad; owner-image deployment és scheduler-migráció nem része. A `scripts/contabo-owner-upgrade.mjs` win32-ra és original-zero tulajdonosi image-only állapotra kötött. A `scripts/ops/contabo-personal-beta.py` reader/original image baseline-ból indított funded átmenetet ellenőriz. Ezek egyike sem jogosít fel a már aktív funded window alatt schema+image+cohort átírására.

Következő külön implementációs csomag szükséges: kanonikus Linux **funded-runtime upgrade**. Meg kell tartania az aktuális window kezdő/vég időpontját, összes és user keretet, ledger/reservation/usage összegét, napi/concurrent limitet, reader/access/CA/hostpint, jelenlegi worker-fence-t és idegen konténereket. A támogatott transition, rollback és candidate schema/recovery páros explicit szerződés legyen; existing receipt hand-edit vagy initial activation újrajátszása tiltott. Source audit, target fixture és CI kapuit ugyanazon candidate SHA-n kell igazolni. A feladatot az [Issue #34](https://github.com/Muzsy/future_flow/issues/34) követi; külön PR-ben készül, nem ezen benchmark scriptből végzett SSH művelet.

## Izolált staging sorrend

1. Teljes N08 paid+human release gate PASS, a költség/idő plafon tulajdonosi döntése rögzített.
2. Kompatibilis alkalmazás- és recovery image ugyanahhoz a reviewed source-hoz, builder/CI digest readback. Független source audit nem helyettesíthető szerzői összefoglalóval.
3. Szintetikus staging 001–037 DB-ről 038 apply; old legacy chapter olvasás, új narrative nullable export/DTO és négyhívásos commit, quality stop/retry, fork és privacy withheld regresszió. További, titokmentes staging credential és költés engedélye külön szükséges, ha valódi provider része a próba.
4. Encrypted backupból izolált 001–038 restore, aktuális deletion/revocation replay, catalog guard és consumer API ellenőrzés; hálózat/publikált port és production AI nélkül. Failed replay esetén kiszolgálás zárt marad.
5. Aktív funded-runtime fixture: sikeres image csere, hibás post-check, megszakadt apply, competing lock, slot/reservation megőrzés, ismert inkompatibilis rollback elutasítása, sikeres recovery. Eredeti window/ledger before/after byte/logical comparison kötelező.
6. Csak ezután konkrét éles prepare csomag és külön apply jóváhagyás, rövid lejáratú friss target readbackkel.

## Drain és visszatérés legacy módba

A `NARRATIVE_MODE=legacy`/üres cohort csak az **új queue** policy-ját változtatja. A már snapshotolt narrative-v1 job továbbra narrative-v1-ként dispatcholhat; ezért flag-off önmagában nem drain. A kanonikus writer-fence/pause után queue és folyamatban lévő reservation/lease állapotát fel kell mérni, a bound ready jobot engedélyezett free commit útvonalon befejezni, minden más jobot a reviewed recovery/cancel eljárás szerint rendezni. Canon/checkpoint/admission count kézzel nem írható át.

Rollbackhez post-038 kompatibilis alkalmazás+recovery image és explicit legacy/default-off konfiguráció szükséges. Az oszlop ismerete önmagában nem elég: a cél- és recovery image-nek a már tárolt artifactok és queue-jobok összes befagyasztott promptverzióját is támogatnia kell, ideértve a planner v1/v2/v3, writer v1/v2/v3 és az új planReviewer marker/report policyt. Egy v3-at nem értő régebbi post-038 image nem automatikusan kompatibilis rollback. A 038 oszlopot és már tárolt artifactot nem töröljük; régi pre-038 API image esetleges `p.*` projekciója sem fogadható el privacy readback nélkül. Régi DB snapshot nem szolgálható automatikusan; aktuális deletion/revocation replay kötelező. Image/config visszaállítás nem nulláz AI költséget vagy windowt.

## Éles post-check

Minden engedélyezett módosítás után visszaolvasni: actual image digest/source, mindhárom saját szolgáltatás health/env, explicit cohort és a nem engedélyezett account legacy útja, Access/CA/anon tiltások, schema/catalog, queue/fence/journal, változatlan window+ledger+limit, exportból/public DTO-ból a privát artifact kizárása. Egy már engedélyezett tesztelő új fejezete csak külön költési engedély és maradék eredeti keret mellett indulhat. A literary minőség kapuját a benchmark igazolja, egy éles smoke nem helyettesíti.

Nyitott kapuk: valódi paid/human benchmark; Linux funded upgrade implementáció/audit; candidate immutable image+Container CI; célgépes migration/recovery/backup/staging proof; explicit éles apply és readback. Ezek lezárásáig narrative-v1 production bekapcsolása tilos.


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
