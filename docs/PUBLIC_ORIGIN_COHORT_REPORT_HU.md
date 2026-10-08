# alterward — P13 nyilvános eredetű életek operatív kohorszriportja

2026-10-08 · 2026-10-08T15:05:17.691Z

[Dokumentáció](README.md) · [Eredeti nyilvános mérés](PUBLIC_ACTIVITY_METRICS_REPORT_HU.md) · [Személyes AI-minőség](PERSONAL_SCENARIO_AI_QUALITY_REPORT_HU.md) · [Teljes terv](NEXT_STEPS.md)

## Elkészült első P13 mérési szelet

A sikeres személyes életlétrehozás és az első, második, harmadik sikeres saját periódus külön összesíthető az eredeti indítás UTC-napjához és három csatornához kötve: Official public checkpoint, Community public checkpoint, Official personal Scenario. A riportban csak nap/csatorna és egész darabszám szerepel. Nem kerül bele owner/user/life/branch/publication/reading ID, public slug, profil, pénzügy, canon, történetszöveg, referrer vagy provideradat. Nincs új anonim statisztikai API, publikus rangsor vagy browser-tracker.

A riport a már létező 034/036 startrekordokból és az aw_history/aw_periods/aw_jobs operatív adataiból egyetlen konzisztens SELECT snapshotban készül; új migráció vagy gyűjtött esemény nincs. A startreceipt újrapróbálása egy tartós life-origin sor, ezért nem növeli a darabszámot. Csak active saját account szerepel. A queued/running/failed job, a puszta checkpoint/kezdeti choice és a saját történeti forkba másolt fejezet nem sikeres saját periódus. Periódust csak az eredeti indító branchhez, ugyanazon user/life-hoz, history pozícióhoz és completed, azonos periodId-jű jobhoz kötve számolunk. Második/harmadik szinthez az összes korábbi szint is szükséges. A külön saját historical child branch további fejezetei ebben a szűk riportban nem emelik az eredeti branch folytatását.

A három completion-szám a startkohorsz mára elért állapota, nem a kohorsz napján befejezett fejezetek mennyisége. A közeli kohorszok még érhetnek. Egy saját account több élete több indítás: ez nem unique-user, visszatérés vagy emberi retention. A riportból nem számolunk olvasó→fork/referral-konverziót; nincs bizonyított kapcsolat egy konkrét anonim olvasással, clickkel vagy későbbi belépési sessionnel. A P08 saját session- és folytatási mérés külön megmarad.

## Törlés és visszakövethetőség határa

A report scope explicit surviving_active_owner_lives_original_branch. A source publication withdrawal/deletion nem törli az önálló saját életet; a leválasztott privát origin továbbra számolható a megőrzött csatorna szerint, nincs foreign tartalom-visszaolvasás. A saját owner deleting állapota már kizárás, life/account fizikai cascade pedig eltávolítja a rekordot. Így a később újrakért korábbi kohorszszám csökkenhet. Ez a még létező operatív adatok pillanatnyi összesítése, nem törlésálló, végleges historikus analytics ledger. A report exportált fájlja korábbi pillanatkép; védett helyi tárolás, későbbi report-retention az ops/privacy kapu része.

A meglévő privát RLS/REVOKE marad; a DB-operator CLI nem nyit új kliensjogot. Az eredeti public-metrics-1 hét anonim signalja és 028 immutable SQL változatlan. A normál PUBLIC_METRICS_ENABLED flag inaktív marad; e read-only report meglévő operatív rekordokból dolgozik, nem aktivál event-gyűjtést vagy AI-budgetet.

## Használat és szigorú szerződés

`pnpm metrics:public:origins` alapból az utolsó 30 UTC-napot olvassa. `pnpm metrics:public:origins 90` külön 90 napos ablakot kér; 1–90 egész nap engedett. Ismeretlen querymező, szöveges/fractional szám és tartományon kívüli érték már SQL előtt tiltott. Új public-origin-metrics-1 query/report JSON-sémák; strict DTO, maximum 270 nap/csatorna sor, dátumtartomány, sorrend/duplikátum és created≥first≥second≥third részhalmaz ellenőrzés. Konzol csak saját védett fájlnevet, kohorsz-sorszámot és nulla write/AI metadatát mutat.

A teljes riport a védett .local/public-origin-metrics/summary.json fájlban van. Nincs admin felületi nyilvános statisztika; a sikeres létrehozás vagy completed job mérése nem helyettesíti a generált szöveg külön kánon/minőség/auditori kapuját.

## Bizonyíték

Öt új PGlite teszt: SQL előtti bounds + valódi UTC eltérő session-timezone mellett; három valódi repository startcsatorna/replay egyszer és normál élet kizárása; completed-job és eredeti branch-kötés, child-fork/missing-first téves completion tiltása; source detachment/deleting/cascade; strict aggregate és eredeti hét signal változatlansága. A budget/job rekordok report előtt/után azonosak. Az első célzott futás egy hibás tesztfeltételezést fogott: a review-fixture-eknek már volt hat technikai budget reservation sora. Az elvárt üres ledger helyett a tényleges előtte/utána azonosságot ellenőrizzük, a runtime nem módosult emiatt.

Teljes helyi format/type/test/build: **655 teszt / 61 fájl**, production build sikeres. **167 JSON-séma**, a korábbi 165 és 001–036 byte szerint változatlan. Külön izolált valódi PostgreSQL container-proof kiegészítés a parallel public-start egyszeri countot, eredeti első három periódust/cascade-et és a source-deletion után folytató személyes Scenario kohorszát is ellenőrzi; e szelet saját verify/container CI-je külön kapu. A megelőző [b839ecb3 Scenario CI](https://github.com/Muzsy/future_flow/actions/runs/37793699905) verify/container sikeres: 650/60/165, 001–036 és ismétlés, verified HTTPS/DB TLS/worker-stop, 0 paid AI/actual credential, tiltott network egress.

Tényleges fejlesztői Supabase read-only query és CLI 1/30/90 napra sikeres, CA-val ellenőrzött kliens TLS; mindhárom provider/seed napló változatlan. A tisztított staging adatban jelenleg nulla élő ilyen kohorsz van: a korábbi próbák saját accountjai ténylegesen törölve. Ez a native SQL/DTO ellenőrzése, nem már megfigyelt béta-konverzió vagy használói kohorsz. Új fizetett AI e riporthoz 0; a külön személyes quality-próba költsége saját jelentésben van.

## Következő sorrend

P13-ban külön additív, DNT/GPC-t és rövid reading TTL-t tisztelő fork-click, sikeres create/first-period attribution és referral/read→start kohorszkapu következik. A jelenlegi hét signal nem bővül csendben, a meglévő 028 és szerződések nem írhatók át. Bot-/Sybil-/ranking határt és mérési definíciót előre kell rögzíteni; report megjelenésből nem lesz automatikus Most Forked/Trending. Pozitív UI, P11/Shared retention/régi személyes próza, backup/restore/email/ops, operator-email, tíz tényleges béta-user UUID és teljes webhely-zárás, Contabo-indulás megmarad. P01–P13 és Shared S0–S7 kombinált eredeti terv változatlan, a teljes nyilvános kínálat béta utáni bővítés.
