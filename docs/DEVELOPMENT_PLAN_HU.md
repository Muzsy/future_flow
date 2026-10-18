---
status: canonical
owner: project
last_reviewed: 2026-10-16
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

1. **Történetminőség és fenntartható használat** — N08 többfejezetes/humán mérés, N09 Linux funded-upgrade; a már elindított P08 béta feedback/retention és fennmaradó E2E kapui.
2. **Shared friend beta hardening** — S3 release-gate-ek, owner downgrade kontroll, sponsored Guest E2E.
3. **Shared friend beta** — legfeljebb öt baráti pár / 10 személy, `friend_group` only.
4. **Billing foundation** — új B01 workstream; payment provider, checkout, webhook és subscription lifecycle.
5. **Shared relationship expansion** — S4–S6 csak friend beta után.
6. **Community/public release** — P13 release-gate; a P09–P12 technikai alap megléte önmagában nem launch.
7. **Scale/platform expansion** — nagyobb katalógus, további nyelvek, mobil és további agent tooling csak valós használat után.

## 3. Personal / public execution plan — L01, P01–P13

| ID  | Státusz | Eredeti cél / jelenlegi értelmezés                                                                                                                     | Kanonikus forrás                                                                                                        | Fennmaradó gate / következő lépés                                                                                                                                                                                                       |
| --- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L01 | DONE    | Angol-first lokalizációs alap. A technikai locale-kezelés megvan; a magyar indulás tudatosan halasztott.                                               | `product/PRODUCT_HU.md`, `architecture/ARCHITECTURE_HU.md`                                                              | Magyar termék csak külön későbbi roadmap-döntéssel.                                                                                                                                                                                     |
| P01 | DONE    | Verziózott időszak, identitás, cél, WorldState, ownership, revision/idempotency alap.                                                                  | `architecture/ARCHITECTURE_HU.md`, contractok + migrációk                                                               | Nincs külön nyitott implementációs gate; regressziót fenn kell tartani.                                                                                                                                                                 |
| P02 | DONE    | Rövid AI-időszak, strukturált események, canon-validáció és narráció.                                                                                  | `product/PRODUCT_HU.md`, `architecture/ARCHITECTURE_HU.md`, `AI_MODEL_ROUTING_HU.md`                                    | Minőség és valós használói elfogadás P07/P08 alatt.                                                                                                                                                                                     |
| P03 | DONE    | Döntés, same-branch folytatás, history fork, atomic consequence és stale/idempotency védelem.                                                          | `product/PRODUCT_HU.md`, `architecture/ARCHITECTURE_HU.md`                                                              | Nincs külön nyitott implementációs gate.                                                                                                                                                                                                |
| P04 | DONE    | Rövid onboarding, draft/revision, visszatérési felület, timeline és folytatás/fork UX alap.                                                            | `product/PRODUCT_HU.md`                                                                                                 | Valós béta-frikció és session-célok P08-ban mérendők.                                                                                                                                                                                   |
| P05 | DONE    | Canon/memória input, célzott repair, project/user budget és költségőr.                                                                                 | `architecture/ARCHITECTURE_HU.md`, `AI_MODEL_ROUTING_HU.md`                                                             | Production/béta allowance aktiválás P08/B01 release-szabály szerint.                                                                                                                                                                    |
| P06 | DONE    | Valódi Auth/DB/browser flow, ownership, export/delete és recovery/backup technikai felkészítés.                                                        | `operations/BETA_HU.md`, `operations/BACKUP_HU.md`, `operations/RECOVERY_HU.md`, `operations/SECURITY_OPERATIONS_HU.md` | A konkrét tesztelői admission és indulás előtti candidate restore P08 feladata.                                                                                                                                                         |
| P07 | DONE    | Technikai, angol AI- és szerkesztői pre-beta minőségkapu; determinisztikus és valódi AI minták.                                                        | `operations/TESTING_HU.md`, `AI_MODEL_ROUTING_HU.md`                                                                    | A valódi használói minőség nem tekinthető bizonyítottnak; P08 méri.                                                                                                                                                                     |
| P08 | PARTIAL | Korlátozott angol személyes béta és continuation/retention mérés. Az első tesztelő aktiválva, valódi háromfejezetes E2E kész; szélesebb kohorsz és retention még nyitott.    | `operations/BETA_HU.md`, `STATUS_HU.md`                                                                                 | Első reader/login/backup+restore/30 napos window/paid E2E megtörtént; további meghívottnál saját admission. Későbbi sessionből sikeres folytatás és valós feedback/retention nyitott. A legfeljebb 10 fős első kör változatlan.   |
| P09 | DONE    | Publication/PublicSnapshot/ScenarioVersion/Official foundation, privacy/review/curation és angol seed-katalógus.                                       | `product/PRODUCT_HU.md`, `STATUS_HU.md`                                                                                 | A technikai foundation nem public release; P13 dönt a launchról.                                                                                                                                                                        |
| P10 | DONE    | Discovery/read-only public surface, category/search/curation, Save/Share/OG/Report és moderation foundation.                                           | `product/PRODUCT_HU.md`, `STATUS_HU.md`                                                                                 | Valós public release, ranking/engagement minőség és kohorsz P13-ban.                                                                                                                                                                    |
| P11 | DONE    | Community publication lifecycle, private/unlisted/public, preview/Confirm, revoke/unpublish/delete/cache/permission alap.                              | `product/PRODUCT_HU.md`, `operations/SECURITY_OPERATIONS_HU.md`                                                         | Production public enablement csak P13 release-gate után.                                                                                                                                                                                |
| P12 | DONE    | Public life/decision fork, private restart, Scenario personalization, attribution/consent alap.                                                        | `product/PRODUCT_HU.md`, `STATUS_HU.md`                                                                                 | Valós használói konverzió és public release P13 alatt.                                                                                                                                                                                  |
| P13 | PARTIAL | Nyilvános indulási kapu, public/community mérés és release governance. Az infrastruktúra jelentős része elkészült, publikus launch nincs engedélyezve. | `ROADMAP_HU.md`, `STATUS_HU.md`, `product/PRODUCT_HU.md`                                                                | Privacy/permission/moderation/fork/retention végső release review; valós public cohort; költség- és üzemeltetési felelősség; explicit launch döntés. Jelenlegi roadmap szerint ez csak a korábbi béta- és Shared-fázisok után aktuális. |

### P08 — végrehajtott első aktiválás és fennmaradó gate

Az első tesztelő alábbi aktiválási lánca megtörtént: reader/login, candidate backup/izolált restore, egyszeri funded ablak és háromfejezetes signed-in paid E2E. Az eredeti ablak 2026-10-13T22:11:21Z–2026-11-12T22:11:21Z, 2 USD projekt / 0,50 USD user; újraaktiválás vagy ledger-reset nem következik ebből a tervből. Későbbi sessionből sikeres új generálás és szélesebb feedback/retention továbbra mérendő.

További résztvevő vagy külön kiadás esetén a kanonikus sorrend és az eredeti ablak megmarad:

1. konkrét, legfeljebb 10 fős tesztelőlista;
2. invite és első login;
3. email ↔ Auth UUID / reader hozzáférés pontos binding; ha korábbi reader-előkészítés lejárt és nem lett alkalmazva, előbb annak explicit archiválása (`--archive-expired-readers`, `PERSONAL_BETA_READER_OPERATOR_HU.md`). Az első végrehajtás pontos forrás/audit/CI/fixture és friss napi eszköz kapui teljesültek; új kiadásnál új, pontos forráshoz kötött bizonyíték kell;
4. friss candidate backup és ellenőrzött restore, az előkészítéstől számított 15 percen belül az apply-jal együtt;
5. a jóváhagyott eredeti window/budget megőrzése; az egyszeri első `--apply-personal` már megtörtént, további reader nem indít új 30 napot;
6. signed-in, valós fizetett AI E2E;
7. monitor/rollback ellenőrzés;
8. első kohorsz indítása és feedback/continuation mérés.

Shared ebben a körben OFF.

## 4. Shared execution plan — S0–S7

| ID  | Státusz  | Eredeti cél / jelenlegi értelmezés                                                                                                                                                                | Kanonikus forrás                                                              | Fennmaradó gate / következő lépés                                                                                                                             |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S0  | DONE     | Shared domain/contract/storage, context lifecycle, invite/membership és entitlement foundation.                                                                                                   | `features/shared/SHARED_CONTEXT_HU.md`                                        | Regresszió és release flag fenntartása.                                                                                                                       |
| S1  | DONE     | `friend_group` common canon/state, participant intent és döntési alap.                                                                                                                            | `features/shared/SHARED_CONTEXT_HU.md`                                        | Valós friend beta S3 release-gate után.                                                                                                                       |
| S2  | DONE     | Shared AI queue/worker, validation/repair, initiator project/user budget és rate-limit.                                                                                                           | `features/shared/SHARED_CONTEXT_HU.md`, `product/MONETIZATION_HU.md`          | Béta alatt költségtelemetria és initiator attribution ellenőrzés.                                                                                             |
| S3  | PARTIAL  | Friend release readiness: personal impact, Auth/privacy/recovery, lifecycle és valós kétfős működés. Technikai foundation jelentős része kész, release továbbra OFF.                              | `features/shared/SHARED_CONTEXT_HU.md`, `operations/BETA_HU.md`               | Owner downgrade `end/archive/revoke` kontroll; retention/personal-impact review; targeted sponsored Guest E2E; kétfős valós privacy/cost/rollback ellenőrzés. |
| S4  | DEFERRED | `romantic_relationship` termékrelease. A domain típus létezik, product-create zárt.                                                                                                               | `features/shared/SHARED_CONTEXT_HU.md`                                        | Friend beta értékelése után mutual consent, unilateral end és max-1/user termékdöntés + teszt.                                                                |
| S5  | DEFERRED | `work_project` és `hobby_group` release.                                                                                                                                                          | `features/shared/SHARED_CONTEXT_HU.md`                                        | S3/S4 tapasztalat, típusos governance/authority és külön acceptance suite.                                                                                    |
| S6  | DEFERRED | `sports_team`, nagyobb roster/quorum/governance.                                                                                                                                                  | `features/shared/SHARED_CONTEXT_HU.md`                                        | S5 után; max 20, subset/quorum és concurrency/lock terhelési proof.                                                                                           |
| S7  | PARTIAL  | Eredeti vegyes késői csomag: sponsored seats + további group/fork/directory/public többfél funkciók. A targeted Friend sponsored Guest seat elkészült; a többi nem egyetlen release-egység többé. | `features/shared/SHARED_CONTEXT_HU.md`, `product/MONETIZATION_HU.md`, ADR-005 | Sponsored Guest: DONE. Directory/public multi-party/fork bővítések: DEFERRED és külön specifikációt/release-döntést igényelnek.                               |

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

### N00–N09 — Personal narrative quality — IN PROGRESS

A felhasználó által jóváhagyott történetminőségi fejlesztés. Issue #24; végrehajtási specifikáció: [NARRATIVE_QUALITY_IMPLEMENTATION_HU.md](plans/NARRATIVE_QUALITY_IMPLEMENTATION_HU.md).

N00–N07: DONE, PR #25–#33. N08 harness és a planner v3 / külön tervellenőr v1 / writer v3 korrekció a főág része, PR #35–#38. Legutóbbi implementáció: `fd10b856`; 87 fájl / 906 offline teszt, Verify és container CI sikeres. Új frozen policy öt normál/max8 fizikai kérés, régi policy négy/max7; egy globális javítás és a monetary/privacy/recovery védelmek változatlanok.

**N08: PARTIAL.** Teljes offline korpusz 68 fejezet / 34 pár / 248 mock transport. A legutóbbi két új első fejezet paid kapun átment öt-öt hívással, javítás nélkül, átlag 0,13373125 USD konzervatív költséggel. Mindkét külön fix-kánon writer momentum 2/5 miatt elutasított; befejezetlen tervmezők is vizsgálandók. Az összes fejlesztési ledger 101 hívás / 2,158755 USD accounted / 1,9980987 USD usage-becslés, minden használat ismert; az eredeti 5 USD keret megmarad. A teljes háromidőszakos/alternatív ágas paid corpus, hash-bound döntési review, független vak emberi értékelés és tulajdonosi költség/idő plafon még hiányzik. A két első fejezet nem qualityRelease.

**N09: PARTIAL.** Kiadási csomag előkészített, production narrative aktiválás nincs. A már funded runtime Linux-upgrade támogatása külön Issue #34; source audit/CI, migráció- és promptkompatibilis recovery, drain/fence/reconcile és target/apply/readback proof szükséges. A normál Linux-operátori adatátvétel elkészült O01-ben; ez nem pótolja az új runtime kiadási kapuit.

Issue #43: a két bukott fix-kánon feltárása elkészült; az eredeti negatív kontrollokat megőrző developed-v2 anyag és planner v4 / reviewer v2 readiness-kapu fejlesztési jelölt. Writer v3 és a kiadási küszöb változatlan; nincs új paid/human PASS.

A 2026-10-16-i két paid kísérlet 39 hívás / 0,82722 USD accounted. A readiness-v2 két első fejezete átment, de a fix kontrollok nem; a külön writer-v4 kísérlet sem javította az alkotói kontroll sceneCraft 3 pontját, ezért visszavonva. Az akkori ledger 140 hívás / 2,985975 USD, maradék 2,014025 USD; nincs qualityRelease.

Következő sorrend: az alkalmazási többfejezetes folytatás szemantikai review-ja → a kontrollanyag és írói képesség külön vizsgálata → új forráson tényleges többfejezetes mérés ugyanazon költségledgerrel → emberi benchmark → külön N09 kiadás. A minőség elsődleges; a [személyes gazdaságossági javaslat](plans/PERSONAL_STORY_ECONOMICS_PROPOSAL_HU.md) még nem ár/keret döntés.

### F00–F06 — Szabad alkotói személyes fikció — IN PROGRESS

Issue #45 / [PR #46](https://github.com/Muzsy/future_flow/pull/46), PR #44 függőséggel. [Részletes terv](plans/CREATIVE_FICTION_IMPLEMENTATION_HU.md), [ADR-008](decisions/ADR-008-creative-fiction-final-author-canon.md). A két korábbi teszt helyett új creative történetek indulnak; régi döntéspárosításuk nem szükséges, történeti eredményük megmarad.

F00–F04 implementált jelölt: verziózott végső szerzői csomag, utólagos tervellenőrzés, öt normál/max9 fizikai hívás, egy javítás, memória/StoryFact/supersession, prefix-fork, privacy/export/delete és recovery fixture. A nagyobb kimenet külön provider-határidőt kap. A v2 kompakt belső címkét gépi pattern védi, a v1 promptok hash-pinnel megmaradnak. Default legacy/üres cohort változatlan.

F05 PARTIAL: a szekvenciális kapu és context javítása implementált (PR #47), végső e5e7ed2 kód CI-je 90 fájl / 966 teszt. A korábbi ismétlődő negatív kontrollt elutasítja. Két profil hat új főági fejezete (04cee85) és egy javított ordering-fork (e5e7ed2, explicit átvett prefix-provenance) átment, mind öt hívással/javítás nélkül, minden dimenzió >=4. Az eredeti két hibás fork-planner és költsége megmarad. A végső forrás teljes többprofilos release-benchmarkja és független emberi olvasói mérce továbbra szükséges. Creative-only reviewed=false / qualityRelease=false. Globális ledger 229 hívás / 6,79395 USD accounted, 3,20605 USD maradék az engedélyezett összesen 10-ből. Részletek a STATUS és a lenti aktuális kiegészítésben.

F06 PARTIAL: compatible-mode/fallback védelem és v2 adatot is tartalmazó lokális recovery próba kész. Teljes többidőszakos/humán minőség és konkrét target/recovery Linux-rollout proof továbbra szükséges; production nincs aktiválva. N08/N09 kapuit nem helyettesíti a technikai siker.

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
- billing + AI cost telemetry;
- a személyes fejezetmodell külön jóváhagyása a mért minőség/használat/költség alapján;
- csak jóváhagyás után külön termékegyenleg, idempotens foglalás/fogyasztás/visszaadás, az USD-budget ledger változtatása nélkül.

Kanonikus forrás: `product/MONETIZATION_HU.md`.

### D01 — Shared owner downgrade data-control hardening — PENDING

A jelenlegi kód aktív host entitlementet kér owner `end`, `archive` és pending invite `revoke` művelethez. Ajánlott termékirány: create/invite/generate marad paywalled, de downgrade után az owner adat-/biztonsági kontrollműveletei maradjanak elérhetők.

Kanonikus forrás: `features/shared/SHARED_CONTEXT_HU.md`.

Ez a legközelebbi új kódos hardening feladat a Shared friend beta előtt.

## 6. Roadmap-kapcsolat

| Roadmap                               | Részletes terv                             |
| ------------------------------------- | ------------------------------------------ |
| P0 Documentation governance           | DONE; nem része a régi P01–P13 számozásnak |
| P1 Personal beta activation           | régi P08 fennmaradó release gate-ek        |
| P2 Shared friend beta                 | S3 + S7 sponsored Guest kész része + D01   |
| P3 Billing foundation                 | B01                                        |
| P4 Shared relationship expansion      | S4–S6                                      |
| P5 Community/public release expansion | P13; P09–P12 foundation már nagyrészt DONE |
| P6 Scale/platform expansion           | eredeti MVP utáni/deferred scope           |

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

### O01 — Linux personal beta operator host — DONE (normál operátori scope)

Reader/funded/daily/fence CLI Linux-host támogatás és az eredeti privát operátori state ellenőrzött átvétele elkészült PR #21-ben (`0b57f7f`). Exact-source CI/audit/root fixture és valódi reader/funded/backup/sync/restore/monitor végrehajtás sikeres; a normál munkához Windows-agent nem szükséges. Az owner-image deployment és a régi Windows scheduler nem került át. A már funded alkalmazás narratív runtime-upgrade támogatása külön nyitott Issue #34 / N09, nem O01 adatátvételi hiány. Kanonikus keret: `operations/BETA_HU.md`; runbook: `operations/LINUX_OPERATOR_HU.md`.


### Szekvenciális minőség — PR #47, aktuális kiegészítés

A végső e5e7ed2 kód CI-je 90 fájl / 966 teszt, Verify/Container sikeres. Új planner/author/reviewer v3, editor v2 és qualityPolicy 2.1.0; minden dimenzió >=4, pass verdict és négy igaz sequenceReview-jelzés kötelező, exact owned lefedéssel. Utolsó három owned legacy/narrative/creative fejezet scene/nyitó/záró bizonyítéka a közös 12 KiB keretben, withheld/prefix privacy megtartva. Choice-sorrend authorityja a history.position; örökölt timestamp megmarad. Régi job/payload és ledger nem íródott át.

A pozitív kontroll átment, a korábbi ismétlődő negatív kontrollt az új editor elutasította. A 04cee85 kétprofilos diagnózis hat teljes fejezetet adott (három-három periódus), mind öt hívással és javítás nélkül, minden pont >=4. A technikai ordering-hibán megállt fork új e5e7ed2 regressziója explicit régi prefix-provenance mellett öt hívással átment. A két forrás mérései külön maradnak; ez nem a teljes benchmark átnevezése. Független emberi, gazdaságossági/időbeli és target/recovery kapuk nyitottak.

Globális ledger: **229 hívás / 6,79395 USD accounted**, 6,3036081 USD usage-becslés; nulla ismeretlen használat/hozzárendeletlen foglalás. Az engedélyezett összesen 10 USD-ból **3,20605 USD** maradt. A hét új elfogadott fejezet kis mintás accounted átlaga 0,2508782 USD; a hibás forktervezést is számolva 0,2723329 USD. Nincs árazási vagy éles aktiválási döntés.

### HQ1–HQ8 — Emberibb, hosszú távon változatos fikció — IMPLEMENTED CANDIDATE / HUMAN VALIDATION PENDING

Issue #45, PR #47 utáni v4 csomag; [végrehajtási terv](plans/alterward_fiction_human_quality_development_plan_codex.md). V3 freeze, quality 2.2.0/editor v3/report 1.2.0, prose/system szétválasztás, három új sequence kapu, védett három raw előzmény + max8 compact signature, unchanged 12 KiB/max9/egy repair. Creative-only max6 period, külön teljes sequence/fork human-review és H1/H2 diagnosztika, régi benchmark változatlan. Nincs új paid mérés vagy production apply; az offline implementáció nem emberi PASS. A végrehajtás Claude Code/Antigravity elkülönített részfeladataival, közös Codex integrációval történik.

Technikai ellenőrzés: 93 fájl / 998 teszt, format/docs/typecheck/build/schemas PASS. Nyolcprofilos max6 creative-only offline futás: 48 főági + 2 fork minta, 250 mock transport, nulla failure/repair, 10 olvasói bundle. Emberi H1/H2, külön valódi editor-kalibráció és N09 nem zárult le; új paid/production művelet nem történt.

[PR #48](https://github.com/Muzsy/future_flow/pull/48), első implementációs forrás 3147d33: Verify/Container #321 sikeres, 93 fájl / 998 teszt. A végső promptpontosítás 34 célzott teszttel ellenőrzött; végleges HEAD/CI a PR-ben, self-merge nélkül.


### Valódi v4 részdiagnózis — 2026-10-17

Külön tulajdonosi utasításra tiszta 3809c56 forrással egy alkotói profil három főági és egy alternatív fejezete ténylegesen elkészült: négy végső kapu-PASS, 26 hívás, két javítás, 1.410585 USD accounted, P95 420594 ms. Az ügynöki olvasás konkrét jeleneteket és érdemben eltérő ágakat talált, de a határidős/órakeretes lehetőségek visszatérése nyitott kockázat. A köztes elutasítások részletes oka completion után nem maradt meg; a következő szintetikus eval előtt ez külön diagnosztikai javítás. F05/F06/N08/N09 továbbra PARTIAL/nyitott: független emberi H1/H2, külön editor-kalibráció és ár/idő/rollout döntések hiányoznak. Globális ledger 255 / 8.204535 USD, maradék 1.795465 USD a 10-ből. Nincs éles módosítás vagy ledger-reset. Részletek: STATUS és a mérési runbook.


### 045 — v5 progression/behavior + local repair provenance

F05/F06 follow-up IN PROGRESS, merged PR #48 actual base 058555005e7e85905cf53081bfa18226780cf9ac. [045 részletes végrehajtás](plans/045_fiction_v4_1_real_quality_iteration.md). V1–v4 freeze, külön v5/quality2.3/editorv4, report1.2 változatlan; az ajánlatlánc és azonnali önkorrekció visszatérésének célzott javítása, eval-only elutasítás/javítási bizonyíték. Cél: két profil hat-hat főági fejezete és két fork, majd külön emberi audit. Owner numeric authorization: legfeljebb új 7 USD / kumulatív 15.204535 USD, korábbi ledger megőrzésével. Technical/real/human eredmény külön; N09/production nem része.

045 technikai implementáció kész, PR #49 draft / CI 326 SUCCESS; részletes 14-célos offline próba PASS. Valódi eredmény 8 elfogadott, 1 elutasított, 5 nem generált: alkotói 6+fork kész; munkahelyi második fejezet ismétlődő lezárás miatt elutasított, a planner repair már elfogyott. Nincs teljes kétprofilos bizonyítás vagy quality release. Új 50 hívás / 2,527495 USD, kumulatív 305 / 10,732030 USD, maradék 4,472505 USD az új 7-ből. F05/F06/N08 PARTIAL, N09 nyitott. A következő korrekció a first-draft hivatkozási konzisztenciát és a döntésfelület prózába ismétlését kezeli; nem növeli a javítási limitet. Részletek: STATUS és 045 terv.

## Aktuális v6 végrehajtás — 2026-10-18

PR #49 merged (`1e1b4303dd779ad8e8b34970892302583a7f66dd`), a korábbi draft-státuszok történetiek. A [v6 terv](plans/045_fiction_v6_earned_life_evolution.md) végrehajtása folyamatban: külön v6/quality2.4/editorv5, v1–v5 freeze, okságilag kiérdemelt életfejlődés menetrend nélkül, goal/actor regressziók. F05/F06/N08 továbbra PARTIAL; emberi minőség nincs igazolva. Új numerikus owner authority: összesen legfeljebb 8 USD v6, nyitó eredeti ledger 305 / 10.732030 USD, kumulatív ceiling 18.732030 USD; a régi 4.472505 maradék nem adódik hozzá. Stage A 3/3, 15 hívás, 0.741945 USD; eredménye megőrizve.

Stage B lezárult, **11 elfogadott / 2 elutasított / 5 nem generált** a 18 célból: alkotói 4 főági + fork, munkahelyi 5 főági + fork. Mindkét editor ismétlődő lezárást állított meg; a prose-only repair 108751/111155 bájtos kérését a 100000-es transport guard még API előtt blokkolta. A negatív forrás `2e1a127` / sourceHash `713be4849c941ad7d8e03c604b0aa333420cc6bf00e3658c4def0b5ba4a11c5b`, nem átnevezett vagy újrapróbált siker. B: 65 hívás / 3.472645 USD; A+B: 80 hívás / **4.214590 USD accounted**, maradék **3.785410 USD** a jóváhagyott 8-ból. Eredeti ledger **385 / 14.946620 USD**, unknown/open/unassigned 0. A konkrét fejlesztői javítás mindkét guardban explicit creative-eval 192 KiB envelope, minden bájt teljes konzervatív előfoglalásával; generic/runtime default 100000, USD/memory/artifact/max9/one-repair változatlan. A javítás valódi újramérése és a nyolcas ablak/független humán mérés még hiányzik; a munkahelyi történetben már van kiérdemelt, döntéssel elfogadott munkakörváltás, de ez ügynöki olvasás, nem human PASS. F05/F06/N08 PARTIAL, N09 és rollout nyitott. Részletes esetenkénti költség/trace/hiba: [v6 terv](plans/045_fiction_v6_earned_life_evolution.md#stage-b-actual-result--2026-10-18-partial-not-release-evidence).


### Aktuális v6 keretbővítés — 2026-10-18

A tulajdonos a részleges Stage B és a konkrét javítás után **összesen legfeljebb 12 USD v6 fogyasztást** engedélyezett (az eredeti 8 + további 4; nem újraindított keret). A nyitó eredeti 305 / 10.732030 USD ledgerhez tartozó új kumulatív plafon **22.732030 USD**. Jelenleg változatlanul 385 hívás / 14.946620 USD accounted, új v6 fogyasztás 4.214590 USD; fennmaradó authority **7.785410 USD**. A korábbi 3.785410 USD maradék az emelés előtti állapot; a v5 régi maradékát nem adjuk hozzá. Új hívás csak a javított tiszta forrás ellenőrzése után: friss három munkahelyi főági/no-fork előpróba, és csak elfogadható eredménye után külön friss 18-célos mérés. Az eredeti negatív korpusz és költsége megmarad; nincs source-adoption, automatikus reroll, modellváltás vagy production engedély.


A javított transport/price guard és a 12 USD authority közös, stabil forrásellenőrzése kész: **101 fájl / 1076 teszt PASS**, format/docs/typecheck/build/schemas/diff rendben, schema drift nincs. Külön Claude Code read-only follow-up audit: nincs actionable finding. Új paid eredmény még nincs a javításon; következő a tiszta commit/CI utáni friss háromfejezetes előpróba.


### Javított forrás valódi Stage A — 2026-10-18

A javított `490db03` / sourceHash `814d73905850b0036aed691d3d7c8ae5d9782f41cc65f094620da1df08a869e5` friss munkahelyi előpróbája **3/3 elfogadott**, 18 valódi hívás, egy author-package repair. A harmadikban a lezárt vállalás typed opportunity státuszát kellett javítani; az eredeti próza teljesen megmaradt, a valódi javító transport most lefutott. Végső fidelity/editor PASS, reference error/unknown/open/unassigned 0. **0.9418175 USD accounted**, 0.8404001 usage estimate, P50 260135/P95 331250 ms. Eredeti ledger **403 /15.8884375 USD**, teljes v6 fogyasztás **5.1564075 USD**, maradék **6.8435925 USD** a 12-ből. CI332 Verify+Container SUCCESS, 101 fájl/1076 helyi teszt. Root végigolvasás szerint feltételesen alkalmas a hosszabb diagnózisra, de az első két rész cutting/critique/overexplaining mechanizmusa és a hónapritmus továbbra watchpoint. Külön, csak elfogadott szintetikus prózát olvasó Claude Code AI-kritika folyamatban; Stage B döntés ezt is mérlegeli. Ez nem human PASS, teljes B8 bizonyítás vagy production aktiválás.


A külön Claude Code diagnosztikai AI-olvasás a friss háromrészes nyitást megfelelőnek találta a hosszabb próbára, a megismételt túlmagyarázás/önirónia, montázsritmus és halk lezárások watchpointjaival. Root a tényleges választásokkal összevetette a kritikát: végső Stage A döntés **a friss 18-célos B mérés indítható**. Nincs human PASS vagy prompt/kód/kapulazítás; a benchmark ellenőrzi a hosszabb változatosságot. Alkalmazáskód változatlan a CI332 sikeres490db03 forráshoz képest, a dokumentáció külön checkpointot ad az új paid source/cost groupnak.
