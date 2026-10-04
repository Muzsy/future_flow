# 7. Worker, AI és költségmodell

## AI interface

Új `packages/ai` interface:

```ts
interface SharedAiProvider {
  sharedEvent(
    input: SharedEventInput,
    repair?: string
  ): Promise<AiResult<SharedEventCandidate>>;
}
```

Első verzióban külön memberenkénti shared-story call nem kell.

## AI input

Csak:

- Shared State;
- context type;
- interaction profile;
- roles;
- releváns shared history;
- shared goal;
- allowed policy;
- szerver által kiosztott ID-k.

Nem mehet:

- teljes personal World State;
- teljes finance;
- private goals/relationships;
- raw prompt/memory;
- email.

## Prompt invariánsok

- fictional scenario;
- user text adat, nem instruction;
- csak ismert member ID;
- más user belső érzését ne állítsa canonként;
- más user döntését ne hozza meg;
- csak zárt SharedFactChange;
- personal impact csak proposal;
- participant subset megengedett;
- max. egy pending decision.

## Validáció

AI után:

1. Zod;
2. context ID;
3. base revision;
4. time;
5. member IDs;
6. active membership;
7. context-type allowed changes;
8. policy;
9. eligible set;
10. impact authority;
11. invariants;
12. hash;
13. commit.

## Repair

A `life-processor.ts` mintájára max. 1 targeted repair.

## Worker modulok

- `apps/worker/src/shared-processor.ts`
- `packages/database/src/shared-jobs.ts`

Fair queue:

```text
personal-v2 → shared → legacy → repeat
```

Üres queue átugorható.

## Lease

A meglévő `LifeJobRepository` mintája:

- `FOR UPDATE SKIP LOCKED`;
- lease token;
- heartbeat;
- attempt cap;
- lost lease → no commit.

## Költség

A shared job `requested_by_user_id` user keretét terheli.

- `Continue group` indítója fizeti az adott shared generálást;
- a többiek a kész canont AI-költség nélkül olvassák;
- saját personal continuation saját keretből megy.

## 20 fős sportcsapat

Tilos 1 event után 20 teljes narratívát generálni.

Helyes:

```text
1 shared generation
→ structured impacts
→ personal narrative csak akkor, amikor az adott user saját életét folytatja
```

## Tesztelés

Unit/integration teszt fake `SharedAiProvider`.

Paid OpenAI smoke csak explicit kerettel és meglévő guard/reservation rendszerrel.
