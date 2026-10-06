# alterward — teljes előnézeti tartalomcsomag

2026-10-06 · P09 · [Sorrend](NEXT_STEPS.md) · [Nyilvános terv](PUBLIC_CONTENT_IMPLEMENTATION_PLAN_HU.md).

## Elkészült viselkedés

A mentett angol történetsnapshot és az explicit kiválasztott immutable döntési checkpointok együtt alkotnak egy saját, privát `public-content-1` csomagot. A szerver a teljes tartalomból készít SHA-256 hash-t: szöveg, szám, null/false, célállapot, referencia, korlát, előfeltétel és hatás egyaránt része. Pont hozzáadása, elhagyása vagy másik változat kiválasztása új csomag; a korábbi változat megmarad. Egy döntéshez legfeljebb egy változat választható, a pontok sorrendje a történet sorrendje.

Az üres pontlista explicit, olvasható történet-előkészítés; nincs belőle továbbindítás. Saját `GET/POST /api/v2/public-previews/:id/content-bundles`, kötelező áttekintési nyilatkozat és idempotenciakulcs, új kulccsal azonos tartalom ingyenes újrahasználata. `PUBLIC_CONTENT_BUNDLES_ENABLED=false` az alap és a deploy-minta; meglévő csomagok olvasása/újrahasználata kikapcsolt új mentésnél is ingyenes. Legfeljebb 100 csomag/előnézet, 12 pont/csomag és 256000 UTF-8 bájt, túllépésnél tiltás, nincs csendes rövidítés.

Az angol felületen külön választható a történettel együtt rögzítendő mentett döntési változat. A teljes történet és kiválasztott döntési tények áttekinthetők, a rögzített csomagok külön visszatölthetők. A pusztán megtekintett checkpointváltozat nem válik automatikusan kiadási választássá. A böngésző újraszámolja a csomag/checkpoint hash-eket és ellenőrzi a másolat/revision/opció/pontkötést megjelenítés előtt. A történetszöveg módosítása vagy lejárata elrejti a csomagpanelt; az el nem mentett pontlista nem kerül helyi tárolóba.

## Teljes ellenőrzés alapja és határa

Új, zárt `public-content-review-1` input/report szerződés készült. Az input a teljes típusos tartalmat egyszer tartalmazza, minden skalárhoz külön mezőkulcs és útvonal tartozik, a null/false/0 értékekhez is. A legfeljebb 6000 mezőt tartalmazó bemenetből kimarad a snapshot UUID, tulajdonos/ág/csomag/mentett checkpoint belső ID-ja és a nyers privát profil/canon/Shared memória. Csak szimbolikus referenciák és a már előkészített, általánosított tartalom kerülhet később AI elé.

Az új report scope-ja `story_and_selected_checkpoints`; kizárólag az adott tartalomhash/policy érvényes mezőkulcsaira hivatkozhat. A régi szövegreview, régi text-curation és egy másik teljes csomag eredménye nem használható hozzá. A gépi preflight nem jelent anonimitási garanciát, a teljes AI-vizsgálat és emberi kurátori döntés továbbra szükséges.

**Még nincs új teljes-scope AI-job/worker/providerhívás vagy kurátori munkafolyamat.** Ezek következnek, külön tartós attempt/queue, közös költségfoglalás, kvóta és automatikus fizetett retry tiltásával. Az itt létrejött csomag és a report is `publicationApproved=false`; nem publikáció, Official badge, forrásengedély vagy nyilvános fork. A ScenarioVersion teljes sablonjának saját kiadási vizsgálata és eredetengedélye külön kapu marad.

## Tárolás és adatvédelem

A 019-es additív migráció két immutable, RLS-védett táblát hoz létre: `aw_public_content_bundles` és `aw_public_content_bundle_checkpoints`. Tulajdonos/előnézet/pont összetett FK, egy pont/döntés, sorrendi egyediség, kliens `anon/authenticated` hozzáférés tiltva. Fiókexport mindkét táblát tartalmazza, a tényleges fióktörlés mindkettőt cascade-dal eltávolítja.

Minden mentés/ingyenes olvasás/replay előtt ellenőrzött tulajdonos és aktív fiók, privacy consent, zárolt saját ág, aktuális forrásrevision, snapshot/checkpoint hash, lejárat, English és Shared-fail-closed kapu. Másik fiók vagy másolat checkpointja nem választható. A forrás későbbi választása a korábbi csomag újraolvasását és idempotens újrahasználatát is tiltja.

## Ellenőrzési bizonyíték

Helyi teljes ellenőrzés: 390 sikeres teszt/33 fájl; formázás, típusellenőrzés és API/worker/Next production build. Hat új JSON-séma, összesen 68; a korábbi 62 és a 001–018 migráció változatlan. A fejlesztői Supabase 001–019 alkalmazása és ismétlése sikeres, verified TLS, 19 ff_ és 42 aw_/42 RLS.

Az új csomaghoz az izolált PostgreSQL CI-próba párhuzamos három mentés → egy csomag, immutable/free-reuse, source-advance/deleting marker, export/cascade/RLS és publication=false ellenőrzést tartalmaz. A runtime `8868a34` [verify és container CI](https://github.com/Muzsy/future_flow/actions/runs/37412306422) sikeres, 390/33/68 és 001–019 + ismétlés mellett; a fenti csomagpróbák és minden korábbi P09/S0–S3 proof ténylegesen lefutottak. A korábbi [02b6838 CI](https://github.com/Muzsy/future_flow/actions/runs/37410712015) verify **és** container sikeres: 375/32/62, 001–018 + ismétlés, ScenarioVersion/checkpoint párhuzamosság és korábbi P09/S0–S3 proof, verified HTTPS/DB TLS, üres négy queue, tiszta worker-leállás, provider-AI 0. A korábbi indítás előtti cancelled runokhoz ez adta meg a hiányzó 017/018 bizonyítékot.

Valódi kétfiókos Supabase Auth/HTTP: párhuzamos három csomagmentés egy rekord, story-only új hash, ownership/anon/hash/source-advance tiltás, export és tényleges Auth/DB cascade-törlés sikeres. Valódi böngésző: explicit mentett pontválasztás/teljes részletek, azonos reuse, pontcsere és pontelhagyás három immutable csomaghoz, régi változat/reload, dirty-copy mindkét panel elrejtése, forrás-visszatöltés és kilépés sikeres. A teszt során talált azonos React sibling-key javítva, az érintett böngészős próba megismételve; végleges format/Next production build is sikeres. Export 3 csomag/2 kiválasztási sor, tényleges Auth/DB cleanup, ideiglenes credential fájl eltávolítva, 3200/4200 leállítva. A forrás kizárólag technikai fixture, nem Official vagy valódi AI seed; új providerhívás 0. Az új csomaghoz fizetett AI-hívás nincs; a két kumulatív 5 USD keret nem nullázódik.

## Következő sorrend

Új teljes-scope AI scan-job/worker és külön kurátori döntés ugyanahhoz az immutable csomaghashhez, finding-javítás → új csomag → új review, majd Publication/Confirm/Official eredetengedély és kis valódi AI seed. Ezután P10 Discovery, P11–P13 közösségi/fork/indulási kapuk. A kombinált P01–P13 és S0–S7, S3 retention/korábbi személyes próza, S4–S7, 50–100 élet/20–30 scenario cél és Contabo/Cloudflare/backup/email kapuk megmaradnak. A domain aktív, ez a munka nem éles szervertelepítés.

## Main CI lezárás — 2026-10-06

[Main CI](https://github.com/Muzsy/future_flow/actions/runs/37412306422), runtime `8868a34cc079fccbc1df42dc767e4c65cd4666dd`: verify és container sikeres. 390 teszt/33 fájl, format/types/API/worker/Next production build és 68 séma-drift. Izolált valódi PostgreSQL/TLS: 001–019 és ismétlés, három párhuzamos csomagmentés egy rekord, immutable/free reuse/source-advance/törlési marker/export/cascade/RLS; minden korábbi P09/S0–S3 proof megmarad. Web/API/Caddy verified HTTPS, üres négy queue és worker tiszta leállás, nulla paid AI/valódi CI-kulcs, hálózati egress tiltva. A 019 runtime-kapu lezárult; teljes-scope AI-job/worker/curator és kiadás továbbra következik. Ez nem éles Contabo-telepítés.
