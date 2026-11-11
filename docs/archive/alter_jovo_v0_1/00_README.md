# Alter Jövő — projekt-dokumentáció

**Státusz:** kezdeti fejlesztési specifikáció  
**Verzió:** 0.1  
**Dátum:** 2026-10-02

## Röviden

Az **Alter Jövő** egy személyre szabott, AI-val támogatott alternatívélet-szimulátor. A felhasználó strukturáltan megadja élethelyzetét, kapcsolatait, munkáját, érdeklődését, értékeit, céljait és személyiségjellemzőit. A rendszer ezekből verziózott személy- és életállapot-modellt készít, majd több lehetséges, hihető jövőágat szimulál.

A termék **nem jóslás**. Lehetséges forgatókönyveket mutat, amelyekbe a felhasználó beavatkozhat, döntéseket hozhat, tulajdonságokat változtathat, és új jövőágakat nyithat.

## Alapvető termékdöntések

1. Web-first, de mobilra előkészített rendszer.
2. A web és a későbbi mobilapp ugyanazt az API-t és backendet használja.
3. A profil elsődleges forrása strukturált adat.
4. A szabad szöveges AI-interjú opcionális finomítás.
5. A szimuláció és a történetírás két külön rendszer.
6. A generált próza nem truth source; a strukturált state/event graph az.
7. Minden jövő profilverzióhoz kötött.
8. A jövőágak reprodukálhatók és összehasonlíthatók.
9. Minden személyes adat privát alapértelmezéssel indul.
10. A közösségi funkciók tudatos megosztásra és anonimizálásra épülnek.
11. MVP-ben modular monolith, nem microservice.
12. Az AI-provider cserélhető absztrakció mögött működik.

## Javasolt technológiai alap

| Réteg | Javaslat |
|---|---|
| Web | Next.js + TypeScript |
| Mobil | Flutter + Dart, később |
| Backend | NestJS + TypeScript |
| Adatbázis | PostgreSQL / Supabase |
| Auth | Supabase Auth |
| Storage | Supabase Storage |
| Realtime | Supabase Realtime, ahol indokolt |
| Háttérfeladat | Supabase Queues / PGMQ vagy később BullMQ |
| API | REST + OpenAPI |
| AI | provider-agnosztikus orchestration layer |
| Deploy | Docker |
| Repo | monorepo |
| Architektúra | modular monolith |

## Dokumentumok

- `01_VISION_AND_PRODUCT.md` — vízió, célok, célcsoport, termékelvek
- `02_USER_EXPERIENCE_AND_FLOWS.md` — onboarding és fő user flow-k
- `03_PROFILE_MODEL_AND_QUESTIONNAIRE.md` — profilmodell, változók, kérdőív
- `04_SIMULATION_ENGINE.md` — szimuláció és jövőágak
- `05_AI_AND_PROMPT_ARCHITECTURE.md` — AI-réteg és promptkezelés
- `06_STORY_ENGINE_AND_CONTENT.md` — történetfolyam
- `07_COMMUNITY_AND_SOCIAL.md` — közösségi rendszer
- `08_SYSTEM_ARCHITECTURE.md` — technikai architektúra
- `09_DATA_MODEL.md` — adatmodell
- `10_API_SPEC.md` — API-váz
- `11_SECURITY_PRIVACY_COMPLIANCE.md` — adatvédelem és biztonság
- `12_MVP_SCOPE_AND_ROADMAP.md` — MVP és roadmap
- `13_ENGINEERING_SETUP.md` — repo, környezetek, CI/CD
- `14_TESTING_AND_QUALITY.md` — tesztelés és minőség
- `15_ANALYTICS_MONETIZATION_OPERATIONS.md` — metrikák, monetizáció, üzemeltetés
- `16_DECISIONS_AND_OPEN_QUESTIONS.md` — döntési napló
- `17_INITIAL_BACKLOG.md` — kezdeti backlog
- `18_AGENT_HANDOFF.md` — átadás fejlesztői ügynöknek
- `19_SAMPLE_CONTRACTS.md` — minta JSON-kontraktusok
- `20_REFERENCES.md` — hivatalos források

## MVP egy mondatban

> A felhasználó regisztrál, kitölt egy strukturált élet- és személyiségprofilt, a rendszer létrehoz egy 10 éves alternatív jövő első változatát és első történetfejezeteit, majd egy döntési pontnál új jövőágat nyithat.

## A legfontosabb technikai szabály

**Soha ne a generált prózaszöveg legyen az igazság forrása.**

A truth source:
1. profile version;
2. life state;
3. world state;
4. strukturált események;
5. döntések;
6. branch graph.

Ez teszi lehetővé a mobilklienst, újragenerálást, összehasonlítást, több nyelvet, promptcserét és regressziós tesztelést.
