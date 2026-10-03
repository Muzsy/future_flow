# alterward — források és referenciák


**Aktuális megvalósítás:** P01–P05 privát v2 mag integrált; P06 valós Auth/ops nyitott. Indulás kizárólag angol, magyar elrejtve; P07 AI szerkesztői ellenőrzés, P08 éles béta és használói visszajelzés. [Legújabb felhasználói döntés](../ENGLISH_RELEASE_PLAN_HU.md). [V2 riport](../V2_IMPLEMENTATION_REPORT_HU.md), [státusz](../STATUS_HU.md). A [P09 privát előnézeti alapja](../PUBLIC_DRAFT_FOUNDATION_HU.md) is kész; a teljes közösségi/nyilvános rész továbbra tervezett.

2026-10-03 · Ez belső forrásjegyzék és tájékozódási linkkatalógus. Nem friss ár-, piaci vagy jogi kutatási jelentés; változó külső állítást új döntés előtt ellenőrizni kell.

## Elsődleges projektforrások

- [Pozicionálás/célmeghatározás](../PROJECT_POSITIONING_AND_GOAL_DEFINITION_HU.md), [Public Lives/Discovery/Community](../PUBLIC_LIVES_DISCOVERY_COMMUNITY_SPEC_HU.md): a két felhasználói forrás, teljes és változatlan.
- [Aktív termékterv](../PRODUCT_PLAN_HU.md), [P01–P13 backlog](../NEXT_STEPS.md), [döntési napló](16_DECISIONS_AND_OPEN_QUESTIONS.md), [követelménymátrix](../REQUIREMENTS_TRACEABILITY_HU.md): elfogadott integráció és felülírások.
- [Implementáció](../IMPLEMENTATION.md), [státusz/keret](../STATUS_HU.md), [v2 szerződés](../V2_SIMULATION_CONTRACT_HU.md), [lokalizáció](../LOCALIZATION_HU.md), [setup](../SETUP.md): kóddal összevetett tények és határok.
- [AI-ellenőrzés](../AI_VALIDATION.md), [modellvizsgálat](../AI_MODEL_ROUTING_HU.md), [minták](../examples/README.md): dátumozott mérések; a 2026-10-02-i árakat nem nevezzük újraellenőrzött aktuális ajánlatnak.
- [V0.1 archívum](../archive/README.md): az eredeti témacsomag és ZIP, történeti javaslatokkal.

## Hivatalos technikai referencia

- [Next.js App Router](https://nextjs.org/docs/app), [NestJS](https://docs.nestjs.com/), [Nest OpenAPI](https://docs.nestjs.com/openapi/introduction).
- [Supabase Auth](https://supabase.com/docs/guides/auth), [getUser](https://supabase.com/docs/reference/javascript/auth-getuser), [JWT fields](https://supabase.com/docs/guides/auth/jwt-fields).
- [PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html), [SELECT/SKIP LOCKED](https://www.postgresql.org/docs/current/sql-select.html).
- [OpenAI Responses](https://developers.openai.com/api/docs/guides/text), [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [token counting](https://developers.openai.com/api/docs/guides/token-counting), [pricing](https://developers.openai.com/api/docs/pricing).
- [OpenAPI specification](https://spec.openapis.org/oas/).

## Indulási adatkezelési felülvizsgálat kiinduló forrásai

- [European Commission — adatvédelmi elvek](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/principles-gdpr_en).
- [European Commission — AI regulatory framework](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai).

Ezek a címek az indulási felülvizsgálat kiindulópontjai, nem már elvégzett megfelelőségi ellenőrzések. A források piaci példái az ötlet hátterét adják; versenytársi bevétel, vásárlási hajlandóság, domain vagy védjegy nincs ezzel igazolva.

## Claude-méréshez ellenőrzött elsődleges források (2026-10-03)

- [Árlista](https://platform.claude.com/docs/en/about-claude/pricing)
- [Modellek](https://platform.claude.com/docs/en/models/overview)
- [Ingyenes tokenszámlálás](https://platform.claude.com/docs/en/build-with-claude/token-counting)
- [Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- [Prompt cache](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- [Thinking/effort és költség](https://platform.claude.com/docs/en/build-with-claude/thinking-steering-and-cost)

Projektbizonyíték: [Claude ár/érték riport](../CLAUDE_MODEL_EVALUATION_HU.md).
