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
