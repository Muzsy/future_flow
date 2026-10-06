# alterward — nyilvános tartalom megvalósítási terve


## Aktuális: kurált nyilvános gyűjtemények

P10 szerkesztett Featured/Community Picks/Turning Points és meglévő Official-lista navigáció elkészült. Exact snapshot/publication/collection revision, idempotens trusted CLI teljes csere, legfeljebb 24 pointer és curated sorrend; minden card teljes live EN/public/Official readerből jön. 029 három RLS-tábla, immutable platform-audit és publisher cascade, PUBLIC_COLLECTIONS_ENABLED=false. Genuine háromfejezetes angol seed egyetlen életként Featured/Turning Points staging-válogatásban; Community Picks üres. Helyi check 513/44/build, 124 séma, régi 121/001–028 változatlan; dev DB 001–029 repeat, 65 aw_/65 RLS. 28 valódi Auth/HTTP/PG/CLI ellenőrzés és actual cleanup sikeres, genuine private export/AI-naplók változatlanok. Metrics ea517bc verify/container CI sikeres; új collection runtime CI még ellenőrizendő. Új paid AI 0; guard-maradék 2.254014125 / 2.62877 USD. Következő explicit OG-index-permission-cache és pozitív UI, majd P11–P13; Trending/Most Forked/fork/cohort külön kapu. P01–P13/S0–S7/retention/ops/Contabo scope megmarad. [Bizonyíték és határ](CURATED_PUBLIC_COLLECTIONS_REPORT_HU.md).

[Dokumentációs központ](README.md) · [Közös státusz és keret](STATUS_HU.md) · [A két terv teljes visszakövetése](REQUIREMENTS_TRACEABILITY_HU.md).

2026-10-06 · A [közösségi specifikáció](PUBLIC_LIVES_DISCOVERY_COMMUNITY_SPEC_HU.md) végrehajtható bontása. A P09 privát szövegszerkesztő, scan-queue, text-curation, [ScenarioVersion](SCENARIO_VERSION_REPORT_HU.md), [döntési checkpoint](PUBLIC_FORK_CHECKPOINT_REPORT_HU.md), angol strukturált előnézet és [teljes immutable tartalomcsomag](PUBLIC_CONTENT_BUNDLE_REPORT_HU.md) alapja elkészült. A [külön teljes-scope AI-job/worker és angol panel](PUBLIC_CONTENT_REVIEW_JOB_REPORT_HU.md) is elkészült; a [külön full-scope curator](PUBLIC_CONTENT_CURATION_REPORT_HU.md) is kész; Community Publication/Confirm és a ScenarioVersion teljes review/eredetengedély is kész; Official LIFE kiadási projekció és első valódi seed kész; a Discovery első read-only API/UI szelete kész. Save/Share/Report/trusted moderáció és rövid public aktivitásmérés kész; kurált Featured/Community Picks/Turning Points is kész; OG/index és nyilvános fork még fejlesztendő. A sorrendet a [backlog](NEXT_STEPS.md) tartalmazza.

## Sorrend és modulhatár

Személyes AI-szimuláció/tartós állapot → publikálható snapshot és Official seed → olvasható Discovery → Community Publishing → nyilvános fork → később reakció/követés/komment. A nyilvános rendszer a teljes MVP része; a technikailag kész privát angol motor bétája korábban is indulhat. A közösség tárgya élet, döntés, ág és szcenárió. A „read-only Discovery” fázis célja a kész élet tartalmának olvasása; a Save és Share már működik a default-off pilotban. Report/trusted moderáció és public metrikák is kész; a három szerkesztett kollekció is kész, a külön OG/index-kapu következik.

| Modul | Felelősség | Határ |
|---|---|---|
| Simulation | Privát Life, ág, időszak, canon, cél, emlékezet, job | A tulajdonosi API/RLS védelme megmarad |
| Public Content | Scenario, Publication, PublicSnapshot, Discovery | Csak jóváhagyott anonimizált projekciót ad ki |
| Community | Save, Share/Fork kapcsolat; később social layer | Nem általános posztfolyam |
| Moderation | Scan, Report, ModerationCase, tiltás és audit | Official és Community tartalomra is érvényes |

A monorepóban modulok készülnek, külön szolgáltatás/új fizetős infrastruktúra induláskor nem szükséges. A konkrét új táblák/API-k sémával és additív migrációval készülnek; az alábbi nevek tervezési nevek.

## Adatmodell

**Life** a tulajdonos privát szimulációja. **ScenarioVersion** verziózott kezdőidentitás/cél/környezet/állapot sablon, nem kész történet. **Official Life** a szcenárióból valódi AI-val legenerált, ellenőrzött konkrét élet. Egy Scenario több választással több élethez vezethet.

**Publication:** tulajdonos, belső forrásélet, aktív snapshot-verzió, public/unlisted, státusz, szerzőmutatás, forkengedély, keresőindexelés, kiadás/visszavonás és láthatósági revision. A szimulációhoz nem elég egy `is_public` mező.

**ScenarioVersion és PublicSnapshot tartalomnyelve** explicit mező. Induláskor kizárólag angol tartalom engedett, magyar halasztva; a kategória/címke/Discovery feliratok katalógusból fordulnak. A történet/snapshot eredeti nyelve megmarad, nyelvválasztás és szűrés nem indít AI-hívást. Angol keresés szükséges; többnyelvű keresés és nyelvi szűrő későbbi nyelvbővítéskor kell. Fordítás később külön ellenőrzött, verziózott szövegprojekció lehet ugyanazon canonhoz, külön költséggel és eredetjelöléssel. A sanitized fork-checkpoint tartalomnyelve átkerül az új életbe; a személyre szabott új szcenárió explicit új nyelvet választhat.

**PublicSnapshot:** megváltoztathatatlan, külön sémával validált cím/összefoglaló, nyilvános profil/kezdőhelyzet, kiválasztott időszakok idővonala és fejezetei, mérföldkövek, döntések/opciók, publikált ágak, taxonómia, opcionális cover és Official/Community/AI-generated/user-edited jelölés. Cover kezdetben kódalapú vizuál lehet, nem igényel képgenerálási költséget.

A **nyilvános fork-checkpoint** is külön anonimizált, géppel validált állapot/cél/környezet-projekció. A szereplők helyettesítő nyilvános azonosítót kapnak. Teljes privát World State, eredeti profil/állapot-ID, raw prompt, memória, rendszerüzenet, jegyzet és audit nem része a publikus DTO-nak. A szöveg PII-mentesítése önmagában nem teszi biztonságossá a strukturált állapotot.

Snapshot frissítése új verziót és új megerősítést igényel. Privát folytatás nem frissíti automatikusan a nyilvános történetet. További MVP-objektum: egyedi user/publication Save, Report, ModerationCase, Tag/Category, Discovery-kollekció és összesített használati jelek. Comment/Follow/Reaction nem szükséges az első migrációkba.

## Publikálási folyamat

1. Tulajdonos kiválasztja az életet/ágat és a kiadható időszakokat.
2. Public vagy unlisted választás, külön szerző- és indexelési beállítás; megerősítésig privát.
3. Automatikus PII/tartalmi elővizsgálat: név, cím, email, telefon, munkahely/iskola, harmadik személy adatai és érzékeny részletek. A scan nem jelent teljes anonimitási garanciát.
4. **Privacy Preview:** helyettesítő nevek, általánosított hely/munkahely, kihagyott részek átnézése/szerkesztése. Más személy adata nem vihető át pusztán a tulajdonos public választása miatt.
5. **Content Preview:** a teljes tényleges snapshot és fork-checkpoint, jelölések és engedélyek áttekintése.
6. Explicit Confirm a megtekintett snapshot hash-éhez, forrásrevisionhöz és scanverzióhoz kötve. Lejárt/módosult bemenet új previewt kér; kiadás atomikus és idempotens.

Scan/anonim átírás/ellenőrzés külön AI-szerep és költség; olcsóbb modell csak PII/minőségi értékelés után választható. Strukturált allowlist és jogosultság minden modell mellett kötelező. Official tartalmat emberi curator hagy jóvá; a badge nem kliensflagből származik.

A [külön immutable teljes előnézeti csomag](PUBLIC_CONTENT_BUNDLE_REPORT_HU.md) már elkészült: a megtekintett szöveg és az explicit kiválasztott, source-bound checkpointverziók együtt kapnak szerveroldali tartalomhash-t. Üres checkpointlista továbbindítás nélküli történet-előkészítést jelent. Checkpoint csere/eltávolítás vagy bármely tartalommódosítás új csomag és új teljes-scope vizsgálat; a régi `public-review-1`/`text-curation-1` csak szövegre szóló eredménye nem emelhető át. Az új AI-input alapja minden kiadásra szánt strukturált mezőt és hatást tartalmaz, nyers privát forrás nélkül; a [tartós full-scope scan-job/worker](PUBLIC_CONTENT_REVIEW_JOB_REPORT_HU.md) kész, a [külön teljes-scope kurátori döntés](PUBLIC_CONTENT_CURATION_REPORT_HU.md) is kész. Full review/curator sem ad automatikus publikációs vagy Official eredetengedélyt. A [végrehajtási sorrend és ellenőrzési kapuk](NEXT_STEPS.md#2026-10-05-a-teljes-strukturált-előnézet-végrehajtási-sorrendje) rögzítik a hash-, forrás-, költség-, törlési és visszavonási feltételeket.

## Jogosultság és URL

| Állapot | Másik felhasználó/látogató | Discovery/keresés | Külső indexelés |
|---|---|---|---|
| Private | Nincs tartalom vagy public link | Nem | Nem |
| Unlisted | Csak érvényes titkos linkkel, kizárólag snapshot | Nem | Mindig tiltott |
| Public | Aktív, moderáció által engedett snapshot | Igen | Community külön opt-in; Official curator-beállítás |
| Withdrawn/hidden/removed | Nyilvános tartalom nem olvasható | Nem | Nem |

A tulajdonos privát API-ját a publikus engedélyek nem nyitják meg. Unlisted link legalább 256 bites véletlen bearer-token, szerveren hash tárolódik; token nem kerülhet naplóba vagy refererbe. Nem UUID-ismereten alapuló védelem. Linkváltás az előző tokent is megszünteti. Mindig `noindex`, sitemap/Discovery/ajánló kizárás; robots nem helyettesíti a hozzáférés-ellenőrzést.

Tervezett `/lives/:slug`, `/scenarios/:slug`, `/discovery`, külön unlisted tokenes útvonal. Privát táblák nem kapnak anon SELECT policyt. Minden public API explicit kiadási/moderációs ellenőrzést végez. Save és új saját élet hitelesítést kér; public olvasás nem jogosít a privát forrás API-jára.

## Discovery, seed és költség

Kurált kollekciók: Featured, Official, Community Picks, Trending, Most Forked, Turning Points. Fix kategóriák: career/business/money/relationships/family/education/lifestyle/moving abroad/starting over/personal growth/adventure/historical/fictional. Utóbbi címkék nem jelentenek kész történelmi/fiktív szimulátort. AI címkejavaslat curator/szerző jóváhagyásával kerül be.

Egyszerű aggregált ranking; sikeres fork erősebb jel, mint egy view. Moderációs státusz, spam/duplikátum korlátozás kötelező; report számából nem lesz ellenőrizetlen tömeges elrejtés. Komplex ML-ajánló később.

Forráscél: **50–100 Official Life és 20–30 Scenario** a publikus indulás előtt, kizárólag angol kínálattal, AI szerkesztői és kánonellenőrzéssel. A magyar minták nem indulási cél. A darabszám összesített cél, nem nyelvenként 50–100 új generálás; az induló tartalom angol; a további nyelvek külön későbbi döntés. Először kis valódi AI-seed pilot az új több időszakos láncon. Teszt-fixture vagy kézzel kitalált kész történet nem kerül be AI-generated Official Life-ként. Meglévő v1 AI-minták referenciák, nem automatikusan publikálható v2 seed.

Olvasás/újratöltés/Save/Share nem indít generálást. Snapshot verzió szerint cache-elhető, de a publication aktív státuszát minden hozzáférésnél ellenőrizni kell. CDN esetén visszavonási purge és előre rögzített rövid érvénytelenítési ablak kell. Publish/refresh és új saját fork külön mért AI-költség.

Az OpenAI összesített 5 USD kísérleti keret dátumozott fogyasztása és maradványa a [státuszban](STATUS_HU.md) szerepel. A külön Claude 5 USD kutatás/audit, nem seed- vagy éles keret. Teljes seed/pilot mért v2-költséghez és szükség esetén külön jóváhagyott kerethez kötött. Kérés előtti foglalás szükséges; nincs olvasásonkénti újragenerálás vagy korlátlan javítás. A v2 fejlesztés négy valódi többidőszakos EN/HU láncot is mért; a dokumentum olvasása/frissítése nem indít AI API-hívást.

A [nyelvi ellenőrzés](LOCALIZATION_HU.md) v1 EN/HU alapot és ágat bizonyít. V2 Official seedhez angol több időszakos minősítés kell; a korábbi minta nem automatikusan public seed.

## Nyilvános fork és személyre szabás

**Fork this life:** engedélyezett public checkpointból új tulajdonos új privát élete, saját élet/ág/szereplő/cél/asset ID-kkel. Nem jön létre privát szülő-előzményre mutató FK vagy tulajdonosi jog. Más felhasználó forkja eltér a mai saját történeti ág API-jától.

**Start from this decision:** a döntés előtti sanitized checkpointból indul, a választást egyszer alkalmazza. Nem másolja az el nem döntött jövőt vagy teljes memóriát. Kezdőállapotot a v2 domainmotor validálja.

**Personalize scenario:** verziózott Scenario és saját jóváhagyott identitás/cél/korlát felülírása új privát kezdőállapotot ad. Eredeti Scenario és mások élete változatlan. Fork-kattintás, sikeres létrehozás és első AI-időszak külön mérendő.

Visszavont/elrejtett kiadásból nincs új fork. Meglévő privát fork saját példányként megmaradhat; forrás törlésekor public attribution-kapcsolata megszűnik. Utólag feltárt érzékeny tartalom nyilvános példányainak/checkpointjainak takarítása külön moderációs művelet, nyilvános indulás előtti kapu. Későbbi privát továbbírás retention-szabálya külön döntés lesz.

## Moderáció, visszavonás és törlés

Minimum: scan, Report, felülvizsgálati sor, soft hide, hard remove, figyelmeztetés, ismétlődő visszaélés korlátozása. Kategória: PII, zaklatás, gyűlölet, explicit szexuális tartalom, erőszak, illegális tartalom, csalás, megszemélyesítés, spam. Rate-limit/deduplikáció, minimális védett jelentőadat és döntési audit. Teljes appeals-platform nem MVP.

**Unpublish:** tulajdonosi hitelesítés, azonnali státuszváltás/új kérések tiltása, Discovery/sitemap/profil eltávolítás, tokenvisszavonás, cache/OG érvénytelenítés. Privát élet megmarad; új publikálás új jóváhagyás. Külső keresőtalálat és korábban letöltött másolat nem vonható fizikailag vissza; saját kiszolgálás/cache kezelése ellenőrizhető.

**Delete life/account:** privát adatgráf mellett Publication/snapshot/token/save/Discovery-index/forrásattribution kezelése; aktív generálási/publikálási job nem írhat vissza. Moderációs/audit retention külön minimális szabály, nem a törölt történet korlátlan megőrzése. A meglévő export/törlés bővítendő.

## Nyilvános kapu és mérés

Kötelező: preview azonos hash jóváhagyása; anon/másik fiók nem ér el private adatot; unlisted token nélkül és Discoveryből nem elérhető; visszavonás közben nincs új public olvasás/fork; nincs privát memória/azonosító/prompt snapshotban, checkpointban vagy OG-ben; teljes export/törlés; kliensflag nem kerüli meg a moderációt; olvasás nem terheli az OpenAI-keretet.

Próbák: hitelességi badge, dupla publish/save/fork, lejárt preview, cache-purge, harmadik személy anonimizálása, utólag érzékeny forrás eltávolítása, report-visszaélés és választás egyszeri alkalmazása. Nyilvános fork első három privát időszaka is a core minőségi kapu része.

A Continuation Rate/Continued Life Sessions mellett views/read depth/completion, Save/Share, public life → sign-up → sikeres fork → első sikeres időszak, publish/unlisted/unpublish/report/removal és referral mérendő. Minimális azonosítók/összesítések, történet/cél/prompt/token analitikába nem kerül. Kattintás és siker külön szám; paid conversion csak későbbi fizetési funkció után mérhető.

Az AI-ra bízott angol szerkesztői döntés a nyelvi minősítésre vonatkozik; a tervezett publikálási Privacy Preview, tulajdonosi Confirm és kurátori eredetellenőrzés külön marad. A privát szerkesztő és mentett tartalomnézet elkészült; a kurátori text-only beküldés/döntés nyilvántartása elkészült. A teljes történet és checkpoint AI-ellenőrzése és külön kurátori döntése is elkészült. Kiadási Confirm, Official eredetengedély és aktív Publication még hátravan. A jelenlegi tulajdonosi előnézet és részleges determinisztikus preflight önmagában nem teljes anonimizálás.

## Shared történetek publikálása — új privacy-kapu

A [Shared Context](SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) első kiadásban privát, nem új public life page. Személyes történetben megjelenő közös eseményből P09/P11 csak általánosított másik szereplőnevet/címet enged snapshotba; InteractionProfile, más felhasználó/member/context személyes azonosítói, live tagság és másik privát ág nem adható át. A próza PII-ellenőrzése is szükséges, UUID-szűrés önmagában nem elegendő. Public fork új saját élet, nem context-csatlakozás. Azonosítható többtagú publikáció későbbi S7, külön snapshot-consent minden érintettől és visszavonási szabállyal; nem a jelenlegi egytulajdonosú Confirm kiterjesztés nélküli használata. A P09–P13 public MVP minden korábbi eleme megmarad; e követelmény shared adat publikálása előtt teljesítendő.


## 2026-10-05: angol AI-pre-screen elkészült

Az eddig hiányzó AI-elővizsgálat operatori szelete elkészült: a külön angol copy mezőnként ellenőrizhető, a 014 RLS-táblában hash/revision/policy/receipt kötésű privát eredmény tárolódik, saját olvasási API és export/törlés integrált. Egy valódi Sol-próba öt privacy-problémát talált az eredeti angol mintában. Ez nem teljes PII-garancia, nem curator/Official/Publication/Confirm és nem fizetős felhasználói job. A szerkeszthető privát Privacy/Content Preview elkészült; a fizetett scan-job és a további public kapuk hátravannak. [Megvalósítás és elfogadás](PUBLIC_AI_REVIEW_REPORT_HU.md).


## 2026-10-05: szerkeszthető privát Privacy/Content Preview

A [privát angol szerkesztő](PUBLIC_PREVIEW_EDITOR_REPORT_HU.md) elkészült: saját forrásszöveg, mezőszintű ingyenes preflight, idempotens immutable mentés, legutóbbi érvényes copy visszatöltése és teljes mentett tartalomnézet. Az operatori AI-review csak a megfelelő hash/revision és mezőkészlet mellett látható; finding a javítandó mezőre mutat. Mentés/olvasás nem hív AI-t, Shared-előzmény és HU továbbra tiltott. Helyi teljes check: 314 teszt/27 fájl, 48 séma, a korábbi 44 és 001–014 változatlan. Következő a külön fizetett scan-job költségőrrel, curator/ScenarioVersion/sanitized fork-checkpoint/Publication/Confirm; majd P10–P13. Éles bekötés továbbra nincs.


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


## 2026-10-06: Community Publication és külön Confirm

[Angol kiadási előnézet és explicit tulajdonosi megerősítés](PUBLICATION_CONFIRM_REPORT_HU.md) elkészült: csak a teljes AI+curator által ellenőrzött aktuális példány; immutable public/unlisted olvasás, anonymous/handle credit, visszavonás/linkcsere és trusted moderáció, export/cascade. Kiadás alapból kikapcsolva, indexelés/fork még tiltott; Official eredetengedély/ScenarioVersion teljes kiadási review/valódi AI seed következik. A korábbi dátumozott riportok bizonyítékát az aktuális státusz egészíti ki; a teljes P/S-terv és ops kapuk megmaradnak.


## 2026-10-06: konkrét Official LIFE eredetengedély

[Előzetes trusted start és teljes AI/canon/választási receipt-engedély](OFFICIAL_LIFE_PROVENANCE_REPORT_HU.md) kész. Normál személyes AI-job/worker, exact full-content curator és accounted provider proof, külön jog/minőség/source grant, visszavonás/export/cascade/recovery; default OFFICIAL_LIFE_OPERATOR_ENABLED=false, nincs grant HTTP-route vagy public olvasási jog. Helyi check 453/38, 96 séma, Supabase 001–024 és ismétlés/52 RLS; a `da9c0118` runtime [CI](https://github.com/Muzsy/future_flow/actions/runs/37503358807) verify/container sikeres. Új paid AI 0, korábbi két 5 USD keret változatlan. Következő külön Official kiadási projekció/Confirm, valódi angol seed/Claude-auditor és P10–P13. P01–P13/S0–S7 és az operatív kapuk megmaradnak.


## 2026-10-06: külön Official kiadási másolat

[Exact Official preview/Confirm és immutable publikáció](OFFICIAL_PUBLICATION_REPORT_HU.md) kész; a source grant külön kapu marad. Default OFFICIAL_PUBLICATIONS_ENABLED=false; védett PUBLICATION_LINK_SECRET, külön HMAC-névtér. Public/unlisted olvasó, saját listázás/linkcsere/withdraw, trusted moderáció; source-revoke és fióktörlés tranzakciós hozzáférésmegszüntetése, export/cascade/recovery. 025 alkalmazva/ismételve, 55 RLS, 105 séma; a korábbi 96/001–024 változatlan. Új paid AI 0, valódi seed/Auth/böngészős pozitív próba még feladat. Runtime `9850a6ae` [CI](https://github.com/Muzsy/future_flow/actions/runs/37507371476) verify/container sikeres; nem Contabo-deploy. A teljes P01–P13/S0–S7 és ops kapuk megmaradnak.


## 2026-10-06: P10 read-only Discovery első szelet

P10 read-only kereső/lista foundation és angol UI kész, valódi seed/Auth/HTTP ellenőrizve. Save/Share/OG/Report/queue/warning/kollekció/metrikák nem készültek el ezzel; a teljes eredeti P09–P13 továbbra követelmény. [Részletes bizonyíték és következő kapuk](DISCOVERY_FOUNDATION_REPORT_HU.md).


## 2026-10-07: mentési és megosztási szelet

P10 hitelesített idempotens Save, saját mentettlista és public linkmásolás elkészült. Ez nem OG/indexelési opt-in vagy teljes P10. Következő felhasználói Report, tartós queue/warning/repeat-offender guard, metrikák és kollekciók, majd public fork/P11–P13. A terv korábbi követelményei és Shared/ops kapui változatlanok.


## 2026-10-07: bejelentési és safety szelet

P10 Report és trusted moderation minimum elkészült: durable private queue, dedup/10 per 24h, warning/hide/remove és explicit repeat-offender restriction/restoration, own notices/export/cascade. Nem automatikus többjelentéses tiltás. Metrikák, kurált kollekciók, explicit OG/index/cache és UI-próba, P11–P13 további kapu.


## 2026-10-07: public aktivitásmérés

P10 rövid public read/depth/end/share és sikeres Save/Unsave/Report/Publish/owner-withdraw/hide/remove napi aggregate kész, new AI 0. Következő kurált Featured/Community Picks/Turning Points és Official csoportok, majd explicit OG/index/permission/cache, pozitív UI. Trending/Most Forked/cohort csak valós új forkméréssel és abuse-kapuval; P11–P13/Shared/ops scope megmarad. [Bizonyíték](PUBLIC_ACTIVITY_METRICS_REPORT_HU.md).


## 2026-10-07: kurált gyűjtemények

P10 három kurált kollekció elkészült. Következő explicit OG/index/permission/cache és pozitív UI. Trending/Most Forked csak megfelelő valódi érdeklődés/fork/abuse mérés után; P11 refresh/withdraw/privacy, P12 public fork/scenario personalization, P13 quality/usage/release és Shared/ops teljes scope megmarad. [Bizonyíték](CURATED_PUBLIC_COLLECTIONS_REPORT_HU.md).
