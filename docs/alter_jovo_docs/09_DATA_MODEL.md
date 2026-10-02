# Alter Jövő — adatmodell

## 1. Elvek

- PostgreSQL az igazságforrás.
- Opaque UUID/ULID-szerű ID-k.
- timestamps.
- audit érzékeny műveletekre.
- profile/future/branch verziózás.
- JSONB csak rugalmas state/meta célra.

## 2. Entitásgráf

```text
User
 ├─ Profile
 │  ├─ ProfileVersion
 │  ├─ TraitValue
 │  ├─ Goal
 │  └─ Relationship
 │
 └─ Future
    └─ Branch
       ├─ LifeState
       ├─ Event
       ├─ Decision
       ├─ Chapter
       └─ ScenarioOverride
```

## 3. users

```text
id
auth_user_id
status
locale
timezone
created_at
updated_at
deleted_at
```

Jelszó nem kerül ide.

## 4. profiles

```text
id
user_id
current_version_id
completion_score
created_at
updated_at
```

## 5. profile_versions

```text
id
profile_id
version_no
source
supersedes_id
facts_json
preferences_json
created_at
created_by
```

## 6. trait_definitions

```text
id
key
name
description
min_value
max_value
active
version
```

## 7. profile_trait_values

```text
id
profile_version_id
trait_definition_id
value
confidence
source_type
user_confirmed
evidence_json
created_at
```

Unique:
`profile_version_id + trait_definition_id`

## 8. profile_goals

```text
id
profile_version_id
category
title
importance
time_horizon
progress
control_level
active
```

## 9. relationships

```text
id
user_id
label
relation_type
privacy_class
created_at
```

### relationship_states

```text
id
relationship_id
profile_version_id
closeness
contact_frequency
support_level
conflict_level
distance_category
metadata_json
```

Valódi név opcionális, lehetőleg külön PII mezőben.

## 10. futures

```text
id
user_id
profile_version_id
title
horizon_start
horizon_end
root_branch_id
simulation_version
status
created_at
```

## 11. branches

```text
id
future_id
parent_branch_id
fork_event_id
fork_decision_id
name
seed
status
created_at
```

## 12. life_states

```text
id
branch_id
effective_at
sequence_no
state_json
state_hash
created_at
```

MVP-ben JSONB, de erős schema validation.

## 13. events

```text
id
branch_id
sequence_no
event_type
title
window_start
window_end
salience
uncertainty
decision_required
causes_json
effects_json
metadata_json
created_at
```

Unique:
`branch_id + sequence_no`

## 14. event_relationships

```text
event_id
relationship_id
role
```

## 15. decisions

```text
id
branch_id
event_id
prompt
status
selected_option_id
freeform_input
parsed_decision_json
created_at
resolved_at
```

## 16. decision_options

```text
id
decision_id
option_key
label
description
constraints_json
effects_hint_json
sort_order
```

## 17. scenario_overrides

```text
id
branch_id
override_type
path
old_value
new_value
created_at
```

## 18. chapters

```text
id
branch_id
chapter_no
title
body
summary
prompt_version
model_metadata_json
published_at
created_at
```

## 19. chapter_events

```text
chapter_id
event_id
sort_order
```

Így a narratíva visszaköthető a canonhoz.

## 20. ai_runs

```text
id
user_id
task_type
resource_type
resource_id
provider
model
prompt_id
prompt_version
input_hash
output_hash
input_tokens
output_tokens
estimated_cost
latency_ms
validation_status
created_at
```

## 21. jobs

```text
id
user_id
job_type
resource_type
resource_id
status
progress_json
attempt
error_code
error_message_safe
created_at
started_at
completed_at
```

## 22. community_posts később

```text
id
user_id
branch_id
chapter_id
visibility
anonymized_payload
body
status
created_at
```

A publikus payload legyen külön a privát forrástól.

## 23. audit_logs

```text
id
actor_type
actor_id
action
resource_type
resource_id
metadata_safe_json
created_at
```

Logolandó:
- export;
- delete;
- admin access;
- privacy change;
- consent;
- moderation.

## 24. consents

```text
id
user_id
consent_type
policy_version
status
created_at
withdrawn_at
```

## 25. notifications

```text
id
user_id
type
channel
payload_json
status
scheduled_at
sent_at
read_at
```

## 26. RLS

Ha Supabase Data API közvetlenül érintett:
- saját row only;
- community public view külön;
- service role csak backend;
- admin audit.

Backend object-level authorization ettől függetlenül kötelező.

## 27. Account delete

1. request;
2. re-auth;
3. törlés/anonymization;
4. community policy;
5. storage;
6. auth user;
7. minimális jogszerű audit.

## 28. Export

Exportálandó:
- profile;
- versions;
- relationships;
- futures;
- branches;
- events;
- chapters;
- community;
- consents.

## 29. Migration

Minden schema change migráció.

Productionben tilos:
- kézi dashboard schema edit;
- ORM auto-sync.
