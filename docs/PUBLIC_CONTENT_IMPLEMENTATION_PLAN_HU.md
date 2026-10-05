# alterward — nyilvános tartalom megvalósítási terve

[Dokumentációs központ](README.md) · [Közös státusz és keret](STATUS_HU.md) · [A két terv teljes visszakövetése](REQUIREMENTS_TRACEABILITY_HU.md).

2026-10-04 · A [közösségi specifikáció](PUBLIC_LIVES_DISCOVERY_COMMUNITY_SPEC_HU.md) végrehajtható bontása. A [P09 privát előnézeti alapja](PUBLIC_DRAFT_FOUNDATION_HU.md) elkészült. Publikálás, Discovery és nyilvános fork még nincs bekötve az alkalmazásba; az alábbi viselkedés tervezett. A sorrendet a [backlog](NEXT_STEPS.md) tartalmazza.

## Sorrend és modulhatár

Személyes AI-szimuláció/tartós állapot → publikálható snapshot és Official seed → olvasható Discovery → Community Publishing → nyilvános fork → később reakció/követés/komment. A nyilvános rendszer a teljes MVP része; a technikailag kész privát angol motor bétája korábban is indulhat. A közösség tárgya élet, döntés, ág és szcenárió. A „read-only Discovery” fázis célja a kész élet tartalmának olvasása; a fázisban Save és Share is működni fog. Ezek jelenleg még fejlesztendők.

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

Az AI-ra bízott angol szerkesztői döntés a nyelvi minősítésre vonatkozik; a tervezett publikálási Privacy Preview, tulajdonosi Confirm és kurátori eredetellenőrzés külön marad. A privát szerkesztő és mentett tartalomnézet elkészült; a kurátori text-only beküldés/döntés nyilvántartása elkészült. A teljes checkpoint ellenőrzése, kiadási Confirm, Official eredetengedély és aktív Publication még hátravan. A jelenlegi tulajdonosi előnézet és részleges determinisztikus preflight önmagában nem teljes anonimizálás.

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
