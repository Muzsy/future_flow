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
