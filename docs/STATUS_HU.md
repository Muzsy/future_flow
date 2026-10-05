# alterward — megvalósítási állapot és kísérleti keret

2026-10-05 · [Megvalósítási riport](V2_IMPLEMENTATION_REPORT_HU.md) · [Sorrend](NEXT_STEPS.md) · [Lokalizáció](LOCALIZATION_HU.md).

## Ténylegesen elkészült

| Terület | Bizonyíték és határ |
|---|---|
| V1 kompatibilitás | Tízéves AI-generálás/archívum és gyermekág megmarad, 001/002 változatlan |
| V2 privát élet | 12 lépéses angol onboarding; HU elrejtve, immutable saját/alternatív bemenet, revisionös draft |
| Hat hónapos AI | 2–5 validált canon-esemény, egy 250–600 szavas fejezet, nyitott döntés a végén |
| Választás/folytatás | Egyszeri atomikus choice, ugyanazon ág következő időszaka, külön saját történeti fork |
| Tartós működés | Job/checkpoint/lease/heartbeat, revision/hash/idempotencia, egy ág egy aktív job |
| Memória/javítás | Aktuális állapot +közeli canon/választások, egy célzott automatikus javítás, bounded manuális retry |
| Költségőr | Tranzakciós projekt/user foglalás, ismert/ismeretlen elszámolás, v1/v2 közös limitek; helyben közös 5 USD fileguard |
| Supabase | 001–017 alkalmazva/ismételve; 16 Shared RLS-tábla, 19 ff_ és 39 aw_/39 RLS; verified TLS, Auth reachable, anon/authenticated közvetlen tiltás |
| Export/törlés | Teljes privát v1/v2 gráf, worker-stop, durable Auth/DB recovery; valódi szintetikus Auth/DB-törlés sikeres; valós DB-kiesésből recovery/backup még nyitott |
| Contabo-előkészítés | Kulcsos SSH és jelszavas tiltás kipróbálva; 25 védett config/storage másolat hash-e egyezik; elkülönített Compose és meglévő proxy merge/adapt sikeres; éles route/alkalmazás nincs |
| Runtime CI | `4d66981`: 336 teszt/29 fájl, teljes check/build/52 séma-drift; izolált PostgreSQL curation submit/decision/reuse/source/deletion/RLS és korábbi P09/S0–S3 proof, 001–016 + ismétlés; verified TLS/HTTPS, üres queue/tiszta leállás; [CI](https://github.com/Muzsy/future_flow/actions/runs/37358126556) |
| P09 ScenarioVersion | Angol zárt/verziózott sablon, friss ID-k, saját privát élet + normál job/kvóta, export/cascade; default-off és kiadási review még nyitott; [riport](SCENARIO_VERSION_REPORT_HU.md) |
| P09 AI-review | Privát angol copy, hash/revision/policy/receipt, operatori egyszeri scan és tulajdonosi eredményolvasás; valódi Sol-minta 5 finding; szerkeszthető privát Privacy/Content Preview kész; [felületről indítható fizetett scan-job](PUBLIC_REVIEW_JOB_REPORT_HU.md) kész; [text-only curator](PUBLIC_TEXT_CURATION_REPORT_HU.md) kész; teljes checkpoint/curator és Publication/Confirm még nincs; [riport](PUBLIC_AI_REVIEW_REPORT_HU.md) |
| Shared S3 rész | Saját memória/AI/time/fork/export/törlés, angol Connections és block/report/moderáció implementált; közös szövegprojekció és kétfiókos Auth/AI/recovery is kész; nyers/backup-retention és korábbi személyes próza még kapu, Shared false |
| Shared S0 | Külön contract/core, 13 RLS-tábla, profil/entitlement/meghívás és lifecycle API; 36 új regresszió, mind a négy flag kikapcsolva, valódi AI/UI S2/S3 |
| Mérési alap | Privát feedback, szerveroldali 30 perces session, fejezetvég-kohorsz és sikeres/későbbi folytatás; [definíciók](BETA_FEEDBACK_AND_METRICS_HU.md) |

## Bizonyíték és hiányzó kapuk

Aktuális ScenarioVersion szelet: 354 sikeres helyi teszt/30 fájl, 57 schema; a korábbi 52 változatlan. [ScenarioVersion bizonyíték](SCENARIO_VERSION_REPORT_HU.md). Korábbi text-curation: 336/29/52. A teljes ellenőrzés/CI a [text-curation riportban](PUBLIC_TEXT_CURATION_REPORT_HU.md) szerepel. Az új main CI eredménye a [review-job riportban](PUBLIC_REVIEW_JOB_REPORT_HU.md) szerepel; korábbi sikeres main CI: 314 teszt/27 fájl és 48 schema. [Privát szerkesztő és ellenőrzés](PUBLIC_PREVIEW_EDITOR_REPORT_HU.md). A korábbi 311-es main CI dátumozott bizonyítéka megmarad. [P09 AI-review és konténeres bizonyíték](PUBLIC_AI_REVIEW_REPORT_HU.md), [korábbi privacy/Auth bizonyíték](SHARED_CONTEXT_S3_PRIVACY_AUTH_REPORT_HU.md). A korábbi CI: [S3 UI/safety](SHARED_CONTEXT_S3_UI_SAFETY_REPORT_HU.md). A 279-es személyes/time bizonyíték és korábbi valódi Sol/Claude minták megmaradnak; újabb teljes Auth/Shared/saját lánc 19 fizetett hívását és a megszakadt próbát az alábbi kumulatív keret tartalmazza. Izolált fixture-teszt nem húsz generatív eset vagy használói megtartási mérés.

Valódi szintetikus Supabase/Auth/DB/OpenAI HTTP-hurok és tényleges fióktörlés sikeres, admin kulcs már rendelkezésre áll. Böngészőben angol onboarding, draft-visszaállítás, első fejezet/döntés/második fejezet és mindkét feedback mentése ellenőrizve. [Aktuális béta-riport](BETA_IMPLEMENTATION_REPORT_HU.md). Backup/restore, valós DB-kiesésből admin recovery és email-kézbesítés még nyitott. P09 privát előnézeti alap kész, Discovery/publishing/Official seed/public fork még fejlesztendő. Main/CI nem éles Contabo-deploy. A jelenlegi és a hátralévő Contabo-ops részleteit a [végrehajtási riport](CONTABO_PREPARATION_REPORT_HU.md) választja szét. Éles AI-allowance nincs kijelölve; a mintakonfigurációban nulla.

## Az OpenAI 5 USD fejlesztői keret

| Lezárt sorozat | Kérés | Tokenalapú becsült költség USD |
|---|---:|---:|
| V1 magyar alapok és ágak | 18 | 0,6299505 |
| Korábbi modellvizsgálat | 14 | 0,0542136 |
| V1 angol/magyar nyelvi próbák | 12 | 0,3352520 |
| V2 EN/HU Sol/Luna, három időszak | 38 | 0,577744805 |
| Új valódi Auth/AI HTTP- és böngészős próba (megszakadt hívással együtt) | 16 | 0.278277000 |
| Két valódi izolált Shared friend Sol-minta | 2 | 0.023752000 |
| S3 kezdeti elutasított és pontosított Shared/personal próbák | 7 | 0.119301200 |
| Megszakadt kétfiókos Auth előkészítés | 6 | 0.0824209 |
| Sikeres teljes Auth/Shared/saját AI lánc | 13 | 0.1698351 |
| P09 valódi angol privacy AI-audit | 1 | 0.009006 |
| P09 privát szerkesztő valódi Auth/AI és két copy-review | 5 | 0.063175000 |
| P09 felületről indított valódi AI-review | 1 | 0.005243500 |
| **Összesen** | **133** | **2.348171605 ≈ 2.35** |
| **Konzervatívan elszámolt összeg** | | **2.433873375** |
| **Guard szerint megmaradt keret** | | **2.566126625 ≈ 2.57** |

Ismeretlen fogyasztású kérés nincs. Ezek dátumozott tokenbecslések, nem lekérdezett szolgáltatói kreditegyenleg. A teljes korábbi napló megmarad .local/ai-smoke/usage.json alatt. Smoke és opcionális helyi alkalmazás-worker egy paid-run.lock fájlt használ; kérés előtt bemeneti/maxkimeneti foglalás, ismeretlen fogyasztásnál teljes plafon marad. Az 5 USD összesített, nem futtatásonkénti keret.

Sol az alap minden szerepben. Luna eseménymodell a kis v2 mintában körülbelül 46–63% kisebb teljeslánc-költséget mutatott, egy angol fejezetjavítással; nem állítottuk át az alkalmazást; új routinghoz továbbra angol teljeslánc-mérés és dokumentált minősítés szükséges. A kézi indulási kaput a felhasználó kiadás utáni visszajelzésre cserélte. [Hivatalos árlista](https://developers.openai.com/api/docs/pricing?tab=suite), ellenőrizve 2026-10-03.

50–100 Official Life és 20–30 Scenario az indulás célja, nem automatikus paid megbízás. Előbb kurált kis v2 seed, megfelelő költségkeret és privacy/minőségi kapu kell. Olvasás/újratöltés/nyelvváltás/Save/Share nem indíthat AI-generálást.

## Külön Claude-kutatási keret és auditor

Új felhasználói döntés: további **5 USD kizárólag Claude-mérésekre**, saját .local/claude-audit/usage.json és paid-run.lock naplóval. 50 HTTP-generálási kísérlet, 48 ismert usage; ismert tokenköltség 1.7691169 USD, konzervatív összeg 2.338015 USD, guard szerint maradt **2.661985 USD**. Két kezdeti usage nélküli HTTP 400 teljes foglalása megmaradt. A fenti OpenAI és ez a Claude keret külön napló, nem összevont vagy futtatásonként új 5 USD.

Négy Claude-modell, EN/HU külső audit, ismert hibák, szereppróbák, token/cache/effort/outputlimit mérés. A fő Sol-minták kánonhűnek bizonyultak a Sonnet/Opus/Fable auditban; személyesség/kíváncsiság a korlátozott angol béta visszajelzésével mérendő. Sonnet a rutin auditor jelöltje, Opus vitás mintavételhez; Haiku narrátor/esemény alapnak nem minősített. [Teljes Claude-riport](CLAUDE_MODEL_EVALUATION_HU.md), [történeti észrevételek](examples/CLAUDE_EXTERNAL_AUDIT_HU.md). A worker routingja továbbra Sol; Claude csak külön szerveroldali értékelő. A korábbi 147 teszt az eredeti 139 mellé 8 fizetés nélküli Claude transport/budget/audit tesztet tartalmazott; az angol átállás további 6 regresszióval 153-re emelte a számot.

## Dátumozott előzmények — a későbbi bejegyzés felülírja a korábbi státuszt

Az alábbiak a sorrendet és az akkori ellenőrzés határát őrzik. A jelenlegi állapot a fenti táblázat; az első SSH-elutasítás, a 147/153-as tesztszám vagy a csak webes CI nem aktuális akadály.

### Angol kiadásra váltás

Felhasználói döntés: a magyar minták fogalmazási hibái miatt kizárólag angol indulás; EN/HU kézi előminősítés helyett AI szerkesztői döntés és éles visszajelzés. A nyelvválasztó, HU-cookie, új HU élet/draft és régi HU történetek API-elérése lezárva; a saját adatok exportja változatlanul teljes. Angol `DELETE ACCOUNT` megerősítés az API és a felület között egyezik. [Indulási terv](ENGLISH_RELEASE_PLAN_HU.md). Contabo a kijelölt éles szerver, domain: alterward.com (Cloudflare), bekötés később; Docker/Compose/Caddy konfiguráció előkészítve. Helyi fejlesztés folyik, éles deploy nem történt. Az új szintetikus Auth/AI próbák az eredeti megőrzött keretből futnak.

Az angol átállás ellenőrzése: `pnpm check` sikeres (formázás, típusellenőrzés, 153 teszt az akkori állapotban, teljes production build); kódból exportált két új angol v2 request-séma. Dokumentumhivatkozások, 21 témás manifest és immutable stratégiai források ellenőrizve. Helyi angol főoldal és adatkezelési felület böngészőben ellenőrizve, nyelvválasztó nélkül. Ez nem valódi belépéses vagy éles deploy-próba.

A későbbi Contabo-telepítéshez a nulla projekt- vagy userkeret most a korábbi pozitív DB-limit mellett is letiltja az új fizetős hívást. Ezt külön fizetés nélküli regresszió ellenőrzi; meglévő fogyasztási napló és számlalimit nem íródott át.

### 2026-10-04: új béta-szelet

159 teszt, formázás, típusellenőrzés és API/worker/Next production build sikeres. Valódi Auth/AI HTTP- és böngészős próba, privát feedback és session-mérés, új angol minta és validált Sonnet audit. [Részletes eredmény és korlátok](BETA_IMPLEMENTATION_REPORT_HU.md). Kijelentkezés/új belépés után mindkét fejezet és a választás visszaolvasható. A tényleges böngészős JSON-export ellenőrzött (1 élet, 2 fejezet, 2 feedback, 2 session). Minden szintetikus tesztfiók és ideiglenes credential fájl eltávolítva; takarítás után a feedback/mérési összesítés nullás. A szándékosan megszakított valós Auth-törlés után a tényleges recovery CLI sikeresen törölte a maradt DB-gráfot. Valós DB-kiesés és backup/restore továbbra külön próba. Contabo-csomag és Linux CI előkészítve, éles telepítés később.

2026-10-04: a 298bdca kódcommit GitHub ellenőrzése sikeres: frozen install, formázás, típusok, 159 teszt, teljes build, séma-drift; a Linux konténer buildje és production web indítása/healthcheck is sikeres. [CI-bizonyíték](https://github.com/Muzsy/future_flow/actions/runs/37164982359). Ez nem éles Contabo-telepítés.

2026-10-04: a felhasználó Contabo szerverauditot kért. [Részleges eredmény](CONTABO_SERVER_AUDIT_HU.md): SSH/80/443 elérhető; HTTP Caddy/308; IP-címes TLS nem igazolt. A megadott SSH-belépés elutasított, így CPU/RAM/tárhely/belső biztonság nem minősíthető. A saját Compose-proxy előtt a meglévő 80/443 használatot fel kell mérni. Helyi credential ACL szűkítve; szerverbeállítás nem változott, paid AI-hívás nem történt. Működő SSH-adatok után az audit folytatandó.

2026-10-04: külön felhasználói kérésre a jelenlegi fájlbeli jelszóval `root` belépést is egyszer próbáltunk; a hostkulcs egyezett, a hitelesítés elutasított. Belső auditparancs nem futott, szerverváltoztatás nem történt. A hibából nem állapítható meg külön a hibás jelszó és a szerveroldali root/jelszavas tiltás.

2026-10-04, későbbi sikeres folytatás: a második fájlbeli belépési párossal UID 0 SSH-hozzáférés és [belső audit](CONTABO_SERVER_AUDIT_HU.md) kész. Ubuntu 24.04.4, 4 vCPU/8 GB RAM, 4,91 GiB elérhető memória/71 GiB szabad tárhely: korlátozott bétára megfelelőnek tűnik. Docker 29.1.3/Compose v5.1.4, helyettesítő env-es YAML-parszolás sikeres; OpenAI/Auth és projekt CA-val Supabase DB TLS működik. Meglévő közös Caddy portfoglalása, három lejárt cert/egy kézfogási hiba, root/jelszavas SSH és megengedő helyi tűzfal, függő reboot/frissítések és nem igazolt teljes backup/restore az indulás előtti feladatok. Semmilyen szerverbeállítás nem változott, AI-költség nem keletkezett, éles deploy/futásmérés továbbra nincs. Ez felváltja a korábbi hozzáférési akadályt, az előzmény változatlanul visszakövethető.

2026-10-04, engedélyezett üzemeltetési folytatás: [Contabo előkészítési riport](CONTABO_PREPARATION_REPORT_HU.md). Külön védett Ed25519 SSH-kulcs telepítve, korábbi kulcs megmaradt. A felhasználó szerint csak ő használ jelszavas belépést; ezért időzített rollback mellett jelszavas/root-password SSH kikapcsolva, friss kulcsos kapcsolat sikeres és jelszavas kapcsolat elutasított, rollback-időzítő leállítva. SSH-reload történt, restart/reboot/tűzfalmódosítás nem. Hat konfiguráció és 19 proxy-storage fájl védett mentése, mind a 25 hash-e ellenőrzött; teljes backup/restore még nincs. Contabo Compose és meglévő proxy merge/adapt ellenőrzött, három szolgáltatás/2816 MiB/nyilvános alkalmazásport nélkül. [Új CI](https://github.com/Muzsy/future_flow/actions/runs/37194453326), a69e3b3: verify és container sikeres, 159 teszt, teljes build és séma-drift; izolált web/API/worker/proxy, hét és megismételt migráció, verified HTTPS/DB TLS, API 401, mindkét üres queue poll és worker megállás SIGKILL nélkül. Éles indítás, domain/TLS/karbantartás és külön éles AI-keret még feladat. AI-hívás és keretváltozás nem történt.

## 2026-10-04: Shared Context forrás és terv integrálva

A felhasználó új ZIP-je megőrizve és teljesen kibontva; 15 témadokumentum + master + manifest/checksum átolvasva, a 17 felsorolt fájl és az eredeti ZIP hash-e ellenőrzött. Az [aktív Shared terv](SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md), termékterv, backlog, 21 témadokumentum és követelménymátrix az S0–S7 fejlesztési szálat követi. Első helyi szelet S0, első kiadható friend funkció S2 valódi AI + S3 integráció/biztonság után.

**Tervezett, még nincs implementálva:** shared szerződés/DB/API/provider/queue/UI, social profile és entitlement. Jelenleg csak 001–007 migráció van, 159 korábbi teszt és két worker queue. Az új specifikáció nem emeli a tesztszámot, nem állít Shared-működést vagy deploymentet. Alkalmazáskód/séma/migráció/Contabo nem változott, fizetett AI-hívás és keretváltozás nem történt. A két kísérleti napló és a nulla éles allowance változatlan.

## 2026-10-04: Shared S0 implementáció

[S0 megvalósítás és korlátok](SHARED_CONTEXT_S0_REPORT_HU.md). A foundation szerződése, két additív migrációja és social/context/invite API-ja elkészült. Saját branch és minimális megosztás, szerver-entitlement, egyszeri token, cap/revision/idempotencia, lifecycle/admin-handover és account export/törlési recovery strukturális bővítése ellenőrzött. 36 új regresszió, jelenlegi készlet 195; Life v2 és 18 régi séma változatlan. A [d94e330 S0 CI](https://github.com/Muzsy/future_flow/actions/runs/37228496066) 194 teszttel, teljes build/séma-drift és container jobbal sikeres: valós PostgreSQL slot/tag race és ötcontextes deletion, kilenc migráció/ismétlés, verified TLS/HTTPS és worker-stop. A további 001–007 kompatibilitási regresszióval az [a20302f végső S0 CI](https://github.com/Muzsy/future_flow/actions/runs/37229799920) mind a 195 tesztet, teljes buildet, séma-driftet és a konténeres próbákat sikeresen ellenőrizte.

Fejlesztői Supabase 001–009 alkalmazva, megismételt runner és checksum egyezik. A felhasználó Session pooler kapcsolatával az IPv6 akadály megszűnt; a tényleges kliens TLS encrypted/authorized, mind a 13 új tábla RLS és közvetlen jog tiltott. Három valódi szintetikus Auth-fiók, 26 foundation HTTP/DB-ellenőrzés, valódi shared export/Auth+DB-törlés és teljes saját fixture-takarítás sikeres. S1 motor implementált; S2 következik, S2/S3 és privacy/moderáció kapu előtt Shared kikapcsolva. Contabo és az AI-keretek változatlanok.

## 2026-10-04: Shared S1 friend motor

[S1 megvalósítás és korlátok](SHARED_CONTEXT_S1_REPORT_HU.md). Egy immutable canon, tényleges saját intent, server deadline/participation, egyszeri opt-in resolution/pending memory, mások válaszának elrejtése és saját részvételi export elkészült. Leave/end/deleting megszakítja a függő döntést. 36 új célzott regresszió sikeres, jelenlegi készlet 231; teljes check és a [valós PostgreSQL/container CI](https://github.com/Muzsy/future_flow/actions/runs/37233779884) sikeres (`4e37715`). Új migráció/paid hívás/Contabo-változás nincs; normál Shared továbbra false. Következő S2 valódi Shared OpenAI, majd S3 személyes integráció/UI/biztonság.

## 2026-10-04: Shared S2 valódi AI

[S2 riport](SHARED_CONTEXT_S2_REPORT_HU.md): strict angol provider, safe input, server IDs/policy/deadline, egy repair, tartós interrupted marker, lease/checkpoint/restart és fair háromqueue-kör implementált. 29 új regresszióval 260 teszt és teljes check sikeres; 37 schema, a korábbi 35 és kilenc SQL változatlan. Két valódi izolált Sol shared pipeline sikeres, 2554 input +1737 outputtoken, repair nélkül; 0.023755 USD guard-fogyasztás, OpenAI maradvány 3.051006625 USD. Claude változatlan. [Main/container CI](https://github.com/Muzsy/future_flow/actions/runs/37236552164) sikeres (`8b3a409`). Következő S3 lazy personal memória/AI-folytatás, Connections és privacy/Auth/deletion/moderáció; feature false, Contabo nem változott.


### 2026-10-05: Shared S3 személyes/time szelet

A saját történet függő közös döntés mellett is folytatható. A később lezárt esemény eredeti effectiveAt dátuma és az ág knownAt dátuma külön marad; a következő saját mutation egyszer veszi át, régi fejezetet/futó vagy retryolt jobot nem módosít. Fork csak a forkpontig ismert saját memóriát kap, élő tagság nélkül. Új közös generálás és accept azonos naptári hónap/latest-anchor szabályt használ; eltérő hónap elutasítva, személyes catch-up nincs. [S3 riport](SHARED_CONTEXT_S3_REPORT_HU.md), [angol minta](examples/AI_SHARED_PERSONAL_ENGLISH_SAMPLE.md), [Claude-audit](examples/AI_SHARED_PERSONAL_CLAUDE_AUDIT_HU.md). 279 teszt/24 fájl és teljes check/build sikeres; 39 schema és 010 alkalmazva/ismételve. Új guard 0.1451425 USD, naplók folytatódnak. Connections angol felület, block/report/moderáció, retained próza PII-redakció/retention és teljes valódi fiókos Shared→saját AI→export/törlés/recovery még S3 kapu. A határidő kiadási alapértéke és entitlement/billing külön döntés; üres deadline mindenkit megvár, 48h javaslat. Mind a négy Shared flag false, Contabo-élesítés később.


## Shared S3: Connections és biztonság — 2026-10-05

Angol Connections, block/report/moderáció és 011/012 elkészült; ezek dátumozott korábbi bizonyítéka megmarad. A későbbi privacy/Auth szelet felülírja az akkori „megjelenítési döntés/full Auth még hiányzik” státuszt: S0–S2 és S3 személyes/time/Connections/safety/privacy implementált; teljes kétfiókos Auth/Shared AI/saját AI/export/törlés/recovery sikeres. 001–013 alkalmazva, normál Shared flag-ek false. Nyers/backup-retention, régi személyes próza, billing/grace/deadline és friend release még kapu; P09–P13 és S4–S7 megmarad. A felhasználó az érintett közös szöveg elrejtését, a dátum és eredmény megtartását választotta. Új 013 stale-input cancellation és explicit friss retry; a P09 előnézet külön Shared privacy review-t kér. [Részletes megvalósítás, költség és korlát](SHARED_CONTEXT_S3_PRIVACY_AUTH_REPORT_HU.md).


## 2026-10-05: P09 AI-ellenőrzés és megvásárolt domain

[Privát AI-pre-screen](PUBLIC_AI_REVIEW_REPORT_HU.md): kizárólag az előkészített angol copy, immutable hash/revision/policy és receipt, egyszeri operatori futás és saját olvasási API, export/törlés. Egy valódi Sol-negatív kontroll öt privacy-jelzést adott; nincs publikálási/Official jóváhagyás. A 014 migráció a fejlesztői Supabase-on alkalmazva és ismételve. Az alterward.com aktív Cloudflare-domain; a DNS még üres, TLS Full, éles bekötés nem történt. Következő: Privacy/Content Preview és curator/Publication/Confirm, majd P10–P13; S3 retention és S4–S7 továbbra megmarad.


## 2026-10-05: szerkeszthető privát Privacy/Content Preview

A [privát angol szerkesztő](PUBLIC_PREVIEW_EDITOR_REPORT_HU.md) elkészült: saját forrásszöveg, mezőszintű ingyenes preflight, idempotens immutable mentés, legutóbbi érvényes copy visszatöltése és teljes mentett tartalomnézet. Az operatori AI-review csak a megfelelő hash/revision és mezőkészlet mellett látható; finding a javítandó mezőre mutat. Mentés/olvasás nem hív AI-t, Shared-előzmény és HU továbbra tiltott. Helyi teljes check: 314 teszt/27 fájl, 48 séma, a korábbi 44 és 001–014 változatlan. Következő a külön fizetett scan-job költségőrrel, curator/ScenarioVersion/sanitized fork-checkpoint/Publication/Confirm; majd P10–P13. Éles bekötés továbbra nincs.


## 2026-10-05: felületről indítható privát AI-review

A felületről indítható P09 fizetett AI-review elkészült: explicit hozzájárulás, tartós queue/lease, egy attempt/immutable copy, közös projekt/user költségőr, egy pending job/user és gördülő napi kvóta. Újraolvasás/dupla kérés ingyenes, elveszett lease és provider-hiba nem indít automatikus fizetett retryt. 015 alkalmazva/ismételve a fejlesztői DB-n; English/Shared/tulajdonosi/hash/revision kapu és export/törlés integrált. Main CI sikeres: 324 teszt/28 fájl, 50 séma; a korábbi 48 és 001–014 változatlan. A normál feature false, éles allowance 0; publicationApproved false. Következő curator/ScenarioVersion/sanitized fork-checkpoint/Publication/Confirm/Official seed, majd P10–P13; S3 retention, S4–S7 és Contabo/Cloudflare élesítés megmarad. [Megvalósítás és pontos korlátok](PUBLIC_REVIEW_JOB_REPORT_HU.md).


### P09 review-job lezárási bizonyíték

[Main CI](https://github.com/Muzsy/future_flow/actions/runs/37353253492) runtime `33bea6fb3ca70b8c722f6c315db810ec8076bab5`: verify és container sikeres. 324 teszt/28 fájl, formázás, típusellenőrzés, API/worker/Next production build és 50 séma-drift. Izolált valós PostgreSQL/TLS: 001–015 + ismétlés, párhuzamos három review-enqueue → egy job és két claim → egy nyertes, eredmény-újrahasználat, lejárt lease automatikus retry nélkül, törlési marker/visszaállítás/export/cascade/RLS és minden korábbi S0–S3 proof. Web/API/Caddy verified HTTPS/DB TLS, üres négy queue és worker tiszta 0-s leállás, nulla provider-AI és valódi CI-kulcs, egress tiltva.

Valódi Supabase Auth/böngészős kliens → queue → worker → OpenAI ellenőrzés sikeres: egy Sol-hívás, no_findings/0 finding, publicationApproved false. A korábban valóban AI-val generált időszak csak technikai replay-forrás volt, nem új paid generálás vagy AI nélküli termékmód. Hozzájárulás és queued-státusz látható; reload/refresh ugyanazt az eredményt használja, dirty copy elrejti azt és az indítást, source reload az eredeti mentett szöveget hozza vissza. Saját export elkészült, szintetikus Auth/DB-fiók és jobok törölve, credential fájl hiányzik, 3200/4200 tesztport leállt.

Új OpenAI-költségbecslés 0.005243500 USD, konzervatív 0.005245000 USD. Kumulatív 133 hívás, 2.348171605 USD becslés, 2.433873375 USD guard-összeg; maradt 2.566126625 USD, ismeretlen usage 0. Claude változatlan: maradt 2.661985 USD. Naplók nem nullázva.


## 2026-10-05: tulajdonosi beküldés és text-curation

A P09 tulajdonosi beküldés és trusted text-curation nyilvántartás elkészült: explicit consent, aktuális immutable copy és no_findings AI-review, idempotens beküldés, védett operatori lista/döntésfájl, egyszeri változatlan döntés, English/Shared/ownership/revision/hash/expiry/törlés kapu, export/cascade és 016 RLS-migráció. Scope text_only, publicationApproved false. Teljes ScenarioVersion/sanitized fork-checkpoint és azok ellenőrzése, Publication/Confirm/Official eredetengedély/seed még hátravan; majd P10–P13. Main CI `4d66981` sikeres: 336 teszt/29 fájl, formázás, típusellenőrzés, API/worker/Next production build és 52 séma-drift. Izolált valódi PostgreSQL/TLS: 001–016 + ismétlés, párhuzamos curation-submit és versengő döntés → egy nyertes, azonos apply újrahasználata, revision/törlés/RLS/export/cascade és publication=false; minden korábbi P09/S0–S3 proof megmarad. Konténeres web/API/worker/Caddy verified HTTPS/DB TLS, üres queue és tiszta worker-leállás, nulla provider-AI/valódi CI-kulcs, egress tiltva. [Main CI](https://github.com/Muzsy/future_flow/actions/runs/37358126556). 52 séma, a korábbi 50 és 001–015 változatlan; fejlesztői DB 001–016 alkalmazva/ismételve, 19 ff_ és 36 aw_/36 RLS. Új AI-hívás nincs; a közös OpenAI/Claude keretek, S3 retention/S4–S7 és Contabo/Cloudflare kapuk megmaradnak. [Kurátori szövegellenőrzés és pontos korlátok](PUBLIC_TEXT_CURATION_REPORT_HU.md).


## 2026-10-05: teljes ScenarioVersion foundation

A P09 teljes angol ScenarioVersion foundation elkészült: külön zárt scenario-1 sablon, immutable/hash/verziózott saját tárolás, friss belső ID-k és teljes cél/állapot/korlát-hivatkozások, explicit indításból normál AI-job és közös kvóták, export/cascade. 017 alkalmazva/ismételve, 19 ff_ és 39 aw_/39 RLS; 354 helyi teszt/30 fájl és teljes check/build, 57 séma, a korábbi 52 és 001–016 változatlan. Két valódi szintetikus Auth/DB HTTP-fiók: ownership/anon, verzió/replay/start és három technikai időszak, export/tényleges törlés sikeres; új paid AI 0. Normál/deploy SCENARIO_VERSIONS_ENABLED=false, publicationApproved=false, saját előkészítő API, scenario UI/public permission még nincs. Következő sanitized fork-checkpoint, teljes structured preview/review, Publication/Confirm/Official seed, majd P10–P13. A három forrás minden követelménye, 50–100 élet/20–30 scenario cél, külön 5–5 USD keret, S3 retention/S4–S7 és Contabo/Cloudflare kiadási kapuk megmaradnak. [Részletes megvalósítás](SCENARIO_VERSION_REPORT_HU.md).
