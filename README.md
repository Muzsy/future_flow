# alterward

OpenAI-val generált, tartósan mentett, folytatható és elágaztatható alternatív életek, kurált Official Lives és önként publikált közösségi életutak. Angol alapnyelv, választható magyar, 18+ webes indulás; a rövid időszakokon át folytatható személyes szimuláció és az arra épülő Discovery az aktív fejlesztési cél.

A termék neve **alterward**. A GitHub-repó és a projektkönyvtár továbbra is `Muzsy/future_flow`, a meglévő belső `@future-flow/*` csomagnevek és v1 sémaazonosítók kompatibilitási okból megmaradnak.

A jelenlegi technikai prototípus tízéves életút-szcenáriókat készít, és a döntésekből új ágat indít. Ugyanazon életág következő időszakának generálása még fejlesztendő. Az [új termékterv](docs/PRODUCT_PLAN_HU.md) rövid első fejezetre, döntésre és ugyanannak az életnek a folytatására rendezi át a munkát.

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
- `packages/ai`: OpenAI Responses API és verziózott promptok.
- `packages/database`: PostgreSQL-elérés, tranzakciók, profilverziók, idempotencia és feladatok.
- `database/migrations`: ellenőrzőösszeggel követett SQL-migrációk.

## Dokumentáció

A pozicionálási és a nyilvános életutakról szóló dokumentum együtt határozza meg a következő változat irányát. A ZIP és a `docs/alter_jovo_docs` mappa az eredeti v0.1 tervezési anyagot őrzi változatlanul. A v1 szerződések mellett már rendelkezésre áll a v2 időszak-/tényállapot-szerződés és determinisztikus validátor; az új tárolás, API és AI-pipeline bekötése még fejlesztendő. Discovery és publikálás még nincs a működő alkalmazásban.

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
