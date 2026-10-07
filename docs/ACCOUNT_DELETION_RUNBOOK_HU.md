# alterward — fióktörlés helyreállítása


## Aktuális: jóváhagyott éles AI-keret és lejárati védelem

Az első éles 30 napra jóváhagyott keret 10 USD OpenAI + 5 USD Claude, összesen 15 USD; a felhasználói 0,50 USD közös a két szolgáltató között. A tényleges induláskor kezdődik, nincs automatikus megújítás. Külön időszakos provider-projekt és közös saját számla, tranzakciós előfoglalás, lock utáni DB-óra/lejárat, késői egyszeri elszámolás és megmaradó projektköltés kész; Claude transport technikai DB-guard próbája is sikeres. A régi kutatási naplók és 5–5 USD keretek változatlanok; új paid AI 0, éles aktiválás nincs. Teljes helyi check 578 teszt/52 fájl/types/script-types/build és 144 változatlan schema; az új budget runtime CI még ellenőrizendő. A public-fork minőség/login/consent pontos 4cb911c verify/container CI sikeres: 565/51, 001–034/repeat, nyolc fork-start PG-proof, minden korábbi proof, verified HTTPS/DB TLS és 0 AI. Következő Scenario personalization/P13, továbbra P11/Shared/retention/ops, operator/kontakt és induló kínálat; Contabo-deploy még nem történt. [Keret, bizonyíték és határ](AI_PRODUCTION_BUDGET_HU.md).

2026-10-04 · [Dokumentációs központ](README.md) · [Státusz és keret](STATUS_HU.md) · [Következő lépések](NEXT_STEPS.md).

A felhasználó exportja/törlése friss tényleges Supabase-hitelesítést kér. Törléshez a védett .env SUPABASE_SERVICE_ROLE_KEY mezőjébe service_role JWT vagy sb_secret_... admin kulcs szükséges. Értékét ne írjuk chatbe/logba/Gitbe vagy NEXT_PUBLIC mezőbe. Kulcs hiányában a kód még a deleting státusz előtt megáll AUTH_ADMIN_NOT_CONFIGURED hibával.

## Állapotok

1. Aktív fiók → deleting; durable awaiting_auth marker. V1/v2 jobok megszakadnak, lease-token visszavonva. A worker nem commitolhat.
2. Szerveroldali Supabase Auth törlés. Ha hiba után admin getUserById bizonyítja, hogy a fiók megvan, active visszaáll és a v2 generálás manuálisan retryolható. Bizonytalan Auth-állapotban deleting marad, nem találgatunk.
3. Bizonyított Auth-törlés → auth_deleted marker → belső adatgráf cascade törlése. DB-hibánál marker megmarad, nem kell új belépés a helyreállításhoz.

## Üzemeltetői parancs

pnpm privacy:recover csak összesített pending/confirmed számot mutat, nem módosít. Konkrét, már felhasználó által kért törlés helyreállítása: pnpm privacy:recover <user-uuid>. Aktív, törlést nem kért fiókot nem töröl. Awaiting_auth esetén admin kulccsal ellenőrzi az Auth-állapotot és szükség esetén befejezi a kért Auth-törlést; confirmed marker esetén DB-takarítás folytatódik. Parancs kimenete csak biztonságos hibakód.

Ellenőrzendő: marker és ff_users sor eltűnik; saját v1/v2 élet/ág/draft/canon/job/choice/consent/interakció és személyes költségfoglalás cascade törlődik. Projektszintű összesített költség marad személyes tartalom nélkül. Aktív worker nem ír vissza. A 006 előnézeti/szcenáriópiszkozat gráf is cascade törlődik; éles publication/cache gráf még nincs.

Automatizált próba fedi az Auth-siker utáni DB-hibát, biztos Auth-hiba visszaállítását és bizonytalan Auth-hiba blokkolását. 2026-10-04: a szerveroldali kulcs ellenőrizve; a szintetikus HTTP-próbában valódi Auth-törlés és a teljes DB-gráf (feedback/session is) takarítása sikeres. [Béta-riport](BETA_IMPLEMENTATION_REPORT_HU.md). A kontrollált megszakításból valódi admin recovery sikeres (lásd alább); tényleges DB-kiesésből recovery és backup/restore még nincs végrehajtva; a hibaágak automatizált tesztje nem ezek üzemeltetési bizonyítéka.

Backup/restore próba, konkrét megőrzési idők, Supabase-backup hozzáférés és törölt adat visszaállítását kizáró üzemeltetési eljárás nyitott release-feladat. Ez a runbook a végrehajtott adatbázisgráf-törlést kezeli, szolgáltatói backup-törlést nem igazol.

## 2026-10-04: kontrollált megszakításból valódi recovery

Új szintetikus Auth-fiók törlése után, még a DB-confirm/cleanup előtt megállított folyamat `awaiting_auth` markert és `deleting` fiókot hagyott. A tényleges recovery CLI felismerte a már hiányzó Auth-fiókot, majd eltávolította a fiókot és a tesztfeedbacket. [Bizonyíték](BETA_IMPLEMENTATION_REPORT_HU.md). Ez valós integrációkkal kontrollált megszakítás, nem valódi adatbázis-kiesés vagy backup-restore.

## Shared S0 strukturális törlési bővítés és S3 kapuk

S0 kódja már kezeli a Shared gráfot a deleting marker/job-cancel és DB/recovery cleanup útvonalon; 008/009 a fejlesztői Supabase-on alkalmazva; a valódi háromfiókos meghívó/export/Auth- és DB-törlés-próba és takarítás sikeres. [S0 megvalósítás és korlátok](SHARED_CONTEXT_S0_REPORT_HU.md). Törlődő account új shared műveletet/commitot nem indíthat. Meghívói visszavonandók, social profile törlendő, membership user/life/branch személyes referenciái leválasztandók és olvasáskor „Former member” projekciót kapnak; pending személyes impactok detached állapotúak. Más tagok közös canonja nem az account-cascade része.

A struktúra nullázása nem távolítja el a nevet a korábban generált prózából: PII-szűrés/redakció, minimális history-retention és backupból helyreállítás utáni törlésvédelem külön kapu. Saját export csak jogosult saját/shared részvételprojekciót vihet ki, más tag teljes profilját/intentjét nem. Kötelező új próba: A/B/C contextből B törlése, A/C minimális anonim története megmarad, B azonosító/prompt/privát adat eltűnik az elérhető DTO-kból, megszakításból recovery és párhuzamos job sem hozza vissza. A strukturális A/B/C deletion/recovery, a többi tag által kezdeményezett job cancel, a soha nem csatlakozott címzett meghívójának visszavonása és admin-handover regresszió sikeres. A teljes valódi Shared AI/próza/Auth/backup kapu S3, ezt a korábbi valódi személyes account-próba nem bizonyítja.

## S1 függő döntés megszakítása

[S1 megvalósítás és korlátok](SHARED_CONTEXT_S1_REPORT_HU.md). A normál deleting marker és leave/end ugyanazon tranzakcióban cancelled immutable resolutiont készít, pending eventet elengedi, új impactot nem képez. Érintett context-lockok rendezettek; ismétlés nem dupláz. Az account-export saját részvételi canont, saját választást és saját pending/detached impactot is adhat, másik ág/intent/proposal nélkül. Ez nem szabad próza PII-redakció vagy teljes Shared Auth/AI/backup igazolás; S3 kapuk megmaradnak.

## S2 AI-job snapshotok

Completed Shared job inputja commitkor törlődik; deleting marker a failed/cancelled input és raw-output checkpointot is tisztítja, korábbi left tagot is beleértve. Nincs receiptben teljes prompt/profil; hash/token/model meta megmarad. A már elküldött provider-hívás költsége a guardban elszámolandó, a késői canon commit lease/member/user ellenőrzéssel tiltott. A retained canon próza teljes redakciója és valódi Shared Auth/AI recovery S3 gate. [S2 riport](SHARED_CONTEXT_S2_REPORT_HU.md).


## 2026-10-05: közös szövegprojekció és frissebb job védelme

A felhasználó az érintett közös próza elrejtését, dátum és eredmény megtartását választotta. 013 már deleting markerre vetületet ad és scrub/cancel védi a régi Shared/személyes inputot. Privacy miatti explicit retry friss jobot kap; a már megtisztított jobot a fizikai törlés megőrzi. Export/pending/emlék/fork ugyanígy projected. Nyers canon/hash és régi személyes fejezet nem íródik át; nyers/backup-retention és régi személyes próza további kapu. Teljes valódi kétfiókos Auth/Shared/saját AI és kontrollált recovery sikeres; migráció utáni valódi Auth/DB technikai proof nulla provider-hívással. [Bizonyíték](SHARED_CONTEXT_S3_PRIVACY_AUTH_REPORT_HU.md).


## 2026-10-05: felületről indítható privát AI-review

A felületről indítható P09 fizetett AI-review elkészült: explicit hozzájárulás, tartós queue/lease, egy attempt/immutable copy, közös projekt/user költségőr, egy pending job/user és gördülő napi kvóta. Újraolvasás/dupla kérés ingyenes, elveszett lease és provider-hiba nem indít automatikus fizetett retryt. 015 alkalmazva/ismételve a fejlesztői DB-n; English/Shared/tulajdonosi/hash/revision kapu és export/törlés integrált. Main CI sikeres: 324 teszt/28 fájl, 50 séma; a korábbi 48 és 001–014 változatlan. A normál feature false, éles allowance 0; publicationApproved false. Következő curator/ScenarioVersion/sanitized fork-checkpoint/Publication/Confirm/Official seed, majd P10–P13; S3 retention, S4–S7 és Contabo/Cloudflare élesítés megmarad. [Megvalósítás és pontos korlátok](PUBLIC_REVIEW_JOB_REPORT_HU.md).


## 2026-10-05: tulajdonosi beküldés és text-curation

A P09 tulajdonosi beküldés és trusted text-curation nyilvántartás elkészült: explicit consent, aktuális immutable copy és no_findings AI-review, idempotens beküldés, védett operatori lista/döntésfájl, egyszeri változatlan döntés, English/Shared/ownership/revision/hash/expiry/törlés kapu, export/cascade és 016 RLS-migráció. Scope text_only, publicationApproved false. Teljes ScenarioVersion/sanitized fork-checkpoint és azok ellenőrzése, Publication/Confirm/Official eredetengedély/seed még hátravan; majd P10–P13. Main CI `4d66981` sikeres: 336 teszt/29 fájl, formázás, típusellenőrzés, API/worker/Next production build és 52 séma-drift. Izolált valódi PostgreSQL/TLS: 001–016 + ismétlés, párhuzamos curation-submit és versengő döntés → egy nyertes, azonos apply újrahasználata, revision/törlés/RLS/export/cascade és publication=false; minden korábbi P09/S0–S3 proof megmarad. Konténeres web/API/worker/Caddy verified HTTPS/DB TLS, üres queue és tiszta worker-leállás, nulla provider-AI/valódi CI-kulcs, egress tiltva. [Main CI](https://github.com/Muzsy/future_flow/actions/runs/37358126556). 52 séma, a korábbi 50 és 001–015 változatlan; fejlesztői DB 001–016 alkalmazva/ismételve, 19 ff_ és 36 aw_/36 RLS. Új AI-hívás nincs; a közös OpenAI/Claude keretek, S3 retention/S4–S7 és Contabo/Cloudflare kapuk megmaradnak. [Kurátori szövegellenőrzés és pontos korlátok](PUBLIC_TEXT_CURATION_REPORT_HU.md).


## 2026-10-05: teljes ScenarioVersion foundation

A P09 teljes angol ScenarioVersion foundation elkészült: külön zárt scenario-1 sablon, immutable/hash/verziózott saját tárolás, friss belső ID-k és teljes cél/állapot/korlát-hivatkozások, explicit indításból normál AI-job és közös kvóták, export/cascade. 017 alkalmazva/ismételve, 19 ff_ és 39 aw_/39 RLS; 354 helyi teszt/30 fájl és teljes check/build, 57 séma, a korábbi 52 és 001–016 változatlan. Két valódi szintetikus Auth/DB HTTP-fiók: ownership/anon, verzió/replay/start és három technikai időszak, export/tényleges törlés sikeres; új paid AI 0. Normál/deploy SCENARIO_VERSIONS_ENABLED=false, publicationApproved=false, saját előkészítő API, scenario UI/public permission még nincs. Következő sanitized fork-checkpoint, teljes structured preview/review, Publication/Confirm/Official seed, majd P10–P13. A három forrás minden követelménye, 50–100 élet/20–30 scenario cél, külön 5–5 USD keret, S3 retention/S4–S7 és Contabo/Cloudflare kiadási kapuk megmaradnak. [Részletes megvalósítás](SCENARIO_VERSION_REPORT_HU.md).


## 2026-10-05: sanitized döntési checkpoint foundation

A P09 sanitized döntési checkpoint foundation elkészült: külön fork-checkpoint-1, teljes típusos állapot/korlát/előfeltétel/hatás és helyettesítő kulcskatalógus, exact canon/copy/opció binding, minden opció végrehajtható, új ID-s privát kezdőállapot motor. Saját candidate/save/read API, immutable hash/dedupe/default-off és privacy-fail-closed, export/cascade, 018 alkalmazva/ismételve; 19 ff_ és 40 aw_/40 RLS. Teljes helyi check/build: 372 teszt/32 fájl, 62 séma; a korábbi 57 és 001–017 változatlan. Valódi kétfiókos Auth/DB HTTP-próba: három párhuzamos save egy rekord, source-advance tiltás, három technikai időszak, export/tényleges Auth/DB cleanup; új paid AI 0. A régi coarse readyForFork=false változatlan, új record publicationApproved=false/readyForPublicFork=false/full review required. Következő teljes strukturált Privacy/Content Preview UI és új teljes-scope hash/AI/curator, majd Publication/Confirm/Official seed és P10–P13. A külön 5–5 USD keret, a három forrás teljes scope-ja és 50–100 élet/20–30 scenario cél, S3 retention/S4–S7 és Contabo/Cloudflare/backup/email kapuk megmaradnak. [Megvalósítás és pontos korlátok](PUBLIC_FORK_CHECKPOINT_REPORT_HU.md).


## 2026-10-06: döntési előnézet és leírásszerkesztő

Az angol saját döntési előnézet és leírásszerkesztő elkészült: tényleges választás előtti állapot/cél/korlát/előfeltétel/hatás, egyértelmű objektumsorszámok, forráskötés mellett javítható prose, immutable saját mentés/verziómegtekintés és ingyenes visszatöltés. Helyi teljes check: 375 teszt/32 fájl, API/worker/Next build; végleges textarea-címkézés után format/Next build ismét sikeres. 62 schema és 001–018 változatlan. Valódi Auth-böngésző/DB próba: két mentés, régi verzió/reload/azonos reuse/dirty-copy elrejtés, export és tényleges cleanup; új paid AI 0. A megtekintett verzió még nem kiadási pontlista. Következő immutable szöveg+választott checkpoint tartalomcsomag/közös hash, új teljes-scope AI/curator, majd Publication/Confirm/Official seed és P10–P13. A korábbi 5d29fcf CI-jobok indítás előtt cancelled, ezért az új 017/018 konténeres proof még nyitott. A teljes korábbi P/S-terv, 50–100 élet/20–30 scenario cél, külön 5–5 USD keret és Contabo/Cloudflare/backup/email kapuk megmaradnak. [Aktuális bizonyíték](PUBLIC_FORK_PREVIEW_REPORT_HU.md).


## 2026-10-06: teljes előnézeti tartalomcsomag

Elkészült a teljes angol immutable történet+explicit kiválasztott checkpoint tartalomcsomag, közös hash, külön tulajdonosi pontlista és teljes tartalom-visszatöltés. Új public-content-1 és public-content-review-1 zárt input/report, minden típusos skalár bevonva, belső UUID/nyers privát forrás nélkül. 019 additív/immutable/RLS és export/cascade, default PUBLIC_CONTENT_BUNDLES_ENABLED=false; üres pontlista olvasható történet továbbindítás nélkül. Helyi check 390 teszt/33 fájl, 68 séma, a korábbi 62 és 001–018 változatlan; fejlesztői DB 001–019 alkalmazva/ismételve, 19 ff_ és 42 aw_/42 RLS, verified TLS. A korábbi 02b6838 verify+container CI sikeres, így a 017/018 izolált PostgreSQL/HTTPS proof lezárult; az új 019 runtime CI külön ellenőrizendő. Új teljes-scope AI-job/worker/curator még következik, majd Publication/Confirm/Official eredetengedély/kis valódi AI seed/P10–P13. PublicationApproved továbbra false. Új paid AI 0; külön kumulatív 5–5 USD keret, a kombinált P01–P13/S0–S7, S3 retention/S4–S7, 50–100 élet/20–30 scenario és Contabo/Cloudflare/backup/email kapuk megmaradnak. [Megvalósítás és határ](PUBLIC_CONTENT_BUNDLE_REPORT_HU.md).

Valódi kétfiókos Supabase Auth/HTTP: párhuzamos három csomagmentés egy rekord, story-only új hash, ownership/anon/hash/source-advance tiltás, export és tényleges Auth/DB cascade-törlés sikeres. Valódi böngésző: explicit mentett pontválasztás/teljes részletek, azonos reuse, pontcsere és pontelhagyás három immutable csomaghoz, régi változat/reload, dirty-copy mindkét panel elrejtése, forrás-visszatöltés és kilépés sikeres. A teszt során talált azonos React sibling-key javítva, az érintett böngészős próba megismételve; végleges format/Next production build is sikeres. Export 3 csomag/2 kiválasztási sor, tényleges Auth/DB cleanup, ideiglenes credential fájl eltávolítva, 3200/4200 leállítva. A forrás kizárólag technikai fixture, nem Official vagy valódi AI seed; új providerhívás 0.

### Teljes csomag CI-lezárás — 2026-10-06

[Main CI](https://github.com/Muzsy/future_flow/actions/runs/37412306422), runtime `8868a34cc079fccbc1df42dc767e4c65cd4666dd`: verify és container sikeres. 390 teszt/33 fájl, format/types/API/worker/Next production build és 68 séma-drift. Izolált valódi PostgreSQL/TLS: 001–019 és ismétlés, három párhuzamos csomagmentés egy rekord, immutable/free reuse/source-advance/törlési marker/export/cascade/RLS; minden korábbi P09/S0–S3 proof megmarad. Web/API/Caddy verified HTTPS, üres négy queue és worker tiszta leállás, nulla paid AI/valódi CI-kulcs, hálózati egress tiltva. A 019 runtime-kapu lezárult; teljes-scope AI-job/worker/curator és kiadás továbbra következik. Ez nem éles Contabo-telepítés.


## 2026-10-06: teljes tartalom AI-job és költségőr

Elkészült a külön public-content-review-1 teljes történet+explicit checkpoint AI-job, tartós egyszeri attempt, worker ötödik fair queue, receipt/hash/source/owner/lease guard és angol hozzájárulás/eredménypanel. Text-only eredmény nem öröklődik; nincs automatikus fizetős retry. Közös text/full napi/pending/projekt/user korlát, max 2200 output token és 70 000 byte teljes scan-input. 020 additív/RLS, export/cancel/cascade; default PUBLIC_CONTENT_REVIEW_JOBS_ENABLED=false. Helyi check 402 teszt/34 fájl, 70 séma; régi 68 és 001–019 változatlan. Supabase 001–020 alkalmazva/ismételve, 19 ff_ és 43 aw_/43 RLS, verified TLS. Valódi Auth/HTTP és tényleges cleanup kész; angol böngészős consent/finding/csomagváltás/dirty/source-reload/reuse/export/tényleges cleanup kész; e1067dd verify/container CI sikeres, 001–020 és ismétlés/konkurencia/source/deletion/export/RLS/TLS/HTTPS proof, paid AI 0. Egyetlen valódi checkerhívás a meglévő angol mintán: checkpoint embedded-instruction észlelve, 11 finding/review_required, 0,036611 USD becslés; OpenAI guard 2,470485875 USD, maradék 2,529514125 USD; Claude guard 2,338015 USD változatlan. Következő a külön teljes-scope curator, majd Publication/Confirm/Official source grant/kis valódi AI seed/P10–P13. PublicationApproved=false. P01–P13/S0–S7, S3 retention/korábbi személyes próza, S4–S7, 50–100 élet/20–30 scenario és Contabo/Cloudflare/backup/email kapuk megmaradnak. [Riport és következő kapuk](PUBLIC_CONTENT_REVIEW_JOB_REPORT_HU.md).


## 2026-10-06: teljes tartalom AI-job CI-bizonyítéka

[Main CI](https://github.com/Muzsy/future_flow/actions/runs/37447883609), runtime `e1067ddbb958f2402b88f84b7c2206c3ac8efc69`: verify és container sikeres. 402 teszt/34 fájl, format/types/API/worker/Next production build és 70 séma-drift. Izolált PostgreSQL/TLS: 001–020 és ismétlés, párhuzamos teljes-scope enqueue/claim egy attempt, immutable receipt/result, nincs automatikus paid retry, source-change/törlési marker/export/cascade/RLS; minden korábbi P09/S0–S3 proof megmarad. Web/API/Caddy verified HTTPS, üres review queue-k és tiszta worker-leállás, nulla paid AI/valódi CI-kulcs, egress tiltva. A 020 runtime-kapu lezárult; külön full-scope curator és kiadási kapuk következnek. Ez nem éles Contabo-telepítés.


## 2026-10-07: mentési és megosztási szelet

026 a saját mentési pointereket usertörlésnél és az idegen publication fizikai törlésénél kaszkáddal törli; a deleting/withdraw/hidden/revoked példányok mentettlistája addig sem mutat tartalmat. Valódi kétfiókos friss Auth HTTP-delete, tényleges Auth/DB/cascade cleanup sikeres.


## 2026-10-07: bejelentési és safety szelet

027 report data saját reporter/publication cascade; már kiadott publisher-warning report FK-ja nullázódik reporter-delete után, a warning és explicit restriction az érintett publishernek megmarad. Publisher own-delete warning/restriction/audit cascade. Valódi friss Auth HTTP mindkét deletion/DB cleanup és genuine seed változatlanság bizonyított.


## 2026-10-07: public aktivitásmérés

028 daily aggregate/raw reading session nem tartalmaz saját reader-azonosítást. Reader/reporter törlése nem vonja vissza másik publisher névtelen darabszámát; publisher/publication physical delete mindkét FK-táblát kaszkáddal törli. Saját export csak own publication slug/day/kind/total. Valódi Auth-delete/cascade ellenőrzött; Unsave/publisher physical-delete verseny külön real-PG CI proof. [Bizonyíték](PUBLIC_ACTIVITY_METRICS_REPORT_HU.md).


## 2026-10-07: kurált gyűjtemények

029 selected publication pointer physical source/account-delete cascade. Deleting marker/new reader 404 már a fizikai törlés előtt; nincs cached card story. Platform-curation audit nem tartalmaz publisher/user ID-t vagy storyt, own exportba nem kerül; protected hash/actor/time megmarad. Actual Auth cleanup és active curation-versus-physical-delete PG CI proof integrált. [Bizonyíték](CURATED_PUBLIC_COLLECTIONS_REPORT_HU.md).


## 2026-10-07: külön külső előnézet és indexelés

030 permission és immutable actions a publikáció/forrás/fiók fizikai törlésével cascade. Deleting/withdrawn/hidden/source-revoked állapotban új HTML-story metadata, image és sitemap nem készül. Recovery nem újraaktiválás; own-view friss bindinggel none revoke akkor is, ha feature-off. Real Auth DELETE/DB/PNG/sitemap proof kész; backup/retention/éles proxy cache ellenőrzés megmarad. [Bizonyíték](EXTERNAL_PUBLIC_EXPOSURE_REPORT_HU.md).


## 2026-10-07: explicit új snapshot és korábbi visszavonás

031 refresh history old/new publication/source/account delete cascade; nem őriz törölt copy-szöveget. Real Auth HTTP-delete és DB cleanup kész; egyetlen élet owner-delete következik, nyers/backup-retention külön kapu. [Bizonyíték](PUBLICATION_SNAPSHOT_REFRESH_REPORT_HU.md).


## 2026-10-07: saját élet törlése és kvótamegőrzés

Külön saját whole-life delete nem törli az Auth-accountot: friss sign-in, DELETE LIFE, aktuális branch/revision. Shared tagság/prose/input/lease leválasztás, public graph source cascade; kvóták rövid admission metaadata marad csak. Account delete ezt is cascade törli. 26 actual Auth/HTTP/TLS +cleanup, seed/ledgers unchanged. [Bizonyíték](SELECTIVE_LIFE_DELETION_REPORT_HU.md).
