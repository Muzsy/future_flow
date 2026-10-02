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
3. `AI_EVENT_MODEL` és `AI_STORY_MODEL`: Structured Outputs-képes, a saját projektben elérhető modell. Kezdő beállítás: `gpt-6.1-sol`; szabadon cserélhető.
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

2026-10-02: a megadott projektben az első migráció lefutott. A közvetlen PostgreSQL-kapcsolat az official Supabase CA-val, teljes TLS-ellenőrzéssel működik; a publikus Auth-konfiguráció elérhető. Személyes profilt vagy valódi Auth-fiókot az ellenőrzés nem hozott létre. Az OpenAI-kulcs biztonságosan beállítva, a hitelesítés és a konfigurált modell elérhetősége ellenőrizve. A valódi generálási kérés `credit_balance_exhausted` hibával elutasítva; AI-tartalom még nem készült. A Supabase adminisztratív kulcs még hiányzik.

## Üzemeltetés

A `main` ágra történő push nem jelent nyilvános deployt. Az API alapértelmezetten localhostra köt. Más hoston az API_PORT, WEB_ORIGIN és a publikus API-URL változókat állítsd be; reverse proxy előtt az IP-alapú rate-limit proxybeállításait külön ellenőrizd.

Nyilvános indulás előtt végleges adatkezelési tájékoztató, retention/backup szabályok, incidenskapcsolat, Supabase/OpenAI adatáramlás és emberi minőségértékelés szükséges.
