---
status: canonical
owner: architecture
last_reviewed: 2026-10-12
supersedes:
  - ../IMPLEMENTATION.md
  - ../alter_jovo_docs/08_SYSTEM_ARCHITECTURE.md
related:
  - ../V2_SIMULATION_CONTRACT_HU.md
  - ../AI_MODEL_ROUTING_HU.md
---

# Alterward — rendszerarchitektúra

## 1. Architektúra célja

Az Alterward tartós, auditálható és folytatható alternatív-élet szimulációt futtat. A rendszer ezért szétválasztja:

- a felhasználói felületet;
- a domain- és entitlement logikát;
- az authoritative adatállapotot;
- az AI-generálást;
- az aszinkron munkát;
- az operátori/recovery védelmeket.

Az AI nem közvetlen adatbázis-authority.

## 2. Monorepo szerkezet

### `apps/web`

Web kliens és felhasználói flow-k. Web-first termék; későbbi mobil kliensnek ugyanazokra az API/domain contractokra kell épülnie.

### `apps/api`

HTTP/API boundary. Feladata többek között:

- request validation;
- Auth/access context;
- idempotency és domain repository hívások;
- publikus/privát endpoint-szétválasztás;
- hibakódok stabil kivezetése.

### `apps/worker`

Aszinkron munkák, különösen AI-generálás és háttérfeldolgozás. A worker nem kerülheti meg a queue/job, budget, lease vagy entitlement határokat.

### `packages/contracts`

Zod/TypeScript contractok és gépi sémák. Külső/belső payload formák elsődleges gépi leírása.

### `packages/core`

Domain-szabályok, tiszta invariánsok, limitek, state transition helper-ek és entitlement policy.

### `packages/database`

Perzisztencia/repository réteg, tranzakciók, locking, idempotency, state lifecycle és adatvédelmi műveletek.

### `packages/ai`

Provider/model routing, strukturált AI contractok és AI-specifikus integráció.

### `packages/access`

Hozzáférési/auth boundary segédek.

## 3. Authoritative state modell

Az authoritative állapot nem a generált próza.

Fő elv:

`validated structured input/state → domain transition → persisted state → narrative rendering`

A narratíva a kanonikus állapotból készül. Ha narratíva és strukturált state ütközik, a strukturált, validált állapot nyer.

## 4. Personal simulation adatfolyam

Magas szinten:

1. web elküldi a validált user inputot;
2. API contract validation + auth/access;
3. repository/domain ellenőrzi revisiont, lifecycle-t, budgetet/idempotencyt;
4. szükség esetén AI job készül;
5. worker/provider strukturált eredményt generál;
6. eredmény schema/domain validáción megy át;
7. DB tranzakcióban rögzül az új canonical state és kapcsolódó narrative/event;
8. kliens a perzisztált állapotot olvassa vissza.

A pontos simulation contractot `../V2_SIMULATION_CONTRACT_HU.md` rögzíti.

## 5. Shared Context architektúra

Shared külön domain a personal simulation mellett.

Fő objektumok:

- Shared Context;
- member;
- invite;
- common Shared canon/state;
- Shared event/decision;
- Shared job;
- personal impact/memory projection.

Fontos határok:

- personal state nem válik automatikusan common Shared state-té;
- participant entitlement és host/create entitlement külön fogalom;
- membership tárolja az entitlement módot (`subscriber` / `sponsored_guest`);
- paid Shared AI jobot entitled initiator indít;
- idempotency és revision védi a versenyhelyzeteket;
- privacy/member státusz minden mutation előtt ellenőrzendő.

## 6. Entitlement és billing boundary

A domain entitlement már létezik billing nélkül is.

Ez szándékos réteghatár:

`payment lifecycle → entitlement record → domain authorization`

A jövőbeli payment provider nem írhat közvetlenül feature-state-et. Webhook/checkout az entitlement réteget módosítja, a domain pedig a saját szabályai alapján engedélyez vagy tilt.

## 7. AI boundary

AI-hívás előtt:

- contract/input minimalizálás;
- privacy filtering;
- entitlement/budget/rate-limit;
- megfelelő provider/model routing.

AI-hívás után:

- schema validation;
- domain validation;
- szükség esetén korlátozott repair;
- csak ezután perzisztálható authoritative következmény.

Az AI output tokenje, prózája vagy tool-returnje önmagában nem jogforrás.

## 8. Database és migration policy

A migrációk append-only történeti szerződésként kezelendők.

Új migration esetén együtt vizsgálandó:

- schema/runtime code;
- constraints/indexek/defaultok;
- repository query-k;
- privacy/recovery schema baseline;
- backup/restore kompatibilitás;
- tesztek;
- dokumentáció.

Éles adatvesztő migration explicit operátori terv nélkül nem elfogadható.

## 9. Concurrency és idempotency

Kritikus mutationök:

- idempotency key-t használnak, ahol contract szerint szükséges;
- revision/optimistic concurrency védelmet alkalmaznak;
- multi-user/shared műveleteknél stabil lock sorrendet tartanak;
- retry nem hozhat létre duplikált user-visible állapotot.

A részletes lock order a feature-spec/repository kód hatásköre.

## 10. Privacy és security boundary

Fail-closed alapelvek:

- aktív account és szükséges consent ellenőrzése;
- privacy acknowledgement;
- user-to-user block/permission ellenőrzés;
- private/public adatút elkülönítése;
- secret nincs kliensbe vagy repóba írva;
- recovery alatt writer-fence/authority kontroll;
- export/delete/revoke műveletek nem függhetnek AI-tól.

## 11. Operations boundary

Runtime és recovery külön réteg:

- containerized deployment;
- TLS/Cloudflare boundary;
- Supabase DB/Auth;
- titkosított backup;
- restore/verifier;
- monitoring;
- external health checks.

A repositoryban lévő runbook a végrehajtási authority; egy korábbi sikeres report csak történeti bizonyíték.

## 12. Quality gates

Minimum repository gate:

- format;
- typecheck;
- tests;
- build;
- generated schemas consistency;
- infrastruktúra/security boundary check;
- container/deployment verification.

Migration, recovery, AI vagy Shared módosítás további célzott ellenőrzést igényel.

## 13. Nem cél jelenleg

Nem szükséges a jelenlegi méretnél:

- microservice-felbontás csak a felbontás kedvéért;
- külön vector/RAG projektmemória;
- központi agent orchestrator;
- event streaming platform egyszerű DB/job flow helyett.

A modular monorepo marad az elsődleges architekturális forma, amíg konkrét skálázási adat más irányt nem indokol.

## 14 Személyes történeti context

N01 opcionális, queue időben snapshotolt `narrativeContext` envelope-ot ad a személyes workerhez. A context memóriája aw_history saját prefixből és elfogadott saját option rekordokból épül, 12 KiB UTF-8 korláttal. Default legacy; külön szerveroldali cohort allowlist. Az író és fidelity kapja, a jelenlegi háromhívásos lánc és kánonvédelmek megmaradnak. Nyitott szál/NPC melléklet még nincs. Mező nélküli legacy job request shape és hash nem változik. Az új context nem kerül web/public DTO-ba. A teljes narratív pipeline és rollout külön fejlesztési/operátori gate.
