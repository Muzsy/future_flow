# alterward — angol Scenario-böngésző

2026-10-08 · 2026-10-08T14:31:24.607Z

[Dokumentáció](README.md) · [15 élet / 5 Scenario](CLOSED_BETA_CATALOG_REPORT_HU.md) · [Következő lépések](NEXT_STEPS.md)

## Elkészült működés

A /scenarios oldal a már meglévő angol Scenario-readerhez vezető kártyákat, keresést és lapozást kínál. Elérhető a fő navigációból, a life/collection navigációból és a Scenario-readerből. A kártya címet, rövid helyzetleírást, fő célt, dátumot és a külön personalization lehetőségét mutatja. A személyes profil/előnézet/start folyamata változatlan; kártyakattintás nem indít AI-t és nem keletkeztet személyes életet.

GET /api/public/scenarios: anonymous, no-store/noindex, kizárólag angol. Q legfeljebb 80 karakter, page 1–100, pageSize 1–24; az HTTP- és oldallinkek ugyanazt a szigorú wire parsert használják. Duplikált tömbérték, ismeretlen mező, idegen locale és nem szabályos szám elutasított (422). Százalék/underscore/backslash literal, paraméterezett ILIKE; újabb dátum előbb, slug stabil tie-break. Legfeljebb 25 candidate/read per kérés. Nem exportálunk privát template hash-t, profilt, állapotot, pénzügyet, source grantot vagy owner/receipt ID-t a kártyába. Official Scenario továbbra nem Official LIFE minősítés.

Minden találat és lapozási sentinel a teljes meglévő élő readeren megy át: aktuális source verzió, reviewed teljes provider-evidence, curator/source grant, teljes template hash, aktív owner és consent szükséges. Withdrawal, moderáció, source revoke, forrásváltás, consentvesztés vagy deleting owner után nem jelenik meg kártya. Ismeretlen hiba blokkol, nem enged át ellenőrizetlen sort. Pagination a nyilvános candidate sorrenden alapul; az időközben érvénytelenné vált forrás kiesése rövidebb oldalt okozhat. HasMore csak ténylegesen validált plusz kártyából származik, nem privát összesítő számból.

A kliens teljes strict DTO-t és kért oldalméretet ellenőriz render előtt. HTML-ként nem értelmezett React-text, validated saját slug-link, no-store/credentials omit/no-referrer fetch, abort és unmount/querychange védelem. Focus/pageshow után törli a régi nézetet és újraolvas; hidden tab törli a kártyákat, látható oldalon 30 másodperces refresh. Invalid/empty/unavailable állapot és angol status/keresési/lapozási címkék készültek. A Next.js adott telepített verziójának page/searchParams és server/client/fetch útmutatóit a módosítás előtt átolvastuk.

## Ellenőrzés és határok

Kilenc új értelmes regresszió: default-off/no DB, költség/job mellékhatás nélküli minimal DTO és sorrend/lapozás, literal keresés/range, withdrawal/moderáció/source revoke, supersede/consent/deleting, candidate-reader közti race és sentinel, anonymous HTTP/no-store/noindex/szigorú query, biztonságos linkek és stale/private/locale/duplicate response elutasítása. Izolált PGlite, szintetikus technikai evidence; nem valódi AI-minőség állítása. Az első tesztkör két fixture-feltevést javított: revise metódusnév és a projekt tényleges 422 validációs státusza. A javított kilenc teszt sikeres; a korábbi publication és UI tesztek az első körben is sikeresek.

A tényleges Supabase staging DB öt jóváhagyott public Scenario-ja az új listából visszaolvasható, kártyacím/summary/source-egyezéssel; öt célzott keresés és egy literal negatív keresés ellenőrzött. Adatmutáció 0, új providerhívás 0, normál serving/budget flag-ek változatlanul false. Ez reader/API bizonyíték, nem pozitív interaktív UI-próba és nem éles indítás. A korábbi UI-eszközkorlátozást nem kerültük meg headless/CDP úton.

Teljes helyi pnpm check: 650 teszt / 60 fájl és production build sikeres. Három új JSON-séma; régi 162 séma és 001–036 migráció változatlan, nincs DB-migráció. A megelőző katalógus-kód pontos [45016eff CI-je](https://github.com/Muzsy/future_flow/actions/runs/37790611665) verify/container sikeres (641/59/162, 001–036 és repeat, PostgreSQL/HTTPS/DB TLS, 0 paid CI-AI); A saját b839ecb3 CI verify/container lezárva: 650/60/165, 001–036 és repeat, verified HTTPS/DB TLS/worker-stop, 0 paid AI/actual credential, tiltott egress.

A 194 seed-providerhívás és 4,668157 USD konzervatív összeg változatlan, a 3 USD beta reserve érintetlen. Személyes Scenario valódi AI-minőség/pozitív UI, P13 mérés, P11/Shared retention, backup/restore/email/ops, kapcsolat-email, tíz valódi user UUID, teljes webhely-zárás és Contabo-indulás továbbra feladat. Eredeti P01–P13 és Shared S0–S7 terv, valamint későbbi 50–100/20–30 kínálat megmarad.
