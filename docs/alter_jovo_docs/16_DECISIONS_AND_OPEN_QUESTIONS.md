# alterward — döntések és nyitott kérdések

**Shared állapot:** S0–S2 és S3 személyes/time/Connections/safety/privacy implementált; teljes kétfiókos Auth/Shared AI/saját AI/export/törlés/recovery sikeres. 001–013 alkalmazva, normál Shared flag-ek false. Nyers/backup-retention, régi személyes próza, billing/grace/deadline és friend release még kapu; P09–P13 és S4–S7 megmarad. [Aktuális bizonyíték](../SHARED_CONTEXT_S3_PRIVACY_AUTH_REPORT_HU.md).

**Aktuális állapot (2026-10-04):** P01–P05 privát v2 mag kész; valódi Auth/AI HTTP- és böngészős próba, export, Auth/DB-törlés és kontrollált megszakításból recovery sikeres. P07 új angol minta Sonnet auditja és P08 privát feedback/session-mérés kész; használói minőség kiadás után mérendő. Kizárólag angol indulás, magyar elrejtve. P09 tulajdonosi előnézeti alap, AI-pre-screen és szerkeszthető privát Privacy/Content Preview kész; fizetett scan-job, publishing/Discovery/Official seed/public fork tervezett. [Közös státusz és bizonyíték](../STATUS_HU.md), [indulási döntés](../ENGLISH_RELEASE_PLAN_HU.md). [Contabo-előkészítés](../CONTABO_PREPARATION_REPORT_HU.md) és teljes izolált web/API/worker/proxy CI sikeres; éles deploy, backup/restore, valós DB-kiesésből recovery és email-kézbesítés még nyitott.

2026-10-05 · Elfogadott irány és visszafordítható mérnöki választások. [Források elsőbbsége](../README.md).

## Elfogadott döntések

| Azonosító | Döntés | Eredet/státusz |
|---|---|---|
| ADR-001 | Web first, reszponzív Next.js | Meglévő alap, natív mobil később |
| ADR-002 | Külön NestJS API és worker, moduláris monolit | Meglévő alap |
| ADR-003 | PostgreSQL/Supabase Auth, migration first | Felhasználói szolgáltatóválasztás, megvalósítva |
| ADR-004 | Valódi OpenAI esemény/történet/ellenőrzés | Felhasználó elvetette az AI nélküli verziót |
| ADR-005 | Canon és determinisztikus átmenet a narratíva előtt | Mindkét terv, megvalósított v1/v2 tárolás és worker |
| ADR-006 | Immutable profil/canon, saját történeti fork nem ír szülőt | Megvalósított v1 és saját v2 történeti fork |
| ADR-007 | Tranzakciós PostgreSQL job, lease/checkpoint | Megvalósítás; felváltja a korábbi PGMQ-ajánlást |
| ADR-008 | Privát alap és ingyenes adatletöltés/törlés | Rögzített termék-/biztonsági alap |
| ADR-009 | 18+ induló webes cél | Megtartott irány; teljes age verification nem kész |
| ADR-010 | Terméknév **alterward** | Felhasználói döntés; repó/csomagazonosítók maradnak |
| ADR-011 | Angol alap és választható magyar, további nyelvekre készülve | Korábbi felhasználói döntés; induló nyelveit ADR-019 felülírja |
| ADR-012 | `Muzsy/future_flow` → közvetlen main munka | Felhasználói döntés, CI ellenőrzéssel |
| ADR-013 | Tartós rövid időszakos élet és same-branch folytatás | Pozicionálási terv; privát integráció és valós Auth-próba kész, éles ops-kapu nyitott; emberi élmény kiadás után mérendő |
| ADR-014 | Private + Official/Scenario + Community, public MVP | Közösségi terv; személyes core után P09–P13 |
| ADR-015 | Snapshot és külön sanitized fork-checkpoint | Privát előnézeti alap kész; publikáció és futtatható public checkpoint tervezett |
| ADR-016 | Feladatonkénti modellkonfiguráció, külön checker | Megvalósítva; Luna minősítendő jelölt |
| ADR-017 | OpenAI fejlesztői összkeret 5 USD | Korábbi felhasználói keret; nincs automatikus bővítés |
| ADR-018 | Claude modellek és külső történetaudit külön 5 USD kerettel | 2026-10-03 felhasználói döntés; külön titok/napi helyett összesített napló; worker-provider nem vált automatikusan |
| ADR-023 | Privát Shared Context és S0–S7; első user release valódi AI-val | 2026-10-04 új forrás és felhasználói integrációs kérés; tervezett |
| ADR-019 | Kizárólag angol béta, magyar elrejtve; AI szerkesztői döntés, kiadás utáni visszajelzés | 2026-10-03 legújabb felhasználói döntés; felülírja az ADR-011 kétnyelvű indulását és az előzetes kézi EN/HU pilotot |

## Felülírt javaslatok

| Korábbi szöveg | Aktív értelmezés |
|---|---|
| Alter Jövő / Future Flow / Branchward munkanév | alterward |
| Magyar-only MVP, soknyelvűség kizárva | Kizárólag angol indulás; magyar és további nyelv későbbi minősítés után |
| AI nélküli első demo/mock termékmód | Valódi AI kötelező; helyettesítő csak tesztben |
| Tízéves első generálás, 25–35 kötelező kérdés | V1 történeti működés; új v2 10–15 kérdés, rövid időszak |
| Minden választás új branch | V1 marad; v2 aktuális választás folytat, múltból fork külön |
| Public/social csak későbbi opcionális réteg, komment először | Public MVP személyes core után; Save/Share/Fork első, social/komment később |
| anonymous_community mint külön privacy szint | private/unlisted/public; szerző anonimitása külön megjelenítési beállítás |
| Privacy vagy adatletöltés prémium | Privát alap/export/törlés ingyenes; csak extra narratív formázás lehet prémium |
| Kötelező PGMQ/ORM/Docker/Flutter/protected-main/PR | Meglévő pg SQL/job és pnpm stack; infrastruktúra/mobil később, felhasználó main döntése érvényes |
| 18/20 siker elég export/törléshez | Auth/canon/privacy/export/törlés minden esetben hibamentes gate |

## Induló munkadöntések

Hat hónap alap, szerződés tizenkettőt is enged; egy 250–600 szavas fejezet/2–5 esemény/egy végső nyitott döntés. Első 12 lépéses rövid kérdőív, egy fő cél, mai magyar földrajzi környezet angol történetekkel. Egyszerű public ranking és fix taxonómia. Ezek mért tapasztalat alapján visszafordíthatók, nem lezárt felhasználói termékpreferenciák.

## Nyitott döntések és függőségek

Domain/védjegy; csomagár és ingyenes generálási limitek; későbbi payment; Contabo-élesítés időpontja/kerete; v2 period/fejezethossz értékelése; nemzetközi környezetsablonok; angol Official seed mérete és költsége; további nyelvek; számszerű pilot-küszöb és sessionablak; végleges privacy/retention/backup és public másolatok takarítása. Ezeket konkrét mérés/előnézet alapján tisztázzuk, nem blokkolják P01-et.

2026-10-04-re a Supabase admin-kulcs védett környezetben beállítva; a valódi szintetikus Auth/DB-törlés sikeres. A–G termékhipotézisek és a public növekedési hurok még nem bizonyított. Modellcseréhez új angol teljeslánc-próba kell, külön keretfoglalással. A tömeges seed/pilot szükség esetén új pénzügyi döntést kér, a szolgáltatónként külön engedélyezett 5 USD nem léphető túl.

## ADR-020 · Helyi fejlesztés, későbbi Contabo

2026-10-04 · Felhasználói döntés: meglévő Contabo szerver, domain később. Most helyi fejlesztés/teszt és GitHub main; élesítés kijelölt későbbi időben. Render-javaslat elvetve. [Telepítési terv](../DEPLOYMENT_HU.md).

## ADR-021 · Angol béta visszajelzés és mérési definíció

2026-10-04 · P08 megvalósítás: privát, önkéntes feedback; szerveridős 30 perces aktivitási munkamenet, fejezetszintű olvasási jel, kérés/job közötti attribution. Kattintás, siker és későbbi visszatérés külön. A 30 perc induló technikai definíció; nincs ebből bizonyított retenció. [Részletek](../BETA_FEEDBACK_AND_METRICS_HU.md).

## ADR-022 · Kipróbált kulcsos SSH és jelszavas tiltás

2026-10-04 · A felhasználó megerősítette, hogy más nem használ jelszavas SSH-t. Új, checkouton kívül védett Ed25519 kulcs telepítve, korábbi kulcs megmaradt. Időzített visszaállítás és konfigurációellenőrzés mellett az SSH-jelszavas belépés kikapcsolva; friss kulcsos kapcsolat sikeres, jelszavas kapcsolat elutasított. Root kulcsos belépés megmarad; csak SSH reload történt. [Végrehajtási bizonyíték és nyitott ops](../CONTABO_PREPARATION_REPORT_HU.md). Karbantartási időpont és a használt meglévő domainek listája még tisztázandó; reboot, tűzfal- vagy proxyaktiválás ezek nélkül nem következik automatikusan.

## ADR-023 · Shared Context a privát életmotorhoz

2026-10-04 · Felhasználói kérés: az új [Shared Context implementációs ZIP](../plans/README.md) teljes tartalma épüljön a tervbe és dokumentációba. [Aktív értelmezés](../SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md). Új privát aggregátum kapcsolja a valós felhasználók saját életágait, egy közös canonnal és jogosult személyes impactokkal; aw_lives/branches egytulajdonosú marad. Öt típus és tiermodell: Free 0, Explorer 1 friend, Connected 3 friend/romantic/work/hobby, World 5 minden típus. Árak/billing és grace nyitott; alapprivacy/export/törlés ingyenes.

S0–S7 külön szál, első helyi szelet S0. A forrás S0/S1 AI nélküli javaslata csak foundation/izolált teszt; friend béta csak S2 valódi Shared AI + S3 személyes integráció és biztonsági kapu után. PR-javaslat main commit-szelet, EN/HU minta angol kiadás. DM/chat/realtime/public shared továbbra későbbi; a korábbi általános multiplayer/social-halasztás nem zárja ki ezt az aszinkron privát funkciót.

Globális user UUID-sort → context → member/invite/event → branch lock-sorrend irányít, a blueprint invite-first példája ennek megfelelően átírandó. Személyes fork nem örököl live tagságot. Account-törlés tagreferenciákat/profilt leválaszt, mások minimális shared canonját nem cascade-törli; retained prose PII-redakciója/retentionje külön kiadási kapu. Shared személyes public snapshot más tagot általánosít, multiparty azonosítható snapshot S7 consenttel.

Grace és downgrade-context választás, deadline/quorum, eltérő időpontú ágak materializálása, billing és redakció/retention a függő implementációs szelet előtt konkretizálandó. Nincs még shared kód, alkalmazott új migráció vagy fizetett shared próba. Helyi fejlesztés folytatódik; dokumentációintegráció nem változtat szervert, keretet vagy alapmodellt.

## ADR-024 · Shared S0 minimális megosztás és fail-closed foundation

2026-10-04 · Visszafordítható technikai munkadöntések: owner invite 7 nap/20 per context/24h, hash-only HMAC token dedikált szerverkulccsal és POST preview, targeted-only decline, pontos napegyezés a későbbi időadapterig; nincs automatikus személyes adatprofil-kivonat. Az owner távozása/törlése admin-handovert ad a legrégebbi megmaradt aktív (ennek hiányában paused) tagnak, történetbeli szerep nélkül. Ended/archived romantikus slotot context_live trigger felszabadítja, paused megtartja. S0 008/009 és az API implementált, 008/009 a fejlesztői Supabase-on alkalmazva és ismétléssel ellenőrizve, mind a négy flag false. [S0 megvalósítás és korlátok](../SHARED_CONTEXT_S0_REPORT_HU.md). Billing, időadapter, downgrade/grace, retained prose és teljes canon-export/moderáció nem tekinthető ezzel késznek.

### ADR-025 · Shared S1 saját választás és memory-only lezárás

2026-10-04 · Friend csak individual_opt_in; participating-option ID és határidő trusted server-adat, nem AI/címke-inferencia. Option sharedChanges tiltott, nincs egymást felülíró egyéni csoportváltozás. Proposal prózából nem képzünk elfogadott személyes cselekvést/érzést; kizárólag canon + own recorded response memory-only pending rekord. Null és véges deadline támogatott, 48h teszt/javaslat; kiadási alapérték tisztázandó. Intent és resolution külön revision, leave/end/deleting atomikus cancellation. Tíz párhuzamos PostgreSQL-intent/öt context pending-deletion CI-kapu. Personal branch/AI-memory materializálás S3, valódi Shared provider S2; kapcsolati/pénzügyi/governance adapter későbbi. [S1 riport](../SHARED_CONTEXT_S1_REPORT_HU.md).

## ADR-026 — Shared AI, lease és megszakadt fizetett kérés

Sol marad, külön strict friend input/output, max4500 outputtoken és egy célzott repair. A kezdeményező keretéből egy közös canon keletkezik. Tartós call/repair marker nélkül nincs provider-hívás; mentett output restartolható, ismeretlen kimenet csendesen nem ismételhető. Egy aktív job/context és fair háromqueue-kör. Két valódi izolált mintát őrzünk, a második prompt nem ígér chatfunkciót. S3 előtt minden Shared flag false; eredeti public terv megmarad.

## ADR-027 — Személyes folytatás a közös válaszok megérkezése előtt

2026-10-04 · **Felhasználói döntés:** a személyes élet folytatható, amíg egy közös döntés válaszokra vár. A későbbi lezárás a következő személyes folytatásban újonnan megismert előzmény; elkészült fejezetet nem írunk át. Az immutable közös `effectiveAt` és az adott személyes ág `knownAt` dátuma külön marad. Futó személyes job bemenetét nem módosítjuk, és a retry ugyanazzal a pillanatfelvétellel dolgozik. Saját user/branch lock alatt egyszeri lazy memóriaátvétel történik, kliensrevision-ellenőrzés után. A történeti fork csak a forkfejezetig ismert memóriát örökli; élő tagságot és későbbi pending hatást nem. A válaszadási határidő külön, továbbra nyitott kiadási beállítás. [S3 személyes integráció](../SHARED_CONTEXT_S3_REPORT_HU.md).


## Shared S3: Connections és biztonság — 2026-10-05

Angol Connections, block/report/moderáció és 011/012 elkészült; ezek dátumozott korábbi bizonyítéka megmarad. A későbbi privacy/Auth szelet felülírja az akkori „megjelenítési döntés/full Auth még hiányzik” státuszt: S0–S2 és S3 személyes/time/Connections/safety/privacy implementált; teljes kétfiókos Auth/Shared AI/saját AI/export/törlés/recovery sikeres. 001–013 alkalmazva, normál Shared flag-ek false. Nyers/backup-retention, régi személyes próza, billing/grace/deadline és friend release még kapu; P09–P13 és S4–S7 megmarad. A felhasználó az érintett közös szöveg elrejtését, a dátum és eredmény megtartását választotta. Új 013 stale-input cancellation és explicit friss retry; a P09 előnézet külön Shared privacy review-t kér. [Részletes megvalósítás, költség és korlát](../SHARED_CONTEXT_S3_PRIVACY_AUTH_REPORT_HU.md).


## ADR-028 · S3 Connections és privát biztonsági műveletek

2026-10-05 · Technikai munkadöntés: a szerver friend-capability irányítja a navigációt; fragment token memóriában, explicit consent/own branch és idempotencia. Free report/block/leave; mások reportjai és block-actor adatai privátak. Tíz új report/user/24h és tartós target/reason dedup. Moderáció csak védett operátori CLI, külön hold, immutable audit, automatikus verdict/AI/újraindítás nélkül. Ezen rész implementált és izoláltan tesztelt. A retained szöveg megjelenítési kérdése felhasználói döntésre vár, nem elfogadott alapérték. [Részletek](../SHARED_CONTEXT_S3_UI_SAFETY_REPORT_HU.md).


## ADR-029 · Törölt tagot érintő közös szöveg

2026-10-05 · Felhasználói döntés: érintett közös szövegek elrejtése, ellenőrzött dátum és közös eredmény megtartása. Olvasási/export/AI-memória projekció implementált, 013 stale-input cancel és explicit friss retry. Nyers canon/backup-retention és korábbi személyes fejezetben megjelenő más-tag adat kezelése külön tisztázandó; ebből nem következik automatikus fizikai törlési vagy megőrzési határidő. [Bizonyíték](../SHARED_CONTEXT_S3_PRIVACY_AUTH_REPORT_HU.md).


## 2026-10-05: P09/domain aktuális kiegészítés

[P09 privát AI-review](../PUBLIC_AI_REVIEW_REPORT_HU.md) operatori szelete kész: zárt angol copy, hash/revision/policy/receipt kötés, immutable review és saját olvasási API; export/törlés, 014 alkalmazva/ismételve. Egy valódi Sol-hívás öt privacy-jelzést adott, publicationApproved false. A privát Privacy/Content Preview kész; fizetett scan-job/curator/Publication/Confirm és P10–P13 még hátravan; Shared-kapu, S3 retention és S4–S7 megmarad. Domain: alterward.com, Cloudflare aktív, DNS üres/TLS Full; éles bekötés/Contabo-indítás később, az ops kapuk után.


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
