# alterward — a három forrás követelményeinek visszakövetése

2026-10-05 · A 38 pozicionálási és 42 közösségi fő fejezet teljes lefedése. A két stratégiai forrás és az új Shared Context csomag szövege változatlan; ez a mátrix az aktív értelmezést, témagazdát és megvalósítási státuszt rendeli hozzájuk. [Dokumentáció](README.md) · [Státusz/keret](STATUS_HU.md) · [Backlog](NEXT_STEPS.md).

A „rögzítve” termékdöntést jelent, nem kész feature-t. A „könyvtári alap” nem API/worker/tárolás. A hipotézis még nem validált. A gazdadokumentum részletes követelmény; a feladat elfogadását a backlog írja le. A legújabb felhasználói döntés felülírja a kétnyelvű indulást: P01–P13 angol élményt követel; magyar halasztva. Az előzetes kézi EN/HU pilot helyett AI angol szerkesztői döntés és éles béta visszajelzés a terv; [aktív indulási út](ENGLISH_RELEASE_PLAN_HU.md).

## Pozicionálási és célmeghatározási terv

[Teljes, változatlan forrás](PROJECT_POSITIONING_AND_GOAL_DEFINITION_HU.md).

| Forrásfejezet | Elfogadott értelmezés | Gazdadokumentum | Megvalósítási státusz | Feladat |
|---|---|---|---|---|
| S1 · A dokumentum célja | Az aktív dokumentáció célja és elsőbbségi rendje | [00](alter_jovo_docs/00_README.md) | Irány rögzítve | L01, P01–P13 |
| S2 · Vezetői összefoglaló | Tartós AI-élet, döntés és következmény | [01](alter_jovo_docs/01_VISION_AND_PRODUCT.md) | V2 privát mag/AI-audit kész; használói minőség kiadás után | P01–P08 |
| S3 · Az alapötlet pontos megfogalmazása | Saját/alternatív identitás és folytatható élet | [01](alter_jovo_docs/01_VISION_AND_PRODUCT.md) | Privát v2 integrált | P01–P04 |
| S4 · Mi a termék – és mi nem az | Szcenárióélmény, autoritás és jóslási százalék nélkül | [01](alter_jovo_docs/01_VISION_AND_PRODUCT.md) | Termékelv; minőség mérendő | P07–P08 |
| S5 · A termékkategória meghatározása | AI Alternate Life Simulator, persistent platform | [01](alter_jovo_docs/01_VISION_AND_PRODUCT.md) | Pozicionálás rögzítve | P08 |
| S6 · Alapvető felhasználói probléma | Mi lenne ha és következmény/folytatás iránti kíváncsiság | [01](alter_jovo_docs/01_VISION_AND_PRODUCT.md) | Hipotézis | P03, P08 |
| S7 · A termék fő ígérete | Döntések által alakított alternatív élet | [01](alter_jovo_docs/01_VISION_AND_PRODUCT.md) | Privát v2 és valódi Auth-próba kész; éles béta/használói mérés még nincs | P01–P08 |
| S8 · Pozicionálási döntés | Élmény/történet először, önreflexió másodlagosan | [01](alter_jovo_docs/01_VISION_AND_PRODUCT.md) | Irány; validálás szükséges | P07–P08 |
| S9 · Versenytér és megkülönböztetés | Versenytársi háttér megőrizve, nem új piackutatási tény | [20](alter_jovo_docs/20_REFERENCES.md) | Háttéranyag | P08 |
| S10 · Célcsoportok | Felnőtt kíváncsi felfedező elsődleges célközönség | [01](alter_jovo_docs/01_VISION_AND_PRODUCT.md) | Hipotézis | P08 |
| S11 · Jobs To Be Done | Alternatív jövő/identitás, következmény, történet, megosztás | [01](alter_jovo_docs/01_VISION_AND_PRODUCT.md) | Hipotézisek | P03, P08–P12 |
| S12 · A termék fő pillérei | Identity/Goal/World State/Events/Choice/Consequence | [01](alter_jovo_docs/01_VISION_AND_PRODUCT.md) | V2 privát mag integrált | P01–P05 |
| S13 · A szimuláció koncepcionális modellje | Állapot → esemény → átmenet → narratíva | [04](alter_jovo_docs/04_SIMULATION_ENGINE.md) | V1/v2 integrált | P01–P03 |
| S14 · A „cél” szerepe a rendszerben | Cél prioritás/horizon/motiváció/tradeoff/progress/constraint | [03](alter_jovo_docs/03_PROFILE_MODEL_AND_QUESTIONNAIRE.md) | V2 szerződés/onboarding integrált | P01, P04 |
| S15 · Profilalkotás és bemeneti modell | Structured Core + Guided Questions + Free Context; rövid indulás | [03](alter_jovo_docs/03_PROFILE_MODEL_AND_QUESTIONNAIRE.md) | 12 lépéses angol UX és valódi fiókos UI-próba kész; HU elrejtve | P04 |
| S16 · Világállapot és idővonal | Idő, tényállapot, szereplő/cél/lehetőség és unknown érték | [04](alter_jovo_docs/04_SIMULATION_ENGINE.md) | V2 tárolás/domain/worker integrált | P01–P03 |
| S17 · Döntések és elágazások | Aktuális választás/folytatás és történeti fork külön | [02](alter_jovo_docs/02_USER_EXPERIENCE_AND_FLOWS.md) | V2 choice/folytatás/history fork integrált | P03 |
| S18 · Történetfolyam | Olvasható folytonos történet, NPC/canon memória | [06](alter_jovo_docs/06_STORY_ENGINE_AND_CONTENT.md) | V2 narratíva/canonmemória integrált | P02, P05, P07 |
| S19 · Realizmus kontra szórakoztatás | Hihetőség, hétköznapiság és változatosság | [06](alter_jovo_docs/06_STORY_ENGINE_AND_CONTENT.md) | Minőség mérendő | P07 |
| S20 · Közösségi réteg | Élet/döntés/ág alapú közösség; public terv előrébb hozza | [07](alter_jovo_docs/07_COMMUNITY_AND_SOCIAL.md) | Public tervezett | P09–P13 |
| S21 · AI szerepe | AI event/narrator/check; további extraction/NPC/summary később | [05](alter_jovo_docs/05_AI_AND_PROMPT_ARCHITECTURE.md) | Három szerep működik; bővítés terv | P02, P05, P09 |
| S22 · Mit nem szabad az AI-ra bízni | Idő/pénz/tulajdon/jog/állapot determinisztikus ellenőrzése | [04](alter_jovo_docs/04_SIMULATION_ENGINE.md) | V1/v2 domain és tárolási ellenőrzés | P01–P03, P07 |
| S23 · MVP pozicionálás | Első eredmény után ugyanazon élet folytatási igénye | [12](alter_jovo_docs/12_MVP_SCOPE_AND_ROADMAP.md) | Még nem validált | P08 |
| S24 · MVP funkciók | Rövid profil/period/decision/consequence/timeline/save/history fork | [12](alter_jovo_docs/12_MVP_SCOPE_AND_ROADMAP.md) | Privát v2 integrált; elfogadási kapuk nyitottak | P01–P08 |
| S25 · MVP-ből tudatosan kihagyandó funkciók | Mobile/DM/marketplace/avatar/voice/VR/coach/health nem MVP | [12](alter_jovo_docs/12_MVP_SCOPE_AND_ROADMAP.md) | Scope-határ | MVP után |
| S26 · Felhasználói élmény – ideális első munkamenet | 10–15 kérdés/3–4 perc; első élmény körülbelül 10 perc | [02](alter_jovo_docs/02_USER_EXPERIENCE_AND_FLOWS.md) | Mérendő UX-cél, nem SLA | P04, P08 |
| S27 · Visszatérési ciklus és megtartás | Event → choice → consequence → curiosity → return | [15](alter_jovo_docs/15_ANALYTICS_MONETIZATION_OPERATIONS.md) | Mérendő hurok, nincs manipuláló streak | P03, P08 |
| S28 · Monetizációs irány | Korlátozott ingyenes AI; privacy/adatjog univerzálisan ingyenes | [15](alter_jovo_docs/15_ANALYTICS_MONETIZATION_OPERATIONS.md) | Prémium privacy/export felülírva; ár nyitott | P05, MVP után |
| S29 · Bizalom, felelősség és kommunikáció | AI-jelölés, szcenáriókeret, bizalom és user agency | [11](alter_jovo_docs/11_SECURITY_PRIVACY_COMPLIANCE.md) | Alpha alap; véglegesítés nyitott | P06–P07, P13 |
| S30 · Márka- és névadási következmények | Márkanév alterward; régi Branchward munkanév felülírva | [16](alter_jovo_docs/16_DECISIONS_AND_OPEN_QUESTIONS.md) | Felhasználói döntés; domain nyitott | Rögzítve |
| S31 · Sikerességi mérőszámok | Continuation Rate/Continued Life Sessions és költség | [15](alter_jovo_docs/15_ANALYTICS_MONETIZATION_OPERATIONS.md) | Privát session/olvasásvég-kohorsz kész; public/emberi mérés nyitott | P08, P13 |
| S32 · Kockázatok | Egyszeri használat/generikus szöveg/inkonzisztencia/frikció/költség | [14](alter_jovo_docs/14_TESTING_AND_QUALITY.md) | Minőség és pilot kapuk | P05–P08 |
| S33 · Stratégiai döntések | Tartós AI, web first, strukturált állapot, core első | [16](alter_jovo_docs/16_DECISIONS_AND_OPEN_QUESTIONS.md) | Rögzített döntések | L01, P01–P13 |
| S34 · Nyitott kérdések és validálandó hipotézisek | A–G hipotézisek külön emberi méréssel | [01](alter_jovo_docs/01_VISION_AND_PRODUCT.md) | Nyitott hipotézisek | P08, P13 |
| S35 · Javasolt fejlesztési sorrend | Prototype/persistent/quality/replay/public/platform egységes sorrend | [12](alter_jovo_docs/12_MVP_SCOPE_AND_ROADMAP.md) | Public forrás pontosítja | P01–P13 |
| S36 · Végleges pozicionálási nyilatkozat | Persistent AI alternate-life szimulátor meghatározása | [01](alter_jovo_docs/01_VISION_AND_PRODUCT.md) | Irány rögzítve | P08 |
| S37 · Rövid pitch-változatok | EN/HU pitch az elfogadott névvel | [01](alter_jovo_docs/01_VISION_AND_PRODUCT.md) | Dokumentált szövegjavaslat | L01 |
| S38 · Források és konkurencia-referenciák | Eredeti konkurenciahivatkozások teljes forrásban | [20](alter_jovo_docs/20_REFERENCES.md) | Háttér, külön verifikálás nélkül | Nincs új piaci állítás |

## Public Lives, Discovery és Community terv

[Teljes, változatlan forrás](PUBLIC_LIVES_DISCOVERY_COMMUNITY_SPEC_HU.md).

| Forrásfejezet | Elfogadott értelmezés | Gazdadokumentum | Megvalósítási státusz | Feladat |
|---|---|---|---|---|
| C1 · A dokumentum célja | Nyilvános réteg kiegészíti a személyes szimulációt | [07](alter_jovo_docs/07_COMMUNITY_AND_SOCIAL.md) | Tervezett | P09–P13 |
| C2 · Vezetői összefoglaló | Private + Official + Community és olvasásból saját AI | [01](alter_jovo_docs/01_VISION_AND_PRODUCT.md) | Tervezett | P09–P13 |
| C3 · Alapelv: private by default, publish by choice | Private by default, publish by choice | [11](alter_jovo_docs/11_SECURITY_PRIVACY_COMPLIANCE.md) | Privát alap kész, publish terv | P11 |
| C4 · Miért kell nyilvános életút-rendszer | Üres Discovery/frikció/social proof/retention/growth kezelése | [07](alter_jovo_docs/07_COMMUNITY_AND_SOCIAL.md) | Hipotézisek | P09, P13 |
| C5 · A három tartalmi réteg | Három tartalmi réteg, Official vs Community külön | [07](alter_jovo_docs/07_COMMUNITY_AND_SOCIAL.md) | Tervezett | P09–P11 |
| C6 · Láthatósági szintek | Private/unlisted/public; anonymous author külön beállítás | [07](alter_jovo_docs/07_COMMUNITY_AND_SOCIAL.md) | Tervezett | P11 |
| C7 · Publikálási folyamat | Publish → scan → Privacy Preview → Content Preview → Confirm | [02](alter_jovo_docs/02_USER_EXPERIENCE_AND_FLOWS.md) | Privát előnézeti API kész; publish/Confirm tervezett | P11 |
| C8 · Privacy Preview és anonimizálás | PII/harmadik személy vizsgálat és szerkeszthető preview | [11](alter_jovo_docs/11_SECURITY_PRIVACY_COMPLIANCE.md) | Részleges privát preflight kész; teljes scan/preview UI tervezett | P09, P11, P13 |
| C9 · Mi számít publikus életútnak | Nyilvános élet csak jóváhagyott külön snapshot | [09](alter_jovo_docs/09_DATA_MODEL.md) | Immutable privát piszkozat kész; publication tervezett | P09 |
| C10 · Publikus életút-oldal felépítése | Cím/summary/badge/timeline/milestone/decision/branch/Save/Share/Fork/Report | [07](alter_jovo_docs/07_COMMUNITY_AND_SOCIAL.md) | Tervezett | P10, P12 |
| C11 · Discovery oldal | Kurált kollekciók/kategóriák és nyelvi szűrő | [07](alter_jovo_docs/07_COMMUNITY_AND_SOCIAL.md) | Tervezett | P10 |
| C12 · Official Lives | Ember által kurált, valódi AI-szintetikus Official Lives | [06](alter_jovo_docs/06_STORY_ENGINE_AND_CONTENT.md) | Tervezett | P09 |
| C13 · Community Lives | Önkéntes Community snapshot, szerzőjelölés | [07](alter_jovo_docs/07_COMMUNITY_AND_SOCIAL.md) | Tervezett | P11 |
| C14 · Private Lives | Teljes privát személyes termék, korlátlan nyilvános kiadás nélkül | [02](alter_jovo_docs/02_USER_EXPERIENCE_AND_FLOWS.md) | V1/v2 privát motor és valódi Auth-próba kész; éles ops részben nyitott | P01–P08 |
| C15 · Előre generált életutak szerepe | 50–100 Official Life, összesítve, kis pilot/keret előzi meg | [06](alter_jovo_docs/06_STORY_ENGINE_AND_CONTENT.md) | Tartalomcél, még nincs seed | P09 |
| C16 · Official Scenario rendszer | 20–30 Scenario; verziózott sablon külön konkrét Life-tól | [09](alter_jovo_docs/09_DATA_MODEL.md) | Tervezett | P09 |
| C17 · Fork this life – központi mechanika | Public fork új saját privát élet, új ID/joghatár | [07](alter_jovo_docs/07_COMMUNITY_AND_SOCIAL.md) | Tervezett | P12 |
| C18 · Start from this decision | Döntés előtti sanitized checkpoint, choice egyszer | [04](alter_jovo_docs/04_SIMULATION_ENGINE.md) | Tervezett | P12 |
| C19 · Personalize this scenario | Scenario + saját jóváhagyott identitás/cél/constraint | [03](alter_jovo_docs/03_PROFILE_MODEL_AND_QUESTIONNAIRE.md) | Tervezett | P12 |
| C20 · Tartalomfogyasztásból szimuláció | Read → interest → fork → saját AI-időszak | [15](alter_jovo_docs/15_ANALYTICS_MONETIZATION_OPERATIONS.md) | Mérendő hipotézis | P12–P13 |
| C21 · Közösségi objektummodell | Life/Branch/Decision/Scenario/Event közösségi objektum | [09](alter_jovo_docs/09_DATA_MODEL.md) | Public tervezett | P09–P12 |
| C22 · Adatmodell és entitások | Publication/PublicSnapshot/Scenario külön entitás | [09](alter_jovo_docs/09_DATA_MODEL.md) | Tervezett | P09 |
| C23 · Publikált snapshot és élő privát állapot szétválasztása | Public snapshot immutable, private continuation nem frissíti | [09](alter_jovo_docs/09_DATA_MODEL.md) | Tervezett | P09, P11 |
| C24 · Jogosultsági modell | Tulajdonosi API marad privát, explicit public permission | [11](alter_jovo_docs/11_SECURITY_PRIVACY_COMPLIANCE.md) | Tervezett public határ | P09–P13 |
| C25 · Keresés, kategóriák és címkézés | 13 fix kategória, jóváhagyott címke, angol keresés; magyar halasztva | [07](alter_jovo_docs/07_COMMUNITY_AND_SOCIAL.md) | Tervezett | P10 |
| C26 · Rangsorolás és ajánlórendszer | Egyszerű aggregált ranking, fork erősebb mint view | [07](alter_jovo_docs/07_COMMUNITY_AND_SOCIAL.md) | Tervezett | P10 |
| C27 · Reakciók, mentések, követés és kommentek | Save/Share/Fork első, reaction/follow majd comment később | [07](alter_jovo_docs/07_COMMUNITY_AND_SOCIAL.md) | Tervezett, social halasztott | P10–P12, MVP után |
| C28 · Moderáció | Scan/Report/review/soft hide/hard remove/warning/abuse limit | [07](alter_jovo_docs/07_COMMUNITY_AND_SOCIAL.md) | Tervezett | P10–P13 |
| C29 · Személyes adatok és érzékeny információk | PII és érzékeny/third-party adat nem automatikusan public | [11](alter_jovo_docs/11_SECURITY_PRIVACY_COMPLIANCE.md) | Tervezett public ellenőrzés | P09, P11, P13 |
| C30 · Publikálás visszavonása és törlés | Unpublish/link/index/cache/OG/delete/fork attribution | [11](alter_jovo_docs/11_SECURITY_PRIVACY_COMPLIANCE.md) | Tervezett; retention döntés nyitott | P11–P13 |
| C31 · Monetizációs szerep | Olcsó/free olvasásból limitált saját generálás | [15](alter_jovo_docs/15_ANALYTICS_MONETIZATION_OPERATIONS.md) | Üzleti hipotézis | P05, P13 |
| C32 · Free és fizetős funkcióhatárok | Free olvasás/Save/Share/Publish; paid mélység később | [15](alter_jovo_docs/15_ANALYTICS_MONETIZATION_OPERATIONS.md) | Árak/limitek nyitottak | P05, MVP után |
| C33 · Growth loop | Tartalom → fork → saját élet → önként megosztás | [15](alter_jovo_docs/15_ANALYTICS_MONETIZATION_OPERATIONS.md) | Hipotézis | P13 |
| C34 · SEO és külső megosztás | Public SEO/OG opt-in, private/unlisted kizárt | [11](alter_jovo_docs/11_SECURITY_PRIVACY_COMPLIANCE.md) | Tervezett | P10–P11 |
| C35 · Közösségi bizalom és hitelesség | Official/Community/AI-generated/user-edited hiteles eredet | [06](alter_jovo_docs/06_STORY_ENGINE_AND_CONTENT.md) | Tervezett | P09–P13 |
| C36 · MVP funkciók | 14 MVP-elem tételesen az alábbi táblában | [12](alter_jovo_docs/12_MVP_SCOPE_AND_ROADMAP.md) | Tervezett, nincs teljesítve | P09–P13 |
| C37 · MVP-ből kihagyandó elemek | Comments/DM/marketplace/followgraph/advanced rec nem MVP | [12](alter_jovo_docs/12_MVP_SCOPE_AND_ROADMAP.md) | Scope-határ | MVP után |
| C38 · Bevezetési fázisok | Seed → Discovery → publishing → fork → social → creator | [12](alter_jovo_docs/12_MVP_SCOPE_AND_ROADMAP.md) | Core után egységes fázisok | P09–P13 |
| C39 · KPI-k és mérőszámok | Views/read/save/signup/fork/publish/report/referral | [15](alter_jovo_docs/15_ANALYTICS_MONETIZATION_OPERATIONS.md) | Privát session/olvasásvég-kohorsz kész; public/emberi mérés nyitott | P13 |
| C40 · Kockázatok | Privacy/üres seed/spam/sameness/social fókusz kockázat | [14](alter_jovo_docs/14_TESTING_AND_QUALITY.md) | Kapuk és pilot tervezett | P09–P13 |
| C41 · Technikai és architekturális következmények | Simulation/Public Content/Community/Moderation modulok | [08](alter_jovo_docs/08_SYSTEM_ARCHITECTURE.md) | Public bővítés tervezett | P09–P13 |
| C42 · Végleges stratégiai állásfoglalás | Core első, snapshot/Discovery/fork majd social | [12](alter_jovo_docs/12_MVP_SCOPE_AND_ROADMAP.md) | Elfogadott sorrend | P01–P13 |

## A közösségi MVP 14 kötelező eleme — C36

A 14 elem közül egy sem teljesen kész nyilvános funkció. A privacy preview és snapshot privát technikai alapja már létezik; teljes public elfogadásuk még hátravan. A személyes core elsőbbsége nem törli őket a nyilvános MVP-ből. A közös P13 release-kapu a privacy/permission/export/delete/moderációs ellenőrzést is kéri.

| # | Forrás szerinti elem | Feladat | Elfogadási feltétel |
|---|---|---|---|
| 1 | private / unlisted / public visibility | P11 | Permission/token/noindex mátrix; Confirm előtt privát |
| 2 | publish flow | P11 | Idempotens, tulajdonosi kiadás, hash/revision/scanverzió |
| 3 | privacy preview | P09/P11 | PII áttekintés/javítás + Content Preview, third-party adat kizárva |
| 4 | public snapshot | P09 | Külön immutable DTO/checkpoint, nincs raw privát referencia |
| 5 | public life page | P10 | Csak engedett snapshot, badge/timeline/döntés és nyelv |
| 6 | Discovery | P10 | Kurált kollekció/kategória/nyelv/ranking; private/unlisted kizárt |
| 7 | Official Lives | P09 | Valódi AI-szintetikus tartalom, curator, kis költségmért pilot |
| 8 | Community Lives | P11 | Explicit önkéntes kiadás, eredet és opcionális szerző |
| 9 | Save | P10 | Hitelesített, egyedi/idempotens, nincs AI-hívás |
| 10 | Share | P10/P11 | Engedett public/unlisted link és OG, nincs új generálás |
| 11 | Fork this life | P12 | Sanitized checkpointból új saját privát élet, új ID és három period |
| 12 | Report | P10 | Rate-limit/dedup, protected reporter, review/hide/remove/audit |
| 13 | Unpublish | P11 | Új olvasás/fork tiltva, index/token/cache/OG visszavonva |
| 14 | basic category/tag system | P09/P10 | Fix taxonómia, jóváhagyott címke, angol felirat |

## Forrásokat pontosító elfogadott döntések

A [döntési napló](alter_jovo_docs/16_DECISIONS_AND_OPEN_QUESTIONS.md) tételesen rögzíti: alterward márka, kizárólag angol kiadás és elrejtett magyar, valódi OpenAI, Supabase/main, ingyenes privacy/adatjog, v1 megőrzés és új v2 hurok, public MVP a személyes core után, külön összesített 5 USD OpenAI és 5 USD Claude kutatás/audit, Contabo mint későbbi éles cél, kipróbált kulcsos SSH és jelszavas tiltás. A forrás régebbi márka/prémium privacy/social sorrend javaslata ezen felülírással érvényes. Piaci és fizetési kereslet nem tekinthető bizonyítottnak.

## Shared Context implementációs forráscsomag

[Változatlan csomag és integritás](plans/README.md) · [Aktív értelmezés és elfogadás](SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md). A 15 önálló témadokumentumot a master teljesen egybefűzi; a master nem külön 16. követelménycsoport. Az SC-azonosítók forrásfejezetek, a roadmap S0–S7 végrehajtási pontjai ettől külön jelölések. Az eredeti pozicionálási S1–S38 mátrix számozása szintén megmarad.

**Státusz:** S0–S2 implementált; S3 személyes backend/AI/időkezelés elkészült, a teljes friend kiadási kapu még nyitott; S4–S7 tervezett. 001–010 alkalmazva, Shared kikapcsolva. [S0](SHARED_CONTEXT_S0_REPORT_HU.md), [S1](SHARED_CONTEXT_S1_REPORT_HU.md), [S2](SHARED_CONTEXT_S2_REPORT_HU.md), [S3 személyes/time](SHARED_CONTEXT_S3_REPORT_HU.md). A forráscsoportok teljes elfogadása még nyitott. Public MVP megmarad, DM/chat/realtime/public context későbbi.

| Forrásfejezet                                                                                                                              | Elfogadott értelmezés                                                                       | Gazdadokumentum                                               | Státusz   | Feladat            |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | --------- | ------------------ |
| SC00 · [README](plans/alterward_shared_context_implementation_docs/00_README.md)                                                           | Forrás, elsőbbség, teljes csomag és meglévő v2 megőrzése                                    | [Shared integráció](SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) | S0–S2 rész kész | S0–S7              |
| SC01 · [CURRENT_CODEBASE_AUDIT](plans/alterward_shared_context_implementation_docs/01_CURRENT_CODEBASE_AUDIT.md)                           | b75e61d alap: nincs shared kód; meglévő v2, budget, recovery és két queue megőrzendő        | [Shared integráció](SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) | S0–S2 rész kész | S0                 |
| SC02 · [PRODUCT_AND_DOMAIN_RULES](plans/alterward_shared_context_implementation_docs/02_PRODUCT_AND_DOMAIN_RULES.md)                       | Öt típus, létszám/slot/tier, tagság, lifecycle, downgrade, személyes consent                | [Shared integráció](SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) | S0–S2 rész kész | S0–S6              |
| SC03 · [CONTRACTS_AND_TYPES](plans/alterward_shared_context_implementation_docs/03_CONTRACTS_AND_TYPES.md)                                 | Külön Shared 1.0.0, typed candidate/policy/impact és opcionális memory.sharedEvents         | [Shared integráció](SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) | S0–S2 és S3 személyes/time rész kész | S0–S3              |
| SC04 · [DATABASE_AND_MIGRATIONS](plans/alterward_shared_context_implementation_docs/04_DATABASE_AND_MIGRATIONS.md)                         | Additív RLS táblák, uniqueness, tokenhash, shared canon/job és törlési leválasztás          | [Shared integráció](SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) | S0–S2 és S3 személyes/time rész kész | S0–S3              |
| SC05 · [SHARED_ENGINE_AND_CANON](plans/alterward_shared_context_implementation_docs/05_SHARED_ENGINE_AND_CANON.md)                         | Egy shared igazság, tényleges intent/policy, time/revision, lazy impact, fork               | [Shared integráció](SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) | S0–S2 és S3 személyes/time rész kész | S1–S3              |
| SC06 · [API_REPOSITORY_AND_ENTITLEMENTS](plans/alterward_shared_context_implementation_docs/06_API_REPOSITORY_AND_ENTITLEMENTS.md)         | Tagsági API, user-lockos entitlement, idempotencia, globális lock-sorrend                   | [Shared integráció](SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) | S0–S2 és S3 személyes/time rész kész | S0–S3              |
| SC07 · [WORKER_AI_AND_COST_MODEL](plans/alterward_shared_context_implementation_docs/07_WORKER_AI_AND_COST_MODEL.md)                       | Shared AI safe input, max 1 repair, 3 queue fair ciklus, initiator charge                   | [Shared integráció](SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) | S2 implementált | S2                 |
| SC08 · [WEB_UX_AND_USER_FLOWS](plans/alterward_shared_context_implementation_docs/08_WEB_UX_AND_USER_FLOWS.md)                             | Angol Connections, invite/consent, saját decision, pending impact, leave/report             | [Shared integráció](SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) | Tervezett | S3–S6              |
| SC09 · [PRIVACY_CONSENT_MODERATION_DELETION](plans/alterward_shared_context_implementation_docs/09_PRIVACY_CONSENT_MODERATION_DELETION.md) | Allowlist/block/report, anonymizálás/recovery, shared public privacy és multiparty consent  | [Shared integráció](SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) | S0–S2 és S3 személyes/time rész kész | S0/S3, P09/P11, S7 |
| SC10 · [TEST_AND_ACCEPTANCE_PLAN](plans/alterward_shared_context_implementation_docs/10_TEST_AND_ACCEPTANCE_PLAN.md)                       | Limit/authority/privacy/time/concurrency/restart/deletion tesztmátrix, valódi AI friend DoD | [Shared integráció](SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) | S0–S2 és S3 személyes/time rész kész | S0–S6              |
| SC11 · [IMPLEMENTATION_ROADMAP](plans/alterward_shared_context_implementation_docs/11_IMPLEMENTATION_ROADMAP.md)                           | S0–S7 szakaszok, kikapcsolt flag; friend release csak S2+S3 után                            | [Shared integráció](SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) | S0–S2 rész kész | S0–S7              |
| SC12 · [AGENT_EXECUTION_CHECKLIST](plans/alterward_shared_context_implementation_docs/12_AGENT_EXECUTION_CHECKLIST.md)                     | Szeletek közvetlen mainen; AI-termék/EN/helyi fejlesztési döntések megőrzése                | [Shared integráció](SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) | S0–S2 rész kész | S0–S7              |
| SC13 · [REFERENCE_SCENARIOS](plans/alterward_shared_context_implementation_docs/13_REFERENCE_SCENARIOS.md)                                 | A–J friend/romantic/work/sport/quorum/downgrade/fork/delete/split példák                    | [Shared integráció](SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) | S0–S2 rész kész | S0–S7              |
| SC14 · [REFERENCE_IMPLEMENTATION_BLUEPRINT](plans/alterward_shared_context_implementation_docs/14_REFERENCE_IMPLEMENTATION_BLUEPRINT.md)   | Mintakód csak javaslat; lock-sorrend, safe impact/AI és anonimizálás korrekt átültetése     | [Shared integráció](SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) | S0–S2 és S3 személyes/time rész kész | S0–S3              |

A forrás rollout „friend beta → shared AI” sorrendje felülírva: alap/teszt → valódi Shared AI → személyes integráció/biztonság → friend béta. A PR-javaslat main commit-szelet, EN/HU javaslat EN release; a blueprint lock-sorrendje a globális user→context→member/invite/event→branch protokoll szerint javítandó. Árak/billing/grace és a megmaradó próza retentionje nyitott részlet, nem kész vagy bizonyított szolgáltatás. [ADR-023](alter_jovo_docs/16_DECISIONS_AND_OPEN_QUESTIONS.md#adr-023--shared-context-a-privát-életmotorhoz).

S1 új bizonyíték: [S1 megvalósítás és korlátok](SHARED_CONTEXT_S1_REPORT_HU.md). SC05/06 own intent/opt-in/canon/pending memória és SC09 cancel/own history-export implementált, 36 új regresszióval. S2 Shared AI, S3 lazy impact/fork/UI/PII/report és további típusok továbbra tervezettek; a forrás teljes slice-példája ezek előtt nem tekinthető kész friend terméknek.

S2 kiegészítés: SC03 strict safe AI/friend output, SC06 generation/progress API, SC07 shared provider/job/lease/fair worker/repair/initiator budget és SC09 transient input scrub implementált; [S2 riport](SHARED_CONTEXT_S2_REPORT_HU.md), 260 teszt és két valódi izolált angol minta. Personal materializálás/fork/UI/PII/report és teljes Auth/AI proof továbbra S3; a forrás teljes friend slice-ja még nem kiadható.


### S3 részbizonyíték — 2026-10-05

SC03/04: opcionális saját memória és két séma, 010 owner-only RLS. SC05/06: késői intent/lezárás, compatible-month/anchor, exactly-once lazy saját mutation és történeti fork. SC09/10/14: saját export/törlés, snapshot/retry/konkurencia regressziók és valódi izolált angol AI/audit. SC08 UI, SC09 teljes retained privacy/moderáció és valódi Shared Auth-recovery még kapu; [pontos határ](SHARED_CONTEXT_S3_REPORT_HU.md).


## Shared S3: Connections és biztonság — 2026-10-05

Angol Connections/csoport/profil/saját ág/consent/meghívó/idővonal/decision/solo és személyes pending banner implementált; block/unblock, saját privát rate-limited report és szerver-only auditált hold/release/dismiss elkészült. 011 szelektív former-member cleanup, 012 safety/moderation; 001–012 alkalmazva/ismételve, 16 Shared RLS-tábla, összesen 33 aw_ RLS-tábla. 297 teszt/26 fájl, teljes helyi check/build sikeres, 42 schema; 39 korábbi schema és 001–010 változatlan. Két valódi szintetikus Auth-fiókos izolált fixture-UI-próba, paid AI nélkül. Shared false, Contabo és AI-keretek változatlanok. Következő S3 kapu: törölt tagot érintő retained szöveg adatvédelmi megjelenítése és nyers/backup-retention, majd teljes valódi fiókos Shared AI → saját AI → export/törlés/recovery. Entitlement/billing és kiadási deadline külön döntés; üres deadline minden választ megvár, 48h nem alapérték. A retained megjelenítési kérdésre még nincs felhasználói válasz. P06 ops, P09–P13 public MVP és S4–S7 megmarad; friend release még nincs. [Megvalósítás és bizonyíték](SHARED_CONTEXT_S3_UI_SAFETY_REPORT_HU.md).
