# 2. Termék- és domain szabályok

## SharedContext

`SharedContext` = több valódi felhasználó konkrét alternatív brancheinek közös szimulációs tere.

Saját state, revision, simulation time, member list, roles, events, decisions és canon tartozik hozzá.

## Típusok

```ts
type SharedContextType =
  | 'friend_group'
  | 'romantic_relationship'
  | 'work_project'
  | 'hobby_group'
  | 'sports_team';
```

### friend_group
- 2–10 fő;
- Explorerben elérhető;
- default `individual_opt_in`;
- event résztvevői lehetnek subset;
- nem módosíthat automatikusan privát pénzt/munkát.

### romantic_relationship
- pontosan 2 aktív tag;
- userenként max. 1 aktív;
- Connected/World;
- létrejött és commitment: mutual consent;
- lezárás: bármelyik fél unilateral;
- AI nem dönthet érzelmi consent helyett.

### work_project
- max. 10;
- Connected/World;
- role, shared goal, governance;
- group policy majority/role-authority lehet;
- más user privát pénzét csak annak saját intentje érintheti.

### hobby_group
- max. 10;
- Connected/World;
- opt-in/majority.

### sports_team
- max. 20;
- World;
- roster/coach/captain;
- team decision és személyes decision külön.

## Active context limitek

Slot-fogyasztó: `inviting`, `active`, `paused`.  
Nem slot: `ended`, `archived`.

- Free: 0
- Explorer: 1
- Connected: 3
- World: 5
- abszolút cap: 5

## Membership

A membership mindig `user + life + branch`.

Egy `(context,user)` csak egyszer lehet aktív. Personal fork nem örököl automatikusan live shared membershipet.

## Context lifecycle

```text
inviting → active ↔ paused → ended → archived
```

## Member lifecycle

```text
active
paused_entitlement
left
removed
deleted
```

Pending invite külön objektum.

## Shared vs personal truth

A csoport state-je egyszer létezik a Shared Contextben. Nem másoljuk ugyanazt a céget/projektet/team state-et minden member personal JSON state-jébe.

## Inaktív user

Mások nem állhatnak meg tartósan. Policy + wall-clock deadline + quorum használható. Személyes authority-t igénylő döntést nem lehet más helyett kitölteni. Romantic mutual decision nem auto-resolve.

## Downgrade

Nem írjuk át a canont. History olvasható, de grace után új shared generálás/intent nem engedett; membership `paused_entitlement`. Romantic context pause, nem automatikus breakup.

## Nem MVP

- DM/chat;
- realtime multiplayer;
- AI proxy user helyett;
- group merge;
- public shared context;
- creator marketplace;
- arbitrary governance scripting.
