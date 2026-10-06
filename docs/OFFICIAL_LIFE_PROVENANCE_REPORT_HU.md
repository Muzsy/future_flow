# alterward — külön Official LIFE eredetigazolás

2026-10-06 · P09 helyi implementáció. A [ScenarioVersion teljes vizsgálatát és sablonengedélyét](SCENARIO_RELEASE_REVIEW_REPORT_HU.md) a konkrét élet előzetes forráskötése és külön, visszavonható eredetengedélye követi. A meglévő [Community Publication/Confirm](PUBLICATION_CONFIRM_REPORT_HU.md) változatlan. Az új eredetengedély még **nem publikálás**; Official kiadási projekció/előnézet/Confirm, valódi angol seed és Discovery továbbra következik.

## Mi készült el?

- Új `official-life-source-1` szerződés, hét külön JSON-séma. A korábbi 89 séma és 001–023 migráció változatlan.
- Trusted operator által előre indított saját, angol, alternatív élet. Az aktuális, teljesen review/curator által ellenőrzött ScenarioVersion aktív, provider-elszámolással igazolt sablonengedélye szükséges. Egy tranzakcióban rögzül a sablon/grant, a friss root élet/ág, a kezdőbemenet hash-e és a normál AI-job. Régi privát indítást, saját profilból készült életet vagy forkot nem minősít át.
- Idempotens indítás, a meglévő személyes generálási kvóta és AI-job/worker használatával. A start önmagában nem hív providert; a normál worker a jóváhagyott saját/projekt allowance alapján generálhat.
- A worker megőrzi az elfogadott esemény-, fejezet- és fidelity-bemenet hash-eit, a teljes job-bemenet hash-ét és a receipt-ek sorrendjét. Javításnál a ténylegesen elfogadott javított bemenet szerepel; elutasított hívás receipt-je és költsége is szükséges. Nyers promptot nem másol az új bizonyítékba.
- Minden kiadni kívánt időszakhoz pontos normál completed job, motorral ismét validált canon, fejezet/event/decision kötés, pozitív token/request azonosítós receipt és egy-egy lezárt, egyező feladat/modell/token költségfoglalás kell. Hiányzó, nulla, ismeretlen, eltérő vagy többlet elszámolás blokkol. A végső fidelity csak `valid=true`, üres issues eredmény lehet.
- A teljes lánc állapota, revisionje és elfogadott választásai is ellenőrződnek. A köztes opciót ismét végrehajtjuk a domainmotorral, összevetjük a tárolt opcióval és következő kezdőállapottal; múltbeli canon nem módosul.
- A teljes publikus tartalomcsomag aktuális, nem lejárt előkészítése, saját teljes-scope no_findings AI-review-ja, tényleges provider-elszámolása és külön `content_reviewed` kurátori döntése szükséges. A grant pontos bundle/content/review/curation/sourceRevision és evidence-hash kötésű. A szerkesztő külön ellenőrzi a fikciós eredetet, jogokat és minőséget.
- Immutable engedély és csak végleges visszavonás. Replay nem aktivál visszavont rekordot. Visszavonás régi forrásrevision vagy lejárt előkészítés mellett is elvégezhető. Fióktörlési marker visszavonja az aktív engedélyt; recovery nem állítja vissza. Export, source/account cascade és RLS/client revoke integrált.
- Külön védett CLI: `pnpm release:official-life`; `OFFICIAL_LIFE_OPERATOR_ENABLED=false` az alap. Nincs ügyféloldali grant/start/paid HTTP-route vagy Official badge. A normál környezet és éles allowance nem lett bekapcsolva.

Az eredetbizonyíték megbízható szerveroldali worker-, canon- és elszámolási rekordokból készül. Nem provideri digitális aláírás, és nem fogad el kliens által állított receipt-et. A nyilvános DTO későbbi külön feladat: a privát UUID-k, grantok, receipt-ek, költségadatok és teljes bemenet nem tehetők bele.

## Adatmodell és operatori folyamat

`024_official_life_sources.sql`: `aw_official_life_starts` immutable előzetes forrás/kezdeti job; `aw_official_life_sources` immutable teljes eredetbizonyíték és végleges revocation. Mindkettő privát, RLS aktív, anon/authenticated közvetlen hozzáférés tiltva. A migráció additív; korábbi alkalmazott fájl nem módosult.

1. A ScenarioVersion teljes AI-review, külön kurátor és explicit Official SCENARIO source grant után a szerkesztő védett request-fájllal indít egy új életet.
2. A normál életmotor és valódi AI-worker időszakot készít; választás/folytatás változatlan személyes folyamat. A generálás a közös keretőrön halad át.
3. A tulajdonosi privacy/content copy, explicit checkpointlista, teljes-scope AI-review és kurátor után ingyenes `--preflight owner bundle` készíti az exact bizonyítékot és a megtekinthető teljes másolatot.
4. Külön `--grant owner --request-file protected-file --apply` kötött eredetengedélyt rögzít. `--revoke` csak lezárja azt. A request/report fájlok az ACL-védett `.local/official-life` mappában maradnak; kulcs, token és nyers történet nem kerül a CLI terminálkimenetébe.
5. Ezután a még fejlesztendő Official kiadási projekció/preview/Confirm engedhet nyilvános olvasást. A source grantból nem következik public fork, keresőindexelés, Discovery vagy többfél-Shared consent.

CLI-alakok:

```text
pnpm release:official-life --preflight OWNER_UUID BUNDLE_UUID
pnpm release:official-life --start OWNER_UUID --request-file .local/official-life/start-request.json --apply
pnpm release:official-life --grant OWNER_UUID --request-file .local/official-life/grant-request.json --apply
pnpm release:official-life --revoke OWNER_UUID --request-file .local/official-life/revoke-request.json --apply
```

A start request fájl `{request, idempotencyKey}` boríték, a belső request a `startRequest.schema.json` szerződését követi. A grant/revoke közvetlenül a saját külön szerződését követi. Az operatori környezeti opt-in nem biztosít AI-költségkeretet.

## Ellenőrzés és költség

Helyi `pnpm check`: **453 teszt / 38 fájl**, formázás, típusellenőrzés és API/worker/Next production build sikeres. 96 exportált séma; a korábbi 89 változatlan. Az új 12 regresszió az előzetes start, technikai/nulla-token deny, exact grant/replay, javított generálás, teljes kurátor, source/hash/accounting eltérés, többidőszakos lánc és fork deny, ownership, lejárat/revoke, törlés/recovery/export/cascade/RLS eseteit fedi le.

Fejlesztői Supabase: **001–024 alkalmazva és ismételve**, verified CA/TLS; 19 ff_ és **52 aw_ / 52 RLS**. Auth és az admin kulcs konfigurációja elérhető. Ez a fejlesztői migráció ellenőrzése; nem új valódi provider seed vagy új teljes Auth/story próba.

Új izolált PostgreSQL-konténeres próba került a CI-be: párhuzamos előzetes start és exact grant egyszer, két időszak és javított fejezet teljes bizonyítéka, cross-owner és technikai receipt deny, versengő terminal revocation, deletion/recovery/export/cascade/RLS; a korábbi összes P09/S0–S3 konténeres próba megmarad. **Az új runtime main CI eredménye még ellenőrizendő.** Helyben Docker nincs telepítve.

A determinisztikus pozitív integration fixture-ekben a trusted worker/provider receipt-et és DB-tokenelszámolást explicit szimuláljuk az izolált tesztben. Ezek kizárólag tranzakciós, binding- és jogosultsági ellenőrzések; nem valódi AI, szerkesztői jóváhagyás vagy nyilvános Official seed. A nulla/null receipt-eket az új kapu elutasítja.

Új fizetett provider-hívás: **0**. OpenAI: 136 korábbi hívás, 2,394107105 USD becslés, 2,479813375 USD guard, maradt **2,520186625 USD**; ismeretlen usage 0. Claude: 50 korábbi kísérlet/48 ismert usage, 1,7691169 USD becslés, 2,338015 USD guard, maradt **2,661985 USD**; két régi ismeretlen teljes foglalás megmaradt. A naplók nem nullázódtak.

## Következő feladat

Külön Official kiadási szerződés/projekció/preview/Confirm és olvasói lifecycle, a korábbi `publication-1` Community sémák megőrzésével. Ezután kis **valódi**, angol többidőszakos AI seed, külön Claude-auditor és szerkesztői minősítés, majd P10 Discovery/Save/Share és P11–P13. A 50–100 Official Life / 20–30 Scenario cél nem most elkészült vagy automatikusan költhető állomány.

A teljes kombinált P01–P13/S0–S7 terv megmarad. S3 nyers/backup-retention és régi személyes próza, billing/grace/deadline, S4–S7; P06 email/backup/restore/valós kiesés, későbbi Contabo/Cloudflare élesítés továbbra külön kapu. Domain/DNS/TLS/deploy módosítás nem történt. [Következő lépések](NEXT_STEPS.md) · [Állapot és keret](STATUS_HU.md).
