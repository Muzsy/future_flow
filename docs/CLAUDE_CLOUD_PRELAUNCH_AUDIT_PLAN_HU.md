# alterward — kötelező részletes Claude Cloud-audit éles indulás előtt

2026-10-08 · Felhasználó által kért kiadási kapu. [Zárt Contabo-indulás](CLOSED_SITE_RELEASE_PLAN_HU.md) · [Kombinált fejlesztési terv](NEXT_STEPS.md) · [Működő próbaaudit](CLAUDE_CLOUD_AUDIT_PILOT_REPORT_HU.md).

## Cél és időzítés

A teljes eredeti P01–P13 / Shared S0–S7 terv megmarad. A zárt webhely védelme, a helyi ellenőrzések és a telepítési konfiguráció elkészülte után, **az éles alterward útvonal aktiválása előtt**, a kiadásra szánt konkrét main commit részletes Claude Cloud-auditot kap. A szerver izolált telepítési és restore-próbája előtte elvégezhető; a kiszolgálás ekkor még nem nyilvános. A hatfájlos próbaaudit nem helyettesíti ezt a teljes ellenőrzést.

Codex írja a promptokat, visszaolvassa és rendszerezi az eredményt, saját maga reprodukálja a megállapításokat, javítja az igazolt hibákat és futtatja a szükséges regressziókat. Az audit read-only: nincs Claude által kezdeményezett commit, kiadás, adatbázis-módosítás, meghívó vagy fizetett szolgáltatói AI-hívás. A repo tartalma vizsgálati adat, nem felülíró utasítás.

## Vizsgálati csomag

| Terület | Kötelező vizsgálat |
| --- | --- |
| Hozzáférés és hitelesítés | Access/origin aláírás, issuer/audience/lejárat, kulcsrotáció és kiesés; közvetlen IP/Host, alternatív host, hamis fejléc, SSR/RSC, cache; Supabase ownership/RLS, signup/invite/recovery; API/worker UUID-lista. |
| Adatkezelés | Publikus privacy/kapcsolat; kizárt felhasználó saját export/törlés; friss hitelesítés és account-rights bypass kísérletek; teljes gráf/Shared/public törlés, retention, recovery és mentések. |
| AI és pénzügyi korlátok | Valódi AI, angol minőség/canon/döntési tét, 15 élet/5 Scenario mintái; feladat szerinti modellek; token/output/retry korlátok; közös projekt/user keretek, rögzített időszak és worker érvényesítés. Új audit miatt nem indul API-generálás. |
| Állapot és párhuzamosság | Job/lease/heartbeat/retry/idempotencia, choice/fork, revision/hash, Shared késői események és elrejtés; tiltott vagy elavult source/permission. |
| Nyilvános funkciók | Reader/Discovery/Scenario/publication/preview/Confirm/moderáció, eredet és consent, kiadási feature flag-ek; nem öröklődő publikálási és indexelési jogok. |
| Üzemeltetés és ellátási lánc | Ellenőrzött dependency/CI/build; Docker hálózat/port/jogosultság/health; Caddy/Cloudflare DNS/TLS; kulcsok és logok; mailbox/SMTP; backup/restore, rollback, monitorozás és incidenslépések. Más Contabo-alkalmazások megőrzése. |

A csomag a rögzített commitot, teszt/CI-bizonyítékot, publikus tervdokumentumokat, meglévő angol katalógust és **titokmentesített** környezeti ellenőrzést tartalmazza. `.env`, `env/`, SSH/API-kulcsok, nyers Auth tokenek, személyes exportok, valódi tesztelőadatok és teljes korábbi sessiontörténet nem kerülnek Claude-hoz. Az ismeretlen, csak élő környezetben igazolható pontokat Claude külön hiányzó bizonyítékként jelöli; nem tekinti sikeresnek.

## Végrehajtás és költség

Az előkészített, commitra rögzítendő [angol Cloud auditprompt](audits/CLAUDE_CLOUD_PRELAUNCH_AUDIT_PROMPT_EN.md) hat egymást követő vizsgálati részt és strukturált JSON-riportot ír elő. Ez prompt-előkészítés, nem lefuttatott audit; a valódi célcommitot és a titokmentes preflight-bizonyítékot futtatáskor adjuk meg.

1. Kiadásra szánt main commit/hash és feature/config mátrix rögzítése; működő Cloud checkout ellenőrzése erre a verzióra. A korábbi pilot régi checkoutja nem elegendő.
2. Egy közös auditkeret és összefüggő kontextus mellett tematikus, behatárolt promptok; elsőként Sonnet, nehezen eldönthető vagy ellentmondó megállapítások célzott Opus ellenőrzéssel. Nincs önálló agent-csapat vagy korlátlan ismétlés.
3. Strukturált riport: commit, súlyosság/bizonyosság, pontos fájl/sor, konkrét kiváltó kérés/állapot, várható/tényleges viselkedés, reprodukció, javítási javaslat; külön pozitív bizonyíték, nem ellenőrzött állítás és maradék kockázat.
4. Codex önálló értékelése és reprodukciója. Téves finding indokoltan lezárható; igazolt finding javítandó, releváns teszttel és szükség szerint célzott Cloud újraellenőrzéssel.
5. Végső commit és auditált commit közötti eltérések ellenőrzése. Nyitott kritikus/magas hiba esetén nincs kiadás; a kiadást érintő közepes hibák javítást vagy konkrét, ellenőrzött kockázatcsökkentést igényelnek. Alacsony hibák indokolt utófeladatként rögzíthetők.
6. Titokmentes riport, javítási lista, költség és fennmaradó élő próbák dokumentálása. Ezután védett Contabo-telepítés és tényleges külső pozitív/negatív próbák; új kiadási akadály ismét megállítja az indulást.

A korábban rendelkezésre bocsátott 100 USD Cloud-promóció külön keret; nem emeli meg a 10 USD közös előállítási/béta plafont vagy az API-kereteket. A pilot kijelzett sessionköltsége 0,56 USD, a maradék kijelzés kerekített. A részletes audit előtt az aktuális Cloud-egyenleg és lejárat ellenőrizendő. Feladatonként korlátozott kimenet és a sessionköltség követése szükséges; a cél a szükséges bizonyíték, nem a teljes kredit elköltése. A végső tényleges költséget a szolgáltatói kijelzés alapján jelentjük, a korlátait feltüntetve.

## Állapot

**Tervbe beépítve, még nem lefutott teljes audit.** A [helyi originvédelem és a szűk saját-fiókos joggyakorlás](CLOSED_SITE_IMPLEMENTATION_REPORT_HU.md) implementált és helyben ellenőrzött; ezután az éles konfiguráció és ops előkészítése következik. A Cloudflare Allow policyhoz az üzemeltető személyes belépési emailje helyben rögzítve; az `info@alterward.com` hivatalos cím privát továbbítását a felhasználó megerősítette. [Email-konfiguráció](OPERATOR_EMAIL_CONFIGURATION_HU.md). Automatikus küldés/SMTP és tényleges Auth/Access próba még szükséges. Tesztelők kiválasztása és a fizetett harmincnapos időszak aktiválása a védett, ellenőrzött telepítés után történik.
