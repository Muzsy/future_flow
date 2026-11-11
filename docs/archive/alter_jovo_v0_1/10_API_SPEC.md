# Alter Jövő — API specifikáció váz

## 1. Alap

Base:
`/api/v1`

Formátum:
`application/json`

Auth:
`Authorization: Bearer <token>`

Szerződés:
OpenAPI.

## 2. Konvenció

- JSON: `camelCase`
- timestamp: ISO 8601 UTC
- ID: opaque string
- pagination: cursor
- create: POST
- partial update: PATCH
- delete: lehetőleg idempotens

## 3. Error envelope

```json
{
  "error": {
    "code": "PROFILE_INCOMPLETE",
    "message": "A profil még nem elegendő ehhez a művelethez.",
    "details": {},
    "requestId": "req_..."
  }
}
```

Stack trace nem kerül klienshez.

## 4. User

```http
GET    /me
PATCH  /me
DELETE /me
GET    /me/export
```

Login a Supabase Auth SDK-n keresztül történhet.

## 5. Profile

```http
GET   /profile
GET   /profile/versions
GET   /profile/versions/{id}
PATCH /profile/draft
POST  /profile/draft/commit
```

A commit immutable profile version.

## 6. Questionnaire

```http
GET  /questionnaires/current
GET  /questionnaires/current/sections
POST /questionnaires/current/answers
POST /questionnaires/current/complete
```

Válaszok szakaszosan menthetők.

## 7. AI profile enrichment

```http
POST /profile/enrichment/analyse
POST /profile/enrichment/{proposalId}/accept
POST /profile/enrichment/{proposalId}/reject
```

AI-javaslat nem commitol automatikusan.

## 8. Relationships

```http
GET    /relationships
POST   /relationships
PATCH  /relationships/{id}
DELETE /relationships/{id}
```

## 9. Futures

```http
GET    /futures
POST   /futures
GET    /futures/{futureId}
DELETE /futures/{futureId}
```

Request:
```json
{
  "profileVersionId": "pv_123",
  "horizonYears": 10,
  "mode": "baseline"
}
```

Response:
```json
{
  "futureId": "f_123",
  "jobId": "job_123",
  "status": "queued"
}
```

## 10. Jobs

```http
GET /jobs/{jobId}
```

```json
{
  "id": "job_123",
  "status": "running",
  "progress": {
    "stage": "SIMULATING_EVENTS"
  }
}
```

Percent csak akkor, ha valósan becsülhető.

## 11. Branch

```http
GET  /futures/{futureId}/branches
GET  /branches/{branchId}
POST /branches/{branchId}/fork
```

## 12. Timeline

```http
GET /branches/{branchId}/timeline
GET /branches/{branchId}/events/{eventId}
```

Window:
`?from=2027-01-01&to=2030-01-01`

## 13. Decision

```http
GET  /decisions/{decisionId}
POST /decisions/{decisionId}/resolve
```

Option:
```json
{
  "type": "option",
  "optionId": "opt_2"
}
```

Freeform:
```json
{
  "type": "freeform",
  "text": "Elfogadom, ha nem kell költöznöm."
}
```

Response:
- newBranchId;
- jobId.

## 14. Scenario override

```http
POST /branches/{branchId}/scenarios
```

```json
{
  "overrides": [
    {
      "type": "trait",
      "key": "riskTolerance",
      "value": 75
    }
  ]
}
```

## 15. Chapter

```http
GET  /branches/{branchId}/chapters
GET  /chapters/{chapterId}
POST /branches/{branchId}/chapters/generate-next
```

## 16. Explain

```http
GET /events/{eventId}/explanation
```

```json
{
  "factors": [
    {
      "type": "profile",
      "key": "changeDesire",
      "impact": "high"
    }
  ],
  "summary": "..."
}
```

Ez a szimuláció belső okgráfja, nem valós oksági bizonyíték.

## 17. Community később

```http
GET  /community/feed
POST /community/posts
GET  /community/posts/{id}
POST /community/posts/{id}/comments
POST /community/posts/{id}/report
```

## 18. Idempotency

AI-t indító create műveleteknél:
`Idempotency-Key`

Kötelező:
- future;
- branch fork;
- chapter generation.

## 19. Rate limit

Külön:
- auth;
- profile;
- AI generation;
- community;
- report.

## 20. Concurrency

Profile draftnál revision/ETag.

Két eszköz ne írja felül csendben egymást.

## 21. OpenAPI

NestJS-ből generálható, de:
- CI diff;
- breaking change explicit;
- web/mobile kliens generálható.

## 22. Versioning

MVP:
`/v1`

DB schema version és API version külön fogalom.
