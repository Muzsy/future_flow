# Alter Jövő — fejlesztői ügynök átadási dokumentum

## 1. Küldetés

Az első cél egy stabil vertical slice:

> regisztráció → strukturált profil → profile version → future job → strukturált timeline → chapter → decision → új branch.

Ne a teljes víziót építsd egyszerre.

## 2. Kötelező architekturális szabályok

1. AI provider közvetlenül nem hívható frontendből.
2. Story text nem canonical state.
3. AI state output schema-validált.
4. Future konkrét profile versionhöz kötött.
5. Fork előtti branch-adat immutable.
6. Minden user resource backend authorization checket kap.
7. Raw profilt ne logolj.
8. Service-role kulcs nem kerül kliensbe.
9. Microservice külön indok nélkül tilos.
10. Community nem előzi meg a core loopot.

## 3. Implementációs sorrend

1. repo + CI + health;
2. auth;
3. questionnaire + profile draft;
4. profile commit;
5. mock future;
6. real simulation AI;
7. story;
8. decision + branch;
9. privacy workflow;
10. alpha hardening.

## 4. Első működő demo

Először AI nélkül:

- synthetic profile;
- hardcoded structured future;
- 3 event;
- 1 chapter;
- 1 decision;
- 1 branch.

Ezzel validáljuk:
- API;
- schema;
- UI;
- state transition;
- branch graph.

Utána kapcsoljuk be az AI-t.

## 5. Domain ownership

### Profile
- questionnaire-derived profile;
- trait;
- version.

### Simulation
- life state;
- event;
- transition;
- consistency.

### Story
- chapter;
- narrative rendering.

### AI
- provider;
- prompt;
- model policy;
- output validation adapter.

### Future/Branch
- future graph;
- branch lifecycle;
- fork.

## 6. Ha valami nincs specifikálva

1. ne találj ki nagy termékdöntést csendben;
2. válaszd a legegyszerűbb visszafordítható implementációt;
3. dokumentáld TODO/ADR-ben;
4. ne terjeszd ki a scope-ot.

## 7. Első DB migrációk

1. users;
2. profiles;
3. profile_versions;
4. trait_definitions;
5. profile_trait_values;
6. relationships;
7. futures;
8. branches;
9. life_states;
10. events;
11. decisions/options;
12. chapters;
13. jobs;
14. ai_runs;
15. audit_logs.

## 8. Első endpointok

- `GET /api/v1/me`
- `GET /api/v1/questionnaires/current`
- `POST /api/v1/questionnaires/current/answers`
- `GET /api/v1/profile`
- `POST /api/v1/profile/draft/commit`
- `POST /api/v1/futures`
- `GET /api/v1/jobs/:id`
- `GET /api/v1/futures/:id`
- `GET /api/v1/branches/:id/timeline`
- `GET /api/v1/branches/:id/chapters`
- `POST /api/v1/decisions/:id/resolve`

## 9. Első AI interfész

Csak:
- `MockAiProvider`
- `PrimaryAiProvider`

Ne implementálj több valós providert az első sprintben.

## 10. Első promptok

Prioritás:
1. event candidates;
2. chapter;
3. decision options;
4. freeform decision parse.

Profile text extraction nem szükséges az első vertical slice-hoz.

## 11. Tesztfixture

Synthetic profilok:
- `persona_stable_worker`
- `persona_career_switcher`
- `persona_social_adventurer`
- `persona_family_focused`
- `persona_entrepreneurial`

Production user export tesztadatként tilos.

## 12. Első UI route-ok

1. `/`
2. `/login`
3. `/onboarding`
4. `/profile`
5. `/future/new`
6. `/future/[id]`
7. `/branch/[id]`
8. `/settings/privacy`

## 13. Generation UX

A future async.

Ne:
- tarts nyitva hosszú requestet;
- mutass végtelen spinnert.

Igen:
- job state;
- stage;
- retry;
- refresh-safe státusz.

## 14. Most még ne építsd

- chat;
- community;
- payment;
- mobile;
- DM;
- image generation;
- vector DB;
- agent swarm;
- Kafka;
- Kubernetes;
- microservices.

## 15. Alpha gate

20 synthetic/tesztprofilból legalább 18-nál:
- future elkészül;
- nincs domain-invalid state;
- story nem mond ellent a canonnak;
- branch létrejön;
- delete/export működik.

## 16. Dokumentáció mint szerződés

Elsődleges:
- `04_SIMULATION_ENGINE.md`
- `08_SYSTEM_ARCHITECTURE.md`
- `09_DATA_MODEL.md`
- `10_API_SPEC.md`
- `11_SECURITY_PRIVACY_COMPLIANCE.md`

Ha kód és dokumentáció eltér, a driftet javítani vagy ADR-rel dokumentálni kell.
