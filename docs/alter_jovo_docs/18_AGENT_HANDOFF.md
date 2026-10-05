# alterward — fejlesztői átadás

**Aktuális állapot (2026-10-04):** P01–P05 privát v2 mag kész; valódi Auth/AI HTTP- és böngészős próba, export, Auth/DB-törlés és kontrollált megszakításból recovery sikeres. P07 új angol minta Sonnet auditja és P08 privát feedback/session-mérés kész; használói minőség kiadás után mérendő. Kizárólag angol indulás, magyar elrejtve. P09 tulajdonosi előnézeti alap kész, publishing/Discovery/Official seed/public fork tervezett. [Közös státusz és bizonyíték](../STATUS_HU.md), [indulási döntés](../ENGLISH_RELEASE_PLAN_HU.md). [Contabo-előkészítés](../CONTABO_PREPARATION_REPORT_HU.md) és teljes izolált web/API/worker/proxy CI sikeres; éles deploy, backup/restore, valós DB-kiesésből recovery és email-kézbesítés még nyitott.

**Shared állapot:** S0–S2 implementált; S3 személyes backend/AI/időkezelés elkészült, a teljes friend kiadási kapu még nyitott; S4–S7 tervezett. 001–010 alkalmazva, Shared kikapcsolva. [S3 megvalósítás és korlátok](../SHARED_CONTEXT_S3_REPORT_HU.md) · [Integrációs terv](../SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md).

2026-10-05 · [Dokumentációs központ](../README.md), [állapot](../STATUS_HU.md), [backlog](../NEXT_STEPS.md). Következő helyben: **S3 Connections/moderáció/retained privacy és valódi fiókos kapu**, az elkészült S0–S2 alapra. P06 backup/restore/valós DB-kiesés és Contabo-ops későbbi kiadási kapu; P09–P13 public szál megmarad.

## Kiindulás és feladat

V2 12 lépéses angol onboarding (HU elrejtve), valódi AI hat hónap, choice/folytatás/történeti fork, memória/javítás és költségőr integrált. V1 archívum megmarad. [Riport](../V2_IMPLEMENTATION_REPORT_HU.md).

P01–P05 technikai mag kész, Supabase 001–007 alkalmazva. P06 valódi Auth/AI HTTP-próba és törlés kész, UI-bizonyíték az aktuális riportban; backup/restore és valós DB-kiesésből recovery nyitott; P07 új angol minta AI-auditja és P08 feedback/session-műszerezés kész; valódi használói béta még nincs. Nyilvános aktiválás még nem engedhető kész kapuk nélkül.

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

Contabo: [előkészítés](../CONTABO_PREPARATION_REPORT_HU.md), védett SSH-kulcs/hostpin, jelszavas SSH tiltva. Ne próbáld újra a régi SSH-jelszót. Konfigurációmentés megvan, teljes restore nincs; éles alkalmazás nem fut. Aktuális [main CI](https://github.com/Muzsy/future_flow/actions/runs/37262177593) (`4a74daa`): 279 teszt, 39 schema és tíz migráció; teljes container/TLS/S3 own-memory race proof sikeres. Éles AI-allowance nulla, domain később; helyi munka nem engedély proxycserére vagy rebootra.

## Shared átadási követelmények

S0–S2 és S3 személyes/time backend elkészült kikapcsolva. 001–010 Session poolerrel alkalmazva/ismételve; 010 immutable, új migration a következő számon. S0 valódi háromfiókos Auth/HTTP/export/törlés és S3 izolált Sol→own-memory→period/chapter/fidelity+Claude audit sikeres. S3 Connections/moderáció/retained PII/full Auth-release kapu még hátravan. Globális lock-sorrend, own branch és canon megtartása kötelező; mások története nem account cascade. Main/angol/helyi munka, két eredeti budget és P09–P13 public terv megmarad. [S3 bizonyíték](../SHARED_CONTEXT_S3_REPORT_HU.md).

[Shared integráció és elfogadások](../SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) · [Változatlan forrás](../plans/README.md).


## S3 személyes integráció — 2026-10-05

S3 személyes/time szelet elkészült; 010 alkalmazva, ezért nem szerkeszthető. Új 39 séma/279 teszt. Következő S3 UI/moderation/retained privacy/full Auth gate; minden feature false. OpenAI guard 2.074165875 USD, Claude guard 2.338015 USD; eredeti naplók megmaradnak. A jelenlegi két új minta változatlan. [Részletes bizonyíték és korlátok](../SHARED_CONTEXT_S3_REPORT_HU.md).
