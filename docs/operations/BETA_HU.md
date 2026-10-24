---
status: canonical
owner: operations
last_reviewed: 2026-10-24
related:
  - ../PERSONAL_BETA_ACTIVATION_PLAN_HU.md
  - ../PERSONAL_BETA_OPERATOR_HU.md
  - ../BETA_ROLLOUT_SEQUENCE_HU.md
  - ../STATUS_HU.md
---

# Beta operations

## Aktuális kiadási fókusz — 2026-10-24

Tulajdonosi döntés: a v9 motor további finomítása helyett annak befagyasztása, technikai stabilizálása és a kis zárt béta előkészítése az elsődleges. Végrehajtás: integrált jelölt → v9-kompatibilis N09/backup/recovery → teljes tesztelői alapút → konkrét engedélyezett indulás. További editor/history-kutatás és archetípus-fejlesztés DEFERRED. A meglévő helyettesítő zártbéta-minőségkapuk érvényesek; adat-, költség-, privacy- és helyreállítási védelem nem halasztható. A konkrét lezárási feltételeket a [narratív kiadási runbook](NARRATIVE_RELEASE_HU.md#bétafókusz-és-motorbefagyasztás--2026-10-24) tartalmazza.

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

Az első tesztelő aktiválása és valódi háromfejezetes E2E megtörtént. Az utolsó igazolt E2E 2026-10-14-i; ez a dokumentációfrissítés nem új élő health-ellenőrzés. Reader/login, friss candidate backup/izolált restore és kanonikus Linux apply/inspect sikeres. Az alkalmazott UTC ablak 2026-10-13T22:11:21Z–2026-11-12T22:11:21Z, 2 USD projekt / 0,50 USD user. Nem indul új 30 nap és nem nullázható a költés.

Új résztvevő vagy külön kiadás előtt megőrzendő sorrend:

1. végleges participant lista;
2. meghívás/első belépés;
3. email ↔ Auth UUID és reader mapping;
4. friss held/read-only megfigyelés;
5. konkrét candidate előkészítése (korábbi lejárt, alkalmazatlan reader-előkészítés esetén előbb annak archiválása);
6. candidate utáni titkosított backup és izolált restore proof; reader apply esetén a prepare, backup, restore és apply egy 15 percen belüli menet, a restore proof az adott előkészítés hash-eihez kötött;
7. pontos időablak és budget;
8. a konkrét változtatáshoz tartozó kanonikus művelet; az első egyszeri `--apply-personal` már megtörtént, nem ismételhető új ablak nyitására;
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

A personal beta operátor elfogadott kerete. Tulajdonosi döntés, 2026-10-19: a narratív zárt béta első köre **10 USD OpenAI-keret 3 tesztelőre** (tervezett beállítás 10 USD projekt / 3,33 USD felhasználó). A kód és az operátori ellenőrzések plafonja ehhez 10 USD projekt és 3,34 USD felhasználó. A már futó, 2026-11-12-ig tartó első ablak 2/0,50 USD-s értékei változatlanok; az új keret csak új, külön jóváhagyott 30 napos ablakkal, az N09 frissítés után indulhat.

- maximum 10 USD OpenAI runtime (az első ablakban 2 USD);
- maximum 3,34 USD/user (az első ablakban 0,50 USD);
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

## Linux operátori host

A személyes béta reader/funded és napi backup/sync/restore/monitor Linux-host támogatása, az eredeti receipt/SSH/recovery identity egyszeri titkosított migrációja és a változatlan release kapuk: [Linux operator runbook](LINUX_OPERATOR_HU.md). Az átadás nem éles aktiválás és nem helyettesíti a konkrét candidate utáni restore proofot.


## 10. Igazolt E2E és jelenlegi nyitott határ

Egy tesztelővel három paid fejezet, két continuation ciklus, mentett választások, lista/újranyitás/logout-login és friss hitelesítés utáni export ellenőrzött. Kilenc task 0,188585 USD adatbázis-elszámolással, nem provider-számlaegyeztetéssel. A következő generálást a szándékos 3/UTC-nap, 1 párhuzamos kérés limit megállította; későbbi sessionből sikeres új generálás és a megtartott fiók destruktív törlése nincs igazolva. Ez nem széles kohorsz-, Shared-, public vagy új narrative release.

A normál reader/funded/daily/fence munka Linuxon elvégezhető; O01/PR #21 átadás lezárt. Az új narratív runtime már funded környezetre frissítése külön támogatási és recovery-kapu (Issue #34, N09). A fejlesztési benchmark külön projektje/összesített 5 USD ledgere nem a fenti bétaablak része. Árjavaslat vagy docs-merge nem módosíthatja a live admissiont, költséget vagy időablakot.
