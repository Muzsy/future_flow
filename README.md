# alterward

OpenAI-val generált, tartósan mentett, folytatható és elágaztatható alternatív életek, kurált Official Lives és önként publikált közösségi életutak. Angol alapnyelv, választható magyar, 18+ webes indulás; a rövid időszakokon át folytatható személyes szimuláció és az arra épülő Discovery az aktív fejlesztési cél.

A termék neve **alterward**. A GitHub-repó és a projektkönyvtár továbbra is `Muzsy/future_flow`, a meglévő belső `@future-flow/*` csomagnevek és v1 sémaazonosítók kompatibilitási okból megmaradnak.

A privát v2 mag 12 lépéses angol/magyar onboardingból hat hónapos valódi AI-történetet készít, majd aktuális választást, ugyanazon ág folytatását és külön történeti elágazást kínál. A v1 tízéves archívum megmarad. [Megvalósítás és ellenőrzött határok](docs/V2_IMPLEMENTATION_REPORT_HU.md).

Az alkalmazás valódi OpenAI API-t használ az eseményekhez, a történethez és a történet ellenőrzéséhez. A működő alkalmazásban nincs AI nélküli demo vagy mock mód. A tesztek elkülönített tesztadatokat és teszthelyettesítőket használnak.

## Indítás

Node.js 24 és pnpm 11.19.0 szükséges.

```powershell
pnpm install
# A .env.example alapján töltsd ki a helyi .env fájlt.
# A NEXT_PUBLIC_* beállítások az apps/web/.env.local fájlba is kerüljenek.
pnpm build:packages
pnpm db:migrate
pnpm dev
```

Web: http://localhost:3000 · API: http://localhost:4000 · OpenAPI: http://localhost:4000/api/openapi.json

A Supabase-projekt, az OpenAI-kulcs és a kiválasztott modellek beállítása az éles generálás feltétele. Részletesen: [helyi beállítás](docs/SETUP.md).

## Ellenőrzés

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm schemas
pnpm verify:infra
```

Az adatbázistesztek PGlite-ba töltik ugyanazt a PostgreSQL-migrációt. Ellenőrzik a profilverziókat, tulajdonosi jogosultságokat, idempotenciát, újraindítás utáni folytatást, elágazást, közvetlen hozzáférés tiltását és a teljes fiókgráf törlését. Nem módosítják a Supabase-projektet.

A `verify:infra` a helyi környezet valódi adatbáziskapcsolatát ellenőrzi, és a hiányzó szolgáltatói kulcsokat értékük kiírása nélkül jelzi.

A `pnpm smoke:ai` valódi OpenAI-kérésekkel ellenőrzi az alapforgatókönyv, a történetellenőrzés és egy új életág generálását. Kitalált profilt és elkülönített PGlite-adatbázist használ, Supabase Auth-fiókot nem hoz létre. A próba API-kreditet használ; eredménye a Gitből kizárt `.local/ai-smoke` mappába kerül.

## Szerkezet

- `apps/web`: Next.js angol/magyar felület és megjegyzett nyelvválasztás; profil, életágak, történet, idővonal, összehasonlítás, adatkezelés.
- `apps/api`: NestJS REST API; Supabase-hitelesítés és minden erőforrásnál tulajdonosi ellenőrzés.
- `apps/worker`: tartós háttérfeladatok feldolgozása, valódi AI-generálás és ellenőrzés.
- `packages/contracts`: az egységes Zod-sémák, TypeScript-típusok és angol/magyar kérdőív, nyelvregiszter, lokalizált API-hibák.
- `packages/core`: determinisztikus állapotváltozások, időrend és domain-validátorok.
- `packages/ai`: OpenAI Responses API és verziózott promptok; külön szerveroldali Claude-értékelő.
- `packages/database`: PostgreSQL-elérés, tranzakciók, profilverziók, idempotencia és feladatok.
- `database/migrations`: ellenőrzőösszeggel követett SQL-migrációk.

## Dokumentáció

A [dokumentációs központ](docs/README.md) a két átadott stratégiai tervet, a frissített 21 témadokumentumot, a [követelménymátrixot](docs/REQUIREMENTS_TRACEABILITY_HU.md) és a [közös megvalósítási státuszt/AI-keretet](docs/STATUS_HU.md) fogja össze. A `docs/alter_jovo_docs` az aktív 0.2 témacsomag; az eredeti v0.1 és manifest változatlan másolata a `docs/archive/alter_jovo_v0_1` mappában, a ZIP az eredeti helyén marad. V2 tárolás/API/worker, rövid élet/folytatás/memória és projekt/user költségőr integrált, privát public-előnézeti alap kész. Valódi fiókos és emberi próba, Discovery/publishing/public fork még nyitott.

- [V2 megvalósítás, valós AI-mérés és határok](docs/V2_IMPLEMENTATION_REPORT_HU.md)
- [Publikálás privát előnézeti alapja](docs/PUBLIC_DRAFT_FOUNDATION_HU.md)
- [Emberi értékelés és pilot](docs/HUMAN_EVALUATION_AND_PILOT_HU.md)
- [Pozicionálás és célmeghatározás — stratégiai alap](docs/PROJECT_POSITIONING_AND_GOAL_DEFINITION_HU.md)
- [Nyilvános életutak, Discovery és közösségi specifikáció](docs/PUBLIC_LIVES_DISCOVERY_COMMUNITY_SPEC_HU.md)
- [Publikálás és Discovery — megvalósítási terv](docs/PUBLIC_CONTENT_IMPLEMENTATION_PLAN_HU.md)
- [V2 időszak- és tényállapot-szerződés](docs/V2_SIMULATION_CONTRACT_HU.md)
- [Aktív termék- és megvalósítási terv](docs/PRODUCT_PLAN_HU.md)
- [Következő fejlesztési lépések — végrehajtási sorrend](docs/NEXT_STEPS.md)
- [Jelenlegi implementáció és elfogadott döntések](docs/IMPLEMENTATION.md)
- [Beállítás és kulcskezelés](docs/SETUP.md)
- [Többnyelvű felület és AI-történetek](docs/LOCALIZATION_HU.md)
- [Korábbi valódi AI-próba és annak határai](docs/AI_VALIDATION.md)
- [Feladatonkénti modellválasztás és mért költségvizsgálat](docs/AI_MODEL_ROUTING_HU.md)

Az API-kulcsok, `.env` fájlok és az `env` mappa nem kerülnek a Gitbe. Kliensoldalra kizárólag a `NEXT_PUBLIC_*` változók kerülhetnek.

Külön Claude-kutatás és külső történetaudit elkészült: [modellek, token/cache/effort/limit és ár/érték](docs/CLAUDE_MODEL_EVALUATION_HU.md), [EN/HU auditori észrevételek](docs/examples/CLAUDE_EXTERNAL_AUDIT_HU.md). ANTHROPIC_API_KEY kizárólag védett szerveroldali .env-ben. pnpm evaluate:claude count ingyenes; paid módok a külön Claude 5 USD naplóját folytatják. A termék workerének OpenAI alapmodellje változatlan. Aktuális automatikus tesztszám: 147, fizetett API nélkül.

Az induló kiadás kizárólag angol felületet és angol történeteket ad; magyar elrejtve. A felhasználó AI szerkesztői ellenőrzést és korlátozott éles bétát választott, majd használói visszajelzés alapján javítunk. [Indulási terv](docs/ENGLISH_RELEASE_PLAN_HU.md) és [Render-telepítés előkészítése](docs/DEPLOYMENT_HU.md); még nincs éles deployment.
