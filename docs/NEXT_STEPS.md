# alterward — következő lépések, sorrendben

[Dokumentációs központ](README.md) · [Közös státusz és keret](STATUS_HU.md) · [A három forrás visszakövetése](REQUIREMENTS_TRACEABILITY_HU.md).

2026-10-05 · A [pozicionálás](PROJECT_POSITIONING_AND_GOAL_DEFINITION_HU.md), a [közösségi specifikáció](PUBLIC_LIVES_DISCOVERY_COMMUNITY_SPEC_HU.md) és az új [Shared Context specifikáció](plans/README.md) alapján bővített backlog. A célállapot részletes leírása az [aktív termékterv](PRODUCT_PLAN_HU.md); a meglévő működés az [implementációs dokumentumban](IMPLEMENTATION.md) szerepel. P01–P05 technikai mag elkészült; P06 valódi Auth/AI HTTP-próba kész, ops még nyitott; P07 új angol minta auditálva, P08 visszajelzés és session-mérés elkészült. [2026-10-04-i béta-riport](BETA_IMPLEMENTATION_REPORT_HU.md). [Részletes bizonyíték](V2_IMPLEMENTATION_REPORT_HU.md).

## Kiinduló állapot

V2 12 lépéses onboarding, hat hónapos valódi AI, choice/folytatás/történeti fork, memória/javítás és közös költségőr integrált. Supabase 001–015 alkalmazva és ismétléssel ellenőrizve; main CI check/build: 324 teszt/28 fájl, 50 schema, a korábbi 48 változatlan; [33bea6f CI](https://github.com/Muzsy/future_flow/actions/runs/37353253492) sikeres. P09 privát AI-pre-screen és izolált PostgreSQL review-verseny/törlési próba is sikeres. Korábbi determinisztikus és valódi AI-minták megmaradnak. [Státusz](STATUS_HU.md), [P09 bizonyíték](PUBLIC_AI_REVIEW_REPORT_HU.md).

Valódi szintetikus Supabase-fiókos Auth/DB/OpenAI HTTP-próba és tényleges fióktörlés sikeres; backup/restore és éles telepítés nyitott. A felhasználó angol bétát és kiadás utáni visszajelzéseket választott, indulás előtti kézi EN/HU minősítést nem kér. Auth/ops és automatikus kánonellenőrzés továbbra szükséges; a későbbi public alap előkészíthető, aktiválás nem minősül késznek.

2026-10-04-i [Contabo-audit](CONTABO_SERVER_AUDIT_HU.md): a második belépési párossal sikeres belső olvasási vizsgálat; 4 vCPU/8 GB RAM, körülbelül 4,91 GiB elérhető memória és 71 GiB szabad tárhely, külső API/Auth és saját CA-val DB TLS rendben. Az auditban rögzített SSH- és csomagolási feladatok az alábbi előkészítésben már elkészültek. Hátravan a tűzfal/TLS, teljes mentés/restore, karbantartás és későbbi éles futás ellenőrzése. A saját proxy 80/443 kötése ütközne; élesítés még nem történt.

Az audit utáni [előkészítés](CONTABO_PREPARATION_REPORT_HU.md): külön SSH-kulcs telepítve és többször próbálva, jelszavas belépés kikapcsolva a felhasználó tisztázása után. Védett konfiguráció- és proxy-storage mentés készült, 25 fájl hash-e egyezik. A külön háromszolgáltatásos Contabo-csomag szerveroldali preflightja, meglévő proxy-Compose merge és Caddy adapt sikeres; összesen 2816 MiB korlát, nincs nyilvános alkalmazásport. A teljes konténeres CI-próba is sikeres: web/API/worker/proxy, izolált DB TLS/migrációk és üres worker-leállítás. Éles alterward még nem fut. Az élesítési ág következő feladata: aktív meglévő domain/TLS helyreállítása, tűzfal és teljes backup/restore, egyeztetett karbantartás, majd saját domain és külön éles AI-keret mellett telepítés.

## Új helyi fejlesztési szál — Shared Context S0–S7

**Állapot:** S0–S2 és S3 személyes/time/Connections/safety/privacy implementált; teljes kétfiókos Auth/Shared AI/saját AI/export/törlés/recovery sikeres. 001–013 alkalmazva, normál Shared flag-ek false. Nyers/backup-retention, régi személyes próza, billing/grace/deadline és friend release még kapu; P09–P13 és S4–S7 megmarad. [Aktuális bizonyíték](SHARED_CONTEXT_S3_PRIVACY_AUTH_REPORT_HU.md).

| Pont | Következő eredmény                                                                              | Függőség / kapu                                                                          |
| ---- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| S0   | Implementáció kész: Shared contract/core, 008/009, social/entitlement, create/list/detail/invite/accept és lifecycle | 36 új regresszió, flag kikapcsolva; 001–009 a fejlesztői DB-n alkalmazva; még nincs release |
| S1   | Implementált: 2–10 fős friend canon, saját intent, opt-in resolution, pending memory impact        | S0; izolált fixture-tesztek, nem felhasználói AI nélküli demo                            |
| S2   | Implementált: valódi Shared OpenAI, job/worker fair queue, validálás/repair, projekt/user költség             | S1; lease/idempotencia és kumulatív keret, max 1 repair                                  |
| S3   | **Részben kész:** saját memória/AI/fork/export/törlés/time, angol Connections, block/report/moderáció; közös szövegprojekció és teljes kétfiókos Auth/AI/recovery is kész; nyers/backup-retention és régi személyes próza még kapu | S2; PII/retention/recovery és valódi fiókos próba; friend release csak utána |
| S4   | Connected romantikus típus                                                                      | S3; 2 tag, max 1/user, mutual consent és unilateral end                                  |
| S5   | Connected work/project és hobby                                                                 | S3 és típusos governance; saját intent, validált authority/adapter                       |
| S6   | World sport, max 20, roster/subset/quorum                                                       | S5 szerep/governance; 20 párhuzamos intent és lock-verseny                               |
| S7   | Split/group fork, sponsored seats, directory, public többfél-snapshot                           | Validált shared alap; public résznél P09–P13 és külön consent, későbbi scope             |

A shared szál S0→S1→S2 elkészült helyben, S3 személyes/time és UI/safety kész, szövegprojekció és kétfiókos Auth/AI/recovery is kész; nyers/backup-retention és régi személyes próza még kapu; a további típusok fokozatosan követik a friend ellenőrzését. P09–P13 továbbra a teljes nyilvános MVP része, nem kell S7-ig várnia; a shared adatot tartalmazó publikációhoz előbb a P09/P11 általánosítás/PII/fork kapuit bővítjük. P06 backup/restore/email/valós kiesés és a későbbi Contabo-ops továbbra kiadási feladat, nem akadálya a helyi foundation fejlesztésének.

S0–S3 helyi fejlesztéshez nincs domainszükséglet. Entitlement megbízható szerverforrás/billing, grace/downgrade és kiadási deadline még döntés. 008/009 foundation, 010 személyes memória, 011 szelektív törlés, 012 moderáció és 013 privacy-input invalidálás alkalmazva/ismételve; mind immutable. S3 compatible-month/latest-anchor kész; nincs személyes catch-up. Owner invite 20/24h és 7 napos token. A közös retained próza megjelenítése és teljes kétfiókos Auth/AI/recovery ellenőrzött; nyers/backup-retention, korábbi személyes próza kezelése még kiadási kapu.

## L01 — Többnyelvű alap, felhasználói elsőbbséggel

**Elkészült:** kizárólag angol kiadás, magyar elrejtve; teljes felület/kérdőív/API-hibák; nyelvregiszter és típusos katalógus; régi magyar cookie angolra szűkítése; mentett tartalomnyelv és jobnyelv; nyelvre utasított esemény/narrátor/ellenőrző. A v2 életbemenet is kötelező `locale` mezőt kapott. Régi életek magyar jelölést kapnak, canonjuk változatlan. [Megvalósítás és további nyelvek](LOCALIZATION_HU.md).

**Minden további P- és S-pont feltétele:** teljes angol élmény; magyar halasztva. P02/P07 az angol generálást és AI/szerkesztői minőséget ellenőrzi. A nyelvváltás ne módosítson választ/korábbi canont és ne indítson fizetett AI-hívást. Discovery/Scenario/snapshot/fork tartalomnyelve is külön mező legyen.

## P01 — Időszak, identitás, cél és állapot szerződése

**Aktuális állapot:** Kész: 003 tárolás, immutable canon/choice/history, ownership/RLS, revision/idempotencia/lease.

**Feladat:** verziózott v2-sémák rövid időszakhoz, saját/alternatív identitáshoz, a cél mezőihez, tartós szereplőkhöz, tényszerű állapotváltozásokhoz és időben érvényes korlátokhoz. Válasszuk külön a környezeti kontextust a szimulált élet állapotától. Készüljön additív `003+` migráció az időszakhoz, ág aktuális állapotához/revisionjéhez, választáshoz és folytatási jobhoz.

**Elfogadás:** a mai migráció változatlan ellenőrzőösszeggel alkalmazható. A régi életek/hash-ek változatlanul visszaolvashatók. Állásváltás és tulajdonlás megszűnése ténylegesen módosítja a megfelelő mezőt; lejárt/ágon kívüli korlát nem válik örök tiltássá. A v1-ről v2-re indulás explicit új élet/másolat, ellenőrzött kezdőállapottal.

**Függőség:** nincs; szerződés/domain/tárolás elkészült. A kérdőív és a további API-k erre épülnek. A későbbi nyilvános snapshot/fork külön sanitized állapotot igényel; nem nyitjuk meg a privát v2 canont.

## P02 — Első rövid AI-időszak

**Aktuális állapot:** Kész: hat hónapos valódi AI, 2–5 esemény, 250–600 szó; négy EN/HU lánc ×3 időszak.

**Feladat:** kezdetben hat hónap, 2–5 esemény, egy 250–600 szavas angol fejezet a mentett tartalomnyelven és a végén egy érdemi döntés. A domainmotor validálja a strukturált AI-javaslatokat, majd a narrátor a canonból ír. A még meg nem hozott választás utáni események nem kerülhetnek a mentett jövőbe.

**Elfogadás:** szintetikus profilból valódi AI-fejezet és választási lehetőség készül. Az események időrendje, hivatkozásai, szereplői és kemény korlátai helyesek. A feladat megáll a döntésnél; a régi tízéves generálás nem fut az új élet alatt.

**Függőség:** P01; minden fizetett próba a megmaradt kereten belüli előzetes foglalással indul.

**Modellmérés:** Luna és Sol összevetése a rövid időszakos szerződésen, azonos profil/állapot/cél mellett. Narrátor és végső ellenőr kezdetben Sol; a modellválasztási próba miatt a checker már külön beállítható.

## P03 — Döntés, folytatás és külön történeti fork

**Aktuális állapot:** Kész: aktuális választás, same-branch folytatás és saját történeti fork külön művelet.

**Feladat:** külön művelet az aktuális döntéshez, ugyanazon ág folytatásához és egy korábbi döntésből másik ág indításához. Döntés és azonnali következmény egyszer, atomikusan mentendő; a következő időszak innen indul. Áganként egy aktív generálás, állapotrevision, idempotenciakulcs és folyamatos esemény/fejezetsorszám kell.

**Elfogadás:** három egymást követő időszak ugyanazon ágon marad. Függő döntés mellett nem keletkezik választás utáni canon. Dupla kérés ugyanazt a jobot adja; elavult revision 409. Újraindítás után a mentett állapot és checkpoint használható, elveszett lease nem commitol. Régi döntés másik opciója új ágat nyit, a szülő visszaolvasott hash-e változatlan.

**Függőség:** P01–P02. A régi v1 resolve jelentését verziózott API őrzi.

## P04 — Rövid onboarding és visszatérési felület

**Aktuális állapot:** Kész kód: 12 lépés, revisionös draft, visszatérés/idővonal. Valódi fiókos UI-próba P06.

**Feladat:** 10–15 kérdés profilhoz és egy fő célhoz; strukturált mag, vezetett kérdések, opcionális szabad kontextus. Saját/alternatív identitás, nulla kapcsolat és ismeretlen opcionális adat kezelése. Piszkozat automatikus mentése revisionnel. Kezdőfelület a mentett élettel, utolsó helyzettel, függő döntéssel és „Folytatom ezt az életet” művelettel; idővonal és külön „Másik ág innen”.

**Elfogadás:** új felhasználó hosszú trait-kitöltés nélkül eljut az első történethez és folytatja. Frissítés, kijelentkezés és későbbi belépés után nincs adatvesztés vagy csendes felülírás. Alternatív élet nem módosítja a saját profilját. A 3–4 perces profil és körülbelül tízperces első élmény mérési célként látszik a használati próbában.

**Függőség:** a szerződés P01; a teljes felület elfogadásához P02–P03. A további profilrészletek fokozatosan kérdezhetők be.

## P05 — Emlékezet, célzott javítás és alkalmazásszintű költségőr

**Aktuális állapot:** Kész: állapot/közeli canon/választás memória, egy célzott javítás, project/user és helyi közös keret.

**Feladat:** a következő időszak bemenete az aktuális állapot, mentett választások, közeli események és releváns korábbi tények legyen. Canonra hivatkozó összefoglaló, legfeljebb egy automatikus célzott javítás, biztonságos manuális retry. Projektszintű/felhasználói keret, párhuzamos költségfoglalás és sikeres/hibás/ismeretlen hívások elszámolása.

**Elfogadás:** korábbi választás következménye a harmadik időszakban is megmarad; eladott vállalkozás nem kerül vissza tulajdonba. Narratívahiba megtartja a már érvényes eseményeket. Keretkimerülés vagy ismételt hiba látható és nem indít újabb fizetett próbát. A mérés nem igényli a teljes történet újraküldését vagy személyes promptok naplózását.

**Függőség:** P01–P03. A költség és retry alapvédelme már P02–P03 közben kötelező; a teljes alkalmazáskeretőr a zárt felhasználói próba előtt készül el. A helyi smoke-guard addig is minden fejlesztői AI-próbára érvényes.

## P06 — Valódi fiók és teljes böngészős folyamat

**Aktuális állapot:** Részben: valódi Auth/DB/OpenAI HTTP-hurok, kétfiókos ownership, friss-auth export és tényleges fióktörlés sikeres. Böngészős onboarding/visszatérés/export és kontrollált megszakításból admin recovery is sikeres; email-kézbesítés, backup/restore és valós DB-kiesésből recovery még nyitott.

**Feladat:** Supabase email-belépés, profil, OpenAI-időszak, döntés, folytatás, visszatérés, fork, export és Auth/DB-fióktörlés ellenőrzése a valódi integrációkkal. Auth-törlés utáni adatbázishiba helyreállítása, szükséges audit és mentés/visszaállítás ellenőrzése.

**Elfogadás:** böngészőből végigvihető a privát személyes hurok; másik fiók adatai nem érhetők el. Export és törlés friss hitelesítést kér, törlés a teljes kapcsolódó adatgráfot érinti, aktív worker nem írhat vissza törölt fiókhoz. Az üzemeltetési helyreállítás végrehajtható.

**Függőség:** P03–P05; a szerveroldali admin kulcs biztonságosan beállítva és ellenőrizve, a valódi törlés lefutott. Értéke nem kerül dokumentumba vagy Gitbe.

## P07 — Technikai és angol AI/szerkesztői ellenőrzés

**Aktuális állapot:** Részben: 20 determinisztikus eset ×3 időszak, négy korábbi valódi AI-lánc, új kétfejezetes angol minta és Sonnet low audit kész; a magyar próza felhasználói kritikát kapott, ezért halasztott; angol AI/szerkesztői döntés és kiadás utáni használói visszajelzés az elfogadott út. [Claude és tokenoptimalizálás](CLAUDE_MODEL_EVALUATION_HU.md).

**Feladat:** 20 változatos determinisztikus szintetikus eset, meglévő valódi angol többidőszakos minták és kereten belüli célzott AI-próbák. További húsz generatív eset bővítési cél, nem a béta kézi kapuja. Az AI angol szerkesztői értékelése: személyesség, történet, kíváncsiság, hihetőség, ismétlés. Constraint/fact consistency, promptutasítások elkülönítése, tulajdonosi hozzáférés, export/törlés, párhuzamos kérések, megszakítás és költséghatár.

**Elfogadás:** a kötelező állapot-, jogosultsági és adatkezelési ellenőrzések minden esetben sikeresek. A narratív hibák kategóriái és javítási eredményei dokumentáltak; nincs nyitott, múltat átíró hiba. Fizetett esetek fokozatosan, a tényleges új tokenfogyasztás alapján indulnak; a 20-as cél nem írja felül a külön OpenAI/Claude 5–5 USD kereteket; egyik napló sem nullázható.

**Függőség:** P02–P06. A technikai tesztek fokozatosan az adott változással készülnek; ez a pont az összesített release-kapu.

## P08 — Korlátozott angol béta, visszajelzés és folytatási mérés

**Aktuális állapot:** Technikai rész kész: privát visszajelzés, szerveroldali 30 perces session, elsőfejezet-vég kohorsz, sikeres és későbbi folytatási session külön mérhető. Kiadás és valódi használói kohorsz még nincs. [Szerződés és korlátok](BETA_FEEDBACK_AND_METRICS_HU.md).

**Feladat:** onboarding/első fejezet/döntés/folytatási szándék/sikeres folytatás/visszatérés/fork események adatminimalizált mérése. Külön a **Continuation Rate** és a **Continued Life Sessions**. Korlátozott angol béta, majd 20–50 használó célkohorsz, önkéntes élmény-visszajelzéssel és a valós generálási költséghez igazított hozzáférési limitekkel.

**Elfogadás:** kattintás és sikeres folytatás külön mérhető; technikai hiba látszik a kohorszban. A pilotból megállapítható, miért folytatnak vagy hagyják abba, és visszatérnek-e ugyanahhoz az élethez. Számszerű sikerhatárt a következő értékelt kohorsz előtt rögzítünk. Nincs előre bizonyítottnak tekintett megtartási állítás.

**Függőség:** P04–P07. A műszerezést már P04 során beépítjük. A pilot külön felhasználói költségkeretet igényelhet: a résztvevői generálásokat nem indítjuk el a fejlesztői keretet meghaladó összeggel.

## P09 — Publikálható snapshot, Official Scenario és kurált seed

**Aktuális állapot:** előkészítő szelet kész: külön allowlist-séma, privacy preflight, immutable/hash/revision/lejáró tulajdonosi előnézet és szcenáriópiszkozat, 006 migráció, export/törlés. [Pontos határ](PUBLIC_DRAFT_FOUNDATION_HU.md). A [külön AI-pre-screen operatori szelete](PUBLIC_AI_REVIEW_REPORT_HU.md) is elkészült. A [szerkeszthető privát Privacy/Content Preview](PUBLIC_PREVIEW_EDITOR_REPORT_HU.md), ingyenes mezőszintű preflight, idempotens mentés/visszatöltés és saját AI-review nézet is kész. A [felületről indítható fizetett scan-job](PUBLIC_REVIEW_JOB_REPORT_HU.md) is kész költségőrrel és egyszeri queue-val. Következő curator/ScenarioVersion/sanitized fork-checkpoint/Publication/Confirm/Official seed.

**Feladat:** külön Publication/PublicSnapshot/ScenarioVersion modul és additív tárolás. Allowlist alapján anonimizált idővonal/fejezet/állapot, fork-checkpoint, Official/Community/AI-generated/user-edited jelölés. PII/tartalmi elővizsgálat és curator-jóváhagyás. Először néhány valódi AI-szintetikus Official minta az új több időszakos láncon.

**Elfogadás:** nincs raw prompt, privát memória/állapot, harmadik személy adata vagy eredeti belső referencia a public DTO-ban/checkpointban. Privát folytatás nem módosítja a kiadást. Scenario sablon és konkrét Official Life külön objektum; teszthelyettesítő nem lesz publikus AI-tartalom. Forráscél 50–100 élet/20–30 szcenárió, mért v2-költség és engedélyezett keret szerint.

**Függőség:** P01–P07; közös költségőr/modellmérés P05. A teljes seed/pilot nem lépheti túl az OpenAI 5 USD keretét. A külön Claude 5 USD kutatási/auditkeret, nem automatikus seed/pilot-felhatalmazás.

## P10 — Read-only Discovery, public életoldal, Save/Share/Report

**Feladat:** kurált kollekciók, fix taxonómia és tartalomnyelv-szűrő, egyszerű ranking, bejelentkezés nélkül olvasható Official snapshot, Save/Share/OG és Report. Alap moderation queue/soft hide/hard remove/figyelmeztetés/rate-limit. Snapshot-cache mellett aktív publication/permission ellenőrzés; indexelés külön engedély szerint.

**Elfogadás:** olvasás/újratöltés nem indít AI-hívást. Anon/másik fiók csak engedett snapshotot kap; private/unlisted nincs Discoveryben. Save hitelesített és idempotens. Rejtett/visszavont élet nem olvasható, Report nem jelent ellenőrizetlen ranking-tiltást. Olvasás/mentés/megosztás mérhető.

**Függőség:** P09; moderáció/visszavonás az Official public próba előfeltétele is. Kis kurált seed-pilot elég a fejlesztés indításához, tömeges generálás nem szükséges.

## P11 — Community Publishing és visszavonás

**Feladat:** private/unlisted/public, Privacy Preview, Content Preview, szerző/indexelés beállítás, hash/revisionhöz kötött Confirm. Unlisted titkos token, Unpublish és új snapshotverziós refresh; export/fiók-élettörlés kiterjesztése. Kezdetben zárt publish-béta.

**Elfogadás:** Confirm előtt privát; lejárt/módosított preview új ellenőrzést kér. Unlisted csak érvényes linkkel olvasható, noindex és listákból kizárt; tokencsere megszünteti a régi linket. Unpublish tiltja új olvasást/forkot, eltávolítja index/OG-t és érvényteleníti cache-t. Törlés/aktív job nem hagy tartalmat. Report/admin moderáció kliensflaggel nem kerülhető meg.

**Függőség:** P09–P10 és P06 teljes adatkezelése; a valódi admin Auth/DB-törlés sikeres, a public revocation/törlés még saját próbát igényel.

## P12 — Fork this life, Start from this decision, Personalize scenario

**Feladat:** sanitized checkpointból új tulajdonos **privát élete**, új belső szereplő/cél/asset ID-k, választás egyszeri alkalmazása, idempotencia/generálási limit. Scenario + saját jóváhagyott profil/cél/korlát új kezdőállapota, forrásattribution törlési szabálya.

**Elfogadás:** másik felhasználó forkja nem örököl privát előzményt vagy jogot; az eredeti élet változatlan. Döntésből indulás nem másol el nem döntött jövőt. Új élet privát és három időszakon át folytatható. Visszavont/rejtett forrásból nincs új fork; forrástörlés leválasztja a public attributiont a meglévő példányról. Kattintás, létrehozás és első sikeres időszak külön mérhető.

**Függőség:** P03–P05, P09–P11. A mai saját branch API más tulajdonosi jelentésű; nem nyitjuk meg idegen privát ágakhoz.

## P13 — Nyilvános indulási kapu és közösségi mérés

**Feladat:** a [nyilvános megvalósítási terv](PUBLIC_CONTENT_IMPLEMENTATION_PLAN_HU.md) permission/privacy/cache/moderáció/törlés/fork próbái, Official minőség és olvasás→saját élet automatikus folyamatpróbája és kiadás utáni használói visszajelzése. P08 mellé views/read depth/completion/save/share/publish/unpublish/report/removal és referral.

**Elfogadás:** a specifikáció 36. fejezetének 14 MVP-eleme és minden privacy/jogosultsági/törlési kapu teljesül. Anon API/fork-checkpoint nem szivárogtat privát adatot. Official kurált, induló Discovery nem üres. Költségkeret és üzemeltetési felelős/folyamat rögzített; tömeges seed és külső generálás csak elegendő engedélyezett kerettel indul.

**Függőség:** P08–P12. Ez a nyilvános indulás kapuja; a privát technikai/emberi pilot korábban végrehajtható.

## A nyilvános MVP után

Reakció/követés, majd komment/szerzői profil a működő public/fork és moderáció után. Szimulációmélység, célok/élettípusok, szabad szöveges döntés/compare mérés alapján bővül. Alkotói szcenárió/analitika, billing, marketplace és mobil külön terv; Shared Context entitlement és S0–S6 fejlesztés már az új helyi szál része. Meglévő compare megőrizhető; bővítése nem előzi meg a folytatást.

**Következő helyben:** P09 szerkeszthető Privacy/Content Preview, felhasználói scan-queue költségőrrel, külön Shared privacy/általánosítás/curator és publikációs modell, utána P10 Discovery; a Shared-emléket tartalmazó jelenlegi előnézet fail-closed. S3 megjelenítés és valódi Auth/AI/recovery kész; nyers canon/backup-retention és régi személyes próza kezelése még tisztázandó. Entitlement/billing/grace és kiadási deadline külön döntés. P06 ops és S4–S7 megmarad; Contabo később. [Aktuális P09 bizonyíték](PUBLIC_AI_REVIEW_REPORT_HU.md).

## Claude-mérés utáni AI-feladatok

Rutin külső audit következő jelöltje Sonnet low +1500 outputtoken, validált idézettel/verdikttel; Opus külön vitás/mintavételes ellenőrzéshez. Éles provider-routing előtt szolgáltatónkénti DB-számla és árszabály, többprofilos angol teljeslánc és dokumentált automatikus/szerkesztői értékelés szükséges; a béta minőségének használói mérése kiadás után történik. Haiku nem kerül a narrátor/esemény alapjába. Cache csak mért, változatlan prefixre; nem automatikus életemlékezet. A Claude szereppróbák nem adnak húsz generatív esetre bizonyítékot. A generatív lefedettség fokozatos bővítési cél; a 20 determinisztikus háromidőszakos eset már kész.

Az AI szerkesztői ellenőrzése és a későbbi használói visszajelzés alapján: kevesebb ismételt állapot-/pénzfelsorolás, konkrét jelenet és a korábbi választás megélt következménye, új kánonadat kitalálása nélkül. Azonos canonon Sol/Sonnet és célzott javítás teljes költsége mérendő. Eredeti értékelési minták változatlanok; [auditori észrevételek](examples/CLAUDE_EXTERNAL_AUDIT_HU.md).


## 2026-10-05: következő helyi szelet

P09 angol AI-pre-screen és privát eredménytárolás kész, 014 fejlesztői Supabase-on alkalmazva/ismételve. Következő az explicit Privacy/Content Preview felület és a curator/Publication/hash-Confirm alap; a fizetős felhasználói scan-queue külön projekt/user keretőrt kap. Shared-előzmény továbbra külön privacy-kaput kér. Az alterward.com megvásárolt, aktív Cloudflare-domain, bekötés a későbbi Contabo-ops része. [Pontos bizonyíték és korlátok](PUBLIC_AI_REVIEW_REPORT_HU.md).


## 2026-10-05: felületről indítható privát AI-review

A felületről indítható P09 fizetett AI-review elkészült: explicit hozzájárulás, tartós queue/lease, egy attempt/immutable copy, közös projekt/user költségőr, egy pending job/user és gördülő napi kvóta. Újraolvasás/dupla kérés ingyenes, elveszett lease és provider-hiba nem indít automatikus fizetett retryt. 015 alkalmazva/ismételve a fejlesztői DB-n; English/Shared/tulajdonosi/hash/revision kapu és export/törlés integrált. Main CI sikeres: 324 teszt/28 fájl, 50 séma; a korábbi 48 és 001–014 változatlan. A normál feature false, éles allowance 0; publicationApproved false. Következő curator/ScenarioVersion/sanitized fork-checkpoint/Publication/Confirm/Official seed, majd P10–P13; S3 retention, S4–S7 és Contabo/Cloudflare élesítés megmarad. [Megvalósítás és pontos korlátok](PUBLIC_REVIEW_JOB_REPORT_HU.md).


### P09 review-job lezárási bizonyíték

[Main CI](https://github.com/Muzsy/future_flow/actions/runs/37353253492) runtime `33bea6fb3ca70b8c722f6c315db810ec8076bab5`: verify és container sikeres. 324 teszt/28 fájl, formázás, típusellenőrzés, API/worker/Next production build és 50 séma-drift. Izolált valós PostgreSQL/TLS: 001–015 + ismétlés, párhuzamos három review-enqueue → egy job és két claim → egy nyertes, eredmény-újrahasználat, lejárt lease automatikus retry nélkül, törlési marker/visszaállítás/export/cascade/RLS és minden korábbi S0–S3 proof. Web/API/Caddy verified HTTPS/DB TLS, üres négy queue és worker tiszta 0-s leállás, nulla provider-AI és valódi CI-kulcs, egress tiltva.

Valódi Supabase Auth/böngészős kliens → queue → worker → OpenAI ellenőrzés sikeres: egy Sol-hívás, no_findings/0 finding, publicationApproved false. A korábban valóban AI-val generált időszak csak technikai replay-forrás volt, nem új paid generálás vagy AI nélküli termékmód. Hozzájárulás és queued-státusz látható; reload/refresh ugyanazt az eredményt használja, dirty copy elrejti azt és az indítást, source reload az eredeti mentett szöveget hozza vissza. Saját export elkészült, szintetikus Auth/DB-fiók és jobok törölve, credential fájl hiányzik, 3200/4200 tesztport leállt.

Új OpenAI-költségbecslés 0.005243500 USD, konzervatív 0.005245000 USD. Kumulatív 133 hívás, 2.348171605 USD becslés, 2.433873375 USD guard-összeg; maradt 2.566126625 USD, ismeretlen usage 0. Claude változatlan: maradt 2.661985 USD. Naplók nem nullázva.
