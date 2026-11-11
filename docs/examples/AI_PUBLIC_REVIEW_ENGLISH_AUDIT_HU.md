# alterward — angol történet privacy AI-audit

2026-10-05 · Valódi OpenAI Sol, az eredeti szintetikus [három angol fejezet](AI_V2_ENGLISH_STORY.md) újrahasználva. Negatív kontroll: a korábbi minta konkrét helyet/pénzügyet tartalmaz. Nem új történet, nincs publikáció vagy Official jóváhagyás. [Implementáció](../PUBLIC_AI_REVIEW_REPORT_HU.md).

## Változatlan gépi eredmény

```json
{
  "verdict": "review_required",
  "findings": [
    {
      "fieldKey": "field-2",
      "category": "precise_location",
      "action": "generalize"
    },
    {
      "fieldKey": "field-2",
      "category": "private_financial",
      "action": "generalize"
    },
    {
      "fieldKey": "field-2",
      "category": "identifying_combination",
      "action": "manual_review"
    },
    {
      "fieldKey": "field-4",
      "category": "precise_location",
      "action": "generalize"
    },
    {
      "fieldKey": "field-6",
      "category": "precise_location",
      "action": "generalize"
    }
  ]
}
```

- `field-1` → `period-1.chapter.title`
- `field-2` → `period-1.chapter.body`
- `field-3` → `period-2.chapter.title`
- `field-4` → `period-2.chapter.body`
- `field-5` → `period-3.chapter.title`
- `field-6` → `period-3.chapter.body`

## Mérési receipt

```json
{
  "task": "public_review",
  "promptVersion": "public_review.v2.en",
  "locale": "en",
  "model": "gpt-6.1-sol",
  "inputHash": "345fc2100e1b87a85be476e3b29a6cf4288416ad8c50a7f2f1ad21dc1ec06a0d",
  "outputHash": "0175772a4248bb0c4e010087d5f3df338d82ceba444dbfa4604c0544b8d23bba",
  "inputTokens": 2647,
  "outputTokens": 239,
  "cachedInputTokens": 0,
  "cacheWriteTokens": 2644,
  "reasoningTokens": 126,
  "latencyMs": 13179
}
```

Egy hívás; 2647 input +239 outputtoken; becslés 0.009006 USD, guard 0.0090075 USD. Az eredeti fejezetek változatlanok. Külön owner Preview/Confirm és kurátori ellenőrzés szükséges. Ez egy negatív kontroll, nem teljes privacy-eval vagy anyanyelvi használói értékelés.
