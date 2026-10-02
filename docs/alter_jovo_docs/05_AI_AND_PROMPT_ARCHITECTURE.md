# Alter Jövő — AI és prompt architektúra

## 1. Cél

Az AI ne legyen közvetlenül összekötve a UI-val, és ne legyen egyetlen óriási prompt. A rendszer több specializált AI-feladatot kezel:

1. profil szabad szöveges kinyerése;
2. candidate event generálás;
3. decision option generálás;
4. freeform decision strukturálás;
5. chapter narratíva;
6. rövid összegzés;
7. később anonimizálás/moderációs segéd.

## 2. Provider abstraction

Javasolt interface:

```ts
export interface AiProvider {
  generateStructured<T>(
    request: StructuredGenerationRequest<T>
  ): Promise<StructuredGenerationResult<T>>;

  generateText(
    request: TextGenerationRequest
  ): Promise<TextGenerationResult>;

  moderate?(
    request: ModerationRequest
  ): Promise<ModerationResult>;
}
```

A domain-kód ne ismerjen provider-specifikus SDK típusokat.

## 3. AI Orchestrator

```text
Domain service
 ↓
AI Orchestrator
 ├─ Prompt Registry
 ├─ Model Policy
 ├─ Context Builder
 ├─ Schema Validator
 ├─ Retry Policy
 ├─ Cost Tracker
 ├─ Audit Metadata
 └─ Provider Adapter
```

## 4. Prompt Registry

Minden prompt verziózott.

Példa:
- `profile.extract.v1`
- `simulation.events.v1`
- `simulation.decision_options.v1`
- `simulation.decision_parse.v1`
- `story.chapter.v1`
- `story.summary.v1`
- `community.redact.v1`

Tárolandó:
- prompt id;
- semantic version;
- input schema;
- output schema;
- createdAt;
- status;
- eval score.

## 5. Structured output first

Ahol az AI kimenete state-et módosít, ott kizárólag validált strukturált output fogadható el.

```json
{
  "candidateEvents": [
    {
      "type": "career_opportunity",
      "title": "Új szakmai lehetőség",
      "rationale": [
        "low_work_satisfaction",
        "high_change_desire"
      ],
      "salience": 0.63,
      "uncertainty": "medium",
      "preconditions": []
    }
  ]
}
```

Validation failure:
1. egy célzott repair retry;
2. ha újra hibás, fail;
3. canonical state-be semmi ne kerüljön.

## 6. Context Builder

Ne küldjük minden hívásnál a teljes profilt és történetet.

Feladata:
- csak releváns mezők;
- tokenbudget;
- érzékeny adat minimalizálás;
- régi történetek helyett state summary;
- branch-specifikus canon.

## 7. Kontextuskategóriák

A promptban külön blokk:
- **CANONICAL_STATE**
- **USER_SUPPLIED**
- **DERIVED_TRAITS**
- **SCENARIO_OVERRIDES**
- **NARRATIVE_HISTORY**

A narratív history soha nem írhatja felül a canonical state-et.

## 8. Hallucináció kontroll

Narratív szabály:

> Ne hozz létre új tartós tényt, kapcsolatot, gyermeket, munkahelyet, diagnózist vagy fontos pénzügyi eseményt, ha az nincs a canonical event/state inputban.

Megengedett narratív részlet:
- hangulat;
- semleges környezetleírás;
- stilizált párbeszéd;
- átvezetés.

## 9. Model Policy

Feladatonként eltérő modellkategória használható.

| Task | Igény |
|---|---|
| profile extraction | olcsó structured output |
| freeform decision parse | gyors, olcsó |
| candidate events | közepes reasoning |
| chapter narrative | jó szövegminőség |
| consistency check | erős reasoning |
| moderation | dedikált/olcsó |

A konkrét modell konfigurációban legyen, ne domain-kódban.

## 10. Retry

Retry:
- hálózati hiba;
- rate limit;
- schema invalid;
- átmeneti provider hiba.

Nem végtelen retry:
- safety refusal;
- tartós quota hiba;
- domain-invalid output ugyanazzal az inputtal.

## 11. Idempotencia

AI job:
- jobId;
- inputHash;
- promptVersion;
- modelPolicyVersion.

A job újrafuttatása ne duplikáljon eventet vagy chaptert.

## 12. Költségkövetés

Minden AI run:

```json
{
  "provider": "provider_x",
  "model": "model_y",
  "inputTokens": 0,
  "outputTokens": 0,
  "estimatedCost": 0,
  "taskType": "story.chapter",
  "userId": "usr_...",
  "futureId": "f_..."
}
```

Kell:
- user/hó;
- feature;
- first future átlag;
- P95;
- failed generation cost.

## 13. Cache

Cache-olható:
- stabil profile summary;
- context summary;
- world context;
- feature extraction.

Óvatosan:
- branch generation;
- friss profile version utáni output.

## 14. Prompt injection

A felhasználói szöveg adat.

```text
SYSTEM INSTRUCTIONS
...

<USER_DATA>
felhasználó szövege
</USER_DATA>
```

User text ne kerülhessen system/developer pozícióba.

## 15. Sensitive content

Külön safety-policy:
- önkárosítás;
- erőszak;
- súlyos egészség;
- függőség;
- fiatalkorú;
- más személy érzékeny adata.

A story generator ne használjon ilyen témát random dramaturgiai eszközként.

## 16. AI audit

Tárolandó:
- taskType;
- promptVersion;
- model;
- requestId;
- inputHash;
- outputHash;
- validationStatus;
- latency;
- token usage.

A teljes raw prompt tárolását minimalizálni kell.

## 17. Eval

Prompt/model változtatás előtt:
- profile extraction pontosság;
- event validitás;
- state consistency;
- narrative fidelity;
- safety;
- tone;
- cost.

## 18. MVP AI taskok

1. `simulation.events.v1`
2. `simulation.decision_options.v1`
3. `simulation.decision_parse.v1`
4. `story.chapter.v1`
5. `story.summary.v1`
6. opcionálisan `profile.extract.v1`

## 19. Kötelező pipeline

```text
AI output
 ↓
schema validation
 ↓
domain validation
 ↓
safety validation
 ↓
transactional commit
```
