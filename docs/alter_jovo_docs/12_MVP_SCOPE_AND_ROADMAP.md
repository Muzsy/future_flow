# alterward — MVP és roadmap


## Aktuális: Publication és külön Confirm

Elkészült a P09 angol Community Publication/Confirm: pontos teljes AI+curator binding, külön végleges előnézet és explicit hozzájárulás, immutable public/unlisted másolat, anonim olvasás, tulajdonosi visszavonás/linkcsere és trusted hide/remove. 022 additív/RLS/export/cascade, default PUBLICATIONS_ENABLED=false; indexelés és nyilvános fork még tiltott. Helyi teljes check 428 teszt/36 fájl, 81 séma; Supabase 001–022 alkalmazva/ismételve, 47 aw_/47 RLS, verified TLS. Valódi Auth/HTTP/böngésző/CLI, két kiadás exportja és mindkét ideiglenes Auth/DB-fiók tényleges cleanupja sikeres; izolált PostgreSQL/HTTPS main CI is sikeres a `bad1b816` runtime commiton: 428 teszt/36 fájl, 81 változatlan kimeneti séma, 001–022 és ismétlés, párhuzamos Confirm/linkcsere/immutability/moderáció/törlés/export/RLS; [CI](https://github.com/Muzsy/future_flow/actions/runs/37457083884). Új paid AI 0; külön kumulatív 5–5 USD keret változatlan. Következő Official eredetengedély/ScenarioVersion teljes kiadási review/valódi AI seed, majd P10–P13. P01–P13/S0–S7, Shared privacy/retention és ops kapuk megmaradnak. [Bizonyíték és határ](../PUBLICATION_CONFIRM_REPORT_HU.md).

**Aktuális állapot (2026-10-04):** P01–P05 privát v2 mag kész; valódi Auth/AI HTTP- és böngészős próba, export, Auth/DB-törlés és kontrollált megszakításból recovery sikeres. P07 új angol minta Sonnet auditja és P08 privát feedback/session-mérés kész; használói minőség kiadás után mérendő. Kizárólag angol indulás, magyar elrejtve. P09 tulajdonosi előnézeti alap, AI-pre-screen és szerkeszthető privát Privacy/Content Preview kész; fizetett scan-job, publishing/Discovery/Official seed/public fork tervezett. [Közös státusz és bizonyíték](../STATUS_HU.md), [indulási döntés](../ENGLISH_RELEASE_PLAN_HU.md). [Contabo-előkészítés](../CONTABO_PREPARATION_REPORT_HU.md) és teljes izolált web/API/worker/proxy CI sikeres; éles deploy, backup/restore, valós DB-kiesésből recovery és email-kézbesítés még nyitott.

**Shared állapot:** S0–S2 és S3 személyes/time/Connections/safety/privacy implementált; teljes kétfiókos Auth/Shared AI/saját AI/export/törlés/recovery sikeres. 001–013 alkalmazva, normál Shared flag-ek false. Nyers/backup-retention, régi személyes próza, billing/grace/deadline és friend release még kapu; P09–P13 és S4–S7 megmarad. [Aktuális bizonyíték](../SHARED_CONTEXT_S3_PRIVACY_AUTH_REPORT_HU.md).

2026-10-05 · [Aktív termékterv](../PRODUCT_PLAN_HU.md) · [Backlog](../NEXT_STEPS.md) · [14 public MVP-elem](../REQUIREMENTS_TRACEABILITY_HU.md).

## Első igazolandó hurok

Rövid identitás/profil és cél → valódi AI-időszak → nyitott döntés → tartós következmény → ugyanazon ág következő időszaka → későbbi visszatérés → történeti másik ág. A kérdés, akarja-e a felhasználó folytatni ugyanazt az életet. V1 tízéves prototípus ehhez technikai alap, nem kész folytatható MVP.

## Fázisok

| Szakasz | Feladatok és kilépés |
|---|---|
| Nyelvi alap | L01 kész a v1/v2-ben; minden új funkció angol; magyar halasztva |
| Tartós személyes alap | P01–P05: v2 tárolás, rövid AI-period, választás/folytatás/fork, 10–15 kérdés, memória és alkalmazáskeret |
| Privát pilot kapu | P06–P08: valós fiókos három időszak/újrabelépés/export/törlés, automatikus/AI angol minőség, ops-kapuk és mérés; használói értékelés kiadás után |
| Official/public alap | P09: külön snapshot/checkpoint/Scenario és kis valódi AI-seed pilot |
| Discovery | P10: public életoldal, kategória/nyelvi szűrő, Save/Share/Report, moderáció és cache/permission |
| Community Publishing | P11: három láthatóság, két preview/Confirm, refresh/unpublish és public adatkezelés |
| Saját élet public forrásból | P12: Fork this life, Start from this decision, Personalize scenario |
| Nyilvános MVP kapu | P13: mind a 14 public elem, privacy/jogosultság és működő kurált kínálat, olvasás→saját élet teszt |
| Későbbi social/platform | Reakció/követés, később komment/szerző, creator sablon/analitika; fizetés/mobil külön |

A két stratégiai forrás eltérő fázisszámozását ez a sorrend egységesíti. A személyes core elsőbbsége megmarad, a közösségi forrás előrébb hozza a nyilvános induló réteget. A privát technikai/emberi pilot korábban is futhat; a nyilvános indulás teljes MVP-t kér.

## Induló paraméterek és kötelezők

Hat hónap alap, tizenkettő a szerződésben; 2–5 esemény/egy 250–600 szavas fejezet/egy nyitott utolsó döntés. 10–15 kérdés, egy fő cél, nulla kapcsolat és unknown adatok kezelése. Áganként egy job, revision/idempotencia/lease, múlt változatlan, saját profil nem íródik át. Export/törlés és privát működés ingyenes. Ezek visszafordítható UX-paraméterek, a biztonsági/integritási feltételek kötelezők.

A 20 determinisztikus eset ×3 időszak elkészült; négy korábbi valódi generatív lánc és az új angol béta-minta auditált. A generatív lefedettség további, kereten belüli bővítése minőségi cél; nem húsz már teljesített fizetett eset. Korlátozott angol béta és későbbi 20–50 használó célkohorsz, előre rögzített mérési definícióval. 50–100 Official Life és 20–30 Scenario összesített nyilvános tartalomcél, előbb kis mért pilot. A darabszámok nem engedélyeznek 5 USD-n túli automatikus generálást.

## Kimarad az első MVP-ből

Komment, DM/chat, követési gráf és reakció; creator payment/marketplace; billing; natív mobil; avatar/kép/hang/VR/real-time multiplayer; habit tracker/coaching/egészségplatform; több száz statisztika és komplex ML-ajánló. Szabad szöveges döntés/összetett compare és mély világmodellek a működő folytatás után. Az angol élmény kötelező; a magyar és további nyelvek halasztottak.

Ha a profilfrikció, általános történet, következményhiány vagy költség megállítja a folytatást, a személyes hurok javítása következik. Nincs még igazolt retenciós küszöb, fizetési arány, naptári release-dátum vagy üzleti eredmény.

## Új S0–S7 fejlesztési szál

S0 foundation → S1 friend determinisztikus izolált teszt → S2 valódi Shared AI → S3 személyes impact/AI-folytatás/Connections + privacy/deletion/moderation kapu → első friend béta. S4 romantic, S5 work/hobby, S6 sport fokozatos; S7 advanced később. A minimális social profile és entitlement S0 alap implementált, billing/ár még nyitott. P09–P13 és a 14 public MVP-elem megmarad. S0 implementált kikapcsolva, DB-alkalmazás és ismétlés sikeres; S1/S2 és S3 személyes backend/time implementált; S3 UI/privacy/release kapu nyitott, S4–S7 tervezett.

[Shared integráció és elfogadások](../SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) · [Változatlan forrás](../plans/README.md).


## S3 személyes integráció — 2026-10-05

Connections angol felület, block/report/moderáció, retained próza PII-redakció/retention és teljes valódi fiókos Shared→saját AI→export/törlés/recovery még S3 kapu. A határidő kiadási alapértéke és entitlement/billing külön döntés; üres deadline mindenkit megvár, 48h javaslat. Mind a négy Shared flag false, Contabo-élesítés később. [Részletes bizonyíték és korlátok](../SHARED_CONTEXT_S3_REPORT_HU.md).


## Shared S3: Connections és biztonság — 2026-10-05

Angol Connections, block/report/moderáció és 011/012 elkészült; ezek dátumozott korábbi bizonyítéka megmarad. A későbbi privacy/Auth szelet felülírja az akkori „megjelenítési döntés/full Auth még hiányzik” státuszt: S0–S2 és S3 személyes/time/Connections/safety/privacy implementált; teljes kétfiókos Auth/Shared AI/saját AI/export/törlés/recovery sikeres. 001–013 alkalmazva, normál Shared flag-ek false. Nyers/backup-retention, régi személyes próza, billing/grace/deadline és friend release még kapu; P09–P13 és S4–S7 megmarad. A felhasználó az érintett közös szöveg elrejtését, a dátum és eredmény megtartását választotta. Új 013 stale-input cancellation és explicit friss retry; a P09 előnézet külön Shared privacy review-t kér. [Részletes megvalósítás, költség és korlát](../SHARED_CONTEXT_S3_PRIVACY_AUTH_REPORT_HU.md).


## 2026-10-05: P09 privát AI-review

[P09 operatori pre-screen](../PUBLIC_AI_REVIEW_REPORT_HU.md): zárt angol copy, minimális problémakategória, 014 privát RLS-tábla, hash/revision/policy/receipt kötés és egyszeri futás. Saját olvasási API, account export/cascade törlés és régi DB-export kompatibilitás ellenőrzött; Shared-előzmény tiltva. 311 helyi teszt, 44 schema (42 korábbi változatlan), egy valódi Sol-negatív kontroll öt jelzéssel. A privát Privacy/Content Preview kész; fizetett scan-job, curator/Publication/Confirm és public release még külön kapu.


## 2026-10-05: szerkeszthető privát Privacy/Content Preview

A [privát angol szerkesztő](../PUBLIC_PREVIEW_EDITOR_REPORT_HU.md) elkészült: saját forrásszöveg, mezőszintű ingyenes preflight, idempotens immutable mentés, legutóbbi érvényes copy visszatöltése és teljes mentett tartalomnézet. Az operatori AI-review csak a megfelelő hash/revision és mezőkészlet mellett látható; finding a javítandó mezőre mutat. Mentés/olvasás nem hív AI-t, Shared-előzmény és HU továbbra tiltott. Helyi teljes check: 314 teszt/27 fájl, 48 séma, a korábbi 44 és 001–014 változatlan. Következő a külön fizetett scan-job költségőrrel, curator/ScenarioVersion/sanitized fork-checkpoint/Publication/Confirm; majd P10–P13. Éles bekötés továbbra nincs.


## 2026-10-05: P09 review-job integráció

A felületről indítható P09 fizetett AI-review elkészült: explicit hozzájárulás, tartós queue/lease, egy attempt/immutable copy, közös projekt/user költségőr, egy pending job/user és gördülő napi kvóta. Újraolvasás/dupla kérés ingyenes, elveszett lease és provider-hiba nem indít automatikus fizetett retryt. 015 alkalmazva/ismételve a fejlesztői DB-n; English/Shared/tulajdonosi/hash/revision kapu és export/törlés integrált. Main CI sikeres: 324 teszt/28 fájl, 50 séma; a korábbi 48 és 001–014 változatlan. A normál feature false, éles allowance 0; publicationApproved false. Következő curator/ScenarioVersion/sanitized fork-checkpoint/Publication/Confirm/Official seed, majd P10–P13; S3 retention, S4–S7 és Contabo/Cloudflare élesítés megmarad. [Aktuális riport](../PUBLIC_REVIEW_JOB_REPORT_HU.md).


## 2026-10-05: P09 text-curation állapot

A P09 tulajdonosi beküldés és trusted text-curation nyilvántartás elkészült: explicit consent, aktuális immutable copy és no_findings AI-review, idempotens beküldés, védett operatori lista/döntésfájl, egyszeri változatlan döntés, English/Shared/ownership/revision/hash/expiry/törlés kapu, export/cascade és 016 RLS-migráció. Scope text_only, publicationApproved false. Teljes ScenarioVersion/sanitized fork-checkpoint és azok ellenőrzése, Publication/Confirm/Official eredetengedély/seed még hátravan; majd P10–P13. Main CI `4d66981` sikeres: 336 teszt/29 fájl, formázás, típusellenőrzés, API/worker/Next production build és 52 séma-drift. Izolált valódi PostgreSQL/TLS: 001–016 + ismétlés, párhuzamos curation-submit és versengő döntés → egy nyertes, azonos apply újrahasználata, revision/törlés/RLS/export/cascade és publication=false; minden korábbi P09/S0–S3 proof megmarad. Konténeres web/API/worker/Caddy verified HTTPS/DB TLS, üres queue és tiszta worker-leállás, nulla provider-AI/valódi CI-kulcs, egress tiltva. [Main CI](https://github.com/Muzsy/future_flow/actions/runs/37358126556). 52 séma, a korábbi 50 és 001–015 változatlan; fejlesztői DB 001–016 alkalmazva/ismételve, 19 ff_ és 36 aw_/36 RLS. Új AI-hívás nincs; a közös OpenAI/Claude keretek, S3 retention/S4–S7 és Contabo/Cloudflare kapuk megmaradnak. [Aktuális riport](../PUBLIC_TEXT_CURATION_REPORT_HU.md).


## 2026-10-05: P09 ScenarioVersion állapot

A P09 teljes angol ScenarioVersion foundation elkészült: külön zárt scenario-1 sablon, immutable/hash/verziózott saját tárolás, friss belső ID-k és teljes cél/állapot/korlát-hivatkozások, explicit indításból normál AI-job és közös kvóták, export/cascade. 017 alkalmazva/ismételve, 19 ff_ és 39 aw_/39 RLS; 354 helyi teszt/30 fájl és teljes check/build, 57 séma, a korábbi 52 és 001–016 változatlan. Két valódi szintetikus Auth/DB HTTP-fiók: ownership/anon, verzió/replay/start és három technikai időszak, export/tényleges törlés sikeres; új paid AI 0. Normál/deploy SCENARIO_VERSIONS_ENABLED=false, publicationApproved=false, saját előkészítő API, scenario UI/public permission még nincs. Következő sanitized fork-checkpoint, teljes structured preview/review, Publication/Confirm/Official seed, majd P10–P13. A három forrás minden követelménye, 50–100 élet/20–30 scenario cél, külön 5–5 USD keret, S3 retention/S4–S7 és Contabo/Cloudflare kiadási kapuk megmaradnak. [Aktuális riport](../SCENARIO_VERSION_REPORT_HU.md).


## 2026-10-05: P09 döntési checkpoint állapot

A P09 sanitized döntési checkpoint foundation elkészült: külön fork-checkpoint-1, teljes típusos állapot/korlát/előfeltétel/hatás és helyettesítő kulcskatalógus, exact canon/copy/opció binding, minden opció végrehajtható, új ID-s privát kezdőállapot motor. Saját candidate/save/read API, immutable hash/dedupe/default-off és privacy-fail-closed, export/cascade, 018 alkalmazva/ismételve; 19 ff_ és 40 aw_/40 RLS. Teljes helyi check/build: 372 teszt/32 fájl, 62 séma; a korábbi 57 és 001–017 változatlan. Valódi kétfiókos Auth/DB HTTP-próba: három párhuzamos save egy rekord, source-advance tiltás, három technikai időszak, export/tényleges Auth/DB cleanup; új paid AI 0. A régi coarse readyForFork=false változatlan, új record publicationApproved=false/readyForPublicFork=false/full review required. Következő teljes strukturált Privacy/Content Preview UI és új teljes-scope hash/AI/curator, majd Publication/Confirm/Official seed és P10–P13. A külön 5–5 USD keret, a három forrás teljes scope-ja és 50–100 élet/20–30 scenario cél, S3 retention/S4–S7 és Contabo/Cloudflare/backup/email kapuk megmaradnak. [Aktuális riport](../PUBLIC_FORK_CHECKPOINT_REPORT_HU.md).


## 2026-10-06: P09 döntési előnézeti felület

Az angol saját döntési előnézet és leírásszerkesztő elkészült: tényleges választás előtti állapot/cél/korlát/előfeltétel/hatás, egyértelmű objektumsorszámok, forráskötés mellett javítható prose, immutable saját mentés/verziómegtekintés és ingyenes visszatöltés. Helyi teljes check: 375 teszt/32 fájl, API/worker/Next build; végleges textarea-címkézés után format/Next build ismét sikeres. 62 schema és 001–018 változatlan. Valódi Auth-böngésző/DB próba: két mentés, régi verzió/reload/azonos reuse/dirty-copy elrejtés, export és tényleges cleanup; új paid AI 0. A megtekintett verzió még nem kiadási pontlista. Következő immutable szöveg+választott checkpoint tartalomcsomag/közös hash, új teljes-scope AI/curator, majd Publication/Confirm/Official seed és P10–P13. A korábbi 5d29fcf CI-jobok indítás előtt cancelled, ezért az új 017/018 konténeres proof még nyitott. A teljes korábbi P/S-terv, 50–100 élet/20–30 scenario cél, külön 5–5 USD keret és Contabo/Cloudflare/backup/email kapuk megmaradnak. [Megvalósítás és határ](../PUBLIC_FORK_PREVIEW_REPORT_HU.md).


## 2026-10-06: P09 teljes tartalomcsomag

Elkészült a teljes angol immutable történet+explicit kiválasztott checkpoint tartalomcsomag, közös hash, külön tulajdonosi pontlista és teljes tartalom-visszatöltés. Új public-content-1 és public-content-review-1 zárt input/report, minden típusos skalár bevonva, belső UUID/nyers privát forrás nélkül. 019 additív/immutable/RLS és export/cascade, default PUBLIC_CONTENT_BUNDLES_ENABLED=false; üres pontlista olvasható történet továbbindítás nélkül. Helyi check 390 teszt/33 fájl, 68 séma, a korábbi 62 és 001–018 változatlan; fejlesztői DB 001–019 alkalmazva/ismételve, 19 ff_ és 42 aw_/42 RLS, verified TLS. A korábbi 02b6838 verify+container CI sikeres, így a 017/018 izolált PostgreSQL/HTTPS proof lezárult; az új 019 runtime CI külön ellenőrizendő. Új teljes-scope AI-job/worker/curator még következik, majd Publication/Confirm/Official eredetengedély/kis valódi AI seed/P10–P13. PublicationApproved továbbra false. Új paid AI 0; külön kumulatív 5–5 USD keret, a kombinált P01–P13/S0–S7, S3 retention/S4–S7, 50–100 élet/20–30 scenario és Contabo/Cloudflare/backup/email kapuk megmaradnak. [Megvalósítás és határ](../PUBLIC_CONTENT_BUNDLE_REPORT_HU.md).

Valódi kétfiókos Supabase Auth/HTTP: párhuzamos három csomagmentés egy rekord, story-only új hash, ownership/anon/hash/source-advance tiltás, export és tényleges Auth/DB cascade-törlés sikeres. Valódi böngésző: explicit mentett pontválasztás/teljes részletek, azonos reuse, pontcsere és pontelhagyás három immutable csomaghoz, régi változat/reload, dirty-copy mindkét panel elrejtése, forrás-visszatöltés és kilépés sikeres. A teszt során talált azonos React sibling-key javítva, az érintett böngészős próba megismételve; végleges format/Next production build is sikeres. Export 3 csomag/2 kiválasztási sor, tényleges Auth/DB cleanup, ideiglenes credential fájl eltávolítva, 3200/4200 leállítva. A forrás kizárólag technikai fixture, nem Official vagy valódi AI seed; új providerhívás 0.

### Teljes csomag CI-lezárás — 2026-10-06

[Main CI](https://github.com/Muzsy/future_flow/actions/runs/37412306422), runtime `8868a34cc079fccbc1df42dc767e4c65cd4666dd`: verify és container sikeres. 390 teszt/33 fájl, format/types/API/worker/Next production build és 68 séma-drift. Izolált valódi PostgreSQL/TLS: 001–019 és ismétlés, három párhuzamos csomagmentés egy rekord, immutable/free reuse/source-advance/törlési marker/export/cascade/RLS; minden korábbi P09/S0–S3 proof megmarad. Web/API/Caddy verified HTTPS, üres négy queue és worker tiszta leállás, nulla paid AI/valódi CI-kulcs, hálózati egress tiltva. A 019 runtime-kapu lezárult; teljes-scope AI-job/worker/curator és kiadás továbbra következik. Ez nem éles Contabo-telepítés.


## 2026-10-06: P09 teljes tartalom AI-job

Elkészült a külön public-content-review-1 teljes történet+explicit checkpoint AI-job, tartós egyszeri attempt, worker ötödik fair queue, receipt/hash/source/owner/lease guard és angol hozzájárulás/eredménypanel. Text-only eredmény nem öröklődik; nincs automatikus fizetős retry. Közös text/full napi/pending/projekt/user korlát, max 2200 output token és 70 000 byte teljes scan-input. 020 additív/RLS, export/cancel/cascade; default PUBLIC_CONTENT_REVIEW_JOBS_ENABLED=false. Helyi check 402 teszt/34 fájl, 70 séma; régi 68 és 001–019 változatlan. Supabase 001–020 alkalmazva/ismételve, 19 ff_ és 43 aw_/43 RLS, verified TLS. Valódi Auth/HTTP és tényleges cleanup kész; angol böngészős consent/finding/csomagváltás/dirty/source-reload/reuse/export/tényleges cleanup kész; e1067dd verify/container CI sikeres, 001–020 és ismétlés/konkurencia/source/deletion/export/RLS/TLS/HTTPS proof, paid AI 0. Egyetlen valódi checkerhívás a meglévő angol mintán: checkpoint embedded-instruction észlelve, 11 finding/review_required, 0,036611 USD becslés; OpenAI guard 2,470485875 USD, maradék 2,529514125 USD; Claude guard 2,338015 USD változatlan. Következő a külön teljes-scope curator, majd Publication/Confirm/Official source grant/kis valódi AI seed/P10–P13. PublicationApproved=false. P01–P13/S0–S7, S3 retention/korábbi személyes próza, S4–S7, 50–100 élet/20–30 scenario és Contabo/Cloudflare/backup/email kapuk megmaradnak. [Riport és következő kapuk](../PUBLIC_CONTENT_REVIEW_JOB_REPORT_HU.md).


## 2026-10-06: teljes tartalom AI-job CI-bizonyítéka

[Main CI](https://github.com/Muzsy/future_flow/actions/runs/37447883609), runtime `e1067ddbb958f2402b88f84b7c2206c3ac8efc69`: verify és container sikeres. 402 teszt/34 fájl, format/types/API/worker/Next production build és 70 séma-drift. Izolált PostgreSQL/TLS: 001–020 és ismétlés, párhuzamos teljes-scope enqueue/claim egy attempt, immutable receipt/result, nincs automatikus paid retry, source-change/törlési marker/export/cascade/RLS; minden korábbi P09/S0–S3 proof megmarad. Web/API/Caddy verified HTTPS, üres review queue-k és tiszta worker-leállás, nulla paid AI/valódi CI-kulcs, egress tiltva. A 020 runtime-kapu lezárult; külön full-scope curator és kiadási kapuk következnek. Ez nem éles Contabo-telepítés.
