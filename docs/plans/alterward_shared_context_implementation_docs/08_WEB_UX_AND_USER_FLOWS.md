# 8. Web UI és user flow

## Jelenlegi frontendhez illesztés

Aktuális:

- `apps/web/app/[...route]/page.tsx` → `Experience`;
- `components/experience.tsx`;
- `components/life-experience.tsx`;
- `lib/client.ts`.

Implementáció előtt kötelező elolvasni `apps/web/AGENTS.md` és az ott hivatkozott telepített Next.js dokumentációt.

## Új fő felület

Nav elem: **Connections**

Route: `/connections`

Tartalom:

- active contexts;
- paused contexts;
- pending invites;
- create new connection;
- archived.

## Social profile setup

Első Shared funkció előtt:

- display name;
- handle;
- discoverability;
- rövid privacy magyarázat.

Email nem jelenik meg.

## Friend context creation

1. Connections.
2. `Create friendship`.
3. saját life/branch választás.
4. context cím.
5. create.
6. secure invite link.
7. recipient login.
8. saját branch kiválasztás.
9. entitlement/time/privacy check.
10. explicit accept.
11. context active.

## Context page

`/connections/:id`

- title/type;
- simulation date;
- member display names;
- roles;
- shared timeline;
- current shared situation;
- pending decision;
- response státusz;
- `Continue group`;
- leave/archive.

Chat nem szükséges.

## Decision UX

- saját választás;
- pl. `6/8 responded`;
- deadline;
- resolution után közös eredmény.

Más tag választását resolution előtt alapból ne mutassuk, ha az befolyásolhatja a döntést.

## Personal life integration

Pending shared impact:

> Something changed in your shared life.

A user megnyithatja a contextet. Personal continue már a materializált impactből dolgozik.

## Tier UX

Free: invite preview + upgrade, accept nincs.  
Explorer: friend only, 1 active.  
Connected: 3 active, romantic/work/hobby.  
World: 5 active, sport is.

Backend entitlement az authority, nem a UI.

## Cap UX

Példa:

> You already have 3 active shared lives. Archive or leave one, or upgrade to World.

## Romantic UX

- invite ≠ relationship;
- csak accept után;
- private by default;
- bármelyik fél lezárhatja.

## Inaktivitás

UI mutathat response countot és deadline-t, de ne shame-elje a hiányzó tagot.

## Report/block

Context/member menü:

- Report;
- Block;
- Leave;
- adminnál Remove.

## Javasolt komponensek

- `connections-dashboard.tsx`
- `shared-context-view.tsx`
- `shared-invite-view.tsx`
- `shared-decision.tsx`
- `social-profile-form.tsx`
- `shared-tier-gate.tsx`

Lehetőleg ne tovább növeljük korlátlanul a jelenlegi `Experience` komponenst.
