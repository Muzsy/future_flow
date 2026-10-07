# Public-fork valódi AI-minősége és belépési útvonala

2026-10-07 · P12 részeredmény · English-only

P12 public-fork engine, három valódi angol AI-időszak és külső Claude-audit kész: nyelv/kánon helyes, 0 finding, 4/5/5/5/4 szerkesztői pontszám. Az eredeti private canon és public reader változatlan; az új élet privát, nem Official. Az olvasás utáni login/signup csak ellenőrzött public útvonalra tér vissza, új fiók külön felnőtt/AI-privacy és költség-hozzájárulást ad; fiókváltás nem küld indítást más felhasználó nevében. Teljes helyi check 563 teszt/50 fájl/build és 144 séma; végső kliensjavítás további két új célzott teszttel/típus/build ellenőrzéssel, 17 valódi Auth/HTTP check és tényleges cleanup. A d38b0e3 034 verify/container CI és nyolc PG-proof sikeres; az új onboarding pontos CI még ellenőrizendő. Új genuine próba 9 OpenAI + 1 Claude hívás: 0,1814238 / 0,031204 USD becslés. Kumulatív guard OpenAI 2,939418375 USD, Claude 2,409600 USD; külön 5–5 USD keretből 2,060581625 / 2,590400 USD marad. Következő Scenario személyre szabás és P13; privacy/retention/Shared/ops, eredeti célállomány és éles név/kontakt/AI-keret/kínálat döntése megmarad. Contabo élesítés még nem történt.

## Valódi generálás és audit

Reviewed genuine Official snapshot első döntési pontjának második opciójából friss saját privát élet indult. Három hat hónapos valódi Sol-időszakban a kezdeti elutasítás megmaradt; később saját új döntések és folytatások készültek. A külső Sonnet-auditor a teljes kezdő/záró állapot, minden tényváltozás, kezdeti és későbbi választás, cél/korlát és fejezet alapján 0 problémát jelzett. A szerző modell nevét nem kapta meg. Ez gépi szerkesztői és technikai bizonyíték, nem használói retenció vagy teljes indulási kapu.

[Három nyers angol fejezet](examples/AI_PUBLIC_FORK_ENGLISH_SAMPLE.md) · [Külső audit és tokenoptimalizálás](examples/AI_PUBLIC_FORK_CLAUDE_AUDIT_HU.md).

Kilenc OpenAI-hívás 0,1814238 USD tokenbecslés/0,1934325 USD guard, egy Claude-hívás 0,031204/0,038370 USD. Ismeretlen új usage nincs. A teljes kezdeti/záró tényállapot és minden változás megtartásával az auditor-input 61 049 → 35 894 byte: az eseményenként ismételt teljes állapotok helyett a változások és a periódusállapotok szerepelnek. Kb. 41% inputméret-csökkenés. Az előzetes tranzakció-helper és auditméret-próba providerhívás előtt megállt; külön, ellenőrzött recovery/compact-attempt után történt a kilenc plusz egy tényleges hívás. Eredeti bizonyítékok nem felülírva, nincs elhallgatott paid retry.

A kutatási privát account és DB-gráf ténylegesen törölve. Az eredeti private canon és public reader változatlan. A forrás kurátori forkengedélye csak a próba indításáig volt explicit bekapcsolva, majd visszavontuk; a seed permission-auditja szándékosan bővült. Nem állítunk változatlan teljes seed exportot erre a genuine kísérletre. A későbbi 17 ellenőrzéses technikai onboarding-próba teljes seed exportja viszont változatlan, paid AI 0.

## Belépés, hozzájárulás és fiókváltás

A public Login link returnTo paramétere kizárólag teljes life-/official- slugot tartalmazó /lives/:slug vagy /official-lives/:slug lehet. Külső origin, protocol-relative út, javascript, kódolt/traversal út, privát élet, unlisted token, query és fragment tiltott. A signup emailRedirectTo ugyanezt a szűrt útvonalat kapja; belépés vagy email-visszatérés után csak a public olvasó nyílik meg. Kiválasztás és generálás nem történik automatikusan. Valódi confirmation-email kézbesítése és a Supabase éles URL-allowlist külön ops-kapu.

GET /api/v1/me/consent verified Auth mellett minimális privacy-consent-status-1 acknowledged/policyVersion DTO-t ad. Nem tölti le a profilválaszokat, nem fogad más usert vagy query-t, no-store/noindex. POST me/consent a meglévő explicit adult=true/acknowledged=true szerződés szerint ír. Új felhasználó külön felnőtt/AI-privacy checkbox és külön AI-költség-megerősítés után indíthat; változatlan szerveroldali consent-gate is szükséges.

A kliens API explicit várt user ID-t tud kérni. A session egyszer beolvasott user ID-ja eltérhet egy async fiókváltás után; ilyen esetben se consent, se paid start nem kerül elküldésre. Azonos user tokenfrissítése használható. Az indítás előre rögzíti a retry-kulcsot; közben változó capability nem cserélheti ki. A szerver továbbra frissen ellenőrzi a konkrét választás és consent jogosultságát, a késve visszaérkező másik fiókos válasz nem navigálhat.

## Ellenőrzés és kiadási határ

563 teszt/50 fájl teljes format/types/script-types/API/worker/Next production build és 144 schema; a régi 143, 001–034, forrás ZIP/tervek és korábbi példák változatlanok. A végső kliens-user binding két további async identity tesztje és két redirect teszt, typecheck/Next build külön sikeres; az új teljes main CI még ellenőrizendő.

17 valódi kétfiókos Supabase Auth/HTTP próba: unaccepted own status/anon/query/foreign identity, új fiók no-consent start tiltás, adult false tiltás, három consent retry egy rekord, explicit consent utáni private start és exact retry, paid provider nélkül fogva tartott technikai job, friss Auth account-delete, tényleges Auth+DB cleanup és seed/ledger változatlanság. Két próbafiók eltávolítva, credential fájl törölve. Pozitív interaktív böngészős próba továbbra külön kapu; a korábbi eszközpolicy tiltást nem kerültük meg.

A [d38b0e3 034 CI](https://github.com/Muzsy/future_flow/actions/runs/37577143227) verify/container sikeres: 560/49/143, 001–034 migráció-repeat, mind a nyolc fork-start PG-proof, minden korábbi P09/S0–S3 proof, web/API/Caddy HTTPS és DB TLS, üres queue/worker-stop, paid AI 0.

## Folytatás

Scenario + saját jóváhagyott identitás/cél/korlát új privát kezdőállapota következik. Utána P13 fork-click/create/first-period/referral és közösségi minőségi/indulási folyamat. P11 retained prose/PII/retention, Shared S3/S4–S7, backup/restore/valós DB-kiesés/email, Contabo/Cloudflare/TLS/tűzfal/karbantartás és éles üzemeltető/kontakt/AI-keret megmarad. Az 50–100 Official Life/20–30 Scenario cél nem törölt; az induló kisebb béta vagy külön keretű teljes állomány kérdése még folyamatban. [Kombinált sorrend](NEXT_STEPS.md).
