# Alter Jövő — szimulációs motor

## 1. Alapelv

A szimulációs motor nem történetet ír. Feladata:
1. kiinduló state;
2. lehetséges eventek;
3. event szűrés;
4. következmények;
5. koherens timeline;
6. decision;
7. branch.

A prózát külön Story Engine készíti.

## 2. Inputok

```text
Profile Snapshot
Life State
Relationship State
World State
Simulation Rules
Scenario Overrides
Random Seed
Simulation Horizon
```

## 3. Life state

Példa:

```json
{
  "date": "2029-06-01",
  "career": {
    "status": "employed",
    "satisfaction": 42,
    "stability": 77,
    "growth": 31
  },
  "finance": {
    "stability": 68,
    "stress": 35
  },
  "relationships": {
    "partnerBond": 73,
    "socialConnectedness": 54
  },
  "personal": {
    "energy": 58,
    "changeDesire": 71
  }
}
```

A belső score-ok nem feltétlenül jelennek meg a usernek.

## 4. World state

MVP-ben egyszerű:
- régió;
- gazdasági környezet kategória;
- munkaerőpiaci trend;
- technológiai trend;
- lakhatási környezet;
- külső események.

Később valós adatokkal bővíthető.

## 5. Event

```json
{
  "eventId": "evt_...",
  "type": "career_opportunity",
  "window": {
    "start": "2028-03-01",
    "end": "2028-06-30"
  },
  "actors": ["user", "rel_colleague_a"],
  "preconditions": [],
  "causes": [],
  "effects": [],
  "salience": 0.71,
  "uncertainty": 0.44,
  "decisionRequired": true
}
```

## 6. Event kategóriák

### Career
- új feladat;
- előléptetés;
- konfliktus;
- váltási lehetőség;
- vállalkozási lehetőség;
- képzés.

### Relationships
- új ismeretség;
- távolodás;
- közeledés;
- közös projekt;
- konfliktus;
- családi változás.

### Personal
- hobbi fejlődés;
- új érdeklődés;
- rutin;
- cél újraértékelése.

### Financial
- költségnyomás;
- megtakarítási lehetőség;
- extra bevétel.

### Environment
- költözési lehetőség;
- helyi lehetőség;
- munkahelyi környezet változása.

Súlyos trauma ne legyen random dramaturgiai eszköz.

## 7. Event-generation pipeline

```text
candidate generation
 ↓
precondition validation
 ↓
profile compatibility
 ↓
repetition penalty
 ↓
plausibility
 ↓
diversity
 ↓
safety
 ↓
selection
 ↓
effect calculation
 ↓
state transition
```

## 8. Candidate scoring

Példa:

```text
score =
  profile_fit*w1
+ state_fit*w2
+ goal_relevance*w3
+ relationship_fit*w4
+ diversity*w5
+ world_fit*w6
- contradiction_penalty
- repetition_penalty
- safety_penalty
```

Nem tudományos pontosságot kell imitálni, hanem konzisztens logikát.

## 9. Hibrid rendszer

### Determinisztikus
- invariantok;
- state transition;
- időrend;
- branch integritás;
- relationship ids;
- profile version.

### Generatív
- eventötletek;
- kreatív kapcsolódások;
- decision options;
- narratíva.

## 10. Reprodukálhatóság

Tárolandó:
- future seed;
- branch seed;
- model;
- prompt version;
- input hash;
- output hash.

Az LLM teljes determinisztikája nem garantálható, de a run auditálható.

## 11. Időmodell

MVP:
- 10 év horizon;
- első 24 hónap részletes;
- 3–5 év közepes;
- 6–10 év anchor eventek.

## 12. Branching

```text
Future
 └─ Branch A
    ├─ Event
    ├─ Event
    └─ Decision
       ├─ Branch B
       └─ Branch C
```

Fork előtti canon immutable.

## 13. Freeform decision

Input:
> „Elfogadom, de csak akkor, ha nem kell költöznöm.”

Parse:

```json
{
  "intent": "accept_offer",
  "constraints": [
    {
      "type": "no_relocation",
      "strength": "hard"
    }
  ]
}
```

Utána domain validation.

## 14. Causality graph

```text
magas változásvágy
 +
alacsony munkaelégedettség
 +
új szakmai kapcsolat
 ↓
álláslehetőség
 ↓
decision
 ↓
munkahelyváltás
```

Ez adja a „Miért történt?” funkció alapját.

## 15. Scenario override

Nem módosítja a valódi profilt:

```json
{
  "traitOverrides": {
    "riskTolerance": 75
  },
  "factOverrides": {
    "location": "other_city"
  }
}
```

## 16. Validatorok

- időrendi ütközés;
- nem létező szereplő;
- kizáró állapotok;
- hiányzó előfeltétel;
- irreális eseménysűrűség;
- túl sok nagy fordulat;
- túlzott pozitív/negatív bias;
- profilidegen esemény indoklás nélkül.

## 17. Dráma/safety

MVP-ben:
- súlyos trauma kizárva vagy külön opt-in;
- halál, súlyos betegség, erőszak ne legyen random;
- pénzügyi összeomlás csak erős okkal;
- kapcsolat megszűnése lehet, de ne clickbait legyen.

## 18. Uncertainty

Külön:
- input confidence;
- scenario uncertainty.

User-facing kategóriák:
- stabilan következő tendencia;
- valószerű lehetőség;
- spekulatív fordulat.

Ne legyen hamis „73,4%”.

## 19. Re-simulation trigger

- profile version változás;
- scenario override;
- decision fork;
- explicit regenerate.

Korábbi future ne törlődjön automatikusan.

## 20. Minőségmérés

Offline eval:
- 50 synthetic profile;
- 3 seed/profil;
- 5–10 éves run.

Mérjük:
- ellentmondás;
- ismétlődés;
- dramatizálás;
- profilidegen event;
- következmény nélküli döntés;
- story/state eltérés.
