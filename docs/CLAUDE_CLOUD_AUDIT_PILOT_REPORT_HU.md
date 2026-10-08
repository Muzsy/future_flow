# alterward — Claude Cloud próbaaudit

2026-10-08 · A felhasználó által engedélyezett próba célja annak ellenőrzése, hogy Codex közvetlenül tud-e feladatot küldeni a Claude Cloudnak, visszaolvasni a választ, majd önállóan értékelni a megállapításokat. **Ez a munkafolyamat működik.** Egy hat fájlra korlátozott kódaudit és egy célzott reprodukció készült; ez nem a teljes termék vagy a teljes történetkínálat auditja.

## Működő kapcsolat

Az aktuális hivatalos Claude Code 2.1.294 a felhasználó Claude-fiókjának bejelentkezésével küldött két üzenetet a meglévő, `Muzsy/future_flow` repóhoz kapcsolt Cloud sessionnek. A modell **Sonnet 5.5**, Medium effort, Fast kikapcsolva. Az első prompt hat fájl read-only vizsgálatát kérte, a második kizárólag a talált hiba szintetikus reprodukcióját. Nem indult további teljes audit.

A kipróbált út: előkészített prompt → hivatalos CLI `--safe-mode --print … --cloud <session-id> --output-format json` → Cloud visszaigazolás → kész jelentés kiolvasása a böngésző látható dokumentumából → helyi JSON- és forráshivatkozás-ellenőrzés → önálló kódvizsgálat és reprodukció. A CLI válasza csak a beküldés visszaigazolása, nem az auditjelentés. Új Cloud session létrehozása interaktív; a fenti forma meglévő session következő feladatára működött.

API-kulcs nem kellett ehhez az úthoz, helyi Anthropic API-fallback nem volt. A Cloud rendelkezett hozzáféréssel a projekt repójához; a prompt a vizsgálatot a felsorolt fájlokra korlátozta. A helyi `.env`, `env/` és `.local/` titkai nem kerültek feltöltésre. Claude nem módosította a repó fájljait; a reprodukció saját ideiglenes fájljait eltávolította. Éles adatbázis és Contabo nem volt érintett.

## Vizsgált állapot és értékelés

Kiinduló commit: `1bd8b962984f9abf5e379fc9d431f5fde0245f99`.

1. `packages/database/src/public-origin-metrics.ts`
2. `packages/contracts/src/public-origin-metrics.ts`
3. `scripts/public-origin-metrics.ts`
4. `scripts/lib/private-report.ts`
5. `tests/public-origin-metrics.test.ts`
6. `docs/PUBLIC_ORIGIN_COHORT_REPORT_HU.md`

A jelentés strukturális ellenőrzése sikeres: azonos auditazonosító és commit, mind a hat engedélyezett fájl, létező forrássorok, egy megállapítás. Ez az ellenőrzés önmagában nem bizonyítja a megállapítás igazságát. Codex külön vizsgálta a kódot és a kapcsolódó migrációkat, majd kontrollált próbával ellenőriztette a hibát.

**F1, alacsony súlyosság:** a privát riportíró `existsSync` ellenőrzése egy nem létező célra mutató szimbolikus fájlhivatkozást hiányzó fájlnak tekintett. Emiatt a linked-file tiltás nem futott le, az írás pedig a hivatkozás külső célját hozhatta létre. A kihasználáshoz előzetes helyi írási hozzáférés kell a védett riportmappához; a vizsgált út nem nyilvános webes végpont.

A Cloud Linux próbája az eredeti helper tényleges forrását használta, ismert SHA-256 ellenőrzőösszeggel (`3a022b6e98af41456371433c0ed217d948924920af2ba78b7626c815c7ec5d01`), szintetikus adatokkal. `existsSync=false`, `lstat` szerint symlink; a helper nem dobott hibát, a riportmappán kívüli cél létrejött. Negatív kontrollként a már létező célra mutató symlinket a helper elutasította. **A hiba reprodukált.** Windows alatt a symlink létrehozását a rendszer `EPERM` hibával tiltja; ez környezeti korlát, nem cáfolat.

A javítás közvetlen `lstatSync` vizsgálatot használ, csak az `ENOENT` jelenti a fájl hiányát, más fájlrendszerhibát továbbad. A létező és a hiányzó célra mutató symlinket, valamint a hardlinket az írás előtt elutasítja. Ez a reprodukált hibát javítja; nem állítunk általános versenyhelyzet-mentességet az ellenőrzés és az írás között.

## Ellenőrzések és határok

Öt új, valódi fájlrendszert használó regresszió került a `tests/private-report.test.ts` fájlba: normál létrehozás/felülírás, létező symlink, dangling symlink, hardlink és tiltott fájlnév. Helyben három sikeres, két symlink-próba a Windows jogosultsági korlátja miatt kihagyott. A teljes `pnpm check` sikeres: formázás, típusellenőrzés, **658 sikeres / 2 kihagyott teszt, 62 fájl**, API/worker/Next production build.

A javítás és regressziók a `de2d76d54fa584888b374b9849c2b2079d307c5f` main commitban szerepelnek. A hozzá tartozó [Linux main CI](https://github.com/Muzsy/future_flow/actions/runs/37825268093) **verify és container sikeres**: **660 sikeres teszt / 62 fájl, kihagyás nélkül**, köztük mind az öt új fájlrendszer-próba; formázás, típusellenőrzés, production build, séma-drift ellenőrzés és izolált konténeres DB/HTTPS/TLS-próba sikeres. A fix utáni Linux-regresszió igazolja, hogy az eredeti reprodukált hibát az új guard elutasítja. DB-migráció és szerződés nem változott.

Claude három kérdést helyesen ellenőrizetlennek jelölt a hatfájlos scope miatt. A kiegészítő önálló ellenőrzés eredménye:

| Kérdés | Ellenőrzött háttér / korlát |
| --- | --- |
| Replay/dupla eredetsor | A 034 és 036 migráció táblánként egyedi életazonosítót használ; a normál start út új életet hoz létre és idempotens. A két táblára együtt nincs külön közös DB-unique constraint. |
| Első három periódus és befejezett job | A 003 migráció az ágpozíciót és periódust egyedivé teszi; a life-job ellenőrzi a payload periódusazonosítóját és a mentéssel együtt véglegesíti a jobot. |
| Törlés és user status | A 001 migráció `active`/`deleting` státuszokat enged; a start táblák user/life/branch FK-i cascade törlést, a publikációforrások leválasztható kapcsolatot használnak. |

Az UTC napváltás körüli, tényleges eseménysoros teszt továbbra bővíthető. A pozitív interaktív UI, retention/backup/restore/email/üzemeltetés, tesztelőlista és Contabo-indulás kapui változatlanul fennállnak. A próba nem zárja le a teljes P01–P13 vagy Shared S0–S7 tervet.

## Költség és bizonyíték

A Cloud felülete a próba előtt és az audit + reprodukció után is **99 USD / 100 USD** megmaradt promóciós keretet mutatott. A részletes elszámolást a `See detailed breakdown` gomb `/usage` lekérdezésként jelenítette meg: **0,56 USD teljes session**, ebből **0,40 USD Sonnet 5.5** és **0,15 USD Opus 5.5**, 80% cache-találat. A Sonnet-rész az auditot és a reprodukciót, az Opus-rész a korábbi, a próba előtti választ tartalmazza. Ezek a szolgáltató felületén kerekítve látható adatok; a sorok kerekítése miatt az összegük nem feltétlenül egyezik a kerekített végösszeggel. Pontos, promptonkénti számla nincs.

| A felület tokenadata | Sonnet 5.5 | Opus 5.5 | Összesen |
| --- | --- | --- | --- |
| Input | 10 | 2 | 12 |
| Output | 306 | 6 | 312 |
| Cache read | 327,6k | 26,1k | 353,8k |
| Cache write | 68,4k | 17,9k | 86,3k |

A kijelzett context 94,5k token, ebből rendszer-/eszközdefiníció és korábbi üzenet is van; nem azonos az új hatfájlos tartalommal vagy a számlázott tokenösszeggel. Következő audithoz indokolt a Sonnet, kis forráscsomag, rövid strukturált jelentés és célzott reprodukció. Ez egy pilot tapasztalata, nem összehasonlító modellminőségi mérés: az Opus korábbi válasza nem összevethető audit. Nagyobb modell bevonása konkrét, nehéz vagy ellentmondásos megállapításnál indokolható; új session és folytatás költsége a cache miatt külön mérendő.

Külön OpenAI/Anthropic API-egyenleget terhelő hívás nem történt; a régi fejlesztési és a 10 USD béta API-keret külön marad. Fizetett kiegészítő Cloud használatot nem kapcsoltunk be.

A nyers jelentés, a JSON-validálás, a Linux reprodukció, az önálló értékelés, a részletes használati riport és a böngészőbizonyíték a Gitből kizárt, védett `.local/claude-cloud-pilot/` mappában marad. Bejelentkezési adat vagy teljes session-előzmény nem kerül a dokumentációba.

Hivatalos háttér: [Claude Code a weben és CLI-ből](https://code.claude.com/docs/en/claude-code-on-the-web), [CLI opciók](https://code.claude.com/docs/en/cli-reference), [Cloud session promóció](https://support.claude.com/en/articles/17152539-cloud-sessions-bonus-credit-promotion). A böngészőben látható lejárat: **2026-11-05 08:59, Europe/Budapest**. A kijelzett egyenleg és lejárat dátumozott megfigyelés, nem új költési engedély.
