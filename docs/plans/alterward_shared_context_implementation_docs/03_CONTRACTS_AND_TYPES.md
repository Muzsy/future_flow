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
