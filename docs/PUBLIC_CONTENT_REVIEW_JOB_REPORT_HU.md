# alterward — teljes tartalom AI-vizsgálata

2026-10-06 · P09 folytatás a [teljes tartalomcsomag](PUBLIC_CONTENT_BUNDLE_REPORT_HU.md) után. A kombinált [P01–P13 és S0–S7 terv](NEXT_STEPS.md) megmarad; a kiadás következő lépése a külön teljes-scope kurátori döntés.

## Elkészült működés

A mentett történet és a tulajdonos által explicit kiválasztott döntési checkpointok együtt vizsgálhatók. A `public_content_review` feladat az új `public-content-review-1` policyhoz, a teljes `contentHash`-hez, a snapshot hash-éhez és a forrás revisionjéhez kötött. A teljes típusos tartalmat egyszer kapja meg a modell; a `field-N` térkép minden skalárhoz tartalmaz útvonalat, beleértve a számokat, `null` és `false` értékeket. A feltételek, hatások, cél/progress, állapot, szereplő/tulajdon/lehetőség-hivatkozások és környezet is a vizsgálat része.

A régi `public_review` és text-only curator rekordok változatlanok. Sem azok eredménye, sem egy másik csomag vizsgálata nem teljes-scope jóváhagyás. A modell csak fieldKey/category/action jelzéseket adhat; az új scope/policy/hash és `publicationApproved=false` metaadatot a szerver adja hozzá. Az alkalmazás ellenőrzi a mezőket, a report/receipt hash-eket és a verdict–finding összhangot; ugyanaz a field/category nem ismétlődhet más actionnel sem. Az `unable_to_assess` blokkoló eredmény.

## Tartós, egyszeri futtatás

Az additív `020_public_content_review_jobs.sql` az `aw_public_content_reviews` táblát vezeti be. A vizsgálati attempt egyben queue rekord: egy sor lehet egy bundle/policyhoz. Identitása és forráskötése immutable; lezárt sor nem módosítható, és running/failed/cancelled nem kerülhet vissza queued állapotba. Új tulajdonosi API:

- `GET /api/v2/public-content-bundles/:id/review-job`: saját, aktuális csomag állapota és ellenőrzött eredménye.
- `POST /api/v2/public-content-bundles/:id/review-job`: pontos contentHash/policy, explicit `acknowledged=true` és idempotenciakulcs szükséges.

Nincs kliensoldali report- vagy jóváhagyásbeküldés. Alapértelmezett `PUBLIC_CONTENT_REVIEW_JOBS_ENABLED=false`; a pozitív projekt- és user AI-keret is feltétel. Az API factory 11. paramétere külön full-review konfiguráció; a korábbi pozíciók változatlanok.

A worker fair queue-ja öt sort kezel: saját V2, Shared, legacy V1, text-only review és full content review. A lease/heartbeat aktuális tulajdonost és tokent igényel; lejárt futás fail-closed, fizetős reclaim vagy automatikus SDK/provider retry nélkül. Újratöltés/azonos vagy új request key az existing attemptet használja újra, kikapcsolt flag mellett is. Hibás próbát azonos csomag mentése sem indít újra; valóban módosított, új hash-ű másolat szükséges.

Owner → source branch → attempt lock-sorrend védi a választás, törlés és párhuzamos kérés versenyeit. Az aktív fiók, privacy consent, ownership, angol tartalom, aktuális source, expiry, Shared eligibility, csomag és checkpoint integrity minden olvasás/claim/input/completion előtt szükséges. A forrás közben módosulhat; ilyen AI-eredmény nem kerül elfogadásra. Fióktörléskor a pending attempt cancelled, a receipt/report az export része, a fizikai törlés cascade. RLS aktív, anon/authenticated közvetlen hozzáférés nincs.

## Angol felület és költség

A complete preparation panel a megtekintett mentett csomaghoz külön angol vizsgálati panelt jelenít meg. Külön checkbox szükséges az AI-szolgáltatónak küldéshez; más csomag kiválasztása új panelt és hozzájárulást jelent. Queued/running állapot lekérdezhető; finding az érintett történeti vagy checkpointmezőhöz rendelhető. Dirty/expired előnézet, account/source hiba vagy félreillő válasz esetén a régi eredmény nem marad használható. Kliensoldali hash- és teljes field-map ellenőrzés is van. Status reload nem indít AI-hívást.

A meglévő checker modell és projekt/user tranzakciós költségőr használatos, legfeljebb 2200 output tokennel. A text-only és full review közös napi limitet és egy pending review/user korlátot használ. A teljes scan-input felső korlátja 70 000 UTF-8 byte, a request szigorú közös tokenköltség-foglalásán felül. Túl nagy csomagból sem szöveg, sem kiválasztott checkpoint nem maradhat ki csendben. Ismeretlen használatnál a teljes foglalás megmarad. Az API `store=false` strukturált válaszát és a refusal/incomplete hibákat a [hivatalos OpenAI dokumentáció](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses) alapján kezeljük.

## Bizonyíték

- Helyi teljes check: **402 teszt / 34 fájl**, format, típusellenőrzés, API/worker és Next production build sikeres. **70 JSON-séma**: két új review-job séma; a korábbi 68 és SQL 001–019 változatlan.
- Fejlesztői Supabase: SQL **001–020 alkalmazva és ismételve**, verified CA TLS; **19 ff_ és 43 aw_ / 43 RLS**. Auth email elérhető. A normál feature flag-ek default-off maradnak.
- Két valódi szintetikus Auth-fiókkal HTTP enqueue-verseny, owner/anon határ, teljes input/report/receipt, ingyenes reuse, source-change, export és tényleges Auth/DB cleanup sikeres, paid AI 0. Védett bizonyíték: `.local/full-content-review-auth/proof.json`.
- Új `smoke:public:content-review`: a már generált háromidőszakos angol élet újrafelhasználása, explicit második/harmadik checkpoint kiválasztásával. Az első checkpoint progress note-ja eredeti címkét tartalmazott és az ingyenes privacy preflight blokkolta; azt nem állítjuk késznek. A teljes háromfejezetes történet és mindkét kiválasztott checkpoint a modellhez került, 345 field útvonallal. Checkpoint-környezetbe helyezett szintetikus embedded-instruction negatív kontrollt a checker észlelte; **review_required, 11 finding** (5 private_financial, 1 embedded_instructions, 3 language, 2 meaning_mismatch). Ez nincs publikálva és nem Official seed.
- A valódi próbában **1 paid hívás**, 12 849 input / 449 output token, becslés **0,036611 USD**, guard **0,0366125 USD**. Az eredmény újrafuttatás helyett 0 hívással visszaolvasható. OpenAI kumulatív: **134 hívás, 2,384782605 USD becslés, 2,470485875 USD guard, 2,529514125 USD maradék**, új ismeretlen usage 0. Claude változatlan: 50 attempt, 1,7691169 USD becslés, 2,338015 USD guard, 2,661985 USD maradék.

Valódi szintetikus Auth-fiókkal az angol böngészős consent/gombvédelem, checkpoint finding, állapot-reuse, másik csomag külön hozzájárulása/eredménye, dirty másolat elrejtése és source reload utáni ellenőrzött visszaállítás sikeres. Egyetlen izolált fixture-review történt, paid AI 0; exportban 2 bundle/1 selection/1 review, tényleges Auth/DB cleanup és ephemeral credential törlés igazolt. Screenshot és védett proof: `.local/full-content-review-browser/`. A teszt 3200/4200 folyamatai leálltak, a felhasználó böngészőlapja változatlan. Az [e1067dd verify/container CI](https://github.com/Muzsy/future_flow/actions/runs/37447883609) sikeres: 402 teszt/34 fájl, teljes build és 70 séma-drift; 001–020 és ismétlés, valódi izolált PostgreSQL konkurens full review enqueue/claim, egyszeri attempt/no retry, receipt/source/deletion/export/cascade/RLS, minden korábbi P09/S0–S3 proof, verified TLS/HTTPS és tiszta worker-leállás; CI paid AI 0, valódi credential 0, egress tiltva. A korábbi [8868a34 CI](https://github.com/Muzsy/future_flow/actions/runs/37412306422) sikeres 001–019-ig; önmagában nem bizonyítja az új 020 szeletet.

## Következő kapuk

Külön, tartós **full-scope curator** submission/queue/decision és teljes csomag újraolvasása, pontos bundle/policy/contentHash/review kötés, majd Publication/Confirm, eredet/Official source grant és kis valódi AI seed. A ScenarioVersion sablon önálló vizsgálatot és eredetengedélyt igényel. Public olvasás/Discovery, likes/follow/report, public fork permission/remap, starter cache/regenerálás csak a kapcsolódó P10–P13 kapuk után. A végcél 50–100 AI-élet és 20–30 scenario; az első próba kisebb.

S3 nyers/backup-retention, korábbi személyes próza, billing/grace/deadline, S4–S7, backup/restore/email/outage és Contabo/Cloudflare telepítési kapuk változatlanul nyitottak. Új éles telepítés, DNS/TLS aktiválás nem történt.

## Kurátori folytatás — 2026-10-06

A [külön teljes-scope kurátori beküldés/döntés és angol panel](PUBLIC_CONTENT_CURATION_REPORT_HU.md) is elkészült, 021 additív migrációval, exact review/report/content/source kötésével. A fent következőként jelölt curator teljesült; Publication/Confirm és Official eredetengedély marad a következő kapu. Új paid AI 0.
