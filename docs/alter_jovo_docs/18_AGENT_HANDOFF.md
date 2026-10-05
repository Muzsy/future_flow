# alterward — fejlesztői átadás

**Aktuális állapot (2026-10-04):** P01–P05 privát v2 mag kész; valódi Auth/AI HTTP- és böngészős próba, export, Auth/DB-törlés és kontrollált megszakításból recovery sikeres. P07 új angol minta Sonnet auditja és P08 privát feedback/session-mérés kész; használói minőség kiadás után mérendő. Kizárólag angol indulás, magyar elrejtve. P09 tulajdonosi előnézeti alap, AI-pre-screen és szerkeszthető privát Privacy/Content Preview kész; fizetett scan-job, publishing/Discovery/Official seed/public fork tervezett. [Közös státusz és bizonyíték](../STATUS_HU.md), [indulási döntés](../ENGLISH_RELEASE_PLAN_HU.md). [Contabo-előkészítés](../CONTABO_PREPARATION_REPORT_HU.md) és teljes izolált web/API/worker/proxy CI sikeres; éles deploy, backup/restore, valós DB-kiesésből recovery és email-kézbesítés még nyitott.

**Shared állapot:** S0–S2 és S3 személyes/time/Connections/safety/privacy implementált; teljes kétfiókos Auth/Shared AI/saját AI/export/törlés/recovery sikeres. 001–013 alkalmazva, normál Shared flag-ek false. Nyers/backup-retention, régi személyes próza, billing/grace/deadline és friend release még kapu; P09–P13 és S4–S7 megmarad. [Aktuális bizonyíték](../SHARED_CONTEXT_S3_PRIVACY_AUTH_REPORT_HU.md).

2026-10-05 · [Dokumentációs központ](../README.md), [állapot](../STATUS_HU.md), [backlog](../NEXT_STEPS.md). Következő helyben: **P09 fizetett scan-job költségőrrel és curator/Publication/Confirm alap**, az elkészült S0–S2 alapra. P06 backup/restore/valós DB-kiesés és Contabo-ops későbbi kiadási kapu; P09–P13 public szál megmarad.

## Kiindulás és feladat

V2 12 lépéses angol onboarding (HU elrejtve), valódi AI hat hónap, choice/folytatás/történeti fork, memória/javítás és költségőr integrált. V1 archívum megmarad. [Riport](../V2_IMPLEMENTATION_REPORT_HU.md).

P01–P05 technikai mag kész, Supabase 001–014 alkalmazva. P06 valódi Auth/AI HTTP-próba és törlés kész, UI-bizonyíték az aktuális riportban; backup/restore és valós DB-kiesésből recovery nyitott; P07 új angol minta AI-auditja és P08 feedback/session-műszerezés kész; valódi használói béta még nincs. Nyilvános aktiválás még nem engedhető kész kapuk nélkül.

## Kötelező keretek

1. Terméknév alterward, repó `Muzsy/future_flow`, **main** ág; belső legacy azonosítókat ne cserélj indok nélkül.
2. Valódi OpenAI, nincs AI nélküli termékmód. Helyettesítő kizárólag elkülönített tesztben.
3. Canon/state validált és determinisztikus; próza nem tartós tényforrás. Függő döntés után nincs előre commitolt következmény.
4. Ág/múlt/profil immutable, choice egyszer alkalmazva, revision/idempotencia/lease védelem.
5. Kizárólag angol minden új induló funkcióban; magyar elrejtve; életnyelv immutable, nyelvváltás nem generál.
6. Saját élet privát, export/törlés ingyenes. Publichoz külön sanitized snapshot/checkpoint és explicit preview/Confirm.
7. Kulcs/log/prompt/titok nem kerül Gitbe, chatbe, kliensbe. Korábbi admin-kulcs függőséget ne kérd újra az érték chatbe másolásával.
8. OpenAI 5 USD és Claude kutatás/audit külön 5 USD, szolgáltatónként összesített korábbi/future fogyasztással; aktuális fogyasztás a státuszban és helyi naplóban. Paid próba előtt közös foglalás, egy folyamat, unknown foglalás megmarad.
9. Modellek jelenleg Sol; Luna candidate csak saját teljeslánc- és nyelvi minősítés után. Ne kapcsolj automatikus drágább fallbacket számlázási hibára.
10. A public rendszer a teljes MVP része, személyes core után. Ne helyettesítsd általános social feed/komment/DM építésével.

## Ellenőrzés és átadás

Repository/AGENTS és érintett kód olvasása; migrált v1 adatok/hash-ek, ownership, period/head concurrency, atomic choice/job/canon és locale célzott ellenőrzése. `pnpm format:check`, typecheck/test/build, schema drift a változásnak megfelelően. Paid OpenAI-próba csak indokolt új AI-változásnál és előzetes keretből. Automatizált domain/privacy siker nem emberi termékvalidáció.

P06 valódi Auth/DB-törlés sikeres; email-kézbesítés/backup/restore/valós DB-kiesésből recovery nyitott; P07 angol automatikus/szerkesztői minőség, P08 emberi folytatás, P09–P13 public. Main commit/CI nem nyilvános deployment. Átadásban kész és tervezett rész, teszt és korlát világosan szerepeljen. Nagy új termékdöntést ne találj ki; visszafordítható részletet dokumentálva oldj meg, tényleges hiányzó információt tisztázz.

Claude kliens/CLI és szintetikus fixture-ök kész; [mért modellajánlás](../CLAUDE_MODEL_EVALUATION_HU.md). Kulcs védett .env és külső vault; .local/claude-audit/usage.json megőrzendő, külön lock. Haiku nem minősített narrátor/esemény alapnak. Sonnet rutin külső auditor-jelölt, Opus vitás mintavétel; használói minőség kiadás után mérendő; kézi HU/EN előkapu felülírva. A raw audit JSON téves riasztásokat is tartalmaz, nem canon-forrás.

Contabo: [előkészítés](../CONTABO_PREPARATION_REPORT_HU.md), védett SSH-kulcs/hostpin, jelszavas SSH tiltva. Ne próbáld újra a régi SSH-jelszót. Konfigurációmentés megvan, teljes restore nincs; éles alkalmazás nem fut. Korábbi main CI-k dátumozott bizonyítéka a [státuszban](../STATUS_HU.md); aktuális helyi ellenőrzés 314 teszt/48 séma/14 migráció. Éles AI-allowance nulla, domain alterward.com; helyi munka nem engedély proxycserére vagy rebootra.

## Shared átadási követelmények

S0–S2 és S3 személyes/time backend elkészült kikapcsolva. 001–010 Session poolerrel alkalmazva/ismételve; 010 immutable, új migration a következő számon. S0 valódi háromfiókos Auth/HTTP/export/törlés és S3 izolált Sol→own-memory→period/chapter/fidelity+Claude audit sikeres. S3 Connections/moderáció/retained PII/full Auth-release kapu még hátravan. Globális lock-sorrend, own branch és canon megtartása kötelező; mások története nem account cascade. Main/angol/helyi munka, két eredeti budget és P09–P13 public terv megmarad. [S3 bizonyíték](../SHARED_CONTEXT_S3_REPORT_HU.md).

[Shared integráció és elfogadások](../SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) · [Változatlan forrás](../plans/README.md).


## S3 személyes integráció — 2026-10-05

S3 személyes/time szelet elkészült; 010 alkalmazva, ezért nem szerkeszthető. Új 39 séma/279 teszt. Következő S3 UI/moderation/retained privacy/full Auth gate; minden feature false. OpenAI guard 2.074165875 USD, Claude guard 2.338015 USD; eredeti naplók megmaradnak. A jelenlegi két új minta változatlan. [Részletes bizonyíték és korlátok](../SHARED_CONTEXT_S3_REPORT_HU.md).


## Shared S3: Connections és biztonság — 2026-10-05

Angol Connections, block/report/moderáció és 011/012 elkészült; ezek dátumozott korábbi bizonyítéka megmarad. A későbbi privacy/Auth szelet felülírja az akkori „megjelenítési döntés/full Auth még hiányzik” státuszt: S0–S2 és S3 személyes/time/Connections/safety/privacy implementált; teljes kétfiókos Auth/Shared AI/saját AI/export/törlés/recovery sikeres. 001–013 alkalmazva, normál Shared flag-ek false. Nyers/backup-retention, régi személyes próza, billing/grace/deadline és friend release még kapu; P09–P13 és S4–S7 megmarad. A felhasználó az érintett közös szöveg elrejtését, a dátum és eredmény megtartását választotta. Új 013 stale-input cancellation és explicit friss retry; a P09 előnézet külön Shared privacy review-t kér. [Részletes megvalósítás, költség és korlát](../SHARED_CONTEXT_S3_PRIVACY_AUTH_REPORT_HU.md).


## 2026-10-05: P09/domain aktuális kiegészítés

[P09 privát AI-review](../PUBLIC_AI_REVIEW_REPORT_HU.md) operatori szelete kész: zárt angol copy, hash/revision/policy/receipt kötés, immutable review és saját olvasási API; export/törlés, 014 alkalmazva/ismételve. Egy valódi Sol-hívás öt privacy-jelzést adott, publicationApproved false. A privát Privacy/Content Preview kész; fizetett scan-job/curator/Publication/Confirm és P10–P13 még hátravan; Shared-kapu, S3 retention és S4–S7 megmarad. Domain: alterward.com, Cloudflare aktív, DNS üres/TLS Full; éles bekötés/Contabo-indítás később, az ops kapuk után.


## 2026-10-05: szerkeszthető privát Privacy/Content Preview

A [privát angol szerkesztő](../PUBLIC_PREVIEW_EDITOR_REPORT_HU.md) elkészült: saját forrásszöveg, mezőszintű ingyenes preflight, idempotens immutable mentés, legutóbbi érvényes copy visszatöltése és teljes mentett tartalomnézet. Az operatori AI-review csak a megfelelő hash/revision és mezőkészlet mellett látható; finding a javítandó mezőre mutat. Mentés/olvasás nem hív AI-t, Shared-előzmény és HU továbbra tiltott. Helyi teljes check: 314 teszt/27 fájl, 48 séma, a korábbi 44 és 001–014 változatlan. Következő a külön fizetett scan-job költségőrrel, curator/ScenarioVersion/sanitized fork-checkpoint/Publication/Confirm; majd P10–P13. Éles bekötés továbbra nincs.

A [4745a3 main CI](https://github.com/Muzsy/future_flow/actions/runs/37347782878) verify és container jobja sikeres: 314 teszt/27 fájl, teljes build/48 séma-drift, 14 migráció/ismétlés, PostgreSQL editor-preflight/duplamentés/visszatöltés/új review és korábbi Shared-próbák, TLS és tiszta worker-stop. Valódi böngészős/Auth/Sol próba is sikeres; öt új kérés 0.063175 USD. [Teljes előnézeti bizonyíték](../PUBLIC_PREVIEW_EDITOR_REPORT_HU.md). Következő a fizetett scan-job közös projekt/user költségőrrel; publikáció még nincs.


## 2026-10-05: P09 review-job integráció

A felületről indítható P09 fizetett AI-review elkészült: explicit hozzájárulás, tartós queue/lease, egy attempt/immutable copy, közös projekt/user költségőr, egy pending job/user és gördülő napi kvóta. Újraolvasás/dupla kérés ingyenes, elveszett lease és provider-hiba nem indít automatikus fizetett retryt. 015 alkalmazva/ismételve a fejlesztői DB-n; English/Shared/tulajdonosi/hash/revision kapu és export/törlés integrált. Helyi teljes check: 323 teszt/28 fájl, 50 séma; a korábbi 48 és 001–014 változatlan. A normál feature false, éles allowance 0; publicationApproved false. Következő curator/ScenarioVersion/sanitized fork-checkpoint/Publication/Confirm/Official seed, majd P10–P13; S3 retention, S4–S7 és Contabo/Cloudflare élesítés megmarad. [Aktuális riport](../PUBLIC_REVIEW_JOB_REPORT_HU.md).
