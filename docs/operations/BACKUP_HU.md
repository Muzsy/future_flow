---
status: canonical
owner: operations
last_reviewed: 2026-10-24
related:
  - ../CONTABO_BACKUP_RESTORE_RUNBOOK_HU.md
  - RECOVERY_HU.md
---

# Backup operations

## 1. Cél

Az Alterward backup rétege az alkalmazási adatok és szükséges konfigurációk titkosított, ellenőrizhető mentését biztosítja úgy, hogy a restore külön izolált környezetben bizonyítható legyen.

## 2. Jelenlegi alapelvek

- konzisztens alkalmazási DB snapshot;
- titkosított archívum;
- szerveres és külön helyi/offsite példány;
- visszafejtő identity külön védett helyen;
- SHA/hash és manifest ellenőrzés;
- hét napos jóváhagyott napi retention;
- plaintext scratch és ideiglenes credential takarítás;
- backup önmagában nem aktivál feature-t vagy paid AI-t;
- az olvasói előkészítés (aktív és archivált, lejárt-alkalmazatlan) kötött fájllistával, root-tulajdonú 0600/0700 elemekkel kerül a titkosított config archívumba; ismeretlen név, alias, hardlink, nyilvános jogosultság vagy a 8 archívumnál több fail-closed hibát ad. Az archívum-szabály verziója külön (`READER_PREPARATION_ARCHIVE_POLICY_VERSION`), a funded operátor verziói változatlanok. Részletek: `../PERSONAL_BETA_READER_OPERATOR_HU.md`.

## 3. Authority runbook

Részletes backup/restore rehearsal:

- `../CONTABO_BACKUP_RESTORE_RUNBOOK_HU.md`

Kapcsolódó napi/retention/managed eszközök és bizonyítékok továbbra is aktív supporting dokumentumok, amennyiben a `DOCS_INDEX_HU.md` vagy ez a router hivatkozik rájuk.

## 4. Mentési scope

A napi/application mentés nem tekintendő automatikusan teljes Supabase-projekt mentésnek.

Külön scope lehet:

- `public` alkalmazási séma;
- proxy/config;
- managed Auth/Storage capture;
- operátori candidate/state fájlok;
- retention és történeti proof.

A scope-ot minden restore előtt a manifestből kell megállapítani; ne feltételezz hiányzó Auth/role/Storage adatot.

## 5. Titokhatár

- backup ciphertext commitolható? Alapértelmezésben nem: repositoryn kívüli védett operational adat;
- recovery identity soha nem kerül Gitbe/image-be;
- DB jelszó rövid életű, védett mechanizmussal használható;
- archive és identity külön helyen tartandó;
- config backup más VPS alkalmazások secretjeit is tartalmazhatja, ezért nem publikálható.

## 6. Backup késznek csak akkor tekinthető, ha

- capture sikeres;
- manifest/hash létezik;
- titkosítás igazolt;
- külön példány elkészült;
- a policy által elvárt restore/verifier gate teljesül;
- cleanup sikeres;
- monitor/retention állapot elfogadható.

Pusztán egy fájl megléte nem restore-bizonyíték.

## 7. Candidate/activation backup

Personal beta vagy más érzékeny activation előtt a konkrét candidate utáni mentés szükséges, nem egy korábbi általános owner-only backup.

Az apply csak az aktuális candidate hash-eket tartalmazó, izoláltan ellenőrzött restore proof után engedhető.

## 8. Tiltott műveletek

- plaintext archive tartós tárolása;
- éles DB-re restore próba rehearsal célból;
- globális VPS/proxy restart csak backup check miatt;
- ismeretlen/symlink/hardlink/device archive entry elfogadása;
- régi proof új state-re való ráfogása;
- retention törlés verification nélkül.

## Linux operátori host

A személyes béta reader/funded és napi backup/sync/restore/monitor Linux-host támogatása, az eredeti receipt/SSH/recovery identity egyszeri titkosított migrációja és a változatlan release kapuk: [Linux operator runbook](LINUX_OPERATOR_HU.md). Az átadás nem éles aktiválás és nem helyettesíti a konkrét candidate utáni restore proofot.

## Aktív funded runtime új verziója

A dedikált Linux upgrade/recovery implementáció és finite archive-határ: [funded runtime runbook](FUNDED_RUNTIME_UPGRADE_HU.md). Ez az eredeti ablakot és ledger-t megőrzi; nem owner-zero aktiválás és nem production engedély. A schema-038 kompatibilis recovery az aktuális DB-t használja; a quarantine restore szabályai változatlanok.

A funded upgrade külön `FUNDED_UPGRADE_ARCHIVE_POLICY_VERSION = 3` szabálya az aktív evidence mellett legfeljebb nyolc hash-nevű, lejárt és soha nem alkalmazott preparation-archívumot foglal a titkosított config backupba. Kilenc eredeti immutable fájl, opcionális probe-compose, lezárt probe-receipt és hash-hez kötött archive receipt megőrzendő; ismeretlen fájl, alias, hardlink, hibás private jogosultság vagy hash-eltérés elutasított. Automatikus archívumtörlés nincs. Az új Daily installálása változatlan kiadási kapu, az archívum nem apply-authority.

A v3 policy az aktív `probe.json` intent/cleanup evidence-t is menti; pending állapot archivált preparationben nem megengedett. A változó probe-receipt az általános titkosított backup része, nem az immutable candidate restore-kapu vagy új apply-authority. A hozzá kötött config hashét a Daily health és az archiválási ellenőrzés is validálja.
