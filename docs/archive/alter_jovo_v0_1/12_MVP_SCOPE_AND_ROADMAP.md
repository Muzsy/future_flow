# Alter Jövő — MVP scope és roadmap

## 1. MVP cél

Az MVP egyetlen kérdést validál:

> Elég érdekes és személyes-e a strukturált profilból generált, elágaztatható alternatív jövő ahhoz, hogy a felhasználó visszatérjen?

## 2. MVP kötelező funkciók

### Account
- regisztráció;
- login/logout;
- account törlés alap.

### Profil
- strukturált onboarding;
- draft;
- minimum profile;
- summary;
- profile version commit.

### Simulation
- baseline future;
- 10 éves horizon;
- strukturált eventek;
- life state;
- legalább 1 decision.

### Story
- első 2–3 chapter;
- timeline;
- egyszerű „miért?” magyarázat.

### Branch
- decision;
- új branch;
- minimális compare.

### Platform
- job queue;
- AI orchestration;
- basic observability;
- basic admin/support.

## 3. Nem MVP

- mobilapp;
- DM;
- teljes community;
- follower;
- payment;
- complex world data;
- valós gazdasági előrejelzés;
- képgenerálás;
- voice;
- páros jövő;
- push;
- gamification;
- klinikai pszichológiai teszt;
- soknyelvűség.

## 4. Fázis 0 — foundation

Output:
- fogalomtár;
- questionnaire v0;
- profile schema;
- simulation schema;
- story schema;
- wireframe;
- repo;
- CI;
- staging.

Exit:
- fake-data end-to-end;
- profile draft menthető;
- OpenAPI működik.

## 5. Fázis 1 — profile MVP

Funkció:
- auth;
- onboarding;
- questionnaire;
- profile commit;
- summary.

Exit:
- 10 synthetic profile;
- schema-valid;
- version immutable;
- user javíthat.

## 6. Fázis 2 — simulation vertical slice

Funkció:
- future create;
- queue;
- initial state;
- event generator;
- validator;
- persistence.

Exit:
Egy profilból:
- 5–10 event;
- időrendi konzisztencia;
- event causes;
- decision.

API-ból már működjön.

## 7. Fázis 3 — story

- chapter generation;
- fidelity validator;
- chapter UI;
- timeline.

Exit:
- nem hoz létre fontos canonon kívüli tényt;
- eventRefs;
- természetes magyar.

## 8. Fázis 4 — branching

- decision options;
- freeform parse;
- fork;
- re-simulate;
- compare.

Exit:
Egy decisionből két stabil branch.

## 9. Fázis 5 — closed alpha

20–50 tesztelő.

Mérjük:
- profile completion;
- first future completion;
- személyesség;
- hibák;
- branch használat;
- AI költség.

Kvalitatív interjú fontos.

## 10. Fázis 6 — beta

Csak ha alpha igazolja:
- onboarding finomítás;
- story feed;
- feature flags;
- subscription skeleton;
- export/delete;
- security review;
- community prototype.

## 11. Community roadmap

- C0: nincs community.
- C1: unlisted story link.
- C2: anonim story feed.
- C3: tematikus cluster.
- C4: aggregált insight.

## 12. Mobile roadmap

Mobil csak akkor:
- web retention igazolt;
- stabil API;
- stabil auth;
- stabil notification model.

Első mobil:
- login;
- feed;
- chapter;
- decision;
- quick profile update;
- notification.

## 13. Prioritás

1. profile quality;
2. simulation consistency;
3. first story;
4. branch;
5. retention;
6. monetization;
7. community;
8. mobile.

## 14. Feature flags

Indulástól:
- conversational enrichment;
- serialized chapters;
- community;
- freeform decision;
- alternate model.

## 15. Stop criteria

Ha alpha alatt:
- nem töltik ki a profilt;
- horoszkópérzet;
- branch érdektelen;
- AI költség magas;

akkor a core loopot kell javítani, nem mobilappot építeni.

## 16. MVP Definition of Done

- regisztráció;
- minimum profile ≤ 15 perc;
- immutable profile version;
- future job stabil;
- timeline + 2–3 chapter;
- decision;
- új branch;
- compare;
- account delete;
- nincs érzékeny raw log;
- legalább 20 alpha useren fut.
