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
