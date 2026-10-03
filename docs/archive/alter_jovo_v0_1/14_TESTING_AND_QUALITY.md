# Alter Jövő — tesztelési és minőségi stratégia

## 1. Két hibakategória

1. hagyományos szoftverhiba;
2. generatív minőségi hiba.

Mindkettőre külön teszt kell.

## 2. Tesztpiramis

### Unit
- scoring;
- validator;
- state transition;
- branch logic;
- permission helper.

### Integration
- DB;
- auth;
- queue;
- repository;
- transaction.

### Contract
- OpenAPI;
- AI schema;
- generated client.

### E2E
- onboarding;
- future;
- branch;
- delete/export.

### AI eval
- semantic quality;
- consistency;
- safety.

## 3. Domain invariant

Példák:
- fork előtti event immutable;
- event sequence növekvő;
- state időrend;
- decision saját branchhez tartozik;
- future profile version immutable;
- chapter csak létező eventet referál.

## 4. Property-based teszt

Jó terület:
- timeline;
- branch graph;
- state transition;
- score normalization.

Invariant:
- sequence unique;
- dátum nem megy vissza;
- state hash reprodukálható.

## 5. Synthetic profile

Legalább 20, később 50+.

Archetípus:
- stabil alkalmazott;
- career switcher;
- családcentrikus;
- vállalkozó;
- introvertált kreatív;
- magas risk tolerance;
- alacsony change seeking.

Mind mesterséges.

## 6. Golden simulation

Fix:
- profile;
- seed;
- rules.

Nem teljes szövegegyezés.

Assert:
- event type;
- kulcs state;
- tiltott event nincs;
- invariantok.

## 7. AI eval

### Event
- relevancia;
- hihetőség;
- változatosság;
- ismétlődés;
- dramatizálás;
- profile fidelity.

### Story
- canon fidelity;
- természetes magyar;
- tone;
- contradiction;
- hallucinated facts.

### Extraction
- precision;
- recall;
- confidence;
- túlértelmezés.

## 8. Human eval rubric

1–5:
- személyes;
- hihető;
- következetes;
- érdekes;
- érthető;
- mennyire érzed jóslásnak;
- folytatnád-e.

A „jóslás” dimenzióban alacsonyabb érték jobb.

## 9. Safety eval

Teszt:
- depresszív free text;
- önkárosító tartalom;
- pénzügyi félelem;
- kapcsolat konfliktus;
- third-party PII;
- kiskorú adat.

A story ne használja ki dramaturgiára.

## 10. Authorization

Minden owned endpoint:
- own resource;
- other user's resource;
- missing token;
- expired token.

## 11. RLS

Ha Data API:
- anon;
- own authenticated;
- other authenticated;
- service role.

## 12. Performance

Példacél:
- normál API P95 < 500 ms AI nélkül;
- profile load < 1 s;
- first future async;
- nincs többperces blocking HTTP.

## 13. Load

Launch előtt:
- auth burst;
- autosave;
- enqueue;
- job polling/status.

## 14. Resilience

Teszt:
- AI timeout;
- 429;
- invalid JSON;
- DB transient fail;
- worker restart;
- duplicate message;
- browser refresh generation közben.

## 15. Migration

- staging snapshot;
- up migration;
- compatibility;
- rollback/forward-fix terv.

## 16. Story regression

Prompt/model csere előtt ugyanazon synthetic profilon.

Compare:
- cost;
- invalid rate;
- human score;
- safety.

## 17. Quality gate

Merge:
- lint;
- typecheck;
- unit;
- integration;
- contract;
- migration.

Release:
- e2e;
- security smoke;
- AI eval;
- delete/export smoke.

## 18. Severity

- **S0:** adatbiztonság/auth bypass/súlyos safety.
- **S1:** adatvesztés/más user adat/future corruption.
- **S2:** core flow törött.
- **S3:** részfunkció/UI.

S0/S1 release blocker.
