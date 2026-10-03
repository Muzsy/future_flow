# alterward — biztonság és adatkezelés

2026-10-03 · Termék- és mérnöki követelmények, nem igazolt jogi megfelelőségi nyilatkozat. [Setup](../SETUP.md) · [Public részletek](../PUBLIC_CONTENT_IMPLEMENTATION_PLAN_HU.md) · [P06/P13](../NEXT_STEPS.md).

## Meglévő védelem

Supabase Auth token szerveroldali `getUser` ellenőrzése, objektumszintű tulajdonosi ellenőrzés, RLS és anon/authenticated közvetlen táblahozzáférés tiltása. UUID ismerete nem jogosultság. Export és törlés friss tényleges JWT AMR-hitelesítést kér, tokenfrissítés önmagában nem elég. A törlés deleting státusz/lease visszavonás → Auth-törlés → belső adatgráf törlése; Auth-hibánál aktívra visszaáll. Auth-siker után DB-hiba ops-helyreállítása még nyitott.

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

Auth/ownership/immutable canon/export/törlés és public privacy kapuk **minden esetben** sikeresek legyenek; narratív 18/20 vagy átlagos élménypont nem enged adatvédelmi hibát. Valós Auth-admin kulcsos végigpróba, worker-törlési verseny, backup/restore, permission/cache/token/prompt-injection és harmadik személy teszt külön kell. A jelenlegi automatizált tesztek és anon UI-próba nem bizonyítják a teljes éles fiókos/public folyamatot.
