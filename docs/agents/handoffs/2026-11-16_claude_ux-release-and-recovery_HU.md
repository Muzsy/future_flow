---
status: active-supporting
owner: operations
related:
  - ../../operations/NATIVE040_IMAGE_RELEASE_HU.md
  - ../../RECOVERY_LIFECYCLE_AUTOMATION_HU.md
---

# Handoff: UX-kiadás előkészítése és a managed mentés helyreállítása (2026-11-16)

Készítette: Claude, 2026-11-16 ~01:30 CET. Címzett: a #210-en dolgozó Codex és minden következő agent. A [#210](https://github.com/Muzsy/future_flow/pull/210) folytatása előtt olvasd el.

## Task

A 2026-11-13-i felületi audit P0/P1 javításainak élesítésre kész előkészítése, valamint a privát health (külső monitor) piros állapotának megszüntetése.

## Current branch

`main` = `672e44d`. Nyitott ág ebből a munkából nincs.

## Current state

**A mainre került (2026-11-15/16):**

| PR | Merge | Tartalom |
|---|---|---|
| [#207](https://github.com/Muzsy/future_flow/pull/207) | `e4757bd` | A CI „Verify main” jobjai `ubuntu-24.04`-re rögzítve. Az `ubuntu-latest` már 26.04, ott a container/image-rehearsal a funded fixture registry replay-ében elhasal (`docker image inspect` → `Private operation failed`). Az ok nincs feltárva; a rögzítés ideiglenes. |
| [#208](https://github.com/Muzsy/future_flow/pull/208) | `1793e85` | `KNOWN_STORAGE_TABLES` + `storage.bucket_lifecycle_states`, `storage.lifecycle_abandoned_artifacts` (tartalommal mentve). Emiatt a managed capture 2026-11-04 óta minden futáskor leállt. |
| [#209](https://github.com/Muzsy/future_flow/pull/209) | `b696229` | `contabo-recovery.mjs` Linuxon is fut; új `--update` (compare-and-swap a telepített commiton, csak `lifecycle.py`/`managed.py`/`catalog.mjs` cserélhető; expiry/local/legacy és a unitok nem). |
| [#205](https://github.com/Muzsy/future_flow/pull/205) | `6087f48` | Felületi audit P0: mobilmenü bejelentkezve, címsor hibás történetnél, történetirány-leírások, tablet/mobil elcsúszások. |
| [#206](https://github.com/Muzsy/future_flow/pull/206) | `08795c8` | Felületi audit P1: `/signup` útvonal, új csak olvasó `GET /api/v2/public-capabilities`, a nyilvános menüpontok csak bekapcsolt funkciónál, törlés a történetoldal alján, szövegek. |
| [#211](https://github.com/Muzsy/future_flow/pull/211) | `672e44d` | `REVIEWED_IMAGE_CHANGES['6644062…']` a 9 UX-termékfájllal; `REVIEWED_REGISTRY_REPLAY_EXCEPTIONS` a `story-labels.ts`-re, a futó image-hez (`sha256:996e7885…7009d`) és a `6644062`-höz kötve. |

**Éles állapot:**

- Alkalmazás változatlan: `6644062`, image `996e7885…`, schema 040. **A UX-javítások még nincsenek élesben.**
- Szerveroldali recovery lifecycle: `1525943` → `b696229` (`--update`, csak `managed.py` változott, régi források `scripts-1525943…` alatt megtartva). Friss managed mentés: `20261115T221902Z-3d2ec785`.
- Helyi Linux szinkron-timer újratelepítve, 0 hiba; a külső monitor privát lépése újra zöld (#168, 2026-11-15).
- Új szerverfájl: `/root/alterward-ops/diagnostics/managed-capture-20261115.json` (csak táblanevek és darabszámok, csak olvasó diagnózisból).

## What changed

- Termék: lásd #205/#206 (9 fájl a `6644062`-höz képest: `apps/api/src/app.ts`, `apps/web/app/globals.css`, `apps/web/components/experience.tsx`, `apps/web/components/life-experience.tsx`, `apps/web/components/site-header.tsx`, `apps/web/lib/i18n/messages.ts`, `apps/web/lib/life-messages.ts`, `apps/web/lib/public-capabilities.ts`, `packages/contracts/src/story-labels.ts`). Séma-, Compose- vagy függőségváltozás nincs.
- Ops: `scripts/ops/contabo-managed-recovery.py`, `scripts/contabo-recovery.mjs`, `scripts/ops/contabo-recovery-install.py`, `scripts/ops/contabo-service-env.py`, `scripts/lib/funded-replay.mjs`, `.github/workflows/ci.yml`.
- Dokumentáció: [NATIVE040_IMAGE_RELEASE_HU](../../operations/NATIVE040_IMAGE_RELEASE_HU.md#a-felületi-audit-kiadása-6644062--205--206), [RECOVERY_LIFECYCLE_AUTOMATION_HU](../../RECOVERY_LIFECYCLE_AUTOMATION_HU.md).

## What remains

1. **UX-kiadás a `672e44d`-ből**, tulajdonosi jóváhagyással, nappal, a runbook „A felületi audit kiadása” szakasza szerint: Daily/operátor frissítése → szünet → friss mentés + natív 040 restore → build + izolált próba → `image-plan`/`image-apply` → új mentés/offsite/restore → zöld monitor → visszanyitás.
2. A 26.04-es runner-hiba okának feltárása, utána a #207 rögzítésének feloldása.

## Verification executed

| Ellenőrzés | Eredmény |
|---|---|
| CI (verify, container, image-rehearsal) | #205, #206, #207, #208, #209, #211: zöld |
| Python ops (`tests/ops`) | OK, 11 skip (#211 fején) |
| Node ops (funded-replay, fence-operator, service-env-operator, recovery-local-linux, linux-operator) | mind zöld |
| Éles: lifecycle `--update`, `--run` | sikeres, friss managed mentés |
| Éles: külső monitor #168 | zöld, a privát lépés ténylegesen lefutott |

## Known risks

- **#210 sorrend:** a #210 is módosítja a `story-labels.ts`-t és a `life-experience.tsx`-et. Ha a UX-kiadás élesítése előtt kerül a mainre, a #211 delta-listája és lenyomatai érvénytelenek, újra kell számolni őket.
- **Pinek a #210-ben:** a main behúzása után a `REGISTRY_040_CHANGE_HASHES` (`scripts/ops/contabo-daily.py`) `story-labels.ts` és `life-experience.tsx` bejegyzését újra kell számolni, különben a CI „Exact reviewed040 application exceptions required” hibával bukik.
- A #210 CI-ja (`75faee9`) mindhárom jobban piros (verify: `pnpm test`, container, image-rehearsal); ez nem a runner-hiba, a #207 már benne van.
- A helyi szinkron-timer pinjei minden `git pull` vagy Node-frissítés után elavulnak (`--inspect`, majd `--remove`/`--install`); a #209 óta ez a `contabo-recovery-install.py`-t is érinti. A `/home/muszy/alterward-linux-operator` checkout most `b696229`-en áll.
- A Supabase új Auth/Storage táblája a managed capture zárt megállását okozza (szándékos); javítás: lista bővítése, majd `--status` → `--update` → `--run`.

## Important decisions

- A két új Storage-tábla tartalma mentésre kerül (tulajdonosi döntés, 2026-11-15).
- A UX-kiadás külön, a 041-es séma kiadása előtt történik (tulajdonosi döntés, 2026-11-16).
- A recovery `--update` nem cserélheti a lejárati/retenciós forrásokat és a unitokat; az külön reviewed telepítési döntés.

## Next recommended action

A #210-et ne mergeld a UX-kiadás élesítése előtt; addig a CI-hibáin dolgozz, és a main behúzásakor számold újra a `REGISTRY_040_CHANGE_HASHES` két érintett bejegyzését.
