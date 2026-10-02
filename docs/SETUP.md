# Beállítás és helyi titokkezelés

## Supabase

1. Hozz létre projektet egy választott EU-régióban.
2. A **Connect** ablakból másold a PostgreSQL-kapcsolati URL-t. Hosszú életű API/worker esetén a direct connection vagy session pooler megfelelő. Ha a gép nem éri el az IPv6 direct hostot, használd a session poolert; a régiófüggő hostot a Connect ablakból másold.
3. Rögzítsd a `DATABASE_URL` és `DATABASE_SSL=true` értékeket a helyi `.env` fájlban. A jelszó URL-encode-olt legyen a connection stringben.
   Ha a Node nem ismeri a Supabase tanúsítványláncát, a Database Settings SSL Configuration részéből töltsd le a CA-tanúsítványt, majd add meg abszolút fájlútvonalként a `DATABASE_SSL_CA_FILE` változóban. A kliens a tanúsítványt és a hostnevet is ellenőrzi; nincs `rejectUnauthorized:false` kerülőút.
4. A projekt URL és publishable key az `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` változókba kerül. Ezek nyilvános kliensbeállítások. A `SUPABASE_URL` ugyanaz a projekt URL a szervernek.
5. A **Settings → API Keys** részből a szerveroldali secret vagy legacy `service_role` kulcsot add meg `SUPABASE_SERVICE_ROLE_KEY` néven. Ez szükséges a fióktörléshez. Ne kerüljön `NEXT_PUBLIC_*` változóba.
6. **Authentication → URL Configuration**: Site URL `http://localhost:3000`; redirect engedélyezés `http://localhost:3000/login`.
7. Email/password belépés és e-mail megerősítés. A felület külön jelzi, amikor a megerősítő levélre kell várni.
8. `pnpm build:packages`, majd `pnpm db:migrate`. Az új migrációk egy tranzakcióban futnak; a már alkalmazott migráció utólagos módosítása hibát ad.

Az adatbázis-URL szerveroldali, privilegizált kapcsolat. A böngésző nem használja. A közvetlen anon/authenticated táblahozzáférés tiltott.

## OpenAI

1. Saját OpenAI API-projekt és API-kulcs, aktív API-hozzáféréssel.
2. `OPENAI_API_KEY` a gyökér `.env` fájlba.
3. `AI_EVENT_MODEL`, `AI_STORY_MODEL` és `AI_CHECK_MODEL`: Structured Outputs-képes, a saját projektben elérhető modellek az eseményekhez, történethez és ellenőrzéshez. Kezdő beállítás mindháromhoz: `gpt-6.1-sol`. Ha `AI_CHECK_MODEL` nincs megadva, az eseménymodell marad az ellenőrző, megőrizve a korábbi működést. Az eseménymodell cseréjénél ezért az ellenőrzőt is állítsd be külön. A Luna-jelölt vizsgálata és a feltételes modellkombináció: [költségoptimalizálás](AI_MODEL_ROUTING_HU.md).
4. A `GENERATION_DAILY_LIMIT`, `GENERATION_CONCURRENT_LIMIT`, `AI_MAX_OUTPUT_TOKENS` változók korlátozzák a terhelést. A szolgáltatói költségkeretet az OpenAI projektbeállításában is állítsd be.

Az API-kulcs hiányában a worker egyértelmű konfigurációs hibával leáll. A felület nem helyettesíti a generálást statikus személyes történettel.

Az érvényes kulcs és a modell elérhetősége önmagában nem igazolja az aktív API-kreditegyenleget. `credit_balance_exhausted`, `insufficient_quota` és számlázási kerethibák esetén az alkalmazás `AI_QUOTA_EXHAUSTED` hibát ad, és nem ismétli automatikusan a kérést. Az átmeneti hálózati, 429-es rate limit és 5xx hibák legfeljebb két újrapróbálást kapnak; hosszú `Retry-After` esetén korai ismétlés helyett a hiba visszatér. Forrás: [OpenAI hibakódok](https://developers.openai.com/api/docs/guides/error-codes).

## Web környezet

A gyökér `.env` szerver- és workerbeállítás. Az `apps/web/.env.local` fájl kizárólag az alábbi sorokat tartalmazza:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_KEY
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
```

A Next.js ezeket beépíti a kliensbe. Szerverkulcsot vagy adatbázis-jelszót soha ne írj ide.

## A felhasználó által megadott kulcsfájl

A korábbi `env/supabase_keys.txt` és `env/openai_key.txt` fájlokat a fejlesztés során a projektkönyvtáron kívülre, `%LOCALAPPDATA%\FutureFlow\secrets` mappába mozgattuk. A fájlok és a titkos gyökér `.env` öröklött Windows ACL-je tiltott, hozzáférésük az aktuális felhasználóra korlátozott. A kulcsfájlok tartalma nem kerül a repóba vagy az alkalmazásnaplóba.

A `.gitignore` minden `.env*` fájlt és az `env/` mappát kizárja, az érték nélküli `.env.example` kivételével. A kulcsfájl nem volt Git-commitban. Új titkot a védett titokmappában vagy a helyi `.env` fájlban adj meg; chatbe ne másold.

## Ellenőrzött határok

A tiszta telepítés, típusellenőrzés, build és lokális PostgreSQL-kompatibilis tesztek kulcs nélkül is futtathatók. A valódi Supabase Auth, DB-hálózat és OpenAI-generálás csak a szükséges beállítások után ellenőrizhető.

2026-10-02: a megadott projektben az első migráció lefutott. A közvetlen PostgreSQL-kapcsolat az official Supabase CA-val, teljes TLS-ellenőrzéssel működik; a publikus Auth-konfiguráció elérhető. Személyes profilt vagy valódi Auth-fiókot az ellenőrzés nem hozott létre. Az OpenAI-kulcs biztonságosan beállítva, a hitelesítés és a konfigurált modell elérhetősége ellenőrizve. Az API-kredit feltöltése után valódi AI-események, történetfejezetek és alternatív életág készültek. A Supabase adminisztratív kulcs még hiányzik; a tényleges email-belépés még külön ellenőrzendő.

## Valódi AI-próba, korlátozott költséggel

`pnpm smoke:ai` kitalált profilból valódi OpenAI-válaszokkal futtatja az esemény → történet → ellenőrzés folyamatot, majd egy döntésből új életágat készít. A PostgreSQL-adatbázis helyi PGlite példány; a próba nem készít Supabase Auth-fiókot és nem ír személyes adatot a Supabase-ba.

További profilok: `pnpm smoke:ai creative` és `pnpm smoke:ai career-change`. Ezek a közeli kapcsolatok nélküli tanulási cél, illetve a költözést kerülő, nagy biztonságigényű pályaváltás esetei. Egy időben egy próbát futtass.

A közös `.local/ai-smoke/usage.json` napló minden futtatás fogyasztását megőrzi. A próba alapértelmezett teljes kerete 1 USD; a `SMOKE_BUDGET_USD` változóval legfeljebb 5 USD engedhető. A határ a napló korábbi hívásait is tartalmazza. A következő generálás előtt az API bemeneti tokenszámlálója és a maximális kimenet alapján foglal keretet. Ismeretlen fogyasztású, megszakadt kérésnél a teljes foglalás megmarad.

Az árbecslés 2026-10-02-án ellenőrzött standard díjakat használ: Sol esetén 2 USD/M bemenet, 0,10 USD/M cache-olvasás, 2,50 USD/M cache-írás, 10 USD/M kimenet; Luna esetén rendre 0,10 / 0,01 / 0,125 / 0,50 USD/M. Minden hívás saját modelljének árával számol; a gondolkodási token a kimenet része, nem kerül kétszer elszámolásra. Más modell vagy hosszú kontextus esetén a próba megáll, amíg nincs hozzá megfelelő árbeállítás. Az összeg tokenszám alapján számolt becslés, nem számlázási egyenleglekérdezés. Források: [Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol), [Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), [bemeneti tokenszámlálás](https://developers.openai.com/api/docs/guides/token-counting).

A történetek és részletes riportok a `.local/ai-smoke` mappában vannak. A diagnosztikai válaszok kizárólag szintetikus tesztadatok; az API-kulcs és a kérés fejlécei nem kerülnek a naplóba. Hibaválaszból csak a kód és típus tárolódik. Ezek a helyi fájlok Gitből kizártak. A generálási hiba nem indít automatikus teljes újragenerálást.

Ez a költségőr a helyi próbára vonatkozik. Az alkalmazás minden felhasználójára érvényes szolgáltatói költségkeret külön ops-feladat.

## Üzemeltetés

A `main` ágra történő push nem jelent nyilvános deployt. Az API alapértelmezetten localhostra köt. Más hoston az API_PORT, WEB_ORIGIN és a publikus API-URL változókat állítsd be; reverse proxy előtt az IP-alapú rate-limit proxybeállításait külön ellenőrizd.

Nyilvános indulás előtt végleges adatkezelési tájékoztató, retention/backup szabályok, incidenskapcsolat, Supabase/OpenAI adatáramlás és emberi minőségértékelés szükséges.
