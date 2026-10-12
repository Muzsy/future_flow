---
status: canonical
owner: project
last_reviewed: 2026-10-12
supersedes:
  - archive/superseded/NEXT_STEPS.md
related:
  - STATUS_HU.md
  - ROADMAP_HU.md
  - DOCS_INDEX_HU.md
  - product/PRODUCT_HU.md
  - features/shared/SHARED_CONTEXT_HU.md
---

# Alterward — kanonikus részletes fejlesztési terv

Ez a dokumentum az Alterward végrehajtási master planje. Megőrzi az eredeti `L01`, `P01–P13` és Shared `S0–S7` azonosítókat, de a jelenlegi `main` állapothoz és az új dokumentációs authority-rendszerhez igazítja őket.

A magas szintű prioritást a `ROADMAP_HU.md`, a pillanatnyi állapotot a `STATUS_HU.md` adja. Ez a fájl azt mondja meg, hogy az eredeti részletes fejlesztési pontok közül mi készült el, mi maradt részleges, és milyen acceptance gate van még nyitva.

## 1. Státuszok

- `DONE` — az adott fejlesztési eredmény technikailag elkészült; további release-validáció más pontban maradhat.
- `PARTIAL` — lényeges részek elkészültek, de az eredeti pont acceptance gate-je még nem teljes.
- `PENDING` — elfogadott feladat, érdemi implementáció még nincs vagy új fejlesztési kör kell.
- `DEFERRED` — tudatosan későbbi roadmap-fázisra halasztva.
- `SUPERSEDED` — az eredeti scope-ot egy későbbi elfogadott döntés felülírta; a történeti terv megmarad bizonyítéknak.

A `DONE` nem jelent automatikus production release-t. Release-flag, béta, billing vagy publikus engedély külön gate lehet.

## 2. Aktuális végrehajtási sorrend

1. **Personal beta activation** — P08 fennmaradó valós kohorsz- és operátori kapui.
2. **Shared friend beta hardening** — S3 release-gate-ek, owner downgrade kontroll, sponsored Guest E2E.
3. **Shared friend beta** — legfeljebb öt baráti pár / 10 személy, `friend_group` only.
4. **Billing foundation** — új B01 workstream; payment provider, checkout, webhook és subscription lifecycle.
5. **Shared relationship expansion** — S4–S6 csak friend beta után.
6. **Community/public release** — P13 release-gate; a P09–P12 technikai alap megléte önmagában nem launch.
7. **Scale/platform expansion** — nagyobb katalógus, további nyelvek, mobil és további agent tooling csak valós használat után.

## 3. Personal / public execution plan — L01, P01–P13

| ID | Státusz | Eredeti cél / jelenlegi értelmezés | Kanonikus forrás | Fennmaradó gate / következő lépés |
|---|---|---|---|---|
| L01 | DONE | Angol-first lokalizációs alap. A technikai locale-kezelés megvan; a magyar indulás tudatosan halasztott. | `product/PRODUCT_HU.md`, `architecture/ARCHITECTURE_HU.md` | Magyar termék csak külön későbbi roadmap-döntéssel. |
| P01 | DONE | Verziózott időszak, identitás, cél, WorldState, ownership, revision/idempotency alap. | `architecture/ARCHITECTURE_HU.md`, contractok + migrációk | Nincs külön nyitott implementációs gate; regressziót fenn kell tartani. |
| P02 | DONE | Rövid AI-időszak, strukturált események, canon-validáció és narráció. | `product/PRODUCT_HU.md`, `architecture/ARCHITECTURE_HU.md`, `AI_MODEL_ROUTING_HU.md` | Minőség és valós használói elfogadás P07/P08 alatt. |
| P03 | DONE | Döntés, same-branch folytatás, history fork, atomic consequence és stale/idempotency védelem. | `product/PRODUCT_HU.md`, `architecture/ARCHITECTURE_HU.md` | Nincs külön nyitott implementációs gate. |
| P04 | DONE | Rövid onboarding, draft/revision, visszatérési felület, timeline és folytatás/fork UX alap. | `product/PRODUCT_HU.md` | Valós béta-frikció és session-célok P08-ban mérendők. |
| P05 | DONE | Canon/memória input, célzott repair, project/user budget és költségőr. | `architecture/ARCHITECTURE_HU.md`, `AI_MODEL_ROUTING_HU.md` | Production/béta allowance aktiválás P08/B01 release-szabály szerint. |
| P06 | DONE | Valódi Auth/DB/browser flow, ownership, export/delete és recovery/backup technikai felkészítés. | `operations/BETA_HU.md`, `operations/BACKUP_HU.md`, `operations/RECOVERY_HU.md`, `operations/SECURITY_OPERATIONS_HU.md` | A konkrét tesztelői admission és indulás előtti candidate restore P08 feladata. |
| P07 | DONE | Technikai, angol AI- és szerkesztői pre-beta minőségkapu; determinisztikus és valódi AI minták. | `operations/TESTING_HU.md`, `AI_MODEL_ROUTING_HU.md` | A valódi használói minőség nem tekinthető bizonyítottnak; P08 méri. |
| P08 | PARTIAL | Korlátozott angol személyes béta és continuation/retention mérés. Technikai mérés/feedback alap elkészült, valós meghívott kohorsz nincs aktiválva. | `operations/BETA_HU.md`, `STATUS_HU.md` | Max. 10 első tesztelő; invite/login; email↔UUID/reader mapping; candidate backup+restore; 30 napos AI-window; signed-in paid AI E2E; utána valós feedback. Az eredeti 20–50 fős első kohorsz célját a max. 10 fős első kör felülírta. |
| P09 | DONE | Publication/PublicSnapshot/ScenarioVersion/Official foundation, privacy/review/curation és angol seed-katalógus. | `product/PRODUCT_HU.md`, `STATUS_HU.md` | A technikai foundation nem public release; P13 dönt a launchról. |
| P10 | DONE | Discovery/read-only public surface, category/search/curation, Save/Share/OG/Report és moderation foundation. | `product/PRODUCT_HU.md`, `STATUS_HU.md` | Valós public release, ranking/engagement minőség és kohorsz P13-ban. |
| P11 | DONE | Community publication lifecycle, private/unlisted/public, preview/Confirm, revoke/unpublish/delete/cache/permission alap. | `product/PRODUCT_HU.md`, `operations/SECURITY_OPERATIONS_HU.md` | Production public enablement csak P13 release-gate után. |
| P12 | DONE | Public life/decision fork, private restart, Scenario personalization, attribution/consent alap. | `product/PRODUCT_HU.md`, `STATUS_HU.md` | Valós használói konverzió és public release P13 alatt. |
| P13 | PARTIAL | Nyilvános indulási kapu, public/community mérés és release governance. Az infrastruktúra jelentős része elkészült, publikus launch nincs engedélyezve. | `ROADMAP_HU.md`, `STATUS_HU.md`, `product/PRODUCT_HU.md` | Privacy/permission/moderation/fork/retention végső release review; valós public cohort; költség- és üzemeltetési felelősség; explicit launch döntés. Jelenlegi roadmap szerint ez csak a korábbi béta- és Shared-fázisok után aktuális. |

### P08 — következő végrehajtható gate

A Personal beta csak a következő sorrenddel aktiválható:

1. konkrét, legfeljebb 10 fős tesztelőlista;
2. invite és első login;
3. email ↔ Auth UUID / reader hozzáférés pontos binding; ha korábbi reader-előkészítés lejárt és nem lett alkalmazva, előbb annak explicit archiválása (`--archive-expired-readers`, `PERSONAL_BETA_READER_OPERATOR_HU.md`). A fejlesztés review-ra kész; az éles használathoz pontos commitra audit, Verify/Container CI, izolált célpróba és a napi eszköz frissítése még szükséges;
4. friss candidate backup és ellenőrzött restore, az előkészítéstől számított 15 percen belül az apply-jal együtt;
5. egyszeri 30 napos személyes AI-window aktiválás a jóváhagyott kerettel;
6. signed-in, valós fizetett AI E2E;
7. monitor/rollback ellenőrzés;
8. első kohorsz indítása és feedback/continuation mérés.

Shared ebben a körben OFF.

## 4. Shared execution plan — S0–S7

| ID | Státusz | Eredeti cél / jelenlegi értelmezés | Kanonikus forrás | Fennmaradó gate / következő lépés |
|---|---|---|---|---|
| S0 | DONE | Shared domain/contract/storage, context lifecycle, invite/membership és entitlement foundation. | `features/shared/SHARED_CONTEXT_HU.md` | Regresszió és release flag fenntartása. |
| S1 | DONE | `friend_group` common canon/state, participant intent és döntési alap. | `features/shared/SHARED_CONTEXT_HU.md` | Valós friend beta S3 release-gate után. |
| S2 | DONE | Shared AI queue/worker, validation/repair, initiator project/user budget és rate-limit. | `features/shared/SHARED_CONTEXT_HU.md`, `product/MONETIZATION_HU.md` | Béta alatt költségtelemetria és initiator attribution ellenőrzés. |
| S3 | PARTIAL | Friend release readiness: personal impact, Auth/privacy/recovery, lifecycle és valós kétfős működés. Technikai foundation jelentős része kész, release továbbra OFF. | `features/shared/SHARED_CONTEXT_HU.md`, `operations/BETA_HU.md` | Owner downgrade `end/archive/revoke` kontroll; retention/personal-impact review; targeted sponsored Guest E2E; kétfős valós privacy/cost/rollback ellenőrzés. |
| S4 | DEFERRED | `romantic_relationship` termékrelease. A domain típus létezik, product-create zárt. | `features/shared/SHARED_CONTEXT_HU.md` | Friend beta értékelése után mutual consent, unilateral end és max-1/user termékdöntés + teszt. |
| S5 | DEFERRED | `work_project` és `hobby_group` release. | `features/shared/SHARED_CONTEXT_HU.md` | S3/S4 tapasztalat, típusos governance/authority és külön acceptance suite. |
| S6 | DEFERRED | `sports_team`, nagyobb roster/quorum/governance. | `features/shared/SHARED_CONTEXT_HU.md` | S5 után; max 20, subset/quorum és concurrency/lock terhelési proof. |
| S7 | PARTIAL | Eredeti vegyes késői csomag: sponsored seats + további group/fork/directory/public többfél funkciók. A targeted Friend sponsored Guest seat elkészült; a többi nem egyetlen release-egység többé. | `features/shared/SHARED_CONTEXT_HU.md`, `product/MONETIZATION_HU.md`, ADR-005 | Sponsored Guest: DONE. Directory/public multi-party/fork bővítések: DEFERRED és külön specifikációt/release-döntést igényelnek. |

### Shared friend beta belépési feltétele

A következő Shared-kör csak akkor indulhat, ha:

1. a személyes P08 első kör értékelve van;
2. downgrade lifecycle döntés implementálva és tesztelve;
3. common/personal impact retention szabály ellenőrzött;
4. targeted Free sponsored Guest meghívás valódi kétfős E2E-ben működik;
5. initiator entitlement és AI cost attribution mérhető;
6. block/leave/end/archive/revoke/export/delete/recovery negatív útvonalak fail-closed működnek;
7. Shared flag külön, kontrolláltan aktiválható.

Első scope: `friend_group`, öt baráti pár, legfeljebb 10 személy.

## 5. Új, az eredeti azonosítókon kívüli workstreamek

### B01 — Billing foundation — PENDING

Az entitlement modell elkészült, de ez nem kész fizetési rendszer.

Kell:

- payment provider döntés;
- checkout;
- subscription state + webhook;
- entitlement sync;
- upgrade/downgrade/cancel/grace;
- retry/idempotency;
- invoice/tax/legal integrációs határ;
- billing + AI cost telemetry.

Kanonikus forrás: `product/MONETIZATION_HU.md`.

### D01 — Shared owner downgrade data-control hardening — PENDING

A jelenlegi kód aktív host entitlementet kér owner `end`, `archive` és pending invite `revoke` művelethez. Ajánlott termékirány: create/invite/generate marad paywalled, de downgrade után az owner adat-/biztonsági kontrollműveletei maradjanak elérhetők.

Kanonikus forrás: `features/shared/SHARED_CONTEXT_HU.md`.

Ez a legközelebbi új kódos hardening feladat a Shared friend beta előtt.

## 6. Roadmap-kapcsolat

| Roadmap | Részletes terv |
|---|---|
| P0 Documentation governance | DONE; nem része a régi P01–P13 számozásnak |
| P1 Personal beta activation | régi P08 fennmaradó release gate-ek |
| P2 Shared friend beta | S3 + S7 sponsored Guest kész része + D01 |
| P3 Billing foundation | B01 |
| P4 Shared relationship expansion | S4–S6 |
| P5 Community/public release expansion | P13; P09–P12 foundation már nagyrészt DONE |
| P6 Scale/platform expansion | eredeti MVP utáni/deferred scope |

## 7. Történeti baseline és traceability

A teljes korábbi végrehajtási napló és checkpoint-sor nem törlendő és nem írható át aktív tervvé:

- `archive/superseded/NEXT_STEPS.md` — eredeti részletes backlog/checkpoint-történet;
- `archive/superseded/REQUIREMENTS_TRACEABILITY_HU.md` — a korábbi teljes stratégiai/requirements mátrix;
- `alter_jovo_docs/` és egyéb régi specifikációk — történeti baseline/supporting források.

Új fejlesztési döntést ebbe a kanonikus `DEVELOPMENT_PLAN_HU.md`-be, a témaspecifikus kanonikus dokumentumba, ADR-be vagy Issue/PR-be kell írni — nem a történeti checkpointokba.

## 8. Agent használat

Planning/implementation task esetén minimális sorrend:

1. `AGENTS.md`;
2. `DOCS_INDEX_HU.md`;
3. `STATUS_HU.md`;
4. `DEVELOPMENT_PLAN_HU.md` releváns pontja;
5. a feladathoz tartozó kanonikus product/feature/architecture/operations dokumentum.

Ha a terv és a kód eltér, az `AGENTS.md` konfliktusszabálya érvényes: a tényleges működést a kód mutatja, a kívánt üzleti viselkedést a kanonikus spec/ADR; az eltérést explicit gapként kell kezelni.