---
status: canonical
owner: operations
last_reviewed: 2026-10-12
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
- backup önmagában nem aktivál feature-t vagy paid AI-t.

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
