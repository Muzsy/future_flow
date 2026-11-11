# Agent task template

## Goal

Egy mondatban: milyen felhasználói vagy rendszereredményt kell elérni?

## Scope

- pontosan milyen viselkedés/fájl/domain érintett;
- milyen meglévő contractot kell megtartani vagy módosítani.

## Out of scope

- mi nem része ennek a feladatnak;
- milyen kapcsolódó refactor/feature külön Issue.

## Canonical docs

- `docs/...`
- releváns ADR-ek
- érintett contract/migration

## Affected code

- app/package/module lista
- adatbázis/migration hatás

## Acceptance criteria

- [ ] mérhető viselkedési feltétel
- [ ] hibautak/fail-closed viselkedés
- [ ] backward compatibility vagy explicit breaking change

## Verification

- [ ] format/lint
- [ ] typecheck
- [ ] unit/integration test
- [ ] build
- [ ] schemas/migration guard, ha releváns
- [ ] célzott smoke/ops ellenőrzés, ha releváns

## Security / privacy / cost impact

Írd le akkor is, ha `none`.

## Documentation impact

Mely kanonikus dokumentumokat kell ugyanebben a PR-ben frissíteni?

## Handoff condition

Mi számít késznek, és milyen ismert kockázat maradhat nyitva?
