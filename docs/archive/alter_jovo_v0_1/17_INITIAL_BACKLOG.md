# Alter Jövő — kezdeti backlog

## Epic 0 — Project foundation

### AJ-001 Monorepo
**AC**
- web/api/worker app;
- shared config;
- lockfile;
- root README.

### AJ-002 CI
**AC**
- lint;
- typecheck;
- unit test;
- build.

### AJ-003 Local environment
**AC**
- dokumentált indítás;
- `.env.example`;
- mock AI.

### AJ-004 Staging
**AC**
- külön env;
- health endpoint;
- deploy pipeline.

---

## Epic 1 — Authentication

### AJ-101 Supabase Auth
- email/password vagy magic link;
- session;
- logout.

### AJ-102 Backend auth guard
- token verify;
- internal user mapping.

### AJ-103 Account delete skeleton
- re-auth;
- request;
- audit.

---

## Epic 2 — Questionnaire

### AJ-201 Questionnaire schema
- section;
- question;
- answer type;
- version.

### AJ-202 Questionnaire API
- load;
- answer save;
- resume.

### AJ-203 Questionnaire UI
- progress;
- navigation;
- autosave.

### AJ-204 Minimum profile validator
- missing requirements;
- completion dimensions.

---

## Epic 3 — Profile

### AJ-301 Profile draft
### AJ-302 Profile commit/version
### AJ-303 Trait scoring
### AJ-304 Profile summary
### AJ-305 Profile review/edit

**DoD**
- committed profile immutable;
- summary;
- version id;
- update új verziót hoz létre.

---

## Epic 4 — Relationships

### AJ-401 Relationship CRUD
### AJ-402 Pseudonym labels
### AJ-403 Relationship state

---

## Epic 5 — AI infrastructure

### AJ-501 AI provider interface
### AJ-502 Mock provider
### AJ-503 Primary provider adapter
### AJ-504 Prompt registry
### AJ-505 Structured output validation
### AJ-506 Token/cost logging
### AJ-507 Retry + timeout

---

## Epic 6 — Jobs

### AJ-601 Job table
### AJ-602 Queue integration
### AJ-603 Worker
### AJ-604 Job status API
### AJ-605 Web progress UI

---

## Epic 7 — Future simulation

### AJ-701 Future entity
### AJ-702 Initial life-state builder
### AJ-703 Candidate event schema
### AJ-704 AI event generator
### AJ-705 Event validator
### AJ-706 State transition
### AJ-707 Timeline persistence
### AJ-708 Simulation consistency check

---

## Epic 8 — Story

### AJ-801 Chapter schema
### AJ-802 Chapter prompt
### AJ-803 Canon fidelity validator
### AJ-804 Chapter API
### AJ-805 Chapter UI
### AJ-806 Timeline UI

---

## Epic 9 — Decision / Branch

### AJ-901 Decision option generator
### AJ-902 Decision UI
### AJ-903 Resolve option
### AJ-904 Freeform parse
### AJ-905 Branch fork
### AJ-906 Re-simulate
### AJ-907 Branch compare

---

## Epic 10 — Privacy / Security

### AJ-1001 Object authorization tests
### AJ-1002 RLS policies
### AJ-1003 Log redaction
### AJ-1004 Export v0
### AJ-1005 Delete v1
### AJ-1006 Privacy copy
### AJ-1007 AI transparency labels

---

## Epic 11 — Quality

### AJ-1101 Synthetic profile fixtures
### AJ-1102 Golden simulation
### AJ-1103 AI eval harness
### AJ-1104 E2E onboarding
### AJ-1105 E2E future
### AJ-1106 E2E branch

---

## Sprint 0 javaslat

1. AJ-001
2. AJ-002
3. AJ-003
4. AJ-101
5. AJ-102
6. AJ-201
7. AJ-501
8. AJ-502
9. DB migration framework
10. OpenAPI bootstrap

**Output:** technikai skeleton + auth + questionnaire schema.

## Sprint 1

1. questionnaire API/UI;
2. profile draft;
3. profile commit;
4. trait scoring;
5. relationships;
6. synthetic profiles.

**Output:** teljes profile vertical slice.

## Sprint 2

1. job/queue;
2. future create;
3. mock simulation;
4. timeline UI;
5. AI event generator.

**Output:** első strukturált future.

## Sprint 3

1. chapter AI;
2. story validator;
3. chapter UI;
4. decision generator.

**Output:** első teljes Alter Jövő élmény.

## Sprint 4

1. branch fork;
2. freeform decision;
3. compare;
4. analytics;
5. privacy/delete/export.

**Output:** alpha-ready core loop.

## Definition of Ready

Minden ticket:
- cél;
- domain impact;
- API/schema impact;
- privacy/security impact;
- acceptance criteria;
- tesztterv.

## Definition of Done

- code merged;
- tests;
- typecheck;
- docs frissítve;
- migration ha kell;
- API contract frissítve;
- telemetry;
- no sensitive log.
