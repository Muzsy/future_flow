# Agent review template

## Scope match

- [ ] A PR az Issue elfogadási feltételeit oldja meg.
- [ ] Nincs indokolatlan scope-bővítés vagy opportunista refactor.

## Correctness

- [ ] A megvalósítás megfelel a kanonikus contractnak/specnek.
- [ ] Negatív és határesetek kezelve vannak.
- [ ] Nincs csendes üzleti szabály-változás.

## Data / security / privacy

- [ ] Migráció és recovery/schema guard összhangban van, ha releváns.
- [ ] Entitlement, privacy, budget, rate-limit és writer-fence nem lazult véletlenül.
- [ ] Nincs secret vagy szükségtelen személyes adat a diffben.

## Verification

- [ ] `pnpm format:check`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] `pnpm schemas`, ha releváns
- [ ] `pnpm docs:check`, ha elérhető és docs érintett
- [ ] célzott smoke/ops ellenőrzés, ha releváns

## Documentation

- [ ] A kanonikus dokumentum frissült, ha a viselkedés változott.
- [ ] `DOCS_INDEX_HU.md` frissült, ha authority vagy státusz változott.
- [ ] Új tartós döntés ADR-ben van.
- [ ] Lezárt munka nem generált felesleges új reportot.

## Verdict

- APPROVE / REQUEST CHANGES
- rövid indoklás
- maradó, de elfogadható kockázatok
