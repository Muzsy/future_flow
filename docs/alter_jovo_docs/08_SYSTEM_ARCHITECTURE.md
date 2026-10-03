# alterward — rendszerarchitektúra


**Aktuális megvalósítás:** P01–P05 privát v2 mag integrált; P06–P08 valós/emberi kapu nyitott. [V2 riport](../V2_IMPLEMENTATION_REPORT_HU.md), [státusz](../STATUS_HU.md). A [P09 privát előnézeti alapja](../PUBLIC_DRAFT_FOUNDATION_HU.md) is kész; a teljes közösségi/nyilvános rész továbbra tervezett.

2026-10-03 · Meglévő architektúra és tervezett bővítés. [Implementáció](../IMPLEMENTATION.md).

## Meglévő adatfolyam

Next.js web → `/api/v1` NestJS API → PostgreSQL tulajdonosi/tranzakciós réteg → külön worker → szerveroldali OpenAI → validált canon/fejezet/jobcheckpoint → API-visszaolvasás. Supabase Auth adja az identitást; a szerver `getUser` ellenőrzést használ. A kliens nem hív OpenAI-t és nem módosít közvetlen canonical táblát.

Monorepo: `apps/web`, `apps/api`, `apps/worker`; `packages/contracts`, `core`, `database`, `ai`; `database/migrations`; `scripts`; `tests`; `docs`. A repó `future_flow`, a termék alterward, a meglévő `@future-flow/*` csomagnevek kompatibilitásból maradnak. Next/Nest patchverzió forrása a package és lockfile, nem egy elavuló architektúraleírás.

## Queue és határok

PostgreSQL jobs + `FOR UPDATE SKIP LOCKED`, lease token, heartbeat és tranzakciós enqueue/commit. PGMQ/Redis nem szükséges a jelenlegi működéshez. A v0.1 PGMQ-javaslatot a tranzakciós hordozhatóság váltotta fel. Átvett job régi workere nem commitolhat. Esemény/történet checkpoint megőrzi az elfogadott lépéseket.

Contracts a típusok/sémák; core a tiszta domain; database a tárolás; ai a provider/prompt/nyelvi utasítás/audit; API alkalmazásszintű auth/idempotencia; worker orchestráció; web megjelenítés/űrlap. Moduláris monolit, külön workerfolyamattal; új microservice/vektoradatbázis nem előfeltétel.

## V2 — következő integráció

A v2 könyvtári lifeInput/lifeState/period/constraint készen áll. P01 új tárolás head/revision/period/accepted choice számára; P02 új AI-időszak; P03 same-branch continuation. V1 DTO és immutable canon megmarad. Az API-verzió és életszerződés külön fogalom. Nyelvregiszter közös, az UI locale és tárolt life locale külön.

## Public bővítés — terv

| Modul | Felelősség |
|---|---|
| Simulation | Privát élet/ág/időszak/tény/korlát/AI/job |
| Public Content | ScenarioVersion, Publication, sanitized PublicSnapshot/checkpoint, Discovery |
| Community | Save, Share és új saját privát fork; később social |
| Moderation | PII/tartalmi scan, Report, review, hide/remove és audit |

Public endpoint csak külön DTO-ból ad olvasást, nem új anon policy a privát táblákon. Snapshot cache verzió szerint, permission/revocation ellenőrzés hozzáférésenként; CDN esetén purge és rögzített invalidálási ablak. SEO/OG kizárólag public, explicit indexelhető snapshot. Olvasás nem kerül workerqueue-ba.

## Infrastrukturális határ

Most helyi web/API/worker és Supabase működik; a main CI ellenőriz, nem deployol. Staging/production izoláció, HTTPS/reverse proxy/rate-limit, backup/restore, monitor/alert és release-felelősség külön indulási feladat. Storage/avatar, realtime push, natív mobil, fizetés és admin UI nem kész szolgáltatás; csak használati igény alapján később épül. A több klienshez API-határ marad, mobiltechnológia nem aktuális implementációs kötelezettség.
