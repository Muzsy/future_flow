# P09 — Angol döntési állapot előnézete és leírásszerkesztője

2026-10-06 · [Sorrend](NEXT_STEPS.md) · [Checkpoint foundation](PUBLIC_FORK_CHECKPOINT_REPORT_HU.md) · [Állapot](STATUS_HU.md).

## Elkészült

A saját `/preview/:branchId` Privacy/Content Preview új angol „Decision starting points” része megjeleníti az érvényes copy döntési checkpointjelöltjeit és mentett előkészítéseit. Döntésenként választható az általánosított jelölt vagy egy korábbi immutable mentés. Ez a választás csak a saját szerkesztőben megtekintett változat; még nem kiadásra kiválasztott checkpointlista vagy publikációs megerősítés.

A nézet megmutatja a választás előtti dátumot, identitást, környezetet, munkát/helyet/pénzt/erőforrásokat, készségeket, tulajdonokat/szereplőket/lehetőségeket, az összes cél állapotát/horizontját/motivációját/tradeoffját, a korlátok feltételét/scope-ját/időhatárát és minden opció előfeltételét/azonnali tényhatását. A tények és hatások rögzítettek; olvasás nem alkalmaz választást és nem indít AI-t. Azonos általánosított címkéjű objektumokat sorszám különböztet meg, a hivatkozott tulajdon így felismerhető. Eredeti belső UUID-t nem mutat a termékfelület.

Explicit szerkeszthető leírásmezők: fiktív identitáscímke, környezet, célleírás/motiváció/progress note, munkahely/hely/lakhatás címkéje, asset/actor/opportunity leírása, korlát szövege és a megfelelő opcióhatások általánosítható prose-mezői. Üres opcionális leírás nullra szűkül. A megjelenített kérdés/opciószöveg a pontos mentett story copyból jön; ezek javítása a copy szerkesztésén és új preview mentésén keresztül történik. Szám, dátum, ország, készség, munkaág, tradeoff, helyettesítő referencia, scope, feltétel vagy hatás nem módosítható a leírásszerkesztővel.

Privát mentés explicit tulajdonosi privacy-áttekintést és idempotenciakulcsot kér. Hibás hossz esetén a mező jelölt; a backend továbbra a teljes source binding és preflight szerint dönt. Új szöveg új immutable előkészítés, azonos újramentés ugyanazt a rekordot adja. Betöltés/visszatöltés ingyenes; nincs helyi tartalom- vagy credential-cache. A textarea címkéje külön hozzáférhető névre kötött.

Minden kliensoldali candidate/mentett DTO zárt sémával és a pontos copyhoz kötve ellenőrzött: draft ID, source revision, snapshot hash, döntéskulcs, kérdés, opciókulcs/sorrend/címke/leírás. Hiányos/ismétlődő/idegen rekord nem jelenhet meg. A szövegsnapshot szerkesztése vagy lejárata elrejti és leválasztja a checkpointnézetet; új érvényes mentéshez új betöltés szükséges. Aborted kérés nem töltheti vissza a leválasztott nézetet.

Az előkészítés privát, `publicationApproved=false` és `readyForPublicFork=false`. A korábbi AI-blokk most „Copy text AI review”, hogy a szövegellenőrzést ne lehessen a strukturált checkpoint jóváhagyásának tekinteni. A teljes csomaghash, kiadásra kiválasztott pontlista, teljes-scope AI/curator és Publication/Confirm még külön következő feladat. A Shared és English kapu, a normal/deploy default-off flag és a nulla production allowance változatlan.

## Bizonyíték és határ

Teljes helyi ellenőrzés sikeres: **375 teszt/32 fájl**, formázás/típusok és API/worker/Next production build. A hozzáférhető textarea-címkézés véglegesítése után a formázás és a Next build ismét sikeres. Három új regresszió ténylegesen a tárolt checkpointot használja: idegen/elavult/szövegében eltérő kliensválasz elutasítása; UI-ból engedett leírásmódosítás szerveroldali forrásellenőrzése és tiltott numerikus/kulcs/opció/prototype módosítás; nulla/negatív/ismeretlen számérték és egyértelmű referenciák megjelenítése választás alkalmazása nélkül. **62 schema**, 001–018 és a korábbi JSON-sémák változatlanok.

Izolált böngészős, valódi Supabase Auth/verified TLS DB-próba sikeres: általánosított munkahelyleírás két külön mentése, első verzió változatlan visszaolvasása, reload utáni második változat, ingyenes azonos újramentés után is két rekord, dirty story copy mellett a checkpointnézet elrejtése és source reload utáni visszaállítása. Exportban mindkét előkészítés szerepelt. A szintetikus Auth/DB-fiók ténylegesen törölve, ideiglenes credential fájl eltávolítva, 3200/4200 tesztport leállítva. Technikai fixture, nem új generatív minőségmérés vagy Official történet.

A GitHub runtime ellenőrzésnek külön meg kell erősítenie a Linux/container/valódi PostgreSQL concurrency próbát. A korábbi `5743d93` verify job sikeres, container jobja indítás előtt cancelled; a checkpoint `5d29fcf` run mindkét jobja indítás előtt cancelled, lépések/log nélkül. Ez nem sikeres CI vagy ismert kódhiba-bizonyíték. [Checkpoint run](https://github.com/Muzsy/future_flow/actions/runs/37365890842); [ScenarioVersion run](https://github.com/Muzsy/future_flow/actions/runs/37364108682). Utolsó teljes verify/container bizonyíték a korábbi `4d66981`/001–016 szelet, nem az új 017/018 bizonyítéka.

Új fizetett AI-hívás: **0**. OpenAI guard 2.433873375 USD/maradék 2.566126625 USD, Claude guard 2.338015 USD/maradék 2.661985 USD. A két külön 5 USD napló megmaradt. Contabo-deploy, DNS/TLS-aktiválás vagy production allowance változás nincs.

## Következő

Külön immutable teljes előnézeti csomag és szerveroldali közös tartalomhash: szövegsnapshot + explicit kiválasztott checkpointpéldányok. Utána új teljes-scope AI-input/report/queue és curator, majd Publication/Confirm/Official eredetengedély és kis valódi AI seed. P10–P13, a korábbi terv minden 50–100 élet/20–30 scenario célja és S3 retention/S4–S7, valamint backup/restore/email/Contabo kapuk megmaradnak.
