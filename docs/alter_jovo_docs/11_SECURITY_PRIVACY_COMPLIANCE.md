# alterward — biztonság és adatkezelés

**Aktuális állapot (2026-10-04):** P01–P05 privát v2 mag kész; valódi Auth/AI HTTP- és böngészős próba, export, Auth/DB-törlés és kontrollált megszakításból recovery sikeres. P07 új angol minta Sonnet auditja és P08 privát feedback/session-mérés kész; használói minőség kiadás után mérendő. Kizárólag angol indulás, magyar elrejtve. P09 tulajdonosi előnézeti alap kész, publishing/Discovery/Official seed/public fork tervezett. [Közös státusz és bizonyíték](../STATUS_HU.md), [indulási döntés](../ENGLISH_RELEASE_PLAN_HU.md). [Contabo-előkészítés](../CONTABO_PREPARATION_REPORT_HU.md) és teljes izolált web/API/worker/proxy CI sikeres; éles deploy, backup/restore, valós DB-kiesésből recovery és email-kézbesítés még nyitott.

**Shared állapot:** S0/S1 implementált: foundation és friend canon/own intent/resolution/pending memória, kikapcsolva; S2–S7 tervezett. 001–009 alkalmazva, következő S2 valódi Shared OpenAI. [S1 megvalósítás és korlátok](../SHARED_CONTEXT_S1_REPORT_HU.md) · [Integrációs terv](../SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md).

2026-10-04 · Termék- és mérnöki követelmények, nem igazolt jogi megfelelőségi nyilatkozat. [Setup](../SETUP.md) · [Public részletek](../PUBLIC_CONTENT_IMPLEMENTATION_PLAN_HU.md) · [P06/P13](../NEXT_STEPS.md).

## Meglévő védelem

Supabase Auth token szerveroldali `getUser` ellenőrzése, objektumszintű tulajdonosi ellenőrzés, RLS és anon/authenticated közvetlen táblahozzáférés tiltása. UUID ismerete nem jogosultság. Export és törlés friss tényleges JWT AMR-hitelesítést kér, tokenfrissítés önmagában nem elég. A törlés deleting státusz/lease visszavonás → Auth-törlés → belső adatgráf törlése; Auth-hibánál csak bizonyítottan meglévő Auth-fiók áll vissza aktívra. Bizonytalan Auth esetén deleting marad; durable marker és recovery parancs kezeli az Auth-siker utáni DB-hibát. [Runbook](../ACCOUNT_DELETION_RUNBOOK_HU.md).

Kulcs csak szerveroldalon, titkos helyi `.env`/projekten kívüli védett mappa; publishable key külön. TLS CA és host ellenőrzés, raw profil/prompt/token/jelszó nincs normál logban. CORS/rate-limit és requestId adott kódból ellenőrizendő; reverse proxy/nyilvános host külön konfiguráció. Nyelvváltás nem változtat ownershipt/canont.

## Termékszabály

Minden saját élet privát. Privát működés, adathozzáférés és törlés nem prémium. 18+ indulás, adatminimalizálás és álnevek. AI-tartalom és lehetséges forgatókönyv röviden jelölt; nincs megjósolt százalék vagy jelentős valós joghatású döntés. Nem klinikai teszt, pénzügyi/egészségügyi autoritás, félelem alapú upsell vagy manipuláló streak.

## Public határ — kötelező fejlesztendő védelem

- Külön allowlistes PublicSnapshot és fork-checkpoint; raw profil/memória/prompt/privát state/note/audit és eredeti belső ID nem adható ki.
- PII scan + Privacy Preview + teljes Content Preview + hash/revision/scanverzióhoz kötött Confirm. Harmadik személy adata nem lesz a szerző választásától kiadható. Scan nem anonimitási garancia.
- Private/unlisted/public. Unlisted erős bearer-token, hash tárolás, napló/referer kizárás, noindex és listákból kizárás. Tokenváltás a régit megszünteti.
- Publication/moderation státusz minden kiszolgálás és fork előtt; revoke/hide/remove a cache mellett is érvényes. OG/sitemap/Discovery nem szivárogtathat.
- Unpublish és törlés az összes saját public projekcióra/index/cache/token/save/attribution elemre kiterjed; aktív worker nem írhat vissza. Érzékeny másolatok takarítása külön gate.
- Report dedup/rate-limit, védett jelentőadat, indokolt moderator szerep és audit. Official badge nem kliensflag.

## Adatáramlás és indulási függőségek

Az alkalmazás Supabase-ban tárol, OpenAI-nak feladathoz szükséges kontextust küld. `store:false` nem általános nulla retention garancia. Indulás előtt ellenőrizendő és dokumentálandó a tényleges szolgáltatói adatáramlás/régió/retention/DPA/subprocessor, feature-önkénti jogalap és értesítési szöveg, optional analytics/marketing/publication kezelése. Az alpha-privacy-v1 nem végleges tájékoztató.

Adattípusonként retention, backup törlési életciklus, restore-próba, support/admin minimum hozzáférés, incidenskapcsolat, kulcsrotáció és helyreállítás kell. A profilozás/személyes adatok miatt a megfelelő jogi besorolás és hatásvizsgálat szükségessége launch előtt felülvizsgálandó; itt nincs frissen ellenőrzött jogszabályi határidő vagy megfelelőségi állítás.

## Release-kapu

Auth/ownership/immutable canon/export/törlés és public privacy kapuk **minden esetben** sikeresek legyenek; narratív 18/20 vagy átlagos élménypont nem enged adatvédelmi hibát. Valódi szintetikus Auth-admin/HTTP- és böngészős végigpróba, export, Auth/DB-törlés és kontrollált megszakításból recovery sikeres. Worker-törlési/lease verseny tesztelt. Valós DB-kiesésből recovery, backup/restore és a későbbi public permission/cache/token/PII próbák még külön kapuk; a privát siker nem igazolja a nyilvános folyamatot.

Contabo: új kulcsos SSH kipróbálva, jelszavas/root-password hozzáférés tiltva; root kulcsos belépés megmarad. Konfiguráció/proxy-storage védetten mentve, a másolatok hash-e egyezik. Teljes restore, Docker/Tailscale-kompatibilis tűzfal, TLS/storage és egyeztetett karbantartás még szükséges. [Pontos operatív határ](../CONTABO_PREPARATION_REPORT_HU.md).

## Shared consent, törlés és másik tag védelme

Secure egyhasználatos token, explicit branchválasztás/adatmegosztás, minimum InteractionProfile. Saját intent nélkül nincs más privát pénzügyi/munka/érzelmi döntése. Block/report/leave, anon outsider és cross-member DTO/prompt/export tesztek friend release előtt kötelezők. Törlés leválasztja/anonymizálja a tagot, nem törli mások közös canonját; próza-redakció és backup-retention külön ellenőrzendő. Shared-adatos public snapshot más tagot általánosít; identifiable multiparty kiadás csak S7 consenttel.

[Shared integráció és elfogadások](../SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) · [Változatlan forrás](../plans/README.md).
