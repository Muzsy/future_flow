# Külön engedély a nyilvános döntésekből induló saját élethez

2026-10-07 · P12 részeredmény · English-only

P12 külön fork-hozzájárulás elkészült: Community tulajdonosi opt-in, Official kurátori engedély és tulajdonosi visszavonás. Az engedély a konkrét ellenőrzött kiadáshoz és revízióhoz kötött; a régi snapshot változatlan, frissítéskor nem öröklődik. Az anonim végpont csak ellenőrzött döntési feliratokat ad, privát azonosítókat nem. A tényleges új privát élet indítása még zárt, ez a következő feladat. Teljes helyi check: 552 teszt/48 fájl/build, 139 séma; dev 001–033 + ismétlés, 71 aw_/71 RLS, 37 valódi Auth/HTTP/CLI/TLS ellenőrzés és fióktakarítás, új paid AI 0. A javított 032 runtime 9a7ecf7 CI verify/container sikeres, hét élet-törlési PG-proof lezárult; az új 033 pontos CI még ellenőrizendő. A teljes P11 privacy/retention, P12 start/personalization/attribution, P13, Shared és üzemeltetési terv megmarad; Contabo élesítés még nem történt.

## A hozzájárulás jelentése

A korábbi Publication/OfficialPublication immutable snapshot forkEnabled=false mezője változatlan. A régi Confirm nem adott engedélyt mások saját életének elindítására. Az új, külön hozzájárulás ezért pontos slug/publicationRevision/snapshotHash/permissionRevision kötést és acknowledged=true megerősítést kér.

Community kiadásnál csak a saját aktív, nyilvános, teljes tartalomvizsgálaton és kurátori ellenőrzésen átesett példány engedélyezhető. Legalább egy kiválasztott, gépileg végrehajtható, teljes körűen reviewzott döntési checkpoint kell. Unlisted történet, pusztán szöveges review és checkpoint nélküli kiadás nem használható. A szerver a teljes olvasói és publikálási korlátozást is ellenőrzi. Official engedélyt csak külön, védett kurátori CLI adhat; az eredeti tulajdonos ezt is visszavonhatja.

Az angol My published copies panel külön hozzájárulást kér, és megmagyarázza az önálló privát életet, a saját forrás privát maradását és a későbbi visszavonás határát. A korábban létrehozott saját példány megmaradhat. A tényleges indítás még nem érhető el, ezt a felület és a capability is jelzi. Pozitív interaktív böngészős próba még külön kapu.

## API, jogosultság és életciklus

- Auth GET/POST /api/v2/public-fork-permission/:slug: csak saját permission view és consent/revoke. Szigorú üres query és request.
- Anonymous GET /api/public/fork-capabilities/:slug: teljes aktuális public permission után cím, besorolás, angol nyelv, új capabilityHash, permissionRevision és ellenőrzött döntés/opciófeliratok. Nincs private élet/ág/user/bundle/grant/review ID, raw snapshot hash, token, prompt vagy rendszerüzenet.
- PUBLIC_FORK_OPERATOR_ENABLED=true mellett pnpm curation:forks -- --list, majd védett .local/public-fork-permission kérésfájl és --apply. A CLI nem ír ki történetet vagy kulcsot, nincs kurátori HTTP-végpont.

Az új indításokhoz használható képesség minden kérésnél frissen ellenőrzött, no-store/noindex. Engedély-visszavonás, feature tiltás, kiadás withdraw/hide/remove, Official eredet-visszavonás, fiók deleting jelölés vagy fizikai forrástörlés azonnal megtagadja a friss olvasást. A régi exact enable retry nem keltheti életre a később visszavont engedélyt. Új snapshot külön consentet igényel; még a régi példány frissítése sem viszi át az engedélyt.

User UPDATE az első írási lock, majd publication SHARE és permission UPDATE. Azonos input/revision párhuzamos retry egyszer növel revisiont és egyszer készít auditot. Eltérő versengő CAS-kérésből egy nyertes, másik 409; idegen tulajdonos 404. Régi/hibás hash nem adhat jogot. Revoke feature-off és már inaktív saját példány esetén is végezhető aktuális kötésből. Account recovery nem állít vissza régi publikációt.

## Tárolás és indítási kapu

033 aw_public_fork_permissions + aw_public_fork_permission_actions: külön Community/Official publication FK, pontos binding/revision, explicit allowed, minimális időpont és immutable audit. RLS és anon/authenticated REVOKE. Saját exportban kizárólag saját kiadás és grant/action adat; actor identity/request hash/belső permission ID nem szerepel. Whole-life és account-delete a forrással együtt cascade törli mindkét új táblát.

PUBLIC_FORK_PERMISSION_ENABLED=false és PUBLIC_FORK_STARTS_ENABLED=false az alapbeállítás és deploy-minta. Ebben a szeletben a starts flag true konfigurációt a szerver elutasítja: consentből önmagában nem állítható, hogy a még nem implementált start engine működik. Operator flag nem kerül a web/API/worker konténerbe. A következő engine-szelet külön engedélyezési kaput, új privát ID-kat, választás egyszeri alkalmazását, normál AI-job/kvótát és attribution leválasztást készít.

## Ellenőrzés

552 sikeres teszt/48 fájl, teljes format/type/script-type/API-worker-Next production build; 139 generált séma, a régi 135 és 001–032 változatlan. Nyolc új regresszió: default-off és korai start tiltás; ownership/unlisted/strict request; minimális projection és privát canon; CAS/revoke/replay; refresh consent-határ; Official kurátori jog és eredet-visszavonás; immutable/RLS/export/élet-törlés; Auth/anonymous/no-store/query és hiányzó start/curator HTTP.

37 sikeres ellenőrzés két tényleges Supabase-fiókkal és CA-ellenőrzött PostgreSQL TLS-sel. Három párhuzamos valódi HTTP consent és revoke egyszer; idegen/anon/hash/query határ; változatlan private/reader; refreshed copy nem örököl; protected Official CLI és owner revoke/source revoke; own/foreign export; friss Auth whole-life/account-delete és tényleges Auth+DB cleanup. Genuine seed teljes exportja és mindkét provider-ledger változatlan. Ezek technikai fixture-ek; nem új valódi Official kínálat, új fizetett AI-hívás nincs.

Az első Auth-próba a tesztprogram kérésfájl-útvonalának átadásakor állt meg. Javított retry külön bizonyítékban teljesült, az első két Auth+DB-fiók takarítását is ellenőriztük és a jelszavas fájlt eltávolítottuk. Ez nem application permission-hiba; nem számítjuk az első futást teljes sikernek.

Az új izolált PostgreSQL CI hat proofot kapott: concurrent exact consent; versengő CAS; reviewed minimal choices/private canon; refresh independent consent; Official curator/owner/source-revoke; fizikai life-delete verseny és privát audit cascade. CI-ben nincs provider-hívás vagy genuine seed. A pontos új 033 futás eredménye még ellenőrizendő.

A 032 9a7ecf7 [CI](https://github.com/Muzsy/future_flow/actions/runs/37573794428) mindkét jobja sikeres. A korábbi ENOBUFS naplóolvasási hiba után a legutóbbi 200 soros ellenőrzés mindkét worker sort igazolja, hét life-delete PG-proof, migráció-repeat, HTTPS/DB TLS és tiszta worker-leállás megmaradt.

## Folytatás

P12 cross-owner private start, választás egyszer, normál AI-job/kvóta, friss forrásellenőrzés/idempotencia/attribution, három időszak, majd Scenario személyre szabás és P13 mérések/minőség/indulás. Teljes P11 privacy/retention, S3 régi személyes próza/nyers backup/billing/grace/deadline, S4–S7 és P06 backup/restore/email/outage/Contabo/Cloudflare scope megmarad. Üzemeltetői név/kontakt és kisebb induló béta vagy teljes 50–100 élet/20–30 szcenárió kínálat külön keretének felhasználói döntése még folyamatban. [Terv](NEXT_STEPS.md).


## 2026-10-07: CI lezárás és következő engine

33bcd8a [CI](https://github.com/Muzsy/future_flow/actions/runs/37575063093) verify/container sikeres: 552/48/139, mind a hat consent PG-proof és 001–033 ismétlés, HTTPS/TLS/worker-stop, paid AI 0. A 033 starts=true korai tiltása ennek a történeti szeletnek a határa volt. Az új [034 privát indítási engine](PUBLIC_FORK_START_REPORT_HU.md) implementált; normál flag-ek továbbra false.
