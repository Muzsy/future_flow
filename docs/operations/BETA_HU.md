---
status: canonical
owner: operations
last_reviewed: 2026-10-12
related:
  - ../PERSONAL_BETA_ACTIVATION_PLAN_HU.md
  - ../PERSONAL_BETA_OPERATOR_HU.md
  - ../BETA_ROLLOUT_SEQUENCE_HU.md
  - ../STATUS_HU.md
---

# Beta operations

## 1. Release sorrend

### Első kör — Personal beta

- legfeljebb 10 valós résztvevő;
- angol UI/történet;
- Shared minden flagje kikapcsolva;
- a 30 napos személyes AI-ablak csak a tényleges aktiváláskor indul;
- budget és participant mapping egyszeri, dokumentált operátori művelet.

### Második kör — Shared friend beta

Csak a personal beta tapasztalatainak értékelése után:

- öt baráti pár;
- legfeljebb 10 személy;
- `friend_group`;
- entitled host + targeted Free sponsored Guest;
- külön Shared activation gate.

## 2. Personal beta előfeltételek

A technikai preparation lezárt, de az aktiválás nincs megtörténve.

Tényleges indulás előtt:

1. végleges participant lista;
2. meghívás/első belépés;
3. email ↔ Auth UUID és reader mapping;
4. friss held/read-only megfigyelés;
5. konkrét candidate előkészítése (korábbi lejárt, alkalmazatlan reader-előkészítés esetén előbb annak archiválása);
6. candidate utáni titkosított backup és izolált restore proof; reader apply esetén a prepare, backup, restore és apply egy 15 percen belüli menet, a restore proof az adott előkészítés hash-eihez kötött;
7. pontos időablak és budget;
8. `--apply-personal` egyszeri activation;
9. első valós signed-in paid AI E2E;
10. monitor és emergency-disable ellenőrzése.

## 3. Authority

Részletes végrehajtási authority:

- `../PERSONAL_BETA_OPERATOR_HU.md`
- `../PERSONAL_BETA_READER_OPERATOR_HU.md`
- `../PERSONAL_BETA_ADMISSION_OBSERVATION_HU.md`
- `../PERSONAL_BETA_ACTIVATION_PLAN_HU.md`

Ezek aktív supporting runbookok. A closure/audit reportok csak bizonyítékok.

## 4. Budget/window

A personal beta operátor jelenlegi elfogadott kerete:

- maximum 2 USD OpenAI runtime;
- maximum 0,50 USD/user;
- pontosan 30 nap;
- külön Claude audit tartalék legfeljebb 1 USD;
- nincs automatikus keret-átcsoportosítás;
- Shared nem kap budgetet ebben a körben.

Ha a kód/operátori contract ettől eltér, activation előtt konfliktusként kezelendő.

## 5. Fail-closed működés

Nem indul beta, ha:

- participant mapping nem pontos;
- backup/restore gate hiányzik;
- provider/window candidate hibás;
- pending/idegen writer vagy queue állapot nem biztonságos;
- health/post-check hibás;
- activation időablak kifut;
- előző transition/exposure állapot nincs rendezve.

A rendszer nem hosszabbítja automatikusan az ablakot és nem próbál újra vakon.

## 6. Emergency disable

A személyes operátor vészleállítása legyen elérhető akkor is, ha a funded candidate nem használható. Célja a saját szolgáltatások stop-first leállítása és az ellenőrzött owner-zero állapot visszaállítása.

Provider key exposure után a kulcs visszavonása/forgatása külön operátori kötelezettség lehet.

## 7. Shared beta extra gate

A Shared friend kör előtt minimum:

- canonical Shared spec aktuális;
- downgrade lifecycle döntés lezárva;
- raw/personal Shared prose retention privacy review;
- sponsored Guest invite E2E;
- common event + personal impact E2E;
- Shared cost/rate-limit monitoring;
- külön activation/rollback.

## 8. Nem beta-aktiválás

Nem számít betaindításnak:

- CI;
- fixture;
- seed/catalog generálás;
- owner-only deployment;
- read-only inspection;
- dokumentáció/friss audit;
- funded candidate puszta előkészítése.
