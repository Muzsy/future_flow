---
status: canonical
owner: documentation
last_reviewed: 2026-10-12
---

# Dokumentációs governance

Ez a dokumentum meghatározza, hogyan kell az Alterward dokumentációját karbantartani úgy, hogy ember és AI agent ugyanazt a projektállapotot olvassa ki belőle.

## 1. Cél

A dokumentáció feladata nem a teljes fejlesztési történet ismétlése, hanem annak egyértelmű megmondása, hogy:

- mi igaz most;
- mi a kívánt működés;
- mi a következő fejlesztési irány;
- melyik anyag csak történeti bizonyíték;
- mely forrás nyer ellentmondás esetén.

## 2. Dokumentum-státuszok

### canonical

Adott témában az elsődleges, aktív emberi olvasású source of truth. Egy témához lehetőleg egy kanonikus dokumentum tartozzon.

### active-supporting

Aktuális runbook, részletes technikai leírás vagy mérési dokumentum, amely egy kanonikus dokumentumot egészít ki. Nem írhatja felül azt.

### transitional

Jelenleg még szükséges vagy hivatkozott dokumentum, de összevonásra, átírásra vagy archiválásra vár. Új fejlesztési döntést lehetőleg már ne ide írjunk.

### historical

Lezárt audit, report, checkpoint, implementation report vagy egyszeri mérés. Történeti bizonyíték, nem jelenlegi specifikáció.

### archived

A `docs/archive/` alatt tárolt, leváltott dokumentum. Aktív fejlesztési döntéshez önmagában nem használható.

## 3. Source precedence

Ellentmondás esetén:

1. futó kód, migráció és géppel ellenőrzött contract;
2. elfogadott ADR / kanonikus specifikáció;
3. kanonikus feature/product/architecture dokumentum;
4. `STATUS_HU.md`;
5. `ROADMAP_HU.md`;
6. aktív implementációs terv;
7. audit/report/checkpoint;
8. archive.

A kód–spec konfliktust explicit módon kell feljegyezni; nem szabad automatikusan feltételezni, hogy a kód a kívánt üzleti döntés.

## 4. Kötelező metadata

Új kanonikus dokumentum elején legyen YAML frontmatter legalább:

```yaml
---
status: canonical
owner: <domain>
last_reviewed: YYYY-MM-DD
---
```

Opcionális:

```yaml
supersedes:
  - path/to/old.md
related:
  - path/to/related.md
```

A `last_reviewed` tényleges tartalmi felülvizsgálat dátuma, nem automatikusan minden commit dátuma.

## 5. Dokumentumtípusok

### STATUS

Csak a jelenlegi projektállapot, aktív gate-ek és kockázatok. Nem napló és nem commitlista.

### ROADMAP

Jövőbeli prioritások, függőségek és release-gate-ek. Nem jelenlegi státusz és nem részletes implementation log.

### Product/feature specification

A kívánt felhasználói és üzleti viselkedés. Implementációs részlet csak annyiban, amennyiben a contract megértéséhez kell.

### Architecture

Rendszerhatárok, komponensek, adatfolyamok és tartós technikai invariánsok.

### ADR

Egy tartós döntés: context, decision, consequences, alternatives, status, date. Nem roadmap és nem tasklista.

### Runbook

Végrehajtható operátori folyamat konkrét preconditionökkel, lépésekkel, ellenőrzéssel és rollbackkel.

### Report/audit/checkpoint

Egy időponthoz kötött bizonyíték. Elkészülte után történeti dokumentumként kezelendő.

## 6. Elavulás és supersede

Ha új kanonikus dokumentum vált le egy régit:

1. az új dokumentum `supersedes` mezőben hivatkozza a régit;
2. `DOCS_INDEX_HU.md` az új dokumentumra mutasson elsődlegesen;
3. a régi fájl kapjon `historical` jelölést vagy kerüljön `docs/archive/` alá;
4. a régi fájl ne maradjon párhuzamos kanonikus forrás.

## 7. Archiválási szabály

Archiválandó, ha a dokumentum:

- lezárt implementációs riport;
- dátumozott checkpoint;
- leváltott terv/spec;
- lezárt audit vagy egyszeri mérés;
- korábbi terméknév/architektúra snapshot.

Nem archiválandó pusztán azért, mert hosszú, ha aktív operátori runbookként továbbra is szükséges.

Az archive fájloknál a könyvtár maga jelzi az archived státuszt; opcionálisan a fájl tetején is szerepelhet:

> HISTORICAL DOCUMENT — NOT A CURRENT SOURCE OF TRUTH

## 8. Új dokumentum létrehozási küszöb

Új fájl csak akkor indokolt, ha:

- új kanonikus témát vezet be;
- tartós ADR-t rögzít;
- önálló operátori runbook;
- jogi/security/compliance szempontból külön bizonyíték kell.

Egy lezárt fejlesztési feladathoz alapértelmezésben az Issue + PR + kanonikus docs frissítés elegendő. Ne gyárts új `*_REPORT` fájlt rutinszerűen.

## 9. Agent-kompatibilitás

Egy tipikus feladat indulásához legfeljebb 4–5 elsődleges dokumentum legyen szükséges. A `DOCS_INDEX_HU.md` feladata, hogy ezt a minimális kontextust megadja.

A történeti dokumentumok tömeges betöltése tilos alapértelmezett agent-stratégiaként: előbb a kanonikus forrásokból kell meghatározni, hogy szükséges-e valamelyik régi anyag.

## 10. CI

A dokumentációs CI célállapota:

- kötelező kanonikus fájlok léteznek;
- frontmatter státuszok érvényesek;
- ADR számok egyediek;
- a kanonikus dokumentumok szerepelnek az indexben;
- a kritikus belső linkek feloldhatók;
- archive nem jelenhet meg aktív kanonikus forrásként.

A gépi ellenőrzés támogatja, de nem helyettesíti a tartalmi review-t.
