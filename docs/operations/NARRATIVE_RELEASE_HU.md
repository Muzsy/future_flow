---
status: active-supporting
owner: operations
last_reviewed: 2026-10-16
related:
  - NARRATIVE_EVALUATION_HU.md
  - LINUX_OPERATOR_HU.md
  - ../PERSONAL_BETA_OPERATOR_HU.md
  - ../CONTABO_PRIVACY_RESTORE_PLAN_HU.md
---

# Narrative-v1 kiadás: konkrét előkészítés és fennmaradó kapuk

Ez N09 előkészítés, **nem apply engedély vagy kiadási bizonyíték**. N00–N07 és a withheld actor follow-up fejlesztési főágon kész; a fizetett/független emberi N08 mérés még kötelező. Production állapotból e dokumentum nem készít új állítást, nem olvas privát operátori fájlt és nem módosít receipteket.

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
