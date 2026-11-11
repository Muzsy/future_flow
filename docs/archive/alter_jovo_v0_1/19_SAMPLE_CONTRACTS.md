# Alter Jövő — minta strukturált kontraktusok

## 1. Profile snapshot

```json
{
  "profileVersionId": "pv_demo_001",
  "version": 1,
  "facts": {
    "ageBand": "35_44",
    "country": "HU",
    "regionType": "small_town",
    "relationshipStatus": "partnered",
    "children": 1,
    "employmentStatus": "employed",
    "workDomain": "technical"
  },
  "preferences": {
    "relocationWillingness": 28,
    "careerChangeWillingness": 61
  },
  "traits": {
    "riskTolerance": {
      "value": 41,
      "confidence": 0.82,
      "source": "questionnaire"
    },
    "changeSeeking": {
      "value": 68,
      "confidence": 0.75,
      "source": "questionnaire"
    },
    "securityNeed": {
      "value": 79,
      "confidence": 0.87,
      "source": "questionnaire"
    }
  },
  "values": [
    "family",
    "security",
    "autonomy",
    "learning",
    "free_time"
  ],
  "goals": [
    {
      "id": "goal_1",
      "category": "career",
      "title": "Érdekesebb munka",
      "importance": 80
    }
  ]
}
```

## 2. Relationship

```json
{
  "id": "rel_partner",
  "label": "Párom",
  "type": "partner",
  "state": {
    "closeness": 82,
    "support": 74,
    "conflict": 22,
    "contactFrequency": "daily"
  }
}
```

## 3. Future create

```json
{
  "profileVersionId": "pv_demo_001",
  "horizonYears": 10,
  "mode": "baseline",
  "locale": "hu-HU"
}
```

## 4. Life state

```json
{
  "effectiveAt": "2028-01-01",
  "career": {
    "employmentStatus": "employed",
    "satisfaction": 38,
    "stability": 81,
    "growthOpportunity": 29
  },
  "finance": {
    "stability": 67,
    "stress": 36
  },
  "social": {
    "connectedness": 55
  },
  "internal": {
    "changeDesire": 72,
    "perceivedAgency": 58
  }
}
```

## 5. Candidate event AI output

```json
{
  "candidateEvents": [
    {
      "type": "career_opportunity",
      "title": "Egy ismerős új munkalehetőséget említ",
      "rationaleKeys": [
        "career.satisfaction_low",
        "trait.changeSeeking_high",
        "goal.career_change"
      ],
      "suggestedWindowMonths": [8, 18],
      "salience": 0.66,
      "uncertainty": "medium",
      "decisionRequired": true,
      "proposedEffects": [
        {
          "path": "internal.changeDesire",
          "delta": 8
        }
      ]
    }
  ]
}
```

## 6. Canon event

```json
{
  "id": "evt_demo_001",
  "branchId": "br_demo_root",
  "type": "career_opportunity",
  "window": {
    "start": "2027-09-01",
    "end": "2027-11-30"
  },
  "title": "Új szakmai lehetőség jelenik meg",
  "causes": [
    {
      "type": "profile_trait",
      "key": "changeSeeking"
    },
    {
      "type": "life_state",
      "key": "career.satisfaction"
    }
  ],
  "decisionRequired": true,
  "uncertainty": "medium"
}
```

## 7. Decision

```json
{
  "id": "dec_demo_001",
  "eventId": "evt_demo_001",
  "prompt": "Mit teszel a lehetőséggel?",
  "options": [
    {
      "id": "opt_a",
      "key": "decline",
      "label": "Maradok a jelenlegi munkában"
    },
    {
      "id": "opt_b",
      "key": "explore",
      "label": "Utánajárok, de még nem döntök"
    },
    {
      "id": "opt_c",
      "key": "accept",
      "label": "Elfogadom a lehetőséget"
    }
  ]
}
```

## 8. Freeform decision parse

Input:
```json
{
  "text": "Utánajárok, de csak akkor váltok, ha nem kell elköltöznöm."
}
```

Output:
```json
{
  "intent": "explore_opportunity",
  "constraints": [
    {
      "type": "relocation",
      "operator": "forbid",
      "strength": "hard"
    }
  ],
  "confidence": 0.91
}
```

## 9. Chapter request

```json
{
  "branchId": "br_demo_root",
  "chapterNo": 2,
  "profileSummary": {
    "coreTension": "magas változásvágy és erős biztonságigény"
  },
  "events": ["evt_demo_001"],
  "stateBeforeId": "state_001",
  "stateAfterId": "state_002",
  "style": {
    "language": "hu",
    "tone": "grounded",
    "person": "second"
  }
}
```

## 10. Chapter output

```json
{
  "title": "Egy lehetőség, amit nehéz félretenni",
  "lead": "A munkahelyeden látszólag semmi nem változik...",
  "body": "...",
  "eventRefs": ["evt_demo_001"],
  "decisionRef": "dec_demo_001",
  "summary": "Megjelenik egy szakmai alternatíva, amely összeütközésbe kerül a biztonságigénnyel."
}
```

## 11. Explain output

```json
{
  "eventId": "evt_demo_001",
  "factors": [
    {
      "source": "profile",
      "key": "changeSeeking",
      "direction": "supports",
      "strength": "high"
    },
    {
      "source": "state",
      "key": "career.satisfaction",
      "direction": "supports",
      "strength": "high"
    },
    {
      "source": "profile",
      "key": "securityNeed",
      "direction": "limits",
      "strength": "medium"
    }
  ],
  "summary": "A lehetőség azért került ebbe a szcenárióba, mert a változás iránti igény magas, miközben a jelenlegi munka kevéssé kielégítő. A magas biztonságigény miatt a rendszer döntési helyzetet hozott létre az azonnali váltás helyett."
}
```
