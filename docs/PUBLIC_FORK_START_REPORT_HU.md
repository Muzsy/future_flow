# Saját privát élet nyilvános döntési pontból

2026-10-07 · P12 részeredmény · English-only

P12 nyilvános, teljesen ellenőrzött döntési pontból külön saját privát élet indítása elkészült. A választás egyszer alkalmazódik, friss saját azonosítók és normál AI-job/kvóta készül; három technikai időszakban megmarad a döntés emlékezete. Az eredeti élet változatlan, Official eredetengedély és élő Shared-tagság nem öröklődik. Visszavonás leállítja az új indításokat; fizikai forrástörlés csak a hivatkozást választja le. Saját élet törlése után a régi kérés nem hozhatja újra létre. Teljes helyi check 560 teszt/49 fájl/build, 143 séma; dev 001–034 és ismétlés, 73 aw_/73 RLS; 50 valódi Auth/HTTP/TLS ellenőrzés és fióktakarítás, új paid AI 0. A 033 33bcd8a verify/container CI sikeres; az új 034 pontos CI és valódi generatív fork-minőség még ellenőrizendő. Scenario személyre szabás, P13, P11 privacy/retention, Shared és üzemeltetési kapuk megmaradnak; Contabo élesítés még nem történt.

## Indítás és döntés

A korábbi külön Community tulajdonosi vagy Official kurátori forkengedély után a látogató hitelesítve, konkrét ellenőrzött ponttal és opcióval, explicit AI-költség-hozzájárulással indíthat. A capabilityHash az aktuális ellenőrzött kiadáshoz és engedélyhez kötött. A szerver ismét megvizsgálja a teljes public/Official olvasói engedélyt és az opció végrehajthatóságát. Unlisted, hiányzó vagy visszavont grant és stale hash nem indíthat.

A sanitized checkpoint friss saját privát input/state/decision ID-kat kap. A választás változásait a szerver újból kiszámolja és egyszer alkalmazza a kezdőállapotra. Az aw_initial_choices saját immutable napló és memória a későbbi normál folytatásban is megmarad. A forrás privát profilja, korábbi prose-ja, auditja, eredeti ID-i, élő Shared-tagsága és még eldöntetlen jövője nem kerül át. A privát élet nem válik Official Life-fá; annak bizonyító eredetengedélyét nem örökli.

Az angol olvasói panel pont/opció kiválasztást és külön megerősítést ad. A saját élet az első kiválasztott döntést és élő, engedett publikus forrását mutatja. A capability és attribution 30 másodpercenként és fókusz/láthatóságváltáskor frissül; hiba elrejti a régi forrásfeliratot. Azonos felhasználó tokenfrissítése megtartja a retry kulcsot; fiókváltás elveti a függő választást és megakadályozza az előző fiók válaszából navigálást. Pozitív interaktív böngészős próba még külön kapu.

## API és tranzakciók

- Auth POST /api/v2/public-forks/:slug: szigorú public-fork-start-1 body, üres query és Idempotency-Key. A célfelhasználót kizárólag a verified Auth adja.
- Auth GET /api/v2/public-forks/lives/:lifeId/source: csak saját minimális attribution, jelenleg engedett public slug/cím/besorolás vagy source=null; no-store/noindex.
- A régi permission és capability API változatlan szerződésű. Normál PUBLIC_FORK_PERMISSION_ENABLED=false és PUBLIC_FORK_STARTS_ENABLED=false. Mindkettő explicit bekapcsolása kell; az indítási gate a 034 engine-nel implementált, a 033 korai tiltás történeti határ volt.

Indításkor a forrás- és célfelhasználó UUID szerint rendezett UPDATE-lockot kap. Utána aktuális copy/permission és teljes reader vizsgálat, saját élet/kezdeti choice/job és idempotencia-receipt egy tranzakcióban készül. Ellentétes irányú egyidejű indítás sem fordítja meg a lock-sorrendet. Három azonos kérés egy életet/jobot ad; eltérő input ugyanazzal a kulccsal 409. Normál napi/párhuzamos kvóta és projekt/user AI-budget érvényes, rollback nem hagy félkész életet.

Attribution előbb a rendezett source/target user SHARE-lockokat, majd a saját start-row SHARE-lockot fogja meg; ez nem ütközik a forrástörlés FK-leválasztásának fordított lock-sorrendjével. A forrás hint nem jogosultság, a teljes reader ismételt ellenőrzése szükséges.

## Visszavonás, törlés és export

A forrás withdraw/hide/remove/deleting vagy Official eredet-visszavonás után új indítás tiltott; a már meglévő saját élet és azonos kérés ingyenes receipt-újraolvasása megmarad. Attribution csak aktuálisan engedett publikus forrást mutat. A forrás fizikai élet- vagy fióktörlése SET NULL-lel leválasztja a hivatkozást, más felhasználó privát canonját nem törli.

A saját teljes élet törlése mindkét új táblát cascade törli. A korábbi v2:public-fork kérés minimális deleted=true tombstone-ja a saját fiókig megmarad; nincs benne törölt élet/ág ID vagy prose. Így késve megérkező régi retry 410, nem hozza létre ismét a törölt privát tartalmat. Új élethez új explicit kulcs és ismét érvényes forrás/kvóta kell. A fióktörlés a tombstone-t is eltávolítja.

034 aw_public_fork_starts és aw_initial_choices: saját composite FK-k, immutable kötés/döntés, source-FK csak nullra leválasztható, RLS és anon/authenticated REVOKE. Saját export csak saját indítási/döntési adatokat és jelenlegi public slugot vagy nullt tartalmaz, idegen owner/private life/branch/publication UUID-t nem. A forrás publikáló exportja nem tartalmazza mások privát indításait.

## Ellenőrzés és korlát

560 teszt/49 fájl, teljes format/types/script-types/API-worker-Next production build; 143 séma, a régi 139 és 001–033 változatlan. Nyolc új teszt covers default-off/strict/current capability; friss privát ID-k és choice egyszer; idempotencia/kvóta; három normál technikai időszak; source withdrawal/physical detachment; Official nem öröklődik; RLS/export/life deletion/tombstone/account cascade; Auth/API izoláció.

50 sikeres valódi kétfiókos Supabase Auth/HTTP/CA-ellenőrzött DB TLS próba: három párhuzamos start egyszer, három technikai időszak saját HTTP choice/continue, source és target ownership, withdrawal, valódi fresh Auth source-life és saját-life törlés, source SET NULL, old retry 410, export/RLS és tényleges Auth+DB fióktakarítás. A teljes genuine seed export és mindkét provider-ledger változatlan. Az első próba 29 ellenőrzés után a tesztprogramban tévesen hívott nem létező own() fixture-helper miatt megállt; a javított külön retry teljesült, az első két Auth+DB-fiók cleanupját külön igazoltuk, credential fájl eltávolítva. Ez nem sikeres első teljes futás és nem application-hiba.

Nyolc új izolált PostgreSQL CI-proof: concurrent exact start, opposite direction lock order, initial choice és három időszak, source deletion detachment, physical delete/start race, quota rollback és tombstone, Official provenance nem öröklődik, immutable/RLS/export/cascade. CI-ben nincs valódi seed/provider-hívás. Az új 034 pontos CI még ellenőrizendő.

A korábbi [033 pontos CI](https://github.com/Muzsy/future_flow/actions/runs/37575063093) 33bcd8a verify/container sikeres: 552/48/139, 001–033 ismétlés, mind a hat consent PG-proof, minden korábbi bizonyíték, HTTPS/DB TLS/tiszta worker-stop és paid AI 0.

Ez technikai funkcióbizonyíték, nem új valódi generatív minőség vagy használói mérés. Következő a genuine checkpointból három valódi AI-időszak és külső Claude audit, Scenario személyre szabás, signup/fork mérés/P13, privacy/retention/backup/restore/email/outage, majd Contabo/Cloudflare kiadási ellenőrzés. Az eredeti P01–P13/S0–S7, 50–100 Official Life/20–30 Scenario cél és külön kumulatív 5–5 USD keret megmarad. Üzemeltető/kontakt és induló kínálat/keret döntése még folyamatban. [Sorrend](NEXT_STEPS.md).
