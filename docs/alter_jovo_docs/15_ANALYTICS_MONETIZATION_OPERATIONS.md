# Alter Jövő — analytics, monetizáció és üzemeltetés

## 1. Analytics cél

Nem a kattintásszám az elsődleges.

Fő kérdések:
- elkészül-e a profile;
- jó-e az első future;
- nyit-e branch-et;
- visszajön-e.

## 2. Funnel

```text
landing_view
signup_started
signup_completed
profile_started
profile_minimum_reached
profile_committed
future_requested
future_completed
first_chapter_viewed
decision_viewed
decision_resolved
branch_completed
return_session
```

## 3. Analytics privacy

Ne küldjünk:
- free text;
- relationship name;
- employer;
- érzékeny exact trait érték, ha nem kell.

Mehet:
- completion bucket;
- section;
- feature;
- duration;
- error code.

## 4. North star jelölt

**Completed meaningful future sessions / active user**

Meaningful:
chapter olvasás + timeline vagy decision interakció.

## 5. Retention

- D1;
- D7;
- D30;
- chapter return;
- branch return.

Serialized story csak akkor, ha valóban javítja.

## 6. AI unit economics

Mérjük:
- first future cost;
- branch cost;
- chapter cost;
- extraction cost;
- user/hó;
- P95.

## 7. Lehetséges csomag

### Free
- 1 baseline future;
- korlátozott branch;
- alap story.

### Plus
- több future;
- több branch;
- sűrűbb chapter;
- hosszabb compare;
- extra style;
- export.

Nem javasolt:
„fizess, hogy jobb jövőt kapj”.

## 8. Monetizációs etika

Soha:
- rossz jövő → fizess jobbért;
- félelemre épülő upsell;
- „AI szerint premium kell”.

## 9. Cost guardrail

- napi generation limit;
- concurrent job limit;
- free branch limit;
- freeform max length;
- abuse detection.

## 10. Ops dashboard

- API error;
- queue depth;
- job failure;
- AI latency;
- AI spend/day;
- invalid output rate;
- signup;
- future completion;
- active users.

## 11. Alert

- job fail > küszöb;
- provider error;
- AI cost anomaly;
- DB saturation;
- auth anomaly;
- deletion failure.

## 12. Support

Technikai support kulcs:
- requestId;
- futureId;
- jobId.

Ne kelljen teljes profilt olvasni.

## 13. Admin analytics

Aggregált legyen. Ne készüljön személyiségalapú „emberek listája” kíváncsiságból.

## 14. Későbbi üzleti irány

- subscription;
- pair/family scenario;
- premium story mode;
- extra compare/export.

Nem javasolt:
- személyiségprofil értékesítés;
- user data sale;
- credit-score jellegű API.
