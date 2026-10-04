# Alterward Shared Context / kapcsolati modell — implementációs dokumentáció

**Repository baseline:** `Muzsy/future_flow`  
**Branch:** `main`  
**Audited commit:** `b75e61ddc0a6dbdc31653a8c58d5c251e2f95aa8`  
**Audit date:** 2026-10-04  


## Cél

Ez a csomag a jelenlegi, működő `future_flow` / **alterward** kódbázisra épülő többfelhasználós kapcsolati és közös-életút rendszer teljes megvalósítási terve.

A cél egy **Shared Context domain**, amelyben több valódi felhasználó külön privát életága egy közös, konzisztens canonhoz kapcsolódhat. A közös tér lehet baráti társaság, párkapcsolat, munka/közös projekt, hobbi-közösség vagy sportcsapat. A kétfős kapcsolat ugyanennek a többfelhasználós modellnek a speciális esete.

## Nem alku tárgyát képező döntések

1. A meglévő `aw_lives`, `aw_branches`, `aw_periods`, `aw_choices` modellje nem válik többtulajdonosossá.
2. Minden személyes élet továbbra is egyetlen user tulajdona.
3. A közös élethelyzet külön `SharedContext` aggregate.
4. Egy közös eseménynek egyetlen Shared Canonja van.
5. A személyes branchek a közös canonból impactokat/projekciókat kapnak.
6. Más user vagy AI nem dönthet tetszőlegesen egy valódi user privát tényeiről.
7. A csoportos működés nem N×N páronkénti kapcsolatokból épül.
8. A privát World State soha nem kerül teljes egészében más userhez vagy Shared Contexthez.
9. A 001–007 migráció és a `LifeStateV2` 2.0.0 történeti kompatibilitása megmarad.
10. A Shared Context additív migrációkkal és új modulokkal készül.
11. Egy személy egyszerre legfeljebb 5 slot-fogyasztó Shared Contextben lehet.
12. Lezárt/archivált kapcsolatok megmaradnak, de nem fogyasztanak aktív slotot.
13. A Shared Context publikálása nem része az első implementációnak.

## Előfizetési konstrukció

| Csomag | Aktív Shared Context | Engedélyezett típusok |
|---|---:|---|
| Free | 0 | nincs valódi user-user Shared Context |
| Explorer | 1 | csak `friend_group` |
| Connected | 3 | friend + romantic + work/project + hobby |
| World | 5 | minden Connected funkció + sport |

A pontos ár billing-konfiguráció; nem core domainkonstans. Korábbi termékirány: Explorer kb. €8.99, Connected €12.99–14.99, World €17.99–19.99.

## Tagszám-korlátok

| Típus | Maximum |
|---|---:|
| `romantic_relationship` | 2 tag (user + 1 partner) |
| `friend_group` | 10 fő |
| `work_project` | 10 fő |
| `hobby_group` | 10 fő |
| `sports_team` | 20 fő |

Egy usernek legfeljebb 1 aktív `romantic_relationship` contextje lehet.

## Fájlok

- `01_CURRENT_CODEBASE_AUDIT.md`
- `02_PRODUCT_AND_DOMAIN_RULES.md`
- `03_CONTRACTS_AND_TYPES.md`
- `04_DATABASE_AND_MIGRATIONS.md`
- `05_SHARED_ENGINE_AND_CANON.md`
- `06_API_REPOSITORY_AND_ENTITLEMENTS.md`
- `07_WORKER_AI_AND_COST_MODEL.md`
- `08_WEB_UX_AND_USER_FLOWS.md`
- `09_PRIVACY_CONSENT_MODERATION_DELETION.md`
- `10_TEST_AND_ACCEPTANCE_PLAN.md`
- `11_IMPLEMENTATION_ROADMAP.md`
- `12_AGENT_EXECUTION_CHECKLIST.md`
- `13_REFERENCE_SCENARIOS.md`
- `MASTER_SHARED_CONTEXT_SPEC_HU.md`

## Implementációs stratégia

Az első működő szelet kizárólag `friend_group`. A domain/adatmodell azonban az első migrációtól általános legyen:

`friend_group → invite → accept → shared event → member intents → resolution → shared canon → personal impacts → next personal period`

A többi kapcsolat ugyanennek a rendszernek új policy- és state-adaptere legyen.
