# alterward — Shared Context integrációs és fejlesztési terv

2026-10-04 · **Tervezett funkció; alkalmazáskód még nem készült.** A felhasználó által átadott [teljes specifikáció](plans/alterward_shared_context_implementation_docs/MASTER_SHARED_CONTEXT_SPEC_HU.md) aktív értelmezése a meglévő alterward-rendszerhez. [Forráscsomag és integritás](plans/README.md) · [Végrehajtási sorrend](NEXT_STEPS.md) · [Követelménymátrix](REQUIREMENTS_TRACEABILITY_HU.md) · [Állapot](STATUS_HU.md).

## 1. Cél és meglévő alap

A Shared Context több valódi felhasználó kiválasztott, saját alternatív életágát kapcsolja össze. A csoportnak saját állapota, szimulációs ideje, revisionje, eseményei és döntései vannak. Egy közös eseménynek egyetlen hiteles története keletkezik; ebből minden érintett a saját jogosultsága és döntése szerint kap személyes következményt. A személyes élet és ág továbbra is egy felhasználó tulajdona.

A forrás auditjának alapja `b75e61ddc0a6dbdc31653a8c58d5c251e2f95aa8` (`main`); ez egyezik az integráció előtti helyi állapottal. Az integráció előtti b75e61d kód alapja: privát v2 életmotor, `LIFE_CONTRACT_VERSION = 2.0.0`, legfeljebb 30 tartós szereplő, revision/idempotencia/lease, OpenAI-provider, projekt/user költségfoglalás, fióktörlési recovery és 001–007 migráció. A személyes AI-memória jelenleg `recentEvents` és `choices`; a worker két queue-t kezel. Shared szerződés, tábla, controller, provider, queue, Connections-felület, social profile és előfizetési entitlement még nincs. Az akkori 159 teszt nem bizonyította az új funkciót.

**S0 aktuális állapot:** contract/core, additív 008/009, social/entitlement és meghívási/lifecycle API implementálva, 35 új regresszió; a fejlesztői DB-alkalmazás Session pooler címre vár. Feature kikapcsolva, következő S1. [S0 megvalósítás és korlátok](SHARED_CONTEXT_S0_REPORT_HU.md).

Külön SharedContext-modul készül a meglévő monorepóban. Nem kerül több tulajdonos az `aw_lives`/`aw_branches` rekordokra, és a jelenlegi szereplőlimit nem változik. A közös projekt/csapat állapotát nem másoljuk minden tag teljes személyes világába. A korábbi Private / Official / Community tartalomrétegek megmaradnak; a Shared Context a privát szimuláció új együttműködési képessége.

## 2. Elsőbbség és a forrás pontosítása

A ZIP és a kibontott forrás változatlanul megmarad. A megvalósítást az alábbi értelmezés irányítja; [ADR-023](alter_jovo_docs/16_DECISIONS_AND_OPEN_QUESTIONS.md#adr-023--shared-context-a-privát-életmotorhoz).

| Forrásbeli javaslat vagy eltérés                                          | Aktív megvalósítási szabály                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S0/S1 „AI nélkül”, rolloutban friend beta a Shared AI előtt               | Az alapok és az elkülönített tesztek determinisztikusan fejleszthetők, kikapcsolt feature mögött. Felhasználói friend béta csak S2 valódi AI + S3 személyes integráció és biztonsági kapuk után indulhat. AI nélküli termékmód továbbra sincs.                       |
| Agent-checklist „first PR”, új branch                                     | A felhasználó közvetlen `main` munkát kért; a checklist szeleteit commitokkal és CI-vel teljesítjük.                                                                                                                                                                 |
| EN/HU hibakatalógus                                                       | A kiadható UI, hibaüzenetek és Shared AI-tartalom angol. A magyar kompatibilitási katalógus megőrizhető, de nem jelenik meg a termékben.                                                                                                                             |
| Korábban minden multiplayer/social/előfizetés későbbi                     | Az aszinkron, privát Shared Context most bekerül a tervbe, saját entitlementtel és minimális social profile-lal. DM/chat, realtime multiplayer, nyilvános csoport és marketplace továbbra későbbi.                                                                   |
| 06. fejezet globális lock-sorrendje és 14. blueprint invite-first példája | A 06. fejezet sorrendje kötelező: érintett user-sorok UUID szerint → context → member/invite/event → branch. Az invite előzetesen olvasható az érintettek megállapításához, majd a rendezett tranzakcióban minden feltételt újra ellenőrizni kell.                   |
| Immutable canon és törlés utáni teljes anonimitás                         | A struktúra külön személyes hivatkozásokat és minimális közös tényeket tároljon. A szabad szövegben maradt név/PII nem tűnik el a membership nullázásától: szükséges a bemeneti szűrés, olvasási redakció és külön törlési/retention-terv. Ezek nélkül nincs kiadás. |

Helyi fejlesztés folytatódik; a dokumentációintegráció nem telepít Contabóra, nem alkalmaz migrációt és nem indít fizetett AI-hívást. Új keret és új modellválasztás sem következik belőle.

## 3. Típusok, entitlement és életciklus

| Típus                   | Tagság               | Tervezett csomag           | Alapvető szabály                                                                                 |
| ----------------------- | -------------------- | -------------------------- | ------------------------------------------------------------------------------------------------ |
| `friend_group`          | 2–10 fő              | Explorer, Connected, World | `individual_opt_in`; egy esemény a tagok részhalmazát érintheti                                  |
| `romantic_relationship` | Pontosan 2 aktív tag | Connected, World           | Felhasználónként legfeljebb 1 aktív; létrejött/elmélyítés kölcsönös, lezárás bármelyik fél által |
| `work_project`          | Legfeljebb 10 fő     | Connected, World           | Közös cél, szerepek, ellenőrzött governance; más pénzügyéhez saját intent kell                   |
| `hobby_group`           | Legfeljebb 10 fő     | Connected, World           | Opt-in vagy típushoz megengedett többségi szabály                                                |
| `sports_team`           | Legfeljebb 20 fő     | World                      | Roster, coach/captain, eseményenként résztvevőrészhalmaz; csapatdöntés és személyes döntés külön |

| Entitlement | Egyidejű context-slot | Engedett típusok                                |
| ----------- | --------------------- | ----------------------------------------------- |
| Free        | 0                     | Meghívó előnézete; létrehozás/elfogadás tiltott |
| Explorer    | 1                     | Friend                                          |
| Connected   | 3                     | Friend, romantic, work, hobby                   |
| World       | 5                     | Mind az öt típus                                |

Abszolút cap 5/felhasználó. Minden résztvevő saját csomagja jogosítsa a típusra; a meghívó tulajdonosának csomagja nem ad automatikusan jogosultságot másnak. Sponsored seats S7. A forrásban szereplő korábbi hozzávetőleges árak javaslatok, nem elfogadott csomagárak; fizetési szolgáltató, checkout, webhook és számlázás nincs megvalósítva. S0 helyi tesztjei csak szerveroldali, megbízható fixture/admin entitlementet használhatnak, kliensoldali „paid” kapcsolót nem. Ügyfélnek szánt fizetős aktiválás előtt a tényleges entitlement-forrást és a billing folyamatot rendezni kell. A privát alap, export és törlés ettől függetlenül ingyenes marad.

Context: `inviting → active ↔ paused → ended → archived`. Slotot az `inviting`, `active`, `paused` állapot fogyaszt; az `ended`/`archived` nem. Létrehozáskor a kezdeményező slotja is foglalt. Az invitáló állapot átmenetileg egy taggal létrejöhet; aktiváláskor a típus tagsági feltétele teljesüljön. A pending invite külön objektum, nem aktív membership és nem a meghívott elfogadott slotja.

Membership: konkrét `user + life + branch`, `(context,user)` páronként legfeljebb egy aktív tagság; állapot `active | paused_entitlement | left | removed | deleted`. Műveletkor tranzakciós user-lock alatt újra számoljuk a típus-, slot-, tagszám- és romantikus limiteket. Downgrade nem ír canont és nem szakítás: history marad, grace után új generálás/intent tiltott, membership `paused_entitlement`; upgrade ellenőrzött visszatérést enged. A grace időt és túl sok context esetén a megtartási sorrendet megvalósítás előtt rögzítjük.

## 4. Consent, szerepek és privacy

A `SocialProfile` a minimális kapcsolatfelvételi azonosító: egyedi kisbetűs 3–30 karakteres handle, display name, discoverability `private | link_only | searchable`. Első szeletben biztonságos meghívólink elég; kereshető directory S7. Nem keresünk email alapján. A meghívó legalább 256 bites titkos tokenjének csak hash-e tárolható; lejár, visszavonható és egyszer használható. Elfogadás hitelesítve, saját ág kiválasztásával, látható adatmegosztási tájékoztatóval és célzott meghívás esetén a címzett ellenőrzésével történik. Ismert ID önmagában nem jogosultság, a tényleges token/címzett ellenőrzés az API-terv része.

Az AI és a tagok által látható `InteractionProfile` allowlistje: `displayName`, opcionális/nullable `ageBand`, `country`, `occupationLabel`, `sharedRole`. Nem tartalmaz emailt, nyers személyes memóriát, privát pénzügyet/célt, más contextet vagy teljes kapcsolatgráfot. A környezet adminisztrátori szerepe és a történetbeli coach/captain/projekt-szerep külön fogalom.

Az AI eseményt és opciót javasolhat, de más felhasználó érzéseit, beleegyezését, ígéretét vagy privát pénzügyi/munkabeli/költözési döntését nem hozhatja meg. A személyes hatás authority-ja ellenőrzött `shared_canon`, az érintett `self_intent`, vagy szűk, típushoz kötött `authorized_role`. Első friend szelet: `memory_only` és szabályozott `relationship_projection`; pénzügyi/foglalkoztatási/tulajdoni adapter későbbi, külön validálva.

Első friend kiadás előtt szükséges block/report/leave és jogosultsági audit. Block tiltja az új közvetlen meghívást és kényszerített páros interakciót; csoportban nem törli automatikusan mások történetét. Report meghívóra/contextre/eseményre/tagra, rate-limit/dedup és védett moderációs kezelés. Leave nem törlés; új intentre nem jogosít, saját korábbi részvétel története a retention/biztonsági policy szerint olvasható maradhat. Másik felhasználó privát ágát sem tag, sem admin nem kapja meg.

S0-ban a törlési modell és az inaktív fiók jobvédelme már alapkövetelmény. Éles friend aktiválásig a teljes export/törlés/recovery, block és report integráció kész legyen. Fióktörléskor meghívók visszavonása, membership személyes hivatkozásainak leválasztása és `deleted`/„Former member” projekció, függő impactok leválasztása, social profile törlése történik; más tagok közös canonja nem account-cascade célpont. A már törlődő/eltűnt tag ne legyen AI-job résztvevője, díjfizetője vagy commit után visszaírt fiók. A folyamat ismételhető, recoveryvel folytatható. A szabad szöveg és backup-retention külön ellenőrzése megmarad; a history megtartása önmagában nem igazol jogi megfelelést.

## 5. Canon, idő, döntés és személyes hatás

Folyamat: közös állapot + biztonságos tagprojekciók → AI candidate → séma/domain-validálás → immutable közös esemény → tényleges tag-intentek → determinisztikus policy resolution → immutable lezárás → jogosult tagok pending impactjai. Minden közös állapotváltozás/context-életciklus növeli a revisiont; stale kérés 409. Contextenként legfeljebb egy feloldatlan döntés és egy aktív generálás.

`individual_opt_in`: csak a saját jelentkezésével érintett részhalmaz. `majority`: egy tag egy szavazat, döntetlen explicit unresolved; `unanimous`: mindenkinek ténylegesen el kell fogadnia; `role_authority`: kizárólag érvényes felhatalmazás; `weighted_vote`: csak szerver által validált súlyokkal, későbbi szeletben. Nincs AI által kitalált intent vagy automatikus romantikus hozzájárulás. Mások választását a felület a lezárás előtt alapértelmezésben elrejti. Wall-clock válaszadási határidő és szimulációs dátum külön mező; opt-in/majority deadline/quorum kezelését explicit policy definiálja, a forrás 48 órás/5 válaszos példája nem általános alapérték.

A contextnek saját `simulation_at` ideje van. Az első integráció kompatibilis naptári hónapú ágakat enged; az anchor a résztvevők állapotdátumaiból képzett legkésőbbi dátum. A context előtt járó ág és időutazás tiltott (`SHARED_TIME_MISMATCH`). Azonos hónap eltérő napjainak kezelése, illetve egy később beérkező esemény és előrehaladt személyes ág viszonya részletes időtesztet kíván: nincs csendes visszadátumozás, személyes jövő újraírása vagy automatikus catch-up generálás. A nem összeegyeztethető eset elutasítandó; hiányzó időszabályt S1/S3 előtt konkretizálunk.

A hatások lazy módon, a saját ág következő módosításánál materializálódnak: `effective_at`, majd `created_at` szerint, branch-lock és exactly-once alkalmazási kulcs mellett. Nem indul egy húsz személyes ágat egyszerre zároló tranzakció. A kliens ismert revisionjét a materializálás előtt ellenőrizzük; a művelet saját impactjai miatt létrejött új revisiont ugyanazon kérés belül használjuk a további enqueue-hoz. Külső konkurens változás továbbra revision-conflict. Nem helyezünk utólag tényt már commitolt múltba.

A következő személyes AI-időszak csak a tagra jogosultan alkalmazott, releváns közös canonból kap `memory.sharedEvents` projekciót: contextazonosító/típus, dátum, cím, összefoglaló, saját szerep. A személyes történet nem változtathatja meg a közös igazságot. A személyes fork **nem örököl élő shared membershipet**: az eredeti tagság az eredeti ágon marad; a fork csak a forkpontig jogosult történeti memóriát viheti át. Jövőbeli közös hatás és másik tag privát története nem kerülhet az új ágba. „Continue solo” explicit kilépést vagy saját külön ágat jelent. Group fork/split külön új context és külön consent: S7.

## 6. Szerződés, tárolás és API

Új `packages/contracts/src/shared-context.ts`, külön `SHARED_CONTEXT_CONTRACT_VERSION = 1.0.0`; a jelenlegi Life v2 szerződés megmarad. Típusos context/member/policy/state/candidate/intent/resolution/impact szerződések és zárt változáslista készül. A candidate szerverrel egyező context/event/member azonosítókat, `baseRevision`, `effectiveAt`, résztvevőket, közös változásokat és opcionális döntést tartalmaz; az AI nem adhat hozzá ismeretlen tagot, policyt vagy jogosultságot. A `memory.sharedEvents` additív, opcionális bővítés; a korábbi tárolt jobok és snapshotok tovább olvashatók. Exportált sémák csak tényleges kód megvalósítása után változnak.

Additív migrációk: `008_shared_context_foundation`, `009_shared_entitlements_and_social_profile`, `010_shared_moderation_metrics`. 008/009 létrehozva és izoláltan ellenőrizve, fejlesztői alkalmazás hálózati kapu miatt függő; 010 későbbi moderáció. 001–007 változatlan. A social profile és entitlement a foundation API használata előtt már szükséges, ezért S0 végére együtt telepíthető alapot kell adniuk; a szakaszszám nem jogosít félkész API bekapcsolására.

| Táblacsoport — tervezett nevek                                                                   | Invariáns                                                                                                               |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `aw_social_profiles`, `aw_user_entitlements`                                                     | Handle-egyediség, hiányzó entitlement Free; megbízható szerveroldali forrás                                             |
| `aw_shared_contexts`, `aw_shared_members`, `aw_shared_invites`                                   | Típus immutable, revision/idő/lifecycle; aktív tagság és romantikus limit; tokenhash, expiry, egy használat             |
| `aw_shared_events`, `aw_shared_event_participants`, `aw_shared_intents`, `aw_shared_resolutions` | Contextbeli sorszám, résztvevőrészhalmaz, egy végleges intent/tag/esemény, egy immutable resolution                     |
| `aw_shared_impacts`                                                                              | Esemény/tag/hatás egyediség, immutable payload/hash; külön pending/applied/detached/expired státusz és applied revision |
| `aw_shared_jobs`, `aw_shared_ai_runs`                                                            | Lease/checkpoint/base revision, egy aktív job/context; kezdeményező díjfizető és költségmetaadat                        |
| `aw_user_blocks`, `aw_shared_reports`                                                            | Elkülönített biztonsági adat, rate-limit és védett audit                                                                |

Minden új tábla RLS-védett, anon/authenticated közvetlen elérés visszavonva; a szerverrepository ellenőrzi a tagságot. A tag személyes FK-i nullázhatók törlésnél; a context nem a létrehozó accountjának cascade tulajdona. A denormalizált membership-context type mindig egyezik a context típusával. Az entitlement cap user-lockos szerverellenőrzés; az aktív tag/romantikus egyediség DB-védelemmel is készül. A globális lock-sorrend minden invite/job/intent/leave/delete útvonalra érvényes; a blueprintet ennek megfelelően kell átírni.

Tervezett útvonalak, **még nem működő endpointok**:

| API-csoport               | Műveletek                                                                                                |
| ------------------------- | -------------------------------------------------------------------------------------------------------- |
| `/api/v2/social-profile`  | GET/PUT saját social profile                                                                             |
| `/api/v2/shared-contexts` | GET lista, POST létrehozás; `/:id` GET részlet                                                           |
| Contextmeghívás           | POST `/:id/invites`; GET `/api/v2/shared-invites`; POST meghívó `/:id/accept` vagy `/decline`            |
| Context-életciklus        | POST context `/:id/leave`, `/archive`; később `/members/:memberId/remove`                                |
| AI és intent              | POST context `/:id/continue`; GET `/api/v2/shared-jobs/:id`; POST context `/:id/events/:eventId/intents` |
| Személyes projekció       | GET `/api/v2/branches/:id/shared-impacts`, kizárólag saját ághoz                                         |

AuthGuard + tagsági/ownership ellenőrzés + server entitlement + revision + idempotencia. A create/invite/accept/continue/intent/leave/remove ismétlése nem okozhat új hatást vagy új számlát. Angol hibakatalógus a forrás teljes `SHARED_*` és `SUBSCRIPTION_REQUIRED` készletével, gépi kódok megőrzésével; pontos DTO/OpenAPI/export a kóddal együtt készül. Külön shared rate-limit és napi userlimit, de az összes v1/v2/shared költés ugyanabba a projekt/user keretbe számítson.

## 7. AI, worker és költség

Új `SharedAiProvider.sharedEvent(input, repair)` és OpenAI-implementáció készül. Bemenet: közös typed state, megengedett InteractionProfile-ok, szerepek, közös cél, releváns közös history, megengedett policyk és szerverazonosítók. Nincs teljes személyes WorldState vagy más contextből átvett nyers memória. Az AI-output séma-, idő-, revision-, résztvevő-, policy-, authority- és hash-validálás után commitolható; legfeljebb egy célzott repair, előzetes keretfoglalással.

Új shared job-repository és `shared-processor.ts`. A fair worker ciklusa personal-v2 → shared → legacy, az üres queue-k átugrásával. Minden queue-nál lease/heartbeat/checkpoint, attempt cap és elveszett lease mellett nulla commit. Új queue nem éheztetheti a privát folytatást és nem kerüli meg a deleting-fiók védelmét.

A közös generálásért a `requested_by_user_id` kezdeményező kerete felel. Egy húszfős közös esemény egy közös AI-generálásból és strukturált taghatásokból készül; nem húsz külön, azonnal generált személyes fejezetből. Olvasás és intent nem indít új AI-t. Saját következő fejezet csak a saját folytatáskor, saját keretből készül. A pontos outputlimit/modellválasztás mért angol shared mintán döntendő el; nincs új alapmodellváltás vagy automatikus drága fallback. OpenAI alap Sol; Claude továbbra külön kutatás/auditor.

A meglévő kumulatív OpenAI 5 USD és külön Claude 5 USD megmarad, ugyanazokkal a naplókkal/foglalásokkal. Éles allowance alapja továbbra nulla; az entitlement nem pénzügyi költési engedély. A fixture-alapú teszt fizetés nélküli; valódi shared smoke csak indokolt AI-implementáció után, meglévő szabad keretből és használati bizonylattal.

## 8. Angol felület és kiadási kapu

Új `/connections` dashboard: saját active/paused context, meghívók, létrehozás, archívum, social profile és adatmegosztási tájékoztató. Contextoldal `/connections/:id`: tagok/szerepek, közös dátum/idővonal, függő döntés, saját válasz, válaszszám/deadline, „Continue group”, leave/archive és report/block. Nem készül chat és inaktivitás miatti megszégyenítés. Free előnézet tájékoztathat a csomaghatárról, de nincs működőnek mutatott checkout a billing elkészülte előtt.

Friend flow: saját ág + cím → biztonságos meghívólink → másik valódi fiók belépése → saját ág választása → entitlement/idő/privacy ellenőrzés → explicit accept → valódi AI-esemény → saját intent → determinisztikus lezárás → személyes folytatásban megjelenő hatás. Függő személyes projekciónál érthető jelzés: „Something changed in your shared life.” A romantikus meghívó önmagában nem kapcsolat és nem kölcsönös beleegyezés.

A context első kiadásban privát, public/unlisted csoportoldal nincs. Shared elemet tartalmazó személyes publikációnál P09/P11 eleve kiszűri más felhasználó azonosítóját és InteractionProfile-ját, általánosítja a címeket/szereplőket; a szabad próza PII-ellenőrzése is kötelező. Azonosítható többtagú publikáció csak későbbi külön, snapshothoz kötött többfél-consenttel (S7). A nyilvános fork nem vihet át live tagságot. A jelenlegi privát draft UUID-szűrése nem teljesíti automatikusan ezt az új kaput.

## 9. Fejlesztési szakaszok és függőségek

S0 **implementáció kész, feature kikapcsolva, fejlesztői DB-alkalmazás függő**; S1–S7 **tervezett**. Az S-azonosítók a ZIP roadmapjét követik; nem váltják fel és nem számozzák át L01/P01–P13-at. A következő helyi szelet S1. A személyes béta üzemeltetési kapui és a public MVP követelményei megmaradnak; a részletes közös sorrend a [NEXT_STEPS](NEXT_STEPS.md) dokumentumban szerepel.

| Pont                                              | Eredmény és függőség                                                                                                                    | Elfogadás / kiadási határ                                                                                                                                                         |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S0 — Foundation**                               | Shared contract/core, additív tárolás, social profile, entitlement, repository/API create/list/detail/invite/accept; meglévő v2-re épül | Limit-, RLS-, privacy-, token-, lock- és deleting-fiók tesztek; régi job/élet olvasható; feature kikapcsolva; még nincs felhasználói Shared release                               |
| **S1 — Determinisztikus friend alap**             | S0 → 2–10 fő, Explorer 1 slot, ág/időkötés, tesztesemény, saját intent, policy, memory impact                                           | Cap/last-slot verseny, stale 409, opt-in/tie/missing vote, egyszeri resolution/impact, kompatibilis idő; fixture csak izolált tesztben                                            |
| **S2 — Shared AI**                                | S1 → OpenAI-provider, shared queue/worker, candidate-validálás/repair és közös budget                                                   | Válós AI-pipeline; leasevesztés/restart/dupla kérés/hibás tag/authority javítva vagy elutasítva; használati bizonylat, legfeljebb egy repair                                      |
| **S3 — Personal integration és friend béta-kapu** | S2 → lazy materializálás, opcionális memory/sharedEvents, saját következő period, Connections/invite/decision UI, solo/fork             | Legalább 2–10 fős valódi fiókos angol folyamat; közös canon megjelenik a saját AI-folytatásban; export/törlés/recovery/block/report/PII ellenőrzött; csak e kapu után friend béta |
| **S4 — Romantic**                                 | S3 friend alap → Connected/World; két tag, max 1/user, mutual formation/escalation, unilateral end                                      | Párhuzamos romantikus acceptből legfeljebb egy; nincs automatikus consent; abuse/block/leave és downgrade-pause teszt                                                             |
| **S5 — Work/project és hobby**                    | S3 alap, típusos governance → szerepek/cél, majority/role-authority, leave/remove, typed impacts                                        | Szerep nem ad privát pénzügyi döntési jogot; saját intent és külön adapter nélkül nincs pénz/tulajdon módosítás                                                                   |
| **S6 — Sport**                                    | S5 szerep/governance alap → World, max 20, roster/coach/captain, subset, quorum                                                         | 20 párhuzamos intent/impact, 21. tag elutasítva; több contextet érintő user-lock verseny deadlock nélkül                                                                          |
| **S7 — Advanced**                                 | Validált S3–S6 használat; public elemhez P09–P13 kapuk is                                                                               | Split/group fork, sponsored seat, directory, többfél-public snapshot, richer entity; külön specifikáció/consent, nem első friend MVP                                              |

Tervezett szerverflag-ek kezdetben `false`: `SHARED_CONTEXTS_ENABLED`, `SHARED_FRIEND_ENABLED`, `SHARED_CONNECTED_ENABLED`, `SHARED_WORLD_ENABLED`. Jelenleg ezek a konfigurációban sem léteznek. Foundation kikapcsolva telepíthető; a flag csak kész jogosultsági/költség/consent ellenőrzés után aktiválhat funkciót. A kliensflag önmagában semmit nem engedélyez.

## 10. Ellenőrzés és még konkretizálandó pontok

Új tesztmátrix a [10. forrásfejezet](plans/alterward_shared_context_implementation_docs/10_TEST_AND_ACCEPTANCE_PLAN.md) szerint: minden típus/tier/slot; hiányzó jogosultság; expiry/revocation/reuse/wrong recipient/block/full; párhuzamos utolsó slot és romantikus uniqueness; outsider DTO/prompt/export/cache privacy; stale revision; duplicate job/intent; exactly-once lazy impact; queue fairness/restart/lost lease/repair receipt; policy/quorum/tie/authority; incompatibilis idő és backdated elutasítás; személyes fork tagság nélkül; háromtagú context egyik tagjának törlése és recovery; húsz párhuzamos sport-intent és öt contextet érintő lock-sorrend. A [referencia A–J esetek](plans/alterward_shared_context_implementation_docs/13_REFERENCE_SCENARIOS.md) mind felhasználhatók: A/B friend S1–S3, C romantic S4, D work S5, E sport S6, F quorum S5/S6, G downgrade S0/S3, H fork S3, I törlés S0/S3, J split S7.

Friend DoD: valódi fiókok, secure invite, tényleges entitlement, kompatibilis ágak, valódi Shared AI, saját intent, egy canon, pontosan egyszeri személyes hatás és következő AI-period; újrabelépés/restart/idempotencia, export/törlés/recovery/moderáció és privacy; megfelelő `pnpm check`, séma-drift és migrációs ellenőrzés sikeres. A 159 korábbi teszt és korábbi CI továbbra a meglévő kód bizonyítéka, nem Shared-elfogadás.

Megvalósítás előtt részletezendő: grace hossza és downgrade-context választás; wall-clock deadline/quorum/tie UX; azonos hónap eltérő napjai és időben előrehaladt ág pending impactja; entitlement megbízható kiadása és későbbi billing; retained shared prose redakciója és retention/backup; membership kilépés utáni olvasási jogai. Ezek nem akadályozzák a dokumentációintegrációt vagy a fail-closed foundation munkáját. Amelyikhez termékdöntés kell, a függő szelet előtt konkrét opciókkal tisztázzuk; árakat és fizetési hajlandóságot nem tekintünk igazoltnak.

## 12. S0 implementációs pontosítások

[S0 megvalósítás és korlátok](SHARED_CONTEXT_S0_REPORT_HU.md). S0 kizárólag friend create/accept, owner meghívás 20/context/24h és 7 napos hash-only HMAC-token, POST preview, strict request/OpenAPI. Minimális profile explicit megosztásból, szerver-only tier és RLS. End→archive és admin-handover kezeli a kilépő/törölt ownert. Pontos napegyezés fail-closed; a compatible-month/latest-anchor és lazy impact szabály S1/S3-ban válik teljessé. Törölt címzett függő meghívója akkor is visszavonódik, ha nem volt tag. Strukturális export/törlés/recovery megvan, retained prose, canon/impact export és moderáció S3 gate. Négy flag false, valódi Shared AI S2 előtt nincs aktiválás; Life v2 2.0.0 és 18 régi séma marad.
