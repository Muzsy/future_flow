# Alterward — Shared Context / többfelhasználós kapcsolati rendszer

**Egybefűzött implementációs specifikáció**



---

# Alterward Shared Context / kapcsolati modell — implementációs dokumentáció

**Repository baseline:** `Muzsy/future_flow`  
**Branch:** `main`  
**Audited commit:** `b75e61ddc0a6dbdc31653a8c58d5c251e2f95aa8`  
**Audit date:** 2026-10-04  


## Cél

Ez a csomag a jelenlegi, működő `future_flow` / **alterward** kódbázisra épülő többfelhasználós kapcsolati és közös-életút rendszer teljes megvalósítási terve.

A cél egy **Shared Context domain**, amelyben több valódi felhasználó külön privát életága egy közös, konzisztens canonhoz kapcsolódhat. A közös tér lehet baráti társaság, párkapcsolat, munka/közös projekt, hobbi-közösség vagy sportcsapat. A kétfős kapcsolat ugyanennek a többfelhasználós modellnek a speciális esete.

## Nem alku tárgyát képező döntések

1. A meglévő `aw_lives`, `aw_branches`, `aw_periods`, `aw_choices` modellje nem válik többtulajdonosossá.
2. Minden személyes élet továbbra is egyetlen user tulajdona.
3. A közös élethelyzet külön `SharedContext` aggregate.
4. Egy közös eseménynek egyetlen Shared Canonja van.
5. A személyes branchek a közös canonból impactokat/projekciókat kapnak.
6. Más user vagy AI nem dönthet tetszőlegesen egy valódi user privát tényeiről.
7. A csoportos működés nem N×N páronkénti kapcsolatokból épül.
8. A privát World State soha nem kerül teljes egészében más userhez vagy Shared Contexthez.
9. A 001–007 migráció és a `LifeStateV2` 2.0.0 történeti kompatibilitása megmarad.
10. A Shared Context additív migrációkkal és új modulokkal készül.
11. Egy személy egyszerre legfeljebb 5 slot-fogyasztó Shared Contextben lehet.
12. Lezárt/archivált kapcsolatok megmaradnak, de nem fogyasztanak aktív slotot.
13. A Shared Context publikálása nem része az első implementációnak.

## Előfizetési konstrukció

| Csomag | Aktív Shared Context | Engedélyezett típusok |
|---|---:|---|
| Free | 0 | nincs valódi user-user Shared Context |
| Explorer | 1 | csak `friend_group` |
| Connected | 3 | friend + romantic + work/project + hobby |
| World | 5 | minden Connected funkció + sport |

A pontos ár billing-konfiguráció; nem core domainkonstans. Korábbi termékirány: Explorer kb. €8.99, Connected €12.99–14.99, World €17.99–19.99.

## Tagszám-korlátok

| Típus | Maximum |
|---|---:|
| `romantic_relationship` | 2 tag (user + 1 partner) |
| `friend_group` | 10 fő |
| `work_project` | 10 fő |
| `hobby_group` | 10 fő |
| `sports_team` | 20 fő |

Egy usernek legfeljebb 1 aktív `romantic_relationship` contextje lehet.

## Fájlok

- `01_CURRENT_CODEBASE_AUDIT.md`
- `02_PRODUCT_AND_DOMAIN_RULES.md`
- `03_CONTRACTS_AND_TYPES.md`
- `04_DATABASE_AND_MIGRATIONS.md`
- `05_SHARED_ENGINE_AND_CANON.md`
- `06_API_REPOSITORY_AND_ENTITLEMENTS.md`
- `07_WORKER_AI_AND_COST_MODEL.md`
- `08_WEB_UX_AND_USER_FLOWS.md`
- `09_PRIVACY_CONSENT_MODERATION_DELETION.md`
- `10_TEST_AND_ACCEPTANCE_PLAN.md`
- `11_IMPLEMENTATION_ROADMAP.md`
- `12_AGENT_EXECUTION_CHECKLIST.md`
- `13_REFERENCE_SCENARIOS.md`
- `MASTER_SHARED_CONTEXT_SPEC_HU.md`

## Implementációs stratégia

Az első működő szelet kizárólag `friend_group`. A domain/adatmodell azonban az első migrációtól általános legyen:

`friend_group → invite → accept → shared event → member intents → resolution → shared canon → personal impacts → next personal period`

A többi kapcsolat ugyanennek a rendszernek új policy- és state-adaptere legyen.


---

# 1. Jelenlegi kódbázis audit

**Repository baseline:** `Muzsy/future_flow`  
**Branch:** `main`  
**Audited commit:** `b75e61ddc0a6dbdc31653a8c58d5c251e2f95aa8`  
**Audit date:** 2026-10-04  


## Aktuális technikai alap

A repó Node 24 + pnpm 11.19 monorepo. Fő részek:

- `apps/web`: Next.js;
- `apps/api`: NestJS REST;
- `apps/worker`: háttér AI worker;
- `packages/contracts`: Zod/TS szerződések;
- `packages/core`: determinisztikus domain;
- `packages/database`: PostgreSQL repository/tranzakció;
- `packages/ai`: OpenAI Responses API;
- `database/migrations`: jelenleg 001–007;
- `tests`: Vitest + PGlite.

A root `pnpm check` format + typecheck + test + build.

## Privát v2 életmodell

Kulcsfájlok:

- `packages/contracts/src/life-v2.ts`
- `packages/core/src/life-v2.ts`
- `packages/database/src/lives.ts`
- `packages/database/src/life-jobs.ts`
- `apps/worker/src/life-processor.ts`
- `database/migrations/003_period_lives.sql`

`LifeStateV2` tartalmaz employment/location/finance/assets/actors/skills/goals/opportunities/resources mezőket.

Az `actors` max. 30, és egy actor jelenleg:

```ts
{
  id: UUID,
  label: string,
  relationship: 'partner' | 'family' | 'friend' | 'colleague' | 'other'
}
```

Ez nem lehet a teljes 10–20 fős valódi user-csoport elsődleges tárolója. A Shared Context taglistája külön adatmodell.

## Ownership

A 003 migrációban a life/branch/period/history/choice/job mind `user_id`-hoz kötött. A repository és FK-struktúra egytulajdonosú.

**Döntés:** nem módosítjuk multi-ownerre. A Shared Context külön domain.

## Újrahasznosítandó konzisztencia-minták

A meglévő v2-ből átveendő:

- revision;
- idempotency;
- `FOR UPDATE`;
- egy aktív job/aggregate;
- worker lease + heartbeat;
- immutable canon;
- hash;
- strukturált AI output → core validáció → transaction commit;
- max. egy automatikus repair.

## Public/privacy alap

Releváns:

- `packages/contracts/src/public-draft.ts`
- `packages/core/src/public-draft.ts`
- `packages/database/src/public-drafts.ts`
- `006_public_draft_foundation.sql`

A Shared Context ugyanazt az elvet használja:

```text
PRIVATE LIFE STATE
        ↓ allowlist
INTERACTION PROJECTION
        ↓
SHARED CONTEXT
```

Más user teljes private state-et nem kap.

## Account deletion

`apps/api/src/account-deletion.ts` recovery-kompatibilis Auth→DB törlést használ.

Shared Contextnél egy user törlése nem törölheti mások közös történetét. A shared history member-ID alapú legyen; user/life/branch link törölhető vagy nullázható.

## API

A v2 API az `apps/api/src/app.ts` `LifeController` mintáját használja:

- AuthGuard;
- Zod;
- DomainError;
- Idempotency-Key;
- repository ownership.

Az új Shared controller ezt a mintát kövesse.

## Worker

`apps/worker/src/main.ts` jelenleg legacy és v2 life queue közt vált. Shared job után fair 3-queue scheduling kell. Első verzióban nem kell külön microservice.

## Frontend

Aktuális:

- `apps/web/app/[...route]/page.tsx` → `Experience`;
- `components/experience.tsx`;
- `components/life-experience.tsx`;
- `lib/client.ts`.

**Kötelező:** web módosítás előtt elolvasni `apps/web/AGENTS.md` és az ott előírt telepített Next.js dokumentációt.

## Kompatibilitási tilalmak

Tilos:

- 001–007 checksum változtatás;
- v1/v2 canon átírás;
- `LIFE_CONTRACT_VERSION = 2.0.0` jelentésének csendes változtatása;
- personal `visibility: private` megszüntetése;
- direct kliens DB-hozzáférés shared/private táblákhoz;
- más user branchének ownership megkerüléssel olvasása.


---

# 2. Termék- és domain szabályok

## SharedContext

`SharedContext` = több valódi felhasználó konkrét alternatív brancheinek közös szimulációs tere.

Saját state, revision, simulation time, member list, roles, events, decisions és canon tartozik hozzá.

## Típusok

```ts
type SharedContextType =
  | 'friend_group'
  | 'romantic_relationship'
  | 'work_project'
  | 'hobby_group'
  | 'sports_team';
```

### friend_group
- 2–10 fő;
- Explorerben elérhető;
- default `individual_opt_in`;
- event résztvevői lehetnek subset;
- nem módosíthat automatikusan privát pénzt/munkát.

### romantic_relationship
- pontosan 2 aktív tag;
- userenként max. 1 aktív;
- Connected/World;
- létrejött és commitment: mutual consent;
- lezárás: bármelyik fél unilateral;
- AI nem dönthet érzelmi consent helyett.

### work_project
- max. 10;
- Connected/World;
- role, shared goal, governance;
- group policy majority/role-authority lehet;
- más user privát pénzét csak annak saját intentje érintheti.

### hobby_group
- max. 10;
- Connected/World;
- opt-in/majority.

### sports_team
- max. 20;
- World;
- roster/coach/captain;
- team decision és személyes decision külön.

## Active context limitek

Slot-fogyasztó: `inviting`, `active`, `paused`.  
Nem slot: `ended`, `archived`.

- Free: 0
- Explorer: 1
- Connected: 3
- World: 5
- abszolút cap: 5

## Membership

A membership mindig `user + life + branch`.

Egy `(context,user)` csak egyszer lehet aktív. Personal fork nem örököl automatikusan live shared membershipet.

## Context lifecycle

```text
inviting → active ↔ paused → ended → archived
```

## Member lifecycle

```text
active
paused_entitlement
left
removed
deleted
```

Pending invite külön objektum.

## Shared vs personal truth

A csoport state-je egyszer létezik a Shared Contextben. Nem másoljuk ugyanazt a céget/projektet/team state-et minden member personal JSON state-jébe.

## Inaktív user

Mások nem állhatnak meg tartósan. Policy + wall-clock deadline + quorum használható. Személyes authority-t igénylő döntést nem lehet más helyett kitölteni. Romantic mutual decision nem auto-resolve.

## Downgrade

Nem írjuk át a canont. History olvasható, de grace után új shared generálás/intent nem engedett; membership `paused_entitlement`. Romantic context pause, nem automatikus breakup.

## Nem MVP

- DM/chat;
- realtime multiplayer;
- AI proxy user helyett;
- group merge;
- public shared context;
- creator marketplace;
- arbitrary governance scripting.


---

# 3. Szerződések és TypeScript/Zod típusok

## Új modul

`packages/contracts/src/shared-context.ts`

```ts
export const SHARED_CONTEXT_CONTRACT_VERSION = '1.0.0';
```

Exportáld a contracts indexből. A `LIFE_CONTRACT_VERSION` marad 2.0.0.

## Típusok

```ts
const sharedContextTypeSchema = z.enum([
  'friend_group',
  'romantic_relationship',
  'work_project',
  'hobby_group',
  'sports_team',
]);

const sharedContextStatusSchema = z.enum([
  'inviting','active','paused','ended','archived'
]);

const sharedMemberStatusSchema = z.enum([
  'active','paused_entitlement','left','removed','deleted'
]);
```

Decision policy:

```ts
z.discriminatedUnion('type', [
  z.object({ type: z.literal('individual_opt_in') }).strict(),
  z.object({ type: z.literal('majority') }).strict(),
  z.object({ type: z.literal('unanimous') }).strict(),
  z.object({ type: z.literal('role_authority'), role: label }).strict(),
  z.object({
    type: z.literal('weighted_vote'),
    weights: z.record(z.uuid(), z.number().positive())
  }).strict(),
]);
```

## Interaction Profile

Nem teljes LifeState.

```ts
{
  displayName: string,
  ageBand: AgeBand | null,
  country: ISO2 | null,
  occupationLabel: string | null,
  sharedRole: string | null
}
```

Tiltott automatikus mező: email, teljes finance, private goals, más relationship/context, raw prompt/memory.

## Context state

Discriminated union:

- `friend_group`: cohesion low/medium/high/null, currentFocus;
- `romantic_relationship`: stage dating/committed/cohabiting/engaged/married;
- `work_project`: projectKind, goal, progress;
- `hobby_group`: activity, currentFocus;
- `sports_team`: sport, seasonStatus, teamGoal.

Kerüld a hamis precizitású 0–100 emberi kapcsolatpontokat.

## Shared Event Candidate

```ts
{
  schemaVersion: '1.0.0',
  eventId,
  contextId,
  baseRevision,
  effectiveAt,
  title,
  summary,
  participantMemberIds,
  sharedChanges,
  decision: null | {
    id,
    prompt,
    policy,
    eligibleMemberIds,
    deadlineSeconds,
    options: [{
      id,
      label,
      description,
      sharedChanges,
      impactProposals
    }]
  }
}
```

## Fact changes

Zárt union, nem arbitrary JSON path.

Friend MVP-ben:
- `summary_set`
- `friend_group_cohesion_set`
- `friend_group_focus_set`

További context type-ok saját változás-unionnal.

## Impact proposal

AI csak proposal:

```ts
type SharedImpactProposal =
  | { type:'memory_only'; memberId; summary }
  | { type:'relationship_projection'; memberId; relationship }
  | { type:'finance_delta'; memberId; currency; amount; authoritySource }
  | { type:'employment_set'; memberId; value; authoritySource };
```

Friend MVP-ben csak `memory_only` és szükség esetén `relationship_projection`.

## Authority

`shared_canon | self_intent | authorized_role`.

Más user intentje nem költhet pénzt a target helyett. Role authority első release-ben legfeljebb membership/role state-et módosítson.

## Personal memory

A meglévő `LifePeriodInput.memory` kompatibilisen bővíthető:

```ts
sharedEvents?: [{
  contextId,
  contextType,
  effectiveAt,
  title,
  summary,
  role
}]
```

Opcionális mező, hogy régi job payloadok olvashatók maradjanak.

## Error code-ok

Minimum:

`SHARED_CONTEXT_NOT_FOUND`, `SHARED_CONTEXT_FULL`, `SHARED_CONTEXT_LIMIT`,
`SHARED_CONTEXT_TYPE_NOT_ALLOWED`, `SHARED_ROMANTIC_LIMIT`,
`SHARED_INVITE_INVALID`, `SHARED_INVITE_EXPIRED`, `SHARED_INVITE_ALREADY_USED`,
`SHARED_TIME_MISMATCH`, `SHARED_REVISION_CONFLICT`, `SHARED_PENDING_DECISION`,
`SHARED_INTENT_ALREADY_SUBMITTED`, `SHARED_INTENT_NOT_ELIGIBLE`,
`SHARED_POLICY_UNRESOLVED`, `SHARED_GENERATION_ACTIVE`,
`SHARED_MEMBER_INACTIVE`, `SHARED_PERMISSION_DENIED`,
`SHARED_BLOCKED`, `SUBSCRIPTION_REQUIRED`.

Az error-messages jelenlegi EN/HU pármintáját kövesd.


---

# 4. Adatbázis és migrációs terv

## Migrációs szabály

A baseline-on 001–007 létezik. Implementálás előtt újra ellenőrizni kell a könyvtárat; a következő szabad sorszám használandó. Alkalmazott migrációt tilos átírni.

Javasolt bontás:

- `008_shared_context_foundation.sql`
- `009_shared_entitlements_and_social_profile.sql`
- `010_shared_moderation_metrics.sql`

## `aw_social_profiles`

A jelenlegi rendszerben nincs közösségi handle, ezért kell minimális social identity.

```text
user_id UUID PK → ff_users ON DELETE CASCADE
handle TEXT NOT NULL
display_name TEXT NOT NULL
discoverability private|link_only|searchable
created_at
updated_at
```

Követelmények:

- `lower(handle)` unique;
- 3–30 karakter;
- email soha nem public identifier;
- MVP-ben a secure invite-link elegendő, searchable directory későbbi.

## `aw_user_entitlements`

```text
user_id UUID PK
tier free|explorer|connected|world
source
valid_until nullable
updated_at
```

Hiányzó row = `free`.

Billing provider nincs ehhez a specifikációhoz kötve.

## `aw_shared_contexts`

```text
id UUID PK
type
status
content_locale
title
state JSONB
revision INTEGER >= 0
simulation_at DATE
governance JSONB
pending_event_id UUID nullable
origin_context_id UUID nullable
origin_event_id UUID nullable
created_at
updated_at
```

A `type` létrehozás után immutable.

## `aw_shared_members`

```text
id UUID PK
context_id UUID
context_type TEXT
user_id UUID NULL → ff_users ON DELETE SET NULL
life_id UUID NULL → aw_lives ON DELETE SET NULL
branch_id UUID NULL → aw_branches ON DELETE SET NULL
status
interaction_profile JSONB
world_role TEXT nullable
role_data JSONB
joined_at
left_at
```

A user/life/branch nullable azért kell, mert account deletion után a történeti anonymous member megmaradhat anélkül, hogy a valódi fiókhoz kapcsolódna.

Index:

- `(context_id,status)`
- `(user_id,status)`
- unique active `(context_id,user_id)` ahol user nem null
- romantic egyediséghez részleges unique index a denormalizált `context_type` segítségével.

A tier szerinti active-context cap repository-tranzakcióban, user row lock alatt érvényesüljön.

## `aw_shared_invites`

```text
id UUID PK
context_id UUID
inviter_member_id UUID
target_user_id UUID nullable
token_hash TEXT
status pending|accepted|declined|revoked|expired
expires_at
created_at
responded_at
```

- legalább 256-bit random token;
- DB-ben csak hash;
- token ne kerüljön logba;
- login szükséges;
- acceptkor a recipient saját branch-et választ;
- egyszer használható.

## `aw_shared_events`

Immutable canon:

```text
id UUID PK
context_id UUID
sequence INTEGER > 0
base_revision INTEGER
effective_at DATE
candidate JSONB
state_before JSONB
state_after_event JSONB
decision JSONB nullable
canon_hash TEXT
created_at
```

Unique `(context_id,sequence)`.

A meglévő `ff_prevent_canon_update()` trigger használható.

## `aw_shared_event_participants`

```text
event_id UUID
member_id UUID
participation_role TEXT
PRIMARY KEY(event_id,member_id)
```

20 fős contextből egy event érinthet csak 4–8 tagot.

## `aw_shared_intents`

```text
id UUID PK
event_id UUID
member_id UUID
option_id UUID
payload JSONB
created_at
UNIQUE(event_id,member_id)
```

MVP-ben a leadott intent végleges. Nincs vote-edit. Nincs tetszőleges chat/free-text.

## `aw_shared_resolutions`

Immutable:

```text
id UUID PK
event_id UUID UNIQUE
context_id UUID
policy JSONB
result JSONB
state_before JSONB
state_after JSONB
canon_hash TEXT
resolved_at
```

## `aw_shared_impacts`

```text
id UUID PK
context_id UUID
event_id UUID
resolution_id UUID nullable
member_id UUID
target_branch_id UUID nullable → aw_branches ON DELETE SET NULL
effective_at DATE
kind TEXT
payload JSONB
payload_hash TEXT
status pending|applied|detached|expired
applied_revision INTEGER nullable
created_at
applied_at
```

Idempotencia: legalább `(event_id,member_id,kind,payload_hash)` unique.

Payload immutable; lifecycle mezők módosulhatnak.

## `aw_shared_jobs`

A `aw_jobs` mintája:

```text
id
context_id
requested_by_user_id
base_revision
status queued|running|completed|failed|cancelled
stage
payload
checkpoints
attempt
lease_token
lease_until
error_code
created_at
completed_at
```

Partial unique: egy aktív job/context.

## `aw_shared_ai_runs`

- shared_job_id;
- charged_user_id;
- metadata;
- created_at.

## Block/report

Foundation után:

- `aw_user_blocks`
- `aw_shared_reports`

## RLS/privilege

Minden shared privát tábla:

- RLS enabled;
- direct `anon`/`authenticated` privilege revoke;
- szerveroldali repository az egyetlen hozzáférési út.

## Account deletion

A DB delete előtt:

1. pending invite revoke;
2. membership `deleted`;
3. `user_id=NULL`;
4. `life_id=NULL`;
5. `branch_id=NULL`;
6. interaction profile → minimális `Former member`;
7. pending impact → detached;
8. shared canon megmarad minimális, mások koherenciájához szükséges formában;
9. social profile törlődik.

A Shared Event ne függjön `ON DELETE CASCADE` módon a user accounttól.

## Context hard delete

Creator nem törölheti ki egyoldalúan mások történeti canont.

Normál flow: `ended` → `archived`. Általános Shared Context hard-delete API ne legyen MVP-ben.


---

# 5. Shared engine, canon és konzisztencia

## Alapmodell

```text
Personal Branch A ─┐
Personal Branch B ─┼──> Shared Context Canon
Personal Branch C ─┘           │
                               ├─ impact A
                               ├─ impact B
                               └─ impact C
```

A Shared Context nem branch-összeolvasztás.

## Egyetlen igazság

A shared business/team/group state csak a Shared Contextben létezik. A személyes state csak a személyre eső tényt/projekciót kapja.

## Event flow

```text
shared state + interaction projections
        ↓
AI candidate
        ↓
schema validation
        ↓
domain validation
        ↓
shared event commit
        ↓
member intents
        ↓
policy resolution
        ↓
shared resolution commit
        ↓
per-member impacts
```

## Revision

Minden shared aggregate state mutation revisiont növel.

- event commit +1;
- resolution +1;
- lifecycle state mutation +1.

Stale request → `SHARED_REVISION_CONFLICT` 409.

## Egy pending decision

MVP-ben contextenként max. egy unresolved shared decision.

## Policyk

### individual_opt_in
Minden eligible user maga dönt. Eredmény lehet participant subset.

### majority
Egy user = egy szavazat. Tie esetén nem találunk ki eredményt: `unresolved_tie`.

### unanimous
Minden required member ugyanazt választja. Romantic commitmenthez alkalmas.

### role_authority
Csak a megadott role válaszolhat.

### weighted_vote
Work/business későbbi döntésekhez. Súly kizárólag validated Shared State-ből jöhet.

## Authority boundary

Három kategória:

1. shared fact;
2. membership/role fact;
3. private personal fact.

A csoport dönthet shared factről. Authorized role módosíthat project/team membershipet. De más user nem dönthet arról, hogy a target:

- pénzt költ;
- felmond;
- költözik;
- szerelmes;
- mit gondol.

Ezekhez self-intent vagy külső eseményből következő, zárt és validált personal impact kell.

## Időszinkron

A personal engine pontos ISO date state-et és 6 hónapos periodokat használ.

Első MVP:

- Shared Context `simulation_at` dátum;
- invitee selected branch state-je ugyanabban a naptári hónapban legyen;
- anchor az érintett state-ek közül a legkésőbbi nap;
- branch nem lehet a context jövőjén túl;
- nincs silent time travel;
- mismatch → `SHARED_TIME_MISMATCH`.

Később külön catch-up flow építhető.

## Miért nem írunk 20 branchet egyszerre

Resolution után pending impact rekordok keletkeznek. Nem egy hosszú tranzakcióban módosítjuk az összes személyes ágat.

```text
resolution
  ↓
impact A pending
impact B pending
impact C pending
```

Az adott user következő branch-műveleténél materializáljuk.

## Personal impact alkalmazás

Új core függvény:

```ts
applySharedImpactsToLifeStateV2(state, impacts, effectiveAt)
```

Friend MVP:

- memory-only;
- szükséges relationship projection.

Ne másoljuk automatikusan az összes team membert `LifeStateV2.actors` alá. A max 30 actor és az 5 context miatt ez skálázhatatlan lenne.

## Personal memory

A personal period inputba bekerülnek a releváns applied shared eventek.

AI szabály:

- Shared Canon authoritative;
- más user privát motivációját ne találja ki;
- más user jövőbeli döntését ne állítsa tényként;
- csak accepted/resolved shared action lehet canon.

## Personal fork

A live membership nem másolódik át.

Új personal branch:

- solo what-if;
- addigi shared history snapshot/memory megmaradhat;
- más user nincs forkollva;
- eredeti membership az eredeti branchhez kötve marad.

## Continue solo

User kiléphet a shared flowból és létrehozhat privát solo folytatást. A többiek contextje változatlan.

## Group fork

Későbbi feature: új Shared Context új ID-val, minden ember külön opt-innel. Nem a régi context másik state-je.

## Deadline / quorum

Wall-clock deadline a human response koordinálásához, nem szimulációs idő.

- majority: quorum után resolve;
- individual opt-in: válaszolók alapján;
- unanimous: hiányzó válasszal nem;
- romantic mutual: nem;
- unilateral end: egy authorized fél elég.


---

# 6. API, repository és entitlement

## Repository

Új:

`packages/database/src/shared-contexts.ts`

Felelősség:

- context lifecycle;
- membership/access;
- invite;
- tier enforcement;
- revision lock;
- event/intent/resolution;
- impact;
- metrics;
- deletion anonymization.

Ne zsúfoljuk a Shared logikát a `LifeRepository` osztályba.

## Tier config

```ts
const SHARED_TIER_LIMITS = {
  free: { activeContexts: 0, types: {} },
  explorer: {
    activeContexts: 1,
    types: { friend_group: 10 }
  },
  connected: {
    activeContexts: 3,
    types: {
      friend_group: 10,
      romantic_relationship: 2,
      work_project: 10,
      hobby_group: 10
    }
  },
  world: {
    activeContexts: 5,
    types: {
      friend_group: 10,
      romantic_relationship: 2,
      work_project: 10,
      hobby_group: 10,
      sports_team: 20
    }
  }
} as const;
```

Ár ne legyen itt.

## Minden tag saját entitlementje

MVP-ben minden aktív participant saját tierje engedélyezze az adott context típust.

Invite preview mehet upgrade előtt, accept nem.

Később lehet sponsored-seat modell.

## Lock sorrend

Deadlock ellen:

1. érintett user row-k, UUID szerint rendezve;
2. context;
3. member/invite/event;
4. branch.

Minden mutációnál ugyanaz a lock sorrend.

## API

### Social profile
- `GET /api/v2/social-profile`
- `PUT /api/v2/social-profile`

### Context
- `GET /api/v2/shared-contexts`
- `POST /api/v2/shared-contexts`
- `GET /api/v2/shared-contexts/:id`

Create body:

```json
{
  "type": "friend_group",
  "title": "Weekend Crew",
  "branchId": "...",
  "revision": 0
}
```

Idempotency-Key kötelező.

### Invite
- `POST /api/v2/shared-contexts/:id/invites`
- `GET /api/v2/shared-invites`
- `POST /api/v2/shared-invites/:id/accept`
- `POST /api/v2/shared-invites/:id/decline`

Accept body:

```json
{ "branchId": "...", "contextRevision": 3 }
```

### Lifecycle
- `POST /api/v2/shared-contexts/:id/leave`
- `POST /api/v2/shared-contexts/:id/archive`
- később admin: `POST /api/v2/shared-contexts/:id/members/:memberId/remove`

### Shared simulation
- `POST /api/v2/shared-contexts/:id/continue`
- `GET /api/v2/shared-jobs/:id`
- `POST /api/v2/shared-contexts/:id/events/:eventId/intents`

Intent:

```json
{ "contextRevision": 5, "optionId": "..." }
```

### Personal impact visibility
- `GET /api/v2/branches/:id/shared-impacts`

Normál personal choice/continue automatikusan materializálhat pending impactot.

## Auth/access

A meglévő AuthGuard használható.

Context ID ismerete nem jogosultság. Member státusz kötelező.

Admin role és in-world role külön fogalom.

## Idempotencia

Kötelező:

- create context;
- invite;
- accept;
- continue;
- intent;
- leave/remove.

## Generation limit

Külön shared napi/user limit és 1 active job/context.

A project/user AI budget a meglévő `DatabaseAiBudget` elvét kövesse.

## Downgrade

Read/history marad. Mutáció előtt entitlement gate. Grace után membership `paused_entitlement`, nem törlés.


---

# 7. Worker, AI és költségmodell

## AI interface

Új `packages/ai` interface:

```ts
interface SharedAiProvider {
  sharedEvent(
    input: SharedEventInput,
    repair?: string
  ): Promise<AiResult<SharedEventCandidate>>;
}
```

Első verzióban külön memberenkénti shared-story call nem kell.

## AI input

Csak:

- Shared State;
- context type;
- interaction profile;
- roles;
- releváns shared history;
- shared goal;
- allowed policy;
- szerver által kiosztott ID-k.

Nem mehet:

- teljes personal World State;
- teljes finance;
- private goals/relationships;
- raw prompt/memory;
- email.

## Prompt invariánsok

- fictional scenario;
- user text adat, nem instruction;
- csak ismert member ID;
- más user belső érzését ne állítsa canonként;
- más user döntését ne hozza meg;
- csak zárt SharedFactChange;
- personal impact csak proposal;
- participant subset megengedett;
- max. egy pending decision.

## Validáció

AI után:

1. Zod;
2. context ID;
3. base revision;
4. time;
5. member IDs;
6. active membership;
7. context-type allowed changes;
8. policy;
9. eligible set;
10. impact authority;
11. invariants;
12. hash;
13. commit.

## Repair

A `life-processor.ts` mintájára max. 1 targeted repair.

## Worker modulok

- `apps/worker/src/shared-processor.ts`
- `packages/database/src/shared-jobs.ts`

Fair queue:

```text
personal-v2 → shared → legacy → repeat
```

Üres queue átugorható.

## Lease

A meglévő `LifeJobRepository` mintája:

- `FOR UPDATE SKIP LOCKED`;
- lease token;
- heartbeat;
- attempt cap;
- lost lease → no commit.

## Költség

A shared job `requested_by_user_id` user keretét terheli.

- `Continue group` indítója fizeti az adott shared generálást;
- a többiek a kész canont AI-költség nélkül olvassák;
- saját personal continuation saját keretből megy.

## 20 fős sportcsapat

Tilos 1 event után 20 teljes narratívát generálni.

Helyes:

```text
1 shared generation
→ structured impacts
→ personal narrative csak akkor, amikor az adott user saját életét folytatja
```

## Tesztelés

Unit/integration teszt fake `SharedAiProvider`.

Paid OpenAI smoke csak explicit kerettel és meglévő guard/reservation rendszerrel.


---

# 8. Web UI és user flow

## Jelenlegi frontendhez illesztés

Aktuális:

- `apps/web/app/[...route]/page.tsx` → `Experience`;
- `components/experience.tsx`;
- `components/life-experience.tsx`;
- `lib/client.ts`.

Implementáció előtt kötelező elolvasni `apps/web/AGENTS.md` és az ott hivatkozott telepített Next.js dokumentációt.

## Új fő felület

Nav elem: **Connections**

Route: `/connections`

Tartalom:

- active contexts;
- paused contexts;
- pending invites;
- create new connection;
- archived.

## Social profile setup

Első Shared funkció előtt:

- display name;
- handle;
- discoverability;
- rövid privacy magyarázat.

Email nem jelenik meg.

## Friend context creation

1. Connections.
2. `Create friendship`.
3. saját life/branch választás.
4. context cím.
5. create.
6. secure invite link.
7. recipient login.
8. saját branch kiválasztás.
9. entitlement/time/privacy check.
10. explicit accept.
11. context active.

## Context page

`/connections/:id`

- title/type;
- simulation date;
- member display names;
- roles;
- shared timeline;
- current shared situation;
- pending decision;
- response státusz;
- `Continue group`;
- leave/archive.

Chat nem szükséges.

## Decision UX

- saját választás;
- pl. `6/8 responded`;
- deadline;
- resolution után közös eredmény.

Más tag választását resolution előtt alapból ne mutassuk, ha az befolyásolhatja a döntést.

## Personal life integration

Pending shared impact:

> Something changed in your shared life.

A user megnyithatja a contextet. Personal continue már a materializált impactből dolgozik.

## Tier UX

Free: invite preview + upgrade, accept nincs.  
Explorer: friend only, 1 active.  
Connected: 3 active, romantic/work/hobby.  
World: 5 active, sport is.

Backend entitlement az authority, nem a UI.

## Cap UX

Példa:

> You already have 3 active shared lives. Archive or leave one, or upgrade to World.

## Romantic UX

- invite ≠ relationship;
- csak accept után;
- private by default;
- bármelyik fél lezárhatja.

## Inaktivitás

UI mutathat response countot és deadline-t, de ne shame-elje a hiányzó tagot.

## Report/block

Context/member menü:

- Report;
- Block;
- Leave;
- adminnál Remove.

## Javasolt komponensek

- `connections-dashboard.tsx`
- `shared-context-view.tsx`
- `shared-invite-view.tsx`
- `shared-decision.tsx`
- `social-profile-form.tsx`
- `shared-tier-gate.tsx`

Lehetőleg ne tovább növeljük korlátlanul a jelenlegi `Experience` komponenst.


---

# 9. Privacy, consent, moderáció és törlés

## Interaction Projection

Alapelv: context-specific need-to-know projection.

Más tag ne lássa:

- teljes pénzügy;
- privát cél;
- más kapcsolat;
- más Shared Context;
- teljes personal timeline;
- raw AI memory/prompt.

## Invite consent

Valódi user aktív szereplővé csak:

```text
invite → preview → branch selection → checks → explicit accept → membership
```

## Romantic consent

- romantic create csak invitation;
- accept nélkül nincs canon relationship;
- stage escalation mutual;
- end unilateral;
- AI nem állíthat consentet/érzelmet canonként bizonyíték nélkül.

## Work/sport authority

Admin/world-role nem ad korlátlan jogot más user privát életére.

Coach/manager módosíthat Shared Context role/membership tényt, de nem írhatja át tetszőlegesen a target finance/magánélet state-jét.

## Publication

Első Shared release-ben nincs public group page.

Personal PublicSnapshot shared event esetén default:

- más user neve generic;
- private interaction profile kihagyva;
- context title szükség esetén generalizált.

Azonosítható közös történet publikálása később multi-party snapshot consent.

## Blocking

- blokkolt user nem küldhet új direct invite-ot;
- 2-fős contextnél UI leave/end opció;
- multi-member context nem törlődik automatikusan;
- shared AI ne generáljon kötelező direkt interakciót blokkolt pár között.

## Report

Target:

- context;
- event;
- member behavior;
- invite abuse.

MVP moderation:

- queue;
- soft pause/hide;
- membership restriction;
- invite rate limit;
- audit.

## Account deletion

A meglévő recovery-kompatibilis törlést ki kell bővíteni.

Törléskor:

- social profile hard delete;
- invites revoke;
- membership anonymize;
- private branch link null;
- pending impact detached;
- shared canon csak minimálisan szükséges formában marad;
- display label `Former member`;
- handle/email/private label nem marad.

## Leave

Nem delete.

- membership `left`;
- múlt megmarad;
- jövőben nem eligible;
- personal life solo folytatható.

## Remove

Admin remove:

- audit;
- shared policy;
- user personal life nem törlődik;
- saját történeti részvétel visszaolvasható, ha nincs külön safety ok.

## Privacy acceptance elv

Minden új DTO-hoz legyen negatív teszt:

> mit NEM kaphat meg egy másik user?


---

# 10. Teszt- és acceptance terv

## Tesztstílus

Kövesd a jelenlegi Vitest + PGlite mintákat:

- `tests/life-v2.test.ts`
- `tests/life-persistence.test.ts`
- `tests/life-api.test.ts`
- `tests/public-drafts.test.ts`

## Új tesztfájlok

- `tests/shared-context-domain.test.ts`
- `tests/shared-context-persistence.test.ts`
- `tests/shared-context-api.test.ts`
- `tests/shared-context-worker.test.ts`
- `tests/shared-entitlements.test.ts`
- `tests/shared-privacy.test.ts`

## Domain limitek

Kötelező:

- friend 2 és 10 fő;
- 11. reject;
- work 10/11;
- hobby 10/11;
- sport 20/21;
- romantic 2/3;
- második active romantic reject;
- tier active-context cap;
- archived nem számít;
- paused számít.

## Entitlement

- Free create reject;
- Free accept reject;
- Explorer friend accept;
- Explorer romantic/work/hobby/sport reject;
- Connected sport reject;
- World sport accept;
- downgrade history readable;
- downgrade mutation reject;
- upgrade resume.

## Invite

- valid;
- expired;
- revoked;
- duplicate;
- wrong target;
- blocked;
- context full;
- utolsó slot két párhuzamos accept: pontosan egy siker.

## Privacy

- outsider nem kap contextet;
- más member nem lát branch state-et;
- DTO nem tartalmaz emailt;
- interaction profile allowlist;
- shared AI inputban nincs private finance/goals.

## Revision/idempotency

- stale revision → 409;
- duplicate continue → ugyanaz a job;
- egy active job/context;
- duplicate intent;
- impact exactly once.

## Worker

- lease loss no commit;
- restart reclaim;
- unknown member ID reject;
- invalid state change reject;
- unauthorized personal impact reject;
- max one repair;
- receipt persisted.

## Policy

- opt-in subset;
- majority;
- tie unresolved;
- unanimous missing response;
- unanimous disagreement;
- role authority invalid role reject;
- unilateral romantic end.

## Time

- compatible branch;
- ahead/incompatible reject;
- shared event nem fordítja vissza personal effectiveAt;
- event impact nem alkalmazódik kétszer.

## Personal integration

- memory-only impact next period inputban;
- relationship projection;
- pending impact + continue konzisztens;
- personal fork nem örököl live membershipet.

## Account deletion

3-user groupból B törlése után:

- A/C context olvasható;
- B valódi azonosítói eltűntek;
- B generic member;
- B nem eligible jövőben;
- deletion recovery továbbra működik.

## Concurrency

- 20 member;
- 20 párhuzamos intent;
- user 5 contexts;
- több context párhuzamosan;
- deadlock nélkül.

## Friend MVP Definition of Done

- 2–10 valódi account;
- Explorer gate;
- secure invite;
- branch/time validation;
- shared event;
- intents;
- resolution;
- shared canon;
- personal impact;
- personal continuation;
- restart/idempotency;
- deletion;
- privacy;
- `pnpm check` zöld.


---

# 11. Implementációs roadmap

## S0 — Foundation

AI nélkül:

- shared contracts;
- shared core;
- migration;
- repository;
- social profile;
- entitlement;
- context create/list/detail;
- invite/accept;
- tests.

## S1 — Friend deterministic MVP

Explorer:

- 2–10 member;
- 1 active context;
- branch/time binding;
- deterministic test/shared event;
- intents;
- resolution;
- memory-only impacts.

Először AI nélkül legyen végigvihető.

## S2 — Shared AI

- `SharedAiProvider`;
- shared jobs;
- worker;
- validator/repair;
- AI budget.

## S3 — Personal integration

- pending impact materialization;
- `memory.sharedEvents`;
- next personal period;
- UI notification;
- personal fork rules.

## S4 — Connected romantic

- max 2;
- max 1/user;
- mutual formation/escalation;
- unilateral end;
- abuse/privacy tests.

## S5 — Connected work/project + hobby

- roles;
- governance;
- majority/role authority;
- type state;
- leave/remove;
- typed personal impacts.

Financial ownership csak külön validált adapterrel.

## S6 — World sport

- max 20;
- roster;
- coach/captain;
- participant subset;
- concurrency/quorum.

## S7 — Advanced

- context split;
- group fork;
- sponsored seats;
- searchable directory;
- public multi-party snapshot;
- richer SharedEntity.

## Fájltérkép

### contracts
`shared-context.ts`, index export, error messages.

### core
`shared-context.ts`: state validator, policy resolver, impact adapter, time compatibility.

### database
`shared-contexts.ts`, `shared-jobs.ts`, entitlement, deletion anonymization.

### API
Új `SharedContextController`; az `app.ts` később modularizálható.

### worker
`shared-processor.ts`, fair queue.

### AI
`SharedAiProvider` + OpenAI implementation.

### web
Connections dashboard/context/invite/decision/social profile.

### docs
Frissítendő:
- root README;
- STATUS;
- IMPLEMENTATION;
- PRODUCT_PLAN;
- NEXT_STEPS;
- REQUIREMENTS_TRACEABILITY.

## Feature flags

```text
SHARED_CONTEXTS_ENABLED=false
SHARED_FRIEND_ENABLED=false
SHARED_CONNECTED_ENABLED=false
SHARED_WORLD_ENABLED=false
```

Foundation deployolható kikapcsolt funkcióval.

## Rollout

schema → backend read → backend mutation → tests → friend UI → friend beta → shared AI → Connected → World.


---

# 12. Implementáló agent végrehajtási checklist

**Repository baseline:** `Muzsy/future_flow`  
**Branch:** `main`  
**Audited commit:** `b75e61ddc0a6dbdc31653a8c58d5c251e2f95aa8`  
**Audit date:** 2026-10-04  


## Indulás

- HEAD ellenőrzés.
- Ha eltér a baseline-tól, diff.
- Olvasd: root README, STATUS, PRODUCT_PLAN, V2_SIMULATION_CONTRACT, PUBLIC_CONTENT_IMPLEMENTATION_PLAN, `apps/web/AGENTS.md`.
- Migrációs sorszám újraellenőrzés.
- Alkalmazott migrációt ne módosíts.

## Invariánsok

- personal ownership egyuseres;
- SharedContext külön domain;
- nincs ownership bypass más branchére;
- interaction projection nélkül nincs shared AI;
- AI output domain-validált;
- nincs arbitrary JSON mutation;
- nincs AI user-proxy;
- nincs automatikus publication;
- nincs hardcoded ár core-ban;
- tier gate server-side.

## Első PR

Csak foundation:

- contract/core;
- migration;
- repository;
- social profile;
- entitlement;
- friend create/list/detail;
- invite/accept/decline;
- tests.

AI még ne legyen.

## Második PR

- intents;
- deterministic resolution;
- impacts;
- personal memory integration;
- tests.

## Harmadik PR

- shared jobs;
- SharedAiProvider;
- worker;
- friend UI;
- paid smoke csak engedéllyel.

## Web

`apps/web/AGENTS.md` kötelező. Telepített Next dokumentációt olvasd el módosítás előtt.

## Parancsok

```bash
pnpm build:packages
pnpm schemas
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm check
```

## AI költség

Automatizált teszt nem használ paid API-t. Valódi smoke csak explicit kerettel/guarddal.

## Dokumentáció

Minden fázis után a repo státusz dokumentumai a valós implementációt tükrözzék.

## Tiltott shortcutok

- personal `is_shared` flag;
- közös company/team state másolása minden personal state-be;
- email public user lookup;
- kliens által megadott role/weight vak bizalma;
- client-only tier gate;
- minden group member automatikus `actors`-ba másolása;
- 20 personal branch egyetlen hosszú transactionben;
- AI által kitalált más-user intent.


---

# 13. Referenciaforgatókönyvek

## A. Két barát

Mindketten Explorer.

Create → secure invite → branch select → accept → shared AI event → individual opt-in → resolution → mindkét user memory impact → saját következő period azonos shared canonra hivatkozik.

## B. Tízfős baráti társaság

10/10. A 11. accept `SHARED_CONTEXT_FULL`.

Egy esemény csak 6 tagot érinthet; a másik 4 user nem kap personal impactot.

## C. Párkapcsolat

Mindketten Connected.

- romantic invite;
- mutual accept;
- második romantic context reject;
- commitment unanimous;
- breakup unilateral;
- context ended;
- partner personal life breakup shared factet kap;
- AI nem „gondolja meg” helyettük.

## D. Hatfős közös projekt

Roles: owner/operations/engineering/sales.

Befektetési ajánlat → majority/weighted policy → Shared State egyszer frissül. Személyes pénz csak saját explicit investment intent alapján változhat.

## E. 20 fős sportcsapat

World.

20 membership, event participant subset 14, coach authority taktikai döntésre, attendance opt-in, team result shared canon. 21. member reject.

## F. Inaktív tag

8-fős friend group, majority, quorum 5, deadline 48h. 6 válasz után resolve. A hiányzó user helyett nem generálunk személyes döntést.

## G. Downgrade

Connected → Explorer.

History marad. Csak egy friend context aktív. Romantic/work `paused_entitlement`. Upgrade után resume.

## H. Personal fork

Fork nem örököl live shared membershipet. Addigi shared memory snapshot használható. Más user nincs forkollva.

## I. Account deletion

5-fős projectből 1 user töröl.

A többiek canonja megmarad, deleted user generic former member, handle/email/branch link eltűnik.

## J. Későbbi context split

10-fős hobby groupból 4 ember új projektet indít. Új SharedContext új ID-val, provenance linkkel és külön opt-innel.


---

# 14. Referencia implementációs blueprint

Ez a fájl a legfontosabb repository tranzakciókat pszeudokóddal rögzíti.

## 1. `SharedContextRepository.create`

```text
input: userId, branchId, type, title, idempotencyKey

transaction:
  lock ff_users(userId)
  require active account
  load entitlement
  require type allowed
  count slot-consuming memberships
  require count < tier activeContexts
  if romantic:
    require no active romantic membership
  lock/read branch through LifeRepository ownership
  require branch ready/decision, not deleting
  build interaction profile allowlist
  create context(status=inviting, simulation_at=branch.state.effectiveAt)
  create creator member(active)
  persist idempotency result
return context
```

A creator membership már slotot fogyaszt.

## 2. `createInvite`

```text
transaction:
  lock requester user
  lock context
  require requester active member + invite permission
  require context not ended/archived
  count active members + live pending accepted reservation if needed
  require under type cap
  require no block
  create random token
  store hash only
  insert pending invite with expiry
```

Ha direct target user ismert, rate limit user-páronként is legyen.

## 3. `acceptInvite`

Ez concurrency-kritikus.

```text
transaction:
  lock invite
  verify token/status/expiry
  lock user rows determinisztikus UUID sorrendben
  lock context
  re-check context revision/status/member cap
  require recipient entitlement
  count recipient slot-consuming contexts
  require under tier cap
  if romantic: require no other active romantic
  load recipient branch through normal ownership
  validate time compatibility
  build interaction projection
  insert membership
  invite accepted
  if min member requirement reached: context active
  context revision++
```

A capot **mindig acceptkor újra ellenőrizni kell**, nem csak invite készítéskor.

## 4. `continueSharedContext`

```text
transaction:
  lock requester
  lock context
  require active member
  require entitlement
  require no pending event/decision
  require no active shared job
  require expected revision
  reserve generation quota/idempotency
  create aw_shared_job(base_revision=current)
return job
```

Az AI hívás nem API request tranzakción belül fut.

## 5. Shared worker commit

```text
claim job with lease
build SharedEventInput from:
  context state
  member interaction projections
  recent shared canon
  governance

AI candidate
validate schema
validate type/policy/member IDs/authority/time

transaction:
  verify lease
  lock context
  require revision == base_revision
  revalidate candidate
  insert immutable event
  insert participant rows
  update context state to state_after_event
  set pending_event_id if decision
  revision++
  persist receipts
  complete job
```

## 6. `submitIntent`

```text
transaction:
  lock user
  lock context
  load pending event
  require active eligible member
  require event/context revision compatible
  require option exists
  insert unique intent
  tryResolve()
```

MVP intent final. Dupla ugyanazzal az idempotency key-jel ugyanazt az eredményt adja; eltérő option conflict.

## 7. `tryResolve`

Deterministic, AI nélkül.

```text
load eligible members + active entitlement state
load intents
evaluate policy

if unresolved:
  return waiting

validate selected sharedChanges
apply to shared state
derive allowed member impacts

transaction:
  lock context/event
  ensure still unresolved
  insert immutable resolution
  update context state
  clear pending_event_id
  revision++
  insert immutable impact payloads (pending)
```

Policy resolver pure core függvény legyen, külön tesztelhető.

## 8. `materializePendingSharedImpacts`

Ezt a personal branch műveletek előtt használjuk.

```text
transaction:
  lock personal branch
  verify requested personal revision
  select pending impacts for exact target branch ordered by effective_at,created_at
  for each:
    require effective_at >= current state.effectiveAt
    apply safe impact adapter
    mark applied
  if any state mutation:
    branch.state = next
    branch.revision++
return current branch + applied shared memory
```

A `continue` ezt követően az **internal új revisionnel** queue-olja a personal jobot; a kliensnek nem kell köztes 409-et kapnia csak azért, mert közben shared impact érkezett.

## 9. Pure policy API

`packages/core/src/shared-context.ts` javasolt exportok:

```ts
validateSharedState(raw)
validateSharedEventCandidate(raw, context, members)
resolveSharedDecision(event, intents, members, now)
validateSharedImpact(proposal, authorityContext)
applySharedChanges(state, changes, effectiveAt)
applySharedImpactsToLifeStateV2(state, impacts)
isSharedTimeCompatible(contextDate, branchEffectiveAt)
sharedTierAllows(tier, type, currentActiveCount)
```

## 10. Repository API

Javasolt `SharedContextRepository` publikus metódusok:

```ts
socialProfile(userId)
saveSocialProfile(userId, input)

list(userId)
detail(userId, contextId)
create(userId, branchId, input, idempotencyKey)

createInvite(userId, contextId, input, idempotencyKey)
listInvites(userId)
acceptInvite(userId, inviteTokenOrId, branchId, revision, idempotencyKey)
declineInvite(userId, inviteId)

continue(userId, contextId, revision, idempotencyKey)
submitIntent(userId, contextId, eventId, revision, optionId, idempotencyKey)

leave(userId, contextId, revision, idempotencyKey)
removeMember(userId, contextId, memberId, revision, idempotencyKey)

pendingImpacts(userId, branchId)
materializeImpacts(tx, userId, branch)
anonymizeUser(userId, tx)
```

## 11. Shared Job Repository

A `LifeJobRepository` mintájára:

```ts
claim()
heartbeat(job)
checkpoint(job, stage, patch)
complete(job, candidate, receipts)
fail(job,error)
```

A complete újra validáljon mindent a tranzakcióban.

## 12. Metrics

Minimális események:

- `shared_context_created`
- `shared_invite_created`
- `shared_invite_accepted`
- `shared_context_activated`
- `shared_generation_clicked`
- `shared_event_completed`
- `shared_intent_submitted`
- `shared_resolution_completed`
- `shared_impact_applied`
- `shared_context_left`
- `shared_context_archived`
- `shared_upgrade_blocked`

Analitikába ne menjen prompt, story text, goal vagy private profile.

## 13. Personal AI prompt bővítés

A personal `periodRules` kapjon elvet:

```text
Shared events supplied by the server are canonical external facts.
Do not invent a real linked user's unrecorded decisions, feelings, promises or private state.
Do not contradict resolved shared events.
```

A shared memory legyen kis, strukturált és canonból képzett.

## 14. State projection elv

20 fős team esetén ne legyen 19 új actor automatikusan.

Csak:

- context summary;
- member display projection runtime;
- olyan member kap local actor linket, aki a személyes narratívában ténylegesen tartós, jelentős szereplővé vált.

Így az `actors.max(30)` nem lesz rejtett skálázási limit.

## 15. Első implementációs vertikális slice

Az agentnek először ezt kell végigvinni:

```text
Explorer user A
→ create friend_group
→ invite token
→ Explorer user B accepts with branch
→ context active
→ deterministic shared event fixture
→ both submit intent
→ pure resolver
→ resolution
→ pending memory impacts
→ A personal continue
→ A story input contains shared event
→ B personal continue
→ B story input contains same shared canon
```

Ha ez restart után, PGlite integrációban és API-n át működik, az architekturális mag helyes.

Csak ezután jöjjön a Shared AI.
