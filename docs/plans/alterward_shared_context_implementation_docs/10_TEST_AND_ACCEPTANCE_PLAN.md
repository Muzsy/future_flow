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
