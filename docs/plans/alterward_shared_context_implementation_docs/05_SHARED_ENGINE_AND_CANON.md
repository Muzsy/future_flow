# 5. Shared engine, canon és konzisztencia

## Alapmodell

```text
Personal Branch A ─┐
Personal Branch B ─┼──> Shared Context Canon
Personal Branch C ─┘           │
                               ├─ impact A
                               ├─ impact B
                               └─ impact C
```

A Shared Context nem branch-összeolvasztás.

## Egyetlen igazság

A shared business/team/group state csak a Shared Contextben létezik. A személyes state csak a személyre eső tényt/projekciót kapja.

## Event flow

```text
shared state + interaction projections
        ↓
AI candidate
        ↓
schema validation
        ↓
domain validation
        ↓
shared event commit
        ↓
member intents
        ↓
policy resolution
        ↓
shared resolution commit
        ↓
per-member impacts
```

## Revision

Minden shared aggregate state mutation revisiont növel.

- event commit +1;
- resolution +1;
- lifecycle state mutation +1.

Stale request → `SHARED_REVISION_CONFLICT` 409.

## Egy pending decision

MVP-ben contextenként max. egy unresolved shared decision.

## Policyk

### individual_opt_in
Minden eligible user maga dönt. Eredmény lehet participant subset.

### majority
Egy user = egy szavazat. Tie esetén nem találunk ki eredményt: `unresolved_tie`.

### unanimous
Minden required member ugyanazt választja. Romantic commitmenthez alkalmas.

### role_authority
Csak a megadott role válaszolhat.

### weighted_vote
Work/business későbbi döntésekhez. Súly kizárólag validated Shared State-ből jöhet.

## Authority boundary

Három kategória:

1. shared fact;
2. membership/role fact;
3. private personal fact.

A csoport dönthet shared factről. Authorized role módosíthat project/team membershipet. De más user nem dönthet arról, hogy a target:

- pénzt költ;
- felmond;
- költözik;
- szerelmes;
- mit gondol.

Ezekhez self-intent vagy külső eseményből következő, zárt és validált personal impact kell.

## Időszinkron

A personal engine pontos ISO date state-et és 6 hónapos periodokat használ.

Első MVP:

- Shared Context `simulation_at` dátum;
- invitee selected branch state-je ugyanabban a naptári hónapban legyen;
- anchor az érintett state-ek közül a legkésőbbi nap;
- branch nem lehet a context jövőjén túl;
- nincs silent time travel;
- mismatch → `SHARED_TIME_MISMATCH`.

Később külön catch-up flow építhető.

## Miért nem írunk 20 branchet egyszerre

Resolution után pending impact rekordok keletkeznek. Nem egy hosszú tranzakcióban módosítjuk az összes személyes ágat.

```text
resolution
  ↓
impact A pending
impact B pending
impact C pending
```

Az adott user következő branch-műveleténél materializáljuk.

## Personal impact alkalmazás

Új core függvény:

```ts
applySharedImpactsToLifeStateV2(state, impacts, effectiveAt)
```

Friend MVP:

- memory-only;
- szükséges relationship projection.

Ne másoljuk automatikusan az összes team membert `LifeStateV2.actors` alá. A max 30 actor és az 5 context miatt ez skálázhatatlan lenne.

## Personal memory

A personal period inputba bekerülnek a releváns applied shared eventek.

AI szabály:

- Shared Canon authoritative;
- más user privát motivációját ne találja ki;
- más user jövőbeli döntését ne állítsa tényként;
- csak accepted/resolved shared action lehet canon.

## Personal fork

A live membership nem másolódik át.

Új personal branch:

- solo what-if;
- addigi shared history snapshot/memory megmaradhat;
- más user nincs forkollva;
- eredeti membership az eredeti branchhez kötve marad.

## Continue solo

User kiléphet a shared flowból és létrehozhat privát solo folytatást. A többiek contextje változatlan.

## Group fork

Későbbi feature: új Shared Context új ID-val, minden ember külön opt-innel. Nem a régi context másik state-je.

## Deadline / quorum

Wall-clock deadline a human response koordinálásához, nem szimulációs idő.

- majority: quorum után resolve;
- individual opt-in: válaszolók alapján;
- unanimous: hiányzó válasszal nem;
- romantic mutual: nem;
- unilateral end: egy authorized fél elég.
