# alterward — teljes dokumentáció-felülvizsgálat

2026-10-04 · [Dokumentációs központ](README.md) · [Aktuális státusz](STATUS_HU.md) · [Következő lépések](NEXT_STEPS.md).

## Átvizsgált anyag és bizonyíték

A felülvizsgálat a repó 83 meglévő Markdown-fájljára terjedt ki: 80 a `docs` alatt, a gyökér README és a két webes fejlesztői útmutató. Ebből 21 az aktív témacsomag, 21 az eredeti archív témacsomag. A két stratégiai forrás 38 + 42 fő fejezete és a közösségi MVP 14 eleme a követelménymátrixban továbbra teljesen visszakövethető. Az új jelen riporttal együtt 84 Markdown-fájl tartozik az ellenőrzött készletbe.

A működés leírását a controllerrel, kontraktusokkal, AI-providerrel, hét SQL-migrációval, csomagparancsokkal és telepítési konfigurációval vetettük össze. A legutóbbi teljes kód-/runtime-bizonyíték az `a69e3b3e03343082a7f728bbae0e6a0930d82737` commit [sikeres CI-futása](https://github.com/Muzsy/future_flow/actions/runs/37194453326): 159 automatizált teszt, formázás, típusellenőrzés, teljes build és séma-drift; izolált web/API/worker/Caddy, verified HTTPS/DB TLS, 001–007 és ismételt migráció, API 401 és üres worker-leállítás. Ez nem Contabo-élesítés, aktív AI-job drain vagy terhelésmérés.

A valódi Auth/AI/böngészős/export/törlési bizonyítékot a [béta-riport](BETA_IMPLEMENTATION_REPORT_HU.md), a szerveren végrehajtott változásokat a [Contabo-előkészítési riport](CONTABO_PREPARATION_REPORT_HU.md) rögzíti. A dokumentációfrissítés ezeket nem futtatta újra.

## Javított eltérések

- A terméktervben a már integrált rövid onboarding, v2 időszak, aktuális választás, folytatás, történeti fork, memória és költségőr kész működésként szerepel. A v1 tízéves archívum külön megmarad.
- A státusz/backlog/átadás egységesen jelzi a sikeres valódi Auth/UI/export/törlést és a kontrollált megszakításból recoveryt; a tényleges DB-kiesésből helyreállítás és teljes backup/restore továbbra nyitott.
- Az API-leírás felsorolja a tényleges v2 útvonalakat, a feedbacket és a tulajdonosi privát előnézetet. Az előnézethez már van séma és API, de nincs publikálás vagy anonim olvasás.
- Az adatmodell 001–007 migrációt és 17 `aw_` táblát követ. A tárolt/kutatási EN/HU kompatibilitás külön szerepel az új termékkérések kizárólag angol policyjától.
- A terv minden új termékfunkcióhoz angol felületet és angol történetet kér. Az előzetes kézi EN/HU minősítést az AI angol szerkesztői ellenőrzése és kiadás utáni használói visszajelzés váltja fel. A tervezett publikálási privacy/Confirm kapu külön marad.
- A régebbi AI-, v2- és szerverriportok az akkori eredményeiket őrzik, egyértelmű jelenlegi kontextussal. A két külön 5 USD keret aktuális összesítése a státuszban található; az árak és történeti mérési számok dátuma megmaradt.
- A Contabo-leírás külön kezeli a kész kulcsos SSH/jelszavas tiltást, védett konfigurációmentést, Compose/proxy preflightot és teljes izolált CI-t, valamint a még hiányzó éles telepítést.
- Az ismételt, elavult témadokumentum-függelékek helyett egy közös aktuális bevezető és központi bizonyítéklink szerepel. Az ADR-011 eredeti kétnyelvű döntését ADR-019 felülírja; ADR-022 rögzíti az SSH-változást.

## Ellenőrzés és megőrzés

Az összes Markdown helyi fájlhivatkozása és helyi fejezethorgonya ellenőrzött, nincs törött hivatkozás. Mindkét témacsomag manifestjének byte-mérete és SHA-256 hash-e ellenőrzött; az aktív 21 fájlé újragenerálva, az archív manifest változatlan.

62 megőrzendő fájl byte szerinti egyezése ellenőrzött a felülvizsgálat előtti Git-állapothoz képest: stratégiai források, archívum/ZIP, AI-minták és auditadatok, 18 kódból exportált JSON-séma és hét alkalmazott SQL-migráció. A generált történettörzsekhez nem nyúltunk. A webes AGENTS/CLAUDE útmutató nem igényelt módosítást.

A változás csak dokumentáció és az aktív dokumentációs manifest; alkalmazáskód, adatbázis és szerverbeállítás nem változott. Új fizetett AI-hívás nincs. A megőrzött naplóban OpenAI 98 hívás, konzervatív 1,925238375 USD és 3,074761625 USD maradvány; Claude 49 kísérlet, konzervatív 2,318045 USD és 2,681955 USD maradvány. Ezek naplóalapú összegek, nem szolgáltatói kreditegyenlegek; a két történeti ismeretlen Claude-fogyasztás foglalása megmarad.

## Hátralévő kapuk

Teljes VPS/Supabase backup és restore, valós DB-kiesésből recovery, email-kézbesítés, szolgáltatói adatkezelés/retenció és incidensfolyamat. Contabón még szükséges az aktív meglévő domainek tisztázása, TLS/storage/ACME és Docker/Tailscale-kompatibilis tűzfal rendezése, valamint egyeztetett karbantartási időablak. Az új domain későbbi felhasználói döntés; éles AI-allowance jelenleg nincs kijelölve, alapértéke nulla.

Ezek után külön éles telepítés és korlátozott privát angol béta, majd valódi használói mérés következik. P09 teljes PII/Scenario/Publication/Official seed, P10–P13 Discovery/publishing/moderáció/public fork és a 14 közösségi MVP-elem továbbra fejlesztendő. A pontos sorrend egyetlen forrása a [backlog](NEXT_STEPS.md).
