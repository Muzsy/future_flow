---
status: canonical
owner: project
last_reviewed: 2026-10-12
supersedes:
  - STATUS_HU.md (pre-2026-10-12 checkpoint-log form)
related:
  - ROADMAP_HU.md
  - DEVELOPMENT_PLAN_HU.md
  - product/PRODUCT_HU.md
  - architecture/ARCHITECTURE_HU.md
---

# Alterward — aktuális projektállapot

Ez a dokumentum kizárólag a jelenlegi állapotot tartalmazza. Korábbi checkpointok, auditok és release-bizonyítékok történeti anyagok.

## Release posture

**A személyes béta műszaki előkészítése lezárt, de a béta nincs aktiválva.**

Jelenlegi működési keret:

- az alkalmazás Contabón, tulajdonosi hozzáféréssel fut;
- Cloudflare Access zárja a webhelyet;
- a konkrét személyes béta tesztelői kör nincs aktiválva;
- a személyes AI 30 napos bétaablaka nincs elindítva;
- Shared nincs bekapcsolva az első személyes béta körben;
- billing/checkout/webhook nincs éles termékként implementálva.

A béta aktiválási részleteit az operations dokumentáció és a `DEVELOPMENT_PLAN_HU.md` P08 pontja kezeli.

## Termékterületek

| Terület | Állapot | Megjegyzés |
|---|---|---|
| Private Personal Simulation | implemented | profil → world state → generálás → döntés → következmény → folytatás/fork |
| Official Lives | implemented/catalogued | angol Official életutak és kiadási pipeline létezik; első személyes béta scope-jától elkülönítve |
| Scenario | implemented/catalogued | Official és személyes Scenario útvonalak léteznek |
| Public/Community infrastruktúra | implemented in substantial parts, release-gated | publication/discovery/fork/moderation/curation kód és operátori eszközök vannak; ez nem jelent nyilvános launchot |
| Shared Context | implemented, release-disabled | friend alap és Shared AI/personal impact infrastruktúra létezik; első személyes béta alatt kikapcsolva |
| Sponsored Guest seat | implemented | targeted Free friend Guest modell a main része |
| Paid subscription billing | not implemented | entitlement modell létezik, payment provider/checkout/webhook nincs kész |
| Hungarian release | deferred | induló termék és AI-történetek angolul |

## Shared entitlement — jelenlegi kódállapot

- Free: saját Shared context nélkül egy targeted `friend_group` sponsored Guest részvétel;
- Explorer: 1 saját friend context;
- Connected: legfeljebb 3 saját context; friend/romantic/work/hobby;
- World: legfeljebb 5 saját context; sports team is elérhető;
- sponsored Guest nem hozhat létre contextet, nem hívhat meg másokat és nem indíthat fizetett Shared AI-t;
- Shared AI költség az entitled kezdeményező `requested_by_user_id` felhasználóhoz és projektbudgethez tartozik.

Részletes kanonikus Shared specifikáció: `features/shared/SHARED_CONTEXT_HU.md`.

## Technikai architektúra

Monorepo:

- `apps/web` — web kliens;
- `apps/api` — HTTP/API réteg;
- `apps/worker` — aszinkron AI/background feldolgozás;
- `packages/access` — hozzáférési/auth helper réteg;
- `packages/contracts` — sémák és külső/belső contractok;
- `packages/core` — domain logika és invariánsok;
- `packages/database` — perzisztencia és repository réteg;
- `packages/ai` — AI/provider integráció.

Adatbázis-migrációk, contractok és recovery/schema guardok a runtime-kód részei; migrációs változtatásnál együtt kell őket frissíteni.

## CI és quality gate

A normál Verify workflow ellenőrzi többek között:

- dependency install/frozen lockfile;
- formázást;
- dokumentációs konzisztenciát (`pnpm docs:check`);
- repository/security boundary-kat;
- typechecket;
- teszteket;
- buildet;
- schemas generálást/eltérést;
- container/deployment/TLS határokat.

## Operations

Aktív infrastruktúra-elemek a jelenlegi operátori dokumentáció alapján:

- Contabo deployment;
- titkosított napi backup;
- offsite/local backup másolat;
- restore/recovery ellenőrzések;
- külső health/availability monitorozás;
- Supabase Auth/DB privacy és writer-fence védelmek.

A részletes végrehajtási eljárásokat nem ez a STATUS, hanem az operations/runbook dokumentáció tartalmazza.

## Aktív release gate-ek

### P1 roadmap — első személyes béta

Még szükséges:

1. a konkrét, legfeljebb 10 fős tesztelőlista;
2. meghívás és első belépés;
3. email ↔ Auth UUID / reader hozzáférés pontos operátori beállítása;
4. candidate backup/restore és indulás előtti egyszeri ellenőrzés;
5. 30 napos személyes AI-ablak dokumentált aktiválása;
6. valódi bejelentkezett, fizetett AI E2E indulási próba.

Részletes végrehajtási pont: `DEVELOPMENT_PLAN_HU.md` P08.

### P2 roadmap — Shared friend beta

Csak a személyes béta után. Tervezett első kör: öt baráti pár / legfeljebb 10 személy, külön aktiválással.

Részletes végrehajtási pont: `DEVELOPMENT_PLAN_HU.md` S3 + S7 sponsored Guest része + D01.

## Ismert aktív kockázatok / döntési pontok

1. **Shared downgrade lifecycle:** a jelenlegi kód owner `end`, `archive` és pending invite `revoke` műveletnél is aktív host entitlementet kér. Emiatt egy Free-re visszaminősített korábbi tulajdonos nem tudja ezeket a kontrollműveleteket elvégezni. Ezt a Shared release előtt explicit termékdöntéssel rendezni kell.
2. **Billing hiány:** a tier/entitlement modell nem azonos kész fizetési rendszerrel. Provider, checkout, webhook és számlázási lifecycle külön fejlesztési fázis.
3. **Recovery határ:** teljes hosted Supabase-vesztés esetére elfogadott korlát a zárva maradó, kézi újraépítés; ez nem automatikus disaster-recovery ígéret.
4. **Publikus/community release:** a meglévő infrastruktúra és staging/curation bizonyíték nem jelent automatikus publikus termékengedélyt.

## Személyes történetminőség fejlesztés

N00–N09 workstream elindult, Issue #24. N00 beolvadt PR #25-ben: nyolc kitalált, determinisztikus tesztprofil és a legacy generálási út háromidőszakos offline baseline-ja. N01 default-off context módja megvalósítva, még review/CI alatt; a production nem használja. Ez nem valódi provider vagy emberi minőségi benchmark, és nem production rollout. Részletek: `plans/NARRATIVE_QUALITY_IMPLEMENTATION_HU.md` és `DEVELOPMENT_PLAN_HU.md`.

## Aktuális fejlesztési fókusz

1. személyes béta tényleges aktiválása a meglévő kapuk szerint;
2. Shared owner downgrade data-control hardening;
3. utána Shared friend beta;
4. billing foundation külön fejlesztési körben.

A dokumentációs governance és canonicalization elkészült. A részletes régi P01–P13 / S0–S7 végrehajtási állapotot a `DEVELOPMENT_PLAN_HU.md` tartja karban.

Jövőbeli prioritások: `ROADMAP_HU.md`.

## Operátori host átállás

A személyes béta reader/funded és napi backup/sync/restore/monitor Linux-host támogatásának és az eredeti Windows operátori state titkosított migrációjának O01 munkája folyamatban. Ez nem jelenti a Linux operátori kiadás vagy a valódi béta aktiválását. Részletek: `operations/LINUX_OPERATOR_HU.md`.
