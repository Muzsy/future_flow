# alterward — megvalósítási állapot és kísérleti keret

2026-10-04 · [Megvalósítási riport](V2_IMPLEMENTATION_REPORT_HU.md) · [Sorrend](NEXT_STEPS.md) · [Lokalizáció](LOCALIZATION_HU.md).

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
| Supabase | 001–007 alkalmazva, 008/009 implementálva/izoláltan tesztelt, Session pooler cím hiányában alkalmazás függő; ellenőrzött TLS, minden aw_ tábla RLS, anon/authenticated közvetlen hozzáférés tiltva |
| Export/törlés | Teljes privát v1/v2 gráf, worker-stop, durable Auth/DB recovery; valódi szintetikus Auth/DB-törlés sikeres; valós DB-kiesésből recovery/backup még nyitott |
| Contabo-előkészítés | Kulcsos SSH és jelszavas tiltás kipróbálva; 25 védett config/storage másolat hash-e egyezik; elkülönített Compose és meglévő proxy merge/adapt sikeres; éles route/alkalmazás nincs |
| Runtime CI | `a69e3b3` commit: 159 teszt/build/séma-drift és teljes izolált web/API/worker/Caddy, 001–007 + ismételt migráció, verified DB TLS/HTTPS, üres queue/leállítás; [CI](https://github.com/Muzsy/future_flow/actions/runs/37194453326) |
| Shared S0 | Külön contract/core, 13 RLS-tábla, profil/entitlement/meghívás és lifecycle API; 35 új regresszió, mind a négy flag kikapcsolva, valódi AI/UI S2/S3 |
| Mérési alap | Privát feedback, szerveroldali 30 perces session, fejezetvég-kohorsz és sikeres/későbbi folytatás; [definíciók](BETA_FEEDBACK_AND_METRICS_HU.md) |

## Bizonyíték és hiányzó kapuk

194 teszt a jelenlegi készletben, köztük 35 új Shared regresszió; az S0 ellenőrzések részletei a [S0 megvalósítás és korlátok](SHARED_CONTEXT_S0_REPORT_HU.md) dokumentumban. A korábbi 159 teszt bizonyítéka: 20 determinisztikus teszteset ×3 időszak és állapot/jogosultság/lease/retry/költség/export/törlés. Négy valódi AI-lánc ×3 időszak (EN/HU, Sol/Luna eseménymodell), schema/domain/fidelity sikerrel. [Modellmérés](AI_V2_ROUTING_REPORT_HU.md) és [angol](examples/AI_V2_ENGLISH_STORY.md)/[magyar](examples/AI_V2_HUNGARIAN_STORY.md) minták. Ez négy generatív eset, nem húsz; emberi minőség/retenció nincs bizonyítva.

Valódi szintetikus Supabase/Auth/DB/OpenAI HTTP-hurok és tényleges fióktörlés sikeres, admin kulcs már rendelkezésre áll. Böngészőben angol onboarding, draft-visszaállítás, első fejezet/döntés/második fejezet és mindkét feedback mentése ellenőrizve. [Aktuális béta-riport](BETA_IMPLEMENTATION_REPORT_HU.md). Backup/restore, valós DB-kiesésből admin recovery és email-kézbesítés még nyitott. P09 privát előnézeti alap kész, Discovery/publishing/Official seed/public fork még fejlesztendő. Main/CI nem éles Contabo-deploy. A jelenlegi és a hátralévő Contabo-ops részleteit a [végrehajtási riport](CONTABO_PREPARATION_REPORT_HU.md) választja szét. Éles AI-allowance nincs kijelölve; a mintakonfigurációban nulla.

## Az OpenAI 5 USD fejlesztői keret

| Lezárt sorozat | Kérés | Tokenalapú becsült költség USD |
|---|---:|---:|
| V1 magyar alapok és ágak | 18 | 0,6299505 |
| Korábbi modellvizsgálat | 14 | 0,0542136 |
| V1 angol/magyar nyelvi próbák | 12 | 0,3352520 |
| V2 EN/HU Sol/Luna, három időszak | 38 | 0,577744805 |
| Új valódi Auth/AI HTTP- és böngészős próba (megszakadt hívással együtt) | 16 | 0.278277000 |
| **Összesen** | **98** | **1.875437905 ≈ 1.88** |
| **Konzervatívan elszámolt összeg** | | **1.925238375** |
| **Guard szerint megmaradt keret** | | **3.074761625 ≈ 3.07** |

Ismeretlen fogyasztású kérés nincs. Ezek dátumozott tokenbecslések, nem lekérdezett szolgáltatói kreditegyenleg. A teljes korábbi napló megmarad .local/ai-smoke/usage.json alatt. Smoke és opcionális helyi alkalmazás-worker egy paid-run.lock fájlt használ; kérés előtt bemeneti/maxkimeneti foglalás, ismeretlen fogyasztásnál teljes plafon marad. Az 5 USD összesített, nem futtatásonkénti keret.

Sol az alap minden szerepben. Luna eseménymodell a kis v2 mintában körülbelül 46–63% kisebb teljeslánc-költséget mutatott, egy angol fejezetjavítással; nem állítottuk át az alkalmazást; új routinghoz továbbra angol teljeslánc-mérés és dokumentált minősítés szükséges. A kézi indulási kaput a felhasználó kiadás utáni visszajelzésre cserélte. [Hivatalos árlista](https://developers.openai.com/api/docs/pricing?tab=suite), ellenőrizve 2026-10-03.

50–100 Official Life és 20–30 Scenario az indulás célja, nem automatikus paid megbízás. Előbb kurált kis v2 seed, megfelelő költségkeret és privacy/minőségi kapu kell. Olvasás/újratöltés/nyelvváltás/Save/Share nem indíthat AI-generálást.

## Külön Claude-kutatási keret és auditor

Új felhasználói döntés: további **5 USD kizárólag Claude-mérésekre**, saját .local/claude-audit/usage.json és paid-run.lock naplóval. 49 HTTP-generálási kísérlet, 47 ismert usage; ismert tokenköltség 1.7526709 USD, konzervatív összeg 2.318045 USD, guard szerint maradt **2.681955 USD**. Két kezdeti usage nélküli HTTP 400 teljes foglalása megmaradt. A fenti OpenAI és ez a Claude keret külön napló, nem összevont vagy futtatásonként új 5 USD.

Négy Claude-modell, EN/HU külső audit, ismert hibák, szereppróbák, token/cache/effort/outputlimit mérés. A fő Sol-minták kánonhűnek bizonyultak a Sonnet/Opus/Fable auditban; személyesség/kíváncsiság a korlátozott angol béta visszajelzésével mérendő. Sonnet a rutin auditor jelöltje, Opus vitás mintavételhez; Haiku narrátor/esemény alapnak nem minősített. [Teljes Claude-riport](CLAUDE_MODEL_EVALUATION_HU.md), [történeti észrevételek](examples/CLAUDE_EXTERNAL_AUDIT_HU.md). A worker routingja továbbra Sol; Claude csak külön szerveroldali értékelő. A korábbi 147 teszt az eredeti 139 mellé 8 fizetés nélküli Claude transport/budget/audit tesztet tartalmazott; az angol átállás további 6 regresszióval 153-re emelte a számot.

## Dátumozott előzmények — a későbbi bejegyzés felülírja a korábbi státuszt

Az alábbiak a sorrendet és az akkori ellenőrzés határát őrzik. A jelenlegi állapot a fenti táblázat; az első SSH-elutasítás, a 147/153-as tesztszám vagy a csak webes CI nem aktuális akadály.

### Angol kiadásra váltás

Felhasználói döntés: a magyar minták fogalmazási hibái miatt kizárólag angol indulás; EN/HU kézi előminősítés helyett AI szerkesztői döntés és éles visszajelzés. A nyelvválasztó, HU-cookie, új HU élet/draft és régi HU történetek API-elérése lezárva; a saját adatok exportja változatlanul teljes. Angol `DELETE ACCOUNT` megerősítés az API és a felület között egyezik. [Indulási terv](ENGLISH_RELEASE_PLAN_HU.md). Contabo a kijelölt éles szerver, domain később; Docker/Compose/Caddy konfiguráció előkészítve. Helyi fejlesztés folyik, éles deploy nem történt. Az új szintetikus Auth/AI próbák az eredeti megőrzött keretből futnak.

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

[S0 megvalósítás és korlátok](SHARED_CONTEXT_S0_REPORT_HU.md). A foundation szerződése, két additív migrációja és social/context/invite API-ja elkészült. Saját branch és minimális megosztás, szerver-entitlement, egyszeri token, cap/revision/idempotencia, lifecycle/admin-handover és account export/törlési recovery strukturális bővítése ellenőrzött. 35 új regresszió, jelenlegi készlet 194; Life v2 és 18 régi séma változatlan. A Linux PostgreSQL concurrency próba CI-ben készül ellenőrzésre.

Fejlesztői Supabase-ra 008/009 még nem alkalmazott: Auth health 200, direct DB IPv6 címre helyben nincs útvonal (`ENETUNREACH`/`ENOTFOUND`), Session pooler host bekérve. A failed migration kapcsolat előtt megállt. S1 fejlesztés függetlenül folytatható; S2/S3 és privacy/moderáció kapu előtt Shared feature kikapcsolva. Contabo és az AI-keretek változatlanok.
