# Alter Jövő — döntési napló és nyitott kérdések

## 1. Rögzített kezdeti döntések

### ADR-001 — Web first
**Döntés:** első kliens Next.js web.  
**Indok:** landing, SEO, megosztás, komplex profilbevitel.  
**Mobil:** Flutter később, ugyanaz az API.

### ADR-002 — Külön backend
**Döntés:** NestJS backend.  
**Indok:** mobil, AI job, domain logic, worker.

### ADR-003 — Modular monolith
**Döntés:** nincs microservice MVP-ben.

### ADR-004 — PostgreSQL / Supabase
**Döntés:** relációs truth source.

### ADR-005 — Structured profile first
**Döntés:** a profil alapja fix/kategorizált adat, a chat csak finomít.

### ADR-006 — Simulation != Story
**Döntés:** külön motor.

### ADR-007 — Canonical state
**Döntés:** prózaszöveg nem domain truth.

### ADR-008 — Async AI jobs
**Döntés:** first future és branch queue-n keresztül.

### ADR-009 — AI provider abstraction
**Döntés:** nincs provider dependency a domainben.

### ADR-010 — Privacy by default
**Döntés:** minden story privát alapállapotban.

### ADR-011 — 18+ MVP
**Döntés:** első kiadás felnőtteknek.

## 2. Fejlesztés előtt eldöntendő

### Q1. Magyar-only MVP?
**Javaslat:** igen.  
Egy nyelven könnyebb a prompt, story quality és moderáció validálása.

### Q2. Életkor vagy korcsoport?
A timeline miatt pontosabb életkor hasznos, privacy szempontból viszont korcsoport egyszerűbb. Az első wireframe előtt döntsük el.

### Q3. Lakhely granularitás?
**Javaslat:** ország + régió/megye + településtípus. Pontos cím nem kell.

### Q4. Jövedelem?
**Javaslat:** stabilitás és relatív kategória, ne pontos összeg.

### Q5. Első future időtáv?
**Javaslat:** 10 év, első 2 év részletes.

### Q6. Hány branch ingyenes?
Alpha használat és AI-költség után döntendő.

### Q7. Generálás?
**Döntés:** queue + job state, nem hosszú blokkoló HTTP.

### Q8. Prompt tárolás?
**Javaslat:** template verzió repo-ban, metadata DB-ben.

### Q9. ORM?
Választható:
- Prisma;
- Drizzle;
- TypeORM.

Egyet a Sprint 0 elején rögzíteni kell. Fontosabb a migration-first működés, mint maga az ORM márka.

### Q10. Supabase direct client?
**Javaslat:**
- Auth: igen;
- Storage: igen;
- canonical profile/future mutation: NestJS API;
- community public read később mérlegelhető.

## 3. Validálandó termékkérdések

- Kitöltenek-e 25–35 kérdést?
- Mely kérdések érződnek túl személyesnek?
- Milyen hosszú chapter az ideális?
- 10 év érdekes vagy túl hosszú?
- Timeline vagy story fontosabb?
- Használják-e a „miért történt?” funkciót?
- Branch valóban érdekes?
- Heti story jobb-e, mint azonnali teljes timeline?
- Van-e tényleges igény communityre?

## 4. Fő kockázatok

### R1 — Horoszkóp-hatás
Mitigáció:
- konkrét state;
- causality;
- személyes input;
- nem automatikusan pozitív történet;
- következetes event graph.

### R2 — Túl hosszú onboarding
Mitigáció:
- minimum profile;
- progress;
- resume;
- későbbi enrichment.

### R3 — AI költség
Mitigáció:
- task-specifikus modell;
- cache;
- limit;
- structured output;
- cost telemetry.

### R4 — Adatvédelmi bizalmatlanság
Mitigáció:
- adatminimalizálás;
- privacy default;
- export/delete;
- közérthető privacy UX.

### R5 — Inkonzisztens story
Mitigáció:
- simulation/story separation;
- validator;
- event refs;
- golden eval.

### R6 — „AI megmondja mit tegyek”
Mitigáció:
- scenario framing;
- nincs winner;
- user agency;
- decision opciók neutralitása.

## 5. Következő döntési workshop

1. MVP profilmezők véglegesítése.
2. Questionnaire v0.
3. Wireframe.
4. ORM.
5. Supabase setup.
6. Primary AI provider.
7. First future JSON schema.
8. Story style.
9. Alpha tesztelői kör.
