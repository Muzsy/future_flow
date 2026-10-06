# alterward — teljes tartalom kurátori ellenőrzése

2026-10-06 · [Státusz és keret](STATUS_HU.md) · [Következő lépések](NEXT_STEPS.md) · [Teljes AI-ellenőrzés](PUBLIC_CONTENT_REVIEW_JOB_REPORT_HU.md).

Elkészült a P09 külön kurátori beküldése, privát várólistája, végleges döntése és angol felülete a teljes mentett történethez és az explicit kiválasztott döntési checkpointokhoz. A `public-content-curation-1` nem örökli a korábbi `text-curation-1` jóváhagyását. Kurátori elfogadás után is `publicationApproved=false`; nincs nyilvános olvasás, Publication/Confirm, Official jelzés vagy publikus fork.

## Beküldés és döntés

A tulajdonos csak az aktuális angol, adatvédelmileg érvényes csomagot küldheti be, külön hozzájárulással. Kötelező a saját, lezárt `public-content-review-1` AI-ellenőrzés `no_findings` eredménye. Találatos, bizonytalan, félbeszakadt vagy csak szövegre szóló ellenőrzés nem elegendő. A kérelem a csomag tartalomhash-ét, a teljes AI-attempt azonosítóját, a jelentés hash-ét és a két szabályzatverziót is rögzíti.

Egy csomag/verzió egy beküldést kap; újratöltés és ismételt kérés azonos eredményt használ, AI-hívás nélkül. A kijelölt checkpoint cseréje vagy elhagyása külön immutable csomag, külön AI- és kurátori ellenőrzés. Forrásváltozás, lejárat, törlési marker, hiányzó hozzájárulás, eltérő hash vagy hibás AI-receipt esetén a régi eredmény nem olvasható vissza érvényesként és nem dönthető el.

A bizalmi kurátor a teljes immutable csomagot kapja: történet, összes kiválasztott checkpoint, tények, feltételek, hatások és teljes AI-jelentés. Külön adatvédelmi, tartalmi és próza/tény/döntés következetességi nyilatkozatot kell megadnia. Döntések: `content_reviewed`, `changes_requested`, `rejected`. Az utóbbi kettő biztonságos okkódot kér; az elfogadás okkódja null. Operátori címke és döntési idő megmarad. A végleges döntés nem írható át; az azonos operátori kérelem ingyenesen újraalkalmazható.

## Tárolás, API és operátori eszköz

A 021 migráció additív `aw_public_content_curations` táblát, közös owner/draft/bundle/review idegen kulcsot, immutable döntési triggert és RLS-t hoz. A 001–020 migrációk és a korábbi 70 JSON-séma változatlan. Két új kérelem/nézet JSON-sémával összesen 72 séma van. Saját export része, fizikai fióktörlés cascade törli; deleting állapotban az operátori döntés és várólista-hozzáférés is tiltott.

Tulajdonosi `GET`/`POST /api/v2/public-content-bundles/:id/curation`. HTTP jóváhagyási végpont nincs. A `PUBLIC_CONTENT_CURATION_ENABLED=false` az új beküldések alapértéke; a konfigurációminták és Compose ezt megtartják. A régi text-only működés és az öt AI worker queue változatlan.

Operátori parancs: `pnpm curation:public:content --list`, csak külön `PUBLIC_CONTENT_CURATION_OPERATOR_ENABLED=true` mellett. A teljes várólista a védett, Gitből kizárt `.local/public-content-curation/pending-copies.json` fájlba kerül; terminálon nincs történet vagy kulcs. Explicit döntéshez a védett könyvtárban lévő, zárt decision-schema szerinti fájl és `--request-file <abszolút-privát-fájl> --apply` szükséges. A döntési fájl pontos bundle/draft/source/snapshot/content/review/hash/verzió kötést és a három ellenőrzési nyilatkozatot tartalmazza. Automatikus kurátori jóváhagyás nincs.

## Ellenőrzött bizonyíték

- Helyi teljes check: **414 teszt / 35 fájl**, formázás, típusellenőrzés, API/worker/Next production build. A két végső angol feliratsimítás után web típusellenőrzés/build és formázás újraellenőrizve.
- 12 új célzott teszt: legacy/full scope különválasztás, találatos/bizonytalan AI tiltás, consent/binding/policy, immutable döntés, okkód, owner/anon HTTP és hiányzó approval route, kikapcsolt flag/ingyenes reuse, pontválasztás-változás, lejárat/forrás/törlés/export/RLS.
- Fejlesztői Supabase: **001–021 alkalmazva és ismételve**, verified CA/TLS, 19 `ff_` és 44 `aw_` tábla / 44 RLS; Auth email belépés elérhető.
- Valódi szintetikus Supabase-Auth/HTTP: három párhuzamos beküldés egy sor; másik tulajdonos és anon tiltás; teljes kurátori input; privát végleges döntés és ingyenes reuse; forrás előrelépés utáni tiltás; saját export. Mindkét tényleges Auth-fiók és DB-gráf törölve.
- Valódi angol böngésző: külön curator consent és addig disabled gomb; privát beküldés; operátori döntés megjelenik; pontelhagyással új csomag nem örökli a döntést; régi eredmény ingyen visszatöltődik; dirty-copy mindkét teljes review panelt elrejti; forrás-visszatöltés után csak egy bound curator panel; kilépés és tényleges Auth/DB cleanup. 3200/4200 tesztszolgáltatások leállítva, ideiglenes credential fájl eltávolítva.
- Tényleges operátori CLI: teljes privát várólista, opt-in nélkül tiltás, védett döntési fájl, explicit apply, azonos reapply és `publicationApproved=false` igazolva.

A valódi Auth/böngésző/CLI próbákban a tartalom és AI-jelentés kizárólag ellenőrzött technikai fixture. Ez nem valódi AI-élet kurátori minősítése vagy Official seed. Az előző szelet egyetlen valódi, teljes AI-checker próbahívása és negatív kontrollja a [külön riportban](PUBLIC_CONTENT_REVIEW_JOB_REPORT_HU.md) szerepel; a 11 findingot ez a kurátori fejlesztés nem írja felül.

A [021 exact runtime GitHub CI](https://github.com/Muzsy/future_flow/actions/runs/37451125069) sikeres: `24d002dde0045ef695cd0dc6fa3674f31053f64e`, verify és container. 414 teszt/35 fájl, format/types/API/worker/Next build és 72 séma-drift. Izolált valódi PostgreSQL/TLS: 001–021 és ismétlés; három párhuzamos beküldés egy sor, két ellentmondó végleges döntésből egy nyer, azonos reapply, immutable/private/no-publication/source/deletion/export/cascade/RLS; minden korábbi P09/S0–S3 bizonyíték megmarad. Web/API/Caddy verified HTTPS, üres queue-k, tiszta worker-leállás, paid AI/valódi CI-kulcs 0, egress tiltva. A korábbi [020 CI](https://github.com/Muzsy/future_flow/actions/runs/37447883609) dátumozott bizonyítéka megmarad. Ez izolált kiadási próba, nem éles Contabo-telepítés.

## Költség és következő kapu

Új fizetős AI-hívás ehhez a kurátori részhez **0**. A kumulatív keretek változatlanok: OpenAI 134 kérés, becslés 2,384782605 USD, guard 2,470485875 USD, maradék 2,529514125 USD; Claude 50 attempt / 48 ismert fogyasztás, becslés 1,7691169 USD, guard 2,338015 USD, maradék 2,661985 USD. A két régi ismeretlen Claude-fogyasztás teljes foglalása megmarad; ezek nem szolgáltatói egyenleglekérdezések.

Következő P09: külön immutable kiadási snapshot, Publication/Confirm, láthatóság/visszavonás/törlés/cache, valamint Official eredetengedély és a ScenarioVersion külön teljes tartalmi vizsgálata. Ezután kis valódi AI seed, P10 Discovery, P11 community publishing, P12 public fork, P13 későbbi social réteg. A kombinált P01–P13/S0–S7 terv, S3 raw/backup-retention és régi személyes próza, S4–S7, a célként kitűzött 50–100 élet / 20–30 Scenario, Contabo/Cloudflare/backup/email és külön éles AI-keret megmarad. Éles telepítés ebben a részben nem történt.
