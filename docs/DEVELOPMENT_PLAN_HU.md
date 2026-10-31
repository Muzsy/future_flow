---
status: canonical
owner: project
last_reviewed: 2026-10-27
supersedes:
  - archive/superseded/NEXT_STEPS.md
related:
  - STATUS_HU.md
  - ROADMAP_HU.md
  - DOCS_INDEX_HU.md
  - product/PRODUCT_HU.md
  - features/shared/SHARED_CONTEXT_HU.md
---

# Alterward — kanonikus részletes fejlesztési terv

Ez a dokumentum az Alterward végrehajtási master planje. Megőrzi az eredeti `L01`, `P01–P13` és Shared `S0–S7` azonosítókat, és külön kezeli a beolvadt `main`, a draft fejlesztési jelölt és az utolsó igazolt production állapotát.

A magas szintű prioritást a `ROADMAP_HU.md`, a pillanatnyi állapotot a `STATUS_HU.md` adja. Ez a fájl azt mondja meg, hogy az eredeti részletes fejlesztési pontok közül mi készült el, mi maradt részleges, és milyen acceptance gate van még nyitva.

## 1. Státuszok

- `DONE` — az adott fejlesztési eredmény technikailag elkészült; további release-validáció más pontban maradhat.
- `PARTIAL` — lényeges részek elkészültek, de az eredeti pont acceptance gate-je még nem teljes.
- `PENDING` — elfogadott feladat, érdemi implementáció még nincs vagy új fejlesztési kör kell.
- `DEFERRED` — tudatosan későbbi roadmap-fázisra halasztva.
- `SUPERSEDED` — az eredeti scope-ot egy későbbi elfogadott döntés felülírta; a történeti terv megmarad bizonyítéknak.

A `DONE` nem jelent automatikus production release-t. Release-flag, béta, billing vagy publikus engedély külön gate lehet.

## 2. Aktuális végrehajtási sorrend

1. **V9 motor befagyasztása, technikai stabilizálás és zárt béta kiadása** — tulajdonosi prioritásváltás, 2026-10-24. A C5 mérési checkpointot megtartjuk, további editor-/history-/promptfinomítás DEFERRED. Közvetlen feladat a PR-integráció és a v9-kompatibilis N09 frissítés/helyreállítás, majd a teljes tesztelői használati út ellenőrzése és a kis zárt béta előkészítése. Új motorfunkció, archetípus vagy teljes irodalmi benchmark nem béta-előfeltétel. A v9 generációválasztás és [ADR-009](decisions/ADR-009-character-state-artifact-fold.md) megmarad; a biztonsági, adatvédelmi és költségvédelmi kapuk kötelezők.
2. **Shared friend beta hardening** — S3 release-gate-ek, owner downgrade kontroll, sponsored Guest E2E.
3. **Shared friend beta** — legfeljebb öt baráti pár / 10 személy, `friend_group` only.
4. **Billing foundation** — új B01 workstream; payment provider, checkout, webhook és subscription lifecycle.
5. **Shared relationship expansion** — S4–S6 csak friend beta után.
6. **Community/public release** — P13 release-gate; a P09–P12 technikai alap megléte önmagában nem launch.
7. **Scale/platform expansion** — nagyobb katalógus, további nyelvek, mobil és további agent tooling csak valós használat után.

### 2.1. V9 következő végrehajtási lépései — 2026-10-23

Aktuális integrációs alap: `main` = `adf2b951b3f8f584a34007570d3560e08f7fae81` ([#88](https://github.com/Muzsy/future_flow/pull/88), 2026-10-25), v9 C5 a #81 óta; befagyasztott motoralap `7bd4d42`. Production továbbra legacy; a #83/#85 szerveres metadata/health felmérése ezt nem állította át. A zöld CI nem független review, irodalmi PASS vagy kiadás.

**Felülíró tulajdonosi döntés — 2026-10-24:** a további motorfinomítás helyett a zárt béta kiadása az elsődleges. A v9 C5 (`7bd4d42`) a befagyasztott motoralap; ez a döntés nem minőségi PASS. A #67–#68 dokumentáció/evidence és a szükséges stabilizálási/üzemeltetési változások integrálhatók. Új irodalmi hibahipotézis nem indít automatikusan fejlesztési vagy mérési kört. Csak adatvesztést, adatvédelmi/költséghibát, hibás állapotmentést, telepíthetetlenséget vagy a béta alapútját ténylegesen blokkoló működési hibát javítunk a kiadás előtt. Az ismert minőségi korlátokat a béta olvasói visszajelzésében követjük. Részletes lezárási kapu: [bétafókuszú kiadási runbook](operations/NARRATIVE_RELEASE_HU.md#bétafókusz-és-motorbefagyasztás--2026-10-24).

| Lépés | Állapot és függőség | Teljesülési feltétel | Futtatási / döntési határ |
| --- | --- | --- | --- |
| V9-1 — C5 független review | DONE a `75fdda0 → 7bd4d42` diffre: 2026-10-23, külön read-only reviewer APPROVE, actionable finding nélkül; új módosítás új review-t igényel | A #65-höz képesti diff ellenőrzött; v1–v8/fidelity/séma/kapuk izolációja, téves ismétlésjelzés és promptméret áttekintve; megállapítások rendezve, módosítás után releváns teszt/CI zöld | A review nem merge- vagy release-engedély. |
| V9-2 — C5 hatásmérés | PARTIAL; béta előtti mérési kör LEZÁRVA, további kutatás DEFERRED; a külön engedélyezett C5 Flex sorozat 12/12 elfogadott, 6 repair / 81 hívás (részletek lent); a korábbi korlátozott 3-periódusos smoke lezárt: kontroll 3 elfogadott/0 repair, C5 1 elfogadott/1 javítás után elutasított/1 nem indult; 2026-10-24: 3 rögzített eset × 2 editor × 2 kör = 12 valid válasz, azonos főítéletek, ingadozó részdiagnózis; C5-nél kevesebb félbeszakadt feedback, általános hatás/tévespozitív nem igazolt; további history-audit és editorkalibráció DEFERRED, nem blokkolja önmagában a zárt bétát ([#68](https://github.com/Muzsy/future_flow/pull/68)) | A meglévő smoke és 12 editorhívás bizonyítéka megőrzött; a korlát és a béta felé történő továbblépés dokumentált. Általános C5-hatás és teljes N08 továbbra nem igazolt; ez nem új béta előtti kutatási feladat | [C5 mérési runbook](operations/NARRATIVE_EVALUATION_HU.md#c5-ellenőrzés-az-editoros-javítások-offline-elemzése-után--2026-10-23). Codex/agy csak a meglévő kvótaszabályokkal; új paid mérés külön számszerű approval. Nincs automatikus újrafuttatás. |
| V9-3 — PR-lánc rendezése | DONE; a main saját Verify+Container CI40195596461 sikeres; a teljes jelölt független review-ja APPROVE, mindkét P2 javítva, a `bc77cc9` saját Verify+Container zöld. Tulajdonosi engedéllyel #81 merge: `4fb7b489`; húsz rész-PR Git-ős, a stack GitHub-állapota rendezett. | A merge fája a reviewed jelöltével egyezik; a main saját Verify+Container CI40195596461 sikeres (1477 app, Python 403 PASS/11 SKIP, root 3+4+10, mindkét Docker-próba). | A main merge engedélye teljesült; a célgépes proof és éles apply V9-4 külön kapuja. |
| V9-4 — N09 v9-kompatibilis üzemeltetés | DONE — 2026-10-26. A6d17fda/schema038 alkalmazásfrissítés után a #96 reviewed9088275 Daily-javítás normál éles update/backup/offsite/restore/monitor/activate lánca és független readback PASS.97tábla/1711sor/107config, minden eredeti authority és konténer megmaradt, paid0; #95/#34 technikai feladata kész. A régi active-proof újrakiadási korlát dokumentált, #94 diagnosztika külön nyitott. | V9 prompt/policy/artifact értő target és recovery; 038 migráció, titkosított backup, izolált restore/privacy replay; mért byte/timeout határok; drain/legacy visszaállás; private health monitor helyreállítva és ellenőrizve; immutable candidate és audit/CI a végleges egyesített forráson | Közvetlen kiadási munka, további editor-kutatástól függetlenül. Végső proof V9-3 eredményére; éles apply külön engedéllyel. A fejlesztési 192 KiB/300 s nem automatikus production érték. |
| V9-5 — Kis zárt narratív béta | PARTIAL; V9-3/4 lezárt. Saját teljes v9 C5 Playwright-kapu PASS:66062ec/3200b28e,szabályos keretváltás,2v9-fejezet/1mentett választás/kilépés/friss belépés/azonos állapot; teljes saját próba0.671215USD a3USD-ből,0unsettled,friss monitor/runtimePASS. A V9-2 checkpoint megmarad. | Tényleges tesztelők, reader/Auth admission, külön10USD-s window/budget és kis kör; visszajelzés a3./6.fejezetnél | [Saját kapu mért lezárása](operations/NARRATIVE_RELEASE_HU.md#teljes-saját-fiókos-v9-playwright-alapút-pass--2026-10-27). A saját PASS nem aktivál automatikusan tesztelőket vagy új keretet; a mostani3USD és ablak megmarad. 2026-10-27: a háromfős kör (tulajdonos + két tesztelő) láncolt `reader-admission` → `tester-beta` generációként [implementálva és helyben tesztelve](operations/NARRATIVE_RELEASE_HU.md#láncolt-successor-generációk-olvasói-belépés-és-tesztelői-ablak--2026-10-27); review, CI és éles lépések még nyitottak. |

2026-10-27 V9-5: az [engedélyezett forenzikus/Daily-helyreállítás](operations/NARRATIVE_RELEASE_HU.md#reader-kapuhiba-után-engedélyezett-forenzikus-és-daily-helyreállítás-pass--2026-10-27) PASS: 97 tábla / 1711 sor / 107 konfigurációs fájl visszaállítása, monitor/timerek és végső readback zöld. Reader-javítás #105 bf52611 független APPROVE / saját CI SUCCESS, még nem main. Következő a végső reviewed forrás main-integrációja és új exact-source image/célgépes elfogadása, utána új konkrét saját keret/próba. Serving 6d17fda / régi keret, kliens és Daily 03dc190, történetek és elszámolás változatlan, paid 0. V9-4 DONE / V9-5 PENDING. A korábbi sikertelen prepare/restore bizonyítékok megmaradnak. Sikeres teljes saját Playwright nélkül nincs tesztelői bétaindulás.


**2026-10-24, külön tulajdonosi tesztkérés:** a befagyasztott C5 motorral 3-fejezetes előpróba, majd siker esetén 8+1 szöveges, izolált API-s sorozat előkészítése GPT-6.1 Sol Flex módban. A mérőfuttató támogatása implementált, offline 3/3 és 9/9 előellenőrzés sikeres; ez célzott használhatósági/költségpróba, nem új általános motorfinomítás. A felhasználó 2026-10-24-én összesen 7 USD fizetős keretet engedélyezett; új `v9-c5-flex-20261024` source-bound kapu, változatlan eredeti főkönyvvel. A paid sorozat `a44d659` forráson lezárt: **12/12 szöveg, 81 Flex-hívás, 6 javítás, 0 végleges elutasítás; 2,25795565 USD Flex usage-becslés / 5,3705 USD konzervatív accounted**, a közös 7 USD cap alatt. A választott út több fejezeten követhető, az alternatív harmadik eltér; a későbbi állásváltás végrehajtása és tartós fork-eltérés nem tesztelt. **Tulajdonosi pontosítás: 2–4 opció elfogadott; kötelező három opció nem fejlesztési vagy bétaakadály.** Az alternatívák érdemben különböző cselekvést, vállalást vagy következményt hordozzanak, ne ugyanazon irány átfogalmazásai legyenek ([termék](product/PRODUCT_HU.md#5-első-személyes-user-flow)). Nem nyitunk automatikus motorfinomítást vagy új mérést; V9-2 továbbra PARTIAL, emberi/N08 PASS nincs. [Fizetős eredmény](operations/NARRATIVE_EVALUATION_HU.md#c5-flex-fizetős-eredmény--2026-10-24). [Protokoll és költségvédelem](operations/NARRATIVE_EVALUATION_HU.md#c5-flex-tesztsorozat-előkészítése--2026-10-24).

**V9-3/4 kiadási preflight — 2026-10-24:** a `5be123b` one-off/stop-first integráció teljes CI-je sikeres. A held restore-frissítés meglévő útja tíz új célzott teszttel ellenőrzött, a teljes ops regresszió 362 Python PASS / 11 SKIP + 99 Node PASS; a fizikai célgépes próba még hiányzik. A régi replay guard a v9 forrást ténylegesen elutasítja (41 védett eltérés, 038 migráció is), az owner-only receipt sem funded aktív runtime-proof. **Registry-bejegyzés helyett kompatibilis capture/replay és funded proof-contract szükséges**, guardlazítás és eredeti-zero receipt átírás nélkül. Ez a következő célzott kiadási feladat ([#72](https://github.com/Muzsy/future_flow/issues/72)), nem motorfinomítás. A mentett C5 repair 139370 B + 4096 B budget-tartalék = 143466 B: a 131072 B runtime-példa kevés; meglévő 196608 B határon belüli konkrét selection és költségfoglalás ellenőrzendő, éles átállítás nélkül. A konkrét új forrás független auditja, saját CI-je és a célgépes bizonyíték megmaradó kapu. [Runbook és bizonyítékhatár](operations/FUNDED_RUNTIME_UPGRADE_HU.md#kiadási-előellenőrzés-hosszabb-hold-és-legacy-replay--2026-10-24).

**#72 implementáció — V9-3/4 továbbra PARTIAL:** a legacy guard megőrzése mellett külön, a befejezett funded átmenetből levezetett aktív proof és v9 image-et használó funded capture/replay út készült. Capture readonly snapshot és replay előtti/utáni strict artifact/karakterállapot-ellenőrzés, saját fresh plan/audit/CI és eredeti authority-kötés. Célzott DB-regresszió 28/28 PASS; teljes source CI/root-Docker és független audit/konkrét célgépes E2E még külön gate. A 16. `fundedReplayProof` fixture-check és a valódi PostgreSQL v9 privacy companion e változás része. [Runbook](operations/FUNDED_RUNTIME_UPGRADE_HU.md#v9-funded-capturereplay-út--72-fejlesztési-implementáció-2026-10-24). Nincs main merge, új budget/window vagy production aktiválás.

**#75 — konkrét béta-konfiguráció és próbamenet, 2026-10-24**

Előkészített runtime: v9 C5 / fiction-v2, **196608 B / 300000 ms**, szintetikus [selection.runtime minta](../deploy/narrative-beta-runtime.example.json). A #74 `ab9eb3f` Verify+Container CI-je és külön fejlesztési review-ja sikeres; új forrás és majdani main külön bizonyítékot kér. A konfiguráció SQL-budget próbája a mért nagy repairre 0,478665 USD előfoglalást igazol, ami a korábbi 0,188585 USD költés után nem fér a régi 0,50 USD userkeretbe. Mai live maradék nem lett lekérdezve. Az upgrade nem emelhet budgetet, nem adhat új admissiont és nem nyithat új ablakot. A termék nem választ explicit Flexet; a korábbi Flex mérőadapter nem production tier/latency proof. A 3 fős 10 USD kör végrehajtható új-window/admission útja, a tényleges target image-hez való fixture-producer és a reviewed Daily/monitor telepítési/readback út még kiadási feladat. V9-3/4 és V9-5 továbbra PARTIAL/PENDING. [Konkrét fázisok és megállási pontok](operations/NARRATIVE_RELEASE_HU.md#konkrét-béta-konfiguráció-és-próbamenet--75-2026-10-24). Nincs live művelet, paid hívás vagy main merge.


**#76 — önálló image-próba, 2026-10-25:** implementált a Linux/root standalone CLI és a közös CI/standalone tesztmotor. Egy pontos image-et igazol target/recovery szerepre, saját TLS/PostgreSQL/belső hálózattal és szintetikus adatokkal; nem örököl CI/provider/DB envet, proofot csak ellenőrzött forrás, 16 check és sikeres cleanup után ír. Tíz új unit teszt PASS; teljes Python 382 PASS / 11 SKIP, Node102 PASS. Új exact-source CI és tényleges célgépes futás még külön szükséges; V9-4 PARTIAL marad. [Futtatás és korlátok](operations/FUNDED_RUNTIME_UPGRADE_HU.md#önálló-kiadási-image-próba--76-2026-10-25). Nincs production/paid/ablakváltozás. A tulajdonos a béta előtt 10 USD feltöltést tervez; ehhez a feladathoz nincs szükség fizetős hívásra. A `b665934` CI-je sikeres, a független review P2 one-off timeout-cleanup hibát talált. Javítása tartós, forkok között is látható helper intent/név/label/image/ID nyilvántartás; tíz új helper-unit regresszió és két tényleges Docker hibaág került a próbába. A re-review további P2 hibáját is javítottuk: sikertelen cleanup vagy foreign-state readback esetén mindkét réteg megőrzi a privát munkakönyvtárat és intenteket, sikeres proof nélkül. Ezt külön orchestration regresszió ellenőrzi. A végső `1c8c3de` [Verify+Container CI-je](https://github.com/Muzsy/future_flow/actions/runs/40177172040) sikeres, a célzott független re-review APPROVE (21/21 saját teszt). A teljes Python-kör 393 PASS / 11 SKIP, az alkalmazástesztek 1477 PASS; mindkét Docker-próba sikeres. Ez nem teljes main-diff audit vagy célgépes proof.



**#80 — kiadási konszolidáció, 2026-10-25:** az aktív `codex/v9-beta-release-candidate` a #79 végső forrására épülő, egyetlen main-célú jelölt. A távoli main `a666c905` és mind a húsz rész-PR aktuális feje Git-ős; konfliktus nincs, a teljes `apps/` és `packages/` a C5-höz bájtazonos. A `c68ab037` konszolidáció csak kiadási dokumentációt rendezett; a teljes review utáni célzott operátori javítások külön, lent követettek. A jelölt saját CI-je és a teljes main-diff független review-ja külön kapu; a #79 szűkebb APPROVE-ja ezt nem helyettesíti. Main merge, célgépes futás és paid aktiválás nem történt. [Konkrét átadás és megállási feltételek](operations/NARRATIVE_RELEASE_HU.md#egyesített-kiadási-jelölt--80-2026-10-25). V9-3/4 PARTIAL, V9-5 PENDING.

A V9-2 nem vezet be új számszerű minőségküszöböt. Kevesebb repair csak akkor kedvező eredmény, ha a valódi hibák is csökkennek; az ismétlés figyelmen kívül hagyása nem siker. A teljes kétprofilos és független emberi N08 bizonyítás nyilvános/fizetős kiadás előtt kötelező; a zárt béta elfogadott helyettesítő kapurendje ezt nem teljes N08 PASS-ként könyveli el.

A részletes technikai specifikáció a [creative tervben](plans/CREATIVE_FICTION_IMPLEMENTATION_HU.md) és az [élő világ tervben](plans/alterward_v8_living_world_feasibility_audit_2026-10-20.md) marad; új párhuzamos végrehajtási terv nem készül. Minden továbblépéskor e táblázat és a [STATUS](STATUS_HU.md) együtt frissítendő.

### 2.2. Nyilvános/fizetős indulás előfeltételei — 2026-10-30

Az „éles indulás” három külön lépcső: **A)** a most futó zárt tesztelői ablak (2026-11-28 01:17 CET-ig), **B)** szélesebb zárt kör (legfeljebb 10 fő, új tulajdonosi döntés és új ablak kell, mert a tesztelői ablak egyszeri), **C)** nyilvános és/vagy fizetős indulás. A C nincs engedélyezve. A motor (v9 C5) befagyasztott; a C-nek nem előfeltétele motorfejlesztés.

| Kapu | Állapot | Megjegyzés |
| --- | --- | --- |
| N08 teljes paid + emberi bizonyítás vagy külön, rögzített tulajdonosi helyettesítés | NYITOTT | A 2026-10-19-i helyettesítő kapurend csak a zárt bétára szól. Új paid mérés új számszerű engedélyhez kötött. |
| Béta-visszajelzés (3./6. fejezet kérdőív, folytatás, költség/fejezet) | FOLYAMATBAN | Az ablak 2026-11-28-ig tart. |
| B01 billing (provider, checkout, webhook, életciklus, termékegyenleg) | PENDING | A csomag- és árdöntés tulajdonosi; a havi 8+4 fejezet csak javaslat. |
| P13 public release gate (privacy, moderáció, fork, retention, cohort, költségfelelősség) | PARTIAL | Csak a személyes béta és a Shared-sorrend döntése után aktuális. |
| Regisztráció megnyitása, Cloudflare Access leválasztása, visszaélés elleni védelem | NYITOTT | Ma a Supabase önregisztráció KI, belépés csak meghívással. A változás biztonsági határ-változás: ADR és célzott negatív tesztek kellenek. |
| Felhasználási feltételek, végleges adatkezelési tájékoztató (feldolgozók, megőrzés), DPA-k, üzemeltetői/jogi forma | PARTIAL | WP-L: a `/terms` ÁSZF-oldal és a bővített `/privacy-notice` (feldolgozók, jogalap-javaslat, megőrzés, jogok, hozzájárulás-visszavonás, sütik) **vázlatként, jogi átnézésre váró jelöléssel** elkészült (PR-ben, merge és deploy külön engedéllyel). Üzemeltető (D7): egyéni vállalkozó, adatai az oldalakon, a hivatalos nyilvántartással ellenőrizendő; korhatár: 18 év. Nyitott: tartalom-licenc, fizetési/megújítási/elállási rész (billing-döntés után), felelősség/irányadó jog (jogász), DPA-k és szolgáltatói régiók, M3; a `/terms` nyilvános elérése tulajdonosi döntés (2026-10-30), a kód a PR-ban, a Cloudflare Access bypass külön lépés. A jogi jóváhagyás tulajdonosi feladat. |
| Független mentési tárhely, kulcsőrzés, operátori gép kivezetése, M3 (történeti másolatok lejárata) | NYITOTT | A mentési kulcs és az egyetlen szerveren kívüli példány ma az operátori gépen van. |
| Szolgáltatói oldali költséglimit (OpenAI), Supabase csomag/mentés, riasztási csatorna, kapacitás (egy worker) | ELLENŐRIZENDŐ | Dashboard-ellenőrzés tulajdonosi hozzáférést igényel; nyilvános nyitás fokozatos (várólista) javasolt. |

A tételes munkalista és a tulajdonosi döntések sorrendje nem része a repónak; ez a táblázat a kanonikus kapuállapot.

## 3. Personal / public execution plan — L01, P01–P13

| ID  | Státusz | Eredeti cél / jelenlegi értelmezés                                                                                                                     | Kanonikus forrás                                                                                                        | Fennmaradó gate / következő lépés                                                                                                                                                                                                       |
| --- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L01 | DONE    | Angol-first lokalizációs alap. A technikai locale-kezelés megvan; a magyar indulás tudatosan halasztott.                                               | `product/PRODUCT_HU.md`, `architecture/ARCHITECTURE_HU.md`                                                              | Magyar termék csak külön későbbi roadmap-döntéssel.                                                                                                                                                                                     |
| P01 | DONE    | Verziózott időszak, identitás, cél, WorldState, ownership, revision/idempotency alap.                                                                  | `architecture/ARCHITECTURE_HU.md`, contractok + migrációk                                                               | Nincs külön nyitott implementációs gate; regressziót fenn kell tartani.                                                                                                                                                                 |
| P02 | DONE    | Rövid AI-időszak, strukturált események, canon-validáció és narráció.                                                                                  | `product/PRODUCT_HU.md`, `architecture/ARCHITECTURE_HU.md`, `AI_MODEL_ROUTING_HU.md`                                    | Minőség és valós használói elfogadás P07/P08 alatt.                                                                                                                                                                                     |
| P03 | DONE    | Döntés, same-branch folytatás, history fork, atomic consequence és stale/idempotency védelem.                                                          | `product/PRODUCT_HU.md`, `architecture/ARCHITECTURE_HU.md`                                                              | Nincs külön nyitott implementációs gate.                                                                                                                                                                                                |
| P04 | DONE    | Rövid onboarding, draft/revision, visszatérési felület, timeline és folytatás/fork UX alap.                                                            | `product/PRODUCT_HU.md`                                                                                                 | Valós béta-frikció és session-célok P08-ban mérendők.                                                                                                                                                                                   |
| P05 | DONE    | Canon/memória input, célzott repair, project/user budget és költségőr.                                                                                 | `architecture/ARCHITECTURE_HU.md`, `AI_MODEL_ROUTING_HU.md`                                                             | Production/béta allowance aktiválás P08/B01 release-szabály szerint.                                                                                                                                                                    |
| P06 | DONE    | Valódi Auth/DB/browser flow, ownership, export/delete és recovery/backup technikai felkészítés.                                                        | `operations/BETA_HU.md`, `operations/BACKUP_HU.md`, `operations/RECOVERY_HU.md`, `operations/SECURITY_OPERATIONS_HU.md` | A konkrét tesztelői admission és indulás előtti candidate restore P08 feladata.                                                                                                                                                         |
| P07 | DONE    | Technikai, angol AI- és szerkesztői pre-beta minőségkapu; determinisztikus és valódi AI minták.                                                        | `operations/TESTING_HU.md`, `AI_MODEL_ROUTING_HU.md`                                                                    | A valódi használói minőség nem tekinthető bizonyítottnak; P08 méri.                                                                                                                                                                     |
| P08 | PARTIAL | Korlátozott angol személyes béta és continuation/retention mérés. Az első tesztelő aktiválva, valódi háromfejezetes E2E kész; szélesebb kohorsz és retention még nyitott.    | `operations/BETA_HU.md`, `STATUS_HU.md`                                                                                 | Első reader/login/backup+restore/30 napos window/paid E2E megtörtént; további meghívottnál saját admission. Későbbi sessionből sikeres folytatás és valós feedback/retention nyitott. A legfeljebb 10 fős első kör változatlan.   |
| P09 | DONE    | Publication/PublicSnapshot/ScenarioVersion/Official foundation, privacy/review/curation és angol seed-katalógus.                                       | `product/PRODUCT_HU.md`, `STATUS_HU.md`                                                                                 | A technikai foundation nem public release; P13 dönt a launchról.                                                                                                                                                                        |
| P10 | DONE    | Discovery/read-only public surface, category/search/curation, Save/Share/OG/Report és moderation foundation.                                           | `product/PRODUCT_HU.md`, `STATUS_HU.md`                                                                                 | Valós public release, ranking/engagement minőség és kohorsz P13-ban.                                                                                                                                                                    |
| P11 | DONE    | Community publication lifecycle, private/unlisted/public, preview/Confirm, revoke/unpublish/delete/cache/permission alap.                              | `product/PRODUCT_HU.md`, `operations/SECURITY_OPERATIONS_HU.md`                                                         | Production public enablement csak P13 release-gate után.                                                                                                                                                                                |
| P12 | DONE    | Public life/decision fork, private restart, Scenario personalization, attribution/consent alap.                                                        | `product/PRODUCT_HU.md`, `STATUS_HU.md`                                                                                 | Valós használói konverzió és public release P13 alatt.                                                                                                                                                                                  |
| P13 | PARTIAL | Nyilvános indulási kapu, public/community mérés és release governance. Az infrastruktúra jelentős része elkészült, publikus launch nincs engedélyezve. | `ROADMAP_HU.md`, `STATUS_HU.md`, `product/PRODUCT_HU.md`                                                                | Privacy/permission/moderation/fork/retention végső release review; valós public cohort; költség- és üzemeltetési felelősség; explicit launch döntés. Jelenlegi roadmap szerint ez csak a korábbi béta- és Shared-fázisok után aktuális. |

### P08 — végrehajtott első aktiválás és fennmaradó gate

Az első tesztelő alábbi aktiválási lánca megtörtént: reader/login, candidate backup/izolált restore, egyszeri funded ablak és háromfejezetes signed-in paid E2E. Az eredeti ablak 2026-10-13T22:11:21Z–2026-11-12T22:11:21Z, 2 USD projekt / 0,50 USD user; újraaktiválás vagy ledger-reset nem következik ebből a tervből. Későbbi sessionből sikeres új generálás és szélesebb feedback/retention továbbra mérendő.

További résztvevő vagy külön kiadás esetén a kanonikus sorrend és az eredeti ablak megmarad:

1. konkrét, legfeljebb 10 fős tesztelőlista;
2. invite és első login;
3. email ↔ Auth UUID / reader hozzáférés pontos binding; ha korábbi reader-előkészítés lejárt és nem lett alkalmazva, előbb annak explicit archiválása (`--archive-expired-readers`, `PERSONAL_BETA_READER_OPERATOR_HU.md`). Az első végrehajtás pontos forrás/audit/CI/fixture és friss napi eszköz kapui teljesültek; új kiadásnál új, pontos forráshoz kötött bizonyíték kell;
4. friss candidate backup és ellenőrzött restore, az előkészítéstől számított 15 percen belül az apply-jal együtt;
5. a jóváhagyott eredeti window/budget megőrzése; az egyszeri első `--apply-personal` már megtörtént, további reader nem indít új 30 napot;
6. signed-in, valós fizetett AI E2E;
7. monitor/rollback ellenőrzés;
8. első kohorsz indítása és feedback/continuation mérés.

Shared ebben a körben OFF.

## 4. Shared execution plan — S0–S7

| ID  | Státusz  | Eredeti cél / jelenlegi értelmezés                                                                                                                                                                | Kanonikus forrás                                                              | Fennmaradó gate / következő lépés                                                                                                                             |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S0  | DONE     | Shared domain/contract/storage, context lifecycle, invite/membership és entitlement foundation.                                                                                                   | `features/shared/SHARED_CONTEXT_HU.md`                                        | Regresszió és release flag fenntartása.                                                                                                                       |
| S1  | DONE     | `friend_group` common canon/state, participant intent és döntési alap.                                                                                                                            | `features/shared/SHARED_CONTEXT_HU.md`                                        | Valós friend beta S3 release-gate után.                                                                                                                       |
| S2  | DONE     | Shared AI queue/worker, validation/repair, initiator project/user budget és rate-limit.                                                                                                           | `features/shared/SHARED_CONTEXT_HU.md`, `product/MONETIZATION_HU.md`          | Béta alatt költségtelemetria és initiator attribution ellenőrzés.                                                                                             |
| S3  | PARTIAL  | Friend release readiness: personal impact, Auth/privacy/recovery, lifecycle és valós kétfős működés. Technikai foundation jelentős része kész, release továbbra OFF.                              | `features/shared/SHARED_CONTEXT_HU.md`, `operations/BETA_HU.md`               | Owner downgrade `end/archive/revoke` kontroll; retention/personal-impact review; targeted sponsored Guest E2E; kétfős valós privacy/cost/rollback ellenőrzés. |
| S4  | DEFERRED | `romantic_relationship` termékrelease. A domain típus létezik, product-create zárt.                                                                                                               | `features/shared/SHARED_CONTEXT_HU.md`                                        | Friend beta értékelése után mutual consent, unilateral end és max-1/user termékdöntés + teszt.                                                                |
| S5  | DEFERRED | `work_project` és `hobby_group` release.                                                                                                                                                          | `features/shared/SHARED_CONTEXT_HU.md`                                        | S3/S4 tapasztalat, típusos governance/authority és külön acceptance suite.                                                                                    |
| S6  | DEFERRED | `sports_team`, nagyobb roster/quorum/governance.                                                                                                                                                  | `features/shared/SHARED_CONTEXT_HU.md`                                        | S5 után; max 20, subset/quorum és concurrency/lock terhelési proof.                                                                                           |
| S7  | PARTIAL  | Eredeti vegyes késői csomag: sponsored seats + további group/fork/directory/public többfél funkciók. A targeted Friend sponsored Guest seat elkészült; a többi nem egyetlen release-egység többé. | `features/shared/SHARED_CONTEXT_HU.md`, `product/MONETIZATION_HU.md`, ADR-005 | Sponsored Guest: DONE. Directory/public multi-party/fork bővítések: DEFERRED és külön specifikációt/release-döntést igényelnek.                               |

### Shared friend beta belépési feltétele

A következő Shared-kör csak akkor indulhat, ha:

1. a személyes P08 első kör értékelve van;
2. downgrade lifecycle döntés implementálva és tesztelve;
3. common/personal impact retention szabály ellenőrzött;
4. targeted Free sponsored Guest meghívás valódi kétfős E2E-ben működik;
5. initiator entitlement és AI cost attribution mérhető;
6. block/leave/end/archive/revoke/export/delete/recovery negatív útvonalak fail-closed működnek;
7. Shared flag külön, kontrolláltan aktiválható.

Első scope: `friend_group`, öt baráti pár, legfeljebb 10 személy.

## 5. Új, az eredeti azonosítókon kívüli workstreamek

### N00–N09 — Personal narrative quality — IN PROGRESS

A felhasználó által jóváhagyott történetminőségi fejlesztés. Issue #24; végrehajtási specifikáció: [NARRATIVE_QUALITY_IMPLEMENTATION_HU.md](plans/NARRATIVE_QUALITY_IMPLEMENTATION_HU.md).

N00–N07: DONE, PR #25–#33. A v6 és v7 után a v8 is beolvadt fejlesztési alap: `main` = `a666c905`, qualityPolicy 2.7.0. Az aktív jelölt **v9 C5**, qualityPolicy 2.8.0, planner/author/reviewer/editor v9, fidelity v1; draft #66 a #57–#65 függő lánc fölött. Ez nem beolvadt vagy élesített állapot. A régi snapshotok megmaradnak, a v8 befagyasztott baseline.

**N08: PARTIAL.** A korábbi v6/v7 mérések részleges történeti korpuszok, nem mai teljes PASS vagy költségengedély. A C5 előtti Codex S1–S4 20/20 elfogadott fejezetet és hét editoros repairt, két paid v9-m futás négy próbából három elfogadottat és két editoros repairt adott. A két futtatás arányai nem vonhatók össze. A kilenc javítás offline elemzése kész, de független emberi PASS nincs. A C5 utáni korlátozott smoke elkészült, javulási bizonyíték nélkül. Új paid mérés új számszerű engedélyhez kötött; a régi ledger és korpusz megmarad. [Mérési eljárás](operations/NARRATIVE_EVALUATION_HU.md#c5-ellenőrzés-az-editoros-javítások-offline-elemzése-után--2026-10-23).

**N09: PARTIAL.** Production narrative aktiválás nincs igazolva. Linux funded-runtime upgrade: Issue #34 / draft #56 ([operátori runbook](operations/FUNDED_RUNTIME_UPGRADE_HU.md)); a v1–v8 támogatás nem elég a v9 kiadáshoz. A végleges target/recovery image, 038 migráció, backup/restore/privacy replay, drain/fence/reconcile, mért request-byte/timeout és explicit apply/readback proof nyitott. A normál Linux-operátori adatátvétel O01-ben kész. A zárt béta elfogadott helyettesítő minőségkapui megmaradnak, a konkrét jelölt v9-re változott; nyilvános/fizetős kiadásra a teljes N08 kötelező. [Kiadási kapuk](operations/NARRATIVE_RELEASE_HU.md).

**Élő világ v9 — implementált draft, részben diagnosztizált.** [Terv és döntések](plans/alterward_v8_living_world_feasibility_audit_2026-10-20.md), [ADR-009](decisions/ADR-009-character-state-artifact-fold.md). A 0. fázis v8 baseline kész; az 1–4. fázis contract/fold/projection/policy/negatív kontroll technikai eredményei a draft láncban megvannak. A 0–5. offline szakasz korábbi köre 2026-10-21-én lezárult; a diagnosztikát követő C2–C4 korrekciók és korlátozott paid próbák nem teljes v9 minőségi lezárás. A C5 külön új review-/mérési kör, nem a korábbi offline lezárás visszavonása. A 6. humán, 7. teljes paid és 8. N09 rollout fázis nem DONE; a részleges paid próbák nem teljesítik a 7. fázist. A +15%-os fejlesztési költségtolerancia megmarad; a C5-re nincs igazolt költséghatás.

**C5 — 2026-10-23:** kilenc editoros eset elemzése után tulajdonosi engedéllyel implementált elsőváltozat-/oksági ismétlés-korrekció a v9 promptokban. Változatlan v8, fidelity, schema, minőségi és költségkapuk. A `7bd4d42` Verify/Container CI zöld (125 fájl / 1446 teszt); független statikus review APPROVE (2026-10-23). A célzott smoke nem igazol javulást: kontroll 3/3, C5 1 elfogadott + 1 javítás után elutasított + 1 nem indult; a vitatott novelty-kifogás és az átírásban létrejött új zárási hiba célzott elemzése következik. A review nem irodalmi bizonyíték. [Scope és kompatibilitás](plans/CREATIVE_FICTION_IMPLEMENTATION_HU.md#v9-első-változat-és-oksági-ismétlés--c5-2026-10-23).

Következő feladatok és függőségeik: [V9-1–V9-5](#21-v9-következő-végrehajtási-lépései--2026-10-23). Modellváltás, kapulazítás, ledger-reset vagy automatikus rollout nincs.

### F00–F06 — Szabad alkotói személyes fikció — IN PROGRESS

Issue #45; alap: [creative terv](plans/CREATIVE_FICTION_IMPLEMENTATION_HU.md), [ADR-008](decisions/ADR-008-creative-fiction-final-author-canon.md). F00–F04 technikai alap implementált: szerző által véglegesített candidate/plan/StoryFact/chapter csomag, author utáni ellenőrzés, prefix-fork, privacy/export/delete és recovery fixture. A régi snapshotok megmaradnak; production utolsó igazolt állapota legacy/üres narrative cohort.

**F05 PARTIAL:** az aktív v9 C5 implementáció és regressziók kész, exact-source CI sikeres; a C5 független statikus review-ja APPROVE, de a célzott smoke után a hasznosság és az emberi élmény/retention bizonyíték nyitott. A korábbi szövegek ügynöki/AI olvasása nem helyettesíti a független emberi értékelést.

**F06 PARTIAL:** compatible-mode/fallback védelem és korábbi lokális recovery próbák kész; a v9 pontos egyesített forrásához kötött Linux target/recovery és kontrollált rollout még szükséges. A korábbi verziók proofja nem vihető át automatikusan.

### B01 — Billing foundation — PENDING

Az entitlement modell elkészült, de ez nem kész fizetési rendszer.

Kell:

- payment provider döntés;
- checkout;
- subscription state + webhook;
- entitlement sync;
- upgrade/downgrade/cancel/grace;
- retry/idempotency;
- invoice/tax/legal integrációs határ;
- billing + AI cost telemetry;
- a személyes fejezetmodell külön jóváhagyása a mért minőség/használat/költség alapján;
- csak jóváhagyás után külön termékegyenleg, idempotens foglalás/fogyasztás/visszaadás, az USD-budget ledger változtatása nélkül.

Kanonikus forrás: `product/MONETIZATION_HU.md`.

### D01 — Shared owner downgrade data-control hardening — PENDING

A jelenlegi kód aktív host entitlementet kér owner `end`, `archive` és pending invite `revoke` művelethez. Ajánlott termékirány: create/invite/generate marad paywalled, de downgrade után az owner adat-/biztonsági kontrollműveletei maradjanak elérhetők.

Kanonikus forrás: `features/shared/SHARED_CONTEXT_HU.md`.

Ez a legközelebbi új kódos hardening feladat a Shared friend beta előtt.

## 6. Roadmap-kapcsolat

| Roadmap                               | Részletes terv                             |
| ------------------------------------- | ------------------------------------------ |
| P0 Documentation governance           | DONE; nem része a régi P01–P13 számozásnak |
| P1 Personal beta activation           | régi P08 fennmaradó release gate-ek        |
| P2 Shared friend beta                 | S3 + S7 sponsored Guest kész része + D01   |
| P3 Billing foundation                 | B01                                        |
| P4 Shared relationship expansion      | S4–S6                                      |
| P5 Community/public release expansion | P13; P09–P12 foundation már nagyrészt DONE |
| P6 Scale/platform expansion           | eredeti MVP utáni/deferred scope           |

## 7. Történeti baseline és traceability

A teljes korábbi végrehajtási napló és checkpoint-sor nem törlendő és nem írható át aktív tervvé:

- `archive/superseded/NEXT_STEPS.md` — eredeti részletes backlog/checkpoint-történet;
- `archive/superseded/REQUIREMENTS_TRACEABILITY_HU.md` — a korábbi teljes stratégiai/requirements mátrix;
- `alter_jovo_docs/` és egyéb régi specifikációk — történeti baseline/supporting források.

Új fejlesztési döntést ebbe a kanonikus `DEVELOPMENT_PLAN_HU.md`-be, a témaspecifikus kanonikus dokumentumba, ADR-be vagy Issue/PR-be kell írni — nem a történeti checkpointokba.

## 8. Agent használat

Planning/implementation task esetén minimális sorrend:

1. `AGENTS.md`;
2. `DOCS_INDEX_HU.md`;
3. `STATUS_HU.md`;
4. `DEVELOPMENT_PLAN_HU.md` releváns pontja;
5. a feladathoz tartozó kanonikus product/feature/architecture/operations dokumentum.

Ha a terv és a kód eltér, az `AGENTS.md` konfliktusszabálya érvényes: a tényleges működést a kód mutatja, a kívánt üzleti viselkedést a kanonikus spec/ADR; az eltérést explicit gapként kell kezelni.

### O01 — Linux personal beta operator host — DONE (normál operátori scope)

Reader/funded/daily/fence CLI Linux-host támogatás és az eredeti privát operátori state ellenőrzött átvétele elkészült PR #21-ben (`0b57f7f`). Exact-source CI/audit/root fixture és valódi reader/funded/backup/sync/restore/monitor végrehajtás sikeres; a normál munkához Windows-agent nem szükséges. Az owner-image deployment és a régi Windows scheduler nem került át. A már funded alkalmazás narratív runtime-upgrade támogatása külön nyitott Issue #34 / N09, nem O01 adatátvételi hiány. Kanonikus keret: `operations/BETA_HU.md`; runbook: `operations/LINUX_OPERATOR_HU.md`.


## 9. Történeti minőségi és költségcheckpointok

Az alábbi szakaszok az adott korábbi forráshoz és időponthoz tartoznak. Aktuális authority/selected policy: az N08/F05 összefoglaló és STATUS; a régi „következő”, „aktuális” és keretértékek nem új végrehajtási engedélyek.

### Szekvenciális minőség — PR #47, korábbi kiegészítés

A végső e5e7ed2 kód CI-je 90 fájl / 966 teszt, Verify/Container sikeres. Új planner/author/reviewer v3, editor v2 és qualityPolicy 2.1.0; minden dimenzió >=4, pass verdict és négy igaz sequenceReview-jelzés kötelező, exact owned lefedéssel. Utolsó három owned legacy/narrative/creative fejezet scene/nyitó/záró bizonyítéka a közös 12 KiB keretben, withheld/prefix privacy megtartva. Choice-sorrend authorityja a history.position; örökölt timestamp megmarad. Régi job/payload és ledger nem íródott át.

A pozitív kontroll átment, a korábbi ismétlődő negatív kontrollt az új editor elutasította. A 04cee85 kétprofilos diagnózis hat teljes fejezetet adott (három-három periódus), mind öt hívással és javítás nélkül, minden pont >=4. A technikai ordering-hibán megállt fork új e5e7ed2 regressziója explicit régi prefix-provenance mellett öt hívással átment. A két forrás mérései külön maradnak; ez nem a teljes benchmark átnevezése. Független emberi, gazdaságossági/időbeli és target/recovery kapuk nyitottak.

Globális ledger: **229 hívás / 6,79395 USD accounted**, 6,3036081 USD usage-becslés; nulla ismeretlen használat/hozzárendeletlen foglalás. Az engedélyezett összesen 10 USD-ból **3,20605 USD** maradt. A hét új elfogadott fejezet kis mintás accounted átlaga 0,2508782 USD; a hibás forktervezést is számolva 0,2723329 USD. Nincs árazási vagy éles aktiválási döntés.

### HQ1–HQ8 — Emberibb, hosszú távon változatos fikció — IMPLEMENTED CANDIDATE / HUMAN VALIDATION PENDING

Issue #45, PR #47 utáni v4 csomag; [végrehajtási terv](plans/alterward_fiction_human_quality_development_plan_codex.md). V3 freeze, quality 2.2.0/editor v3/report 1.2.0, prose/system szétválasztás, három új sequence kapu, védett három raw előzmény + max8 compact signature, unchanged 12 KiB/max9/egy repair. Creative-only max6 period, külön teljes sequence/fork human-review és H1/H2 diagnosztika, régi benchmark változatlan. Nincs új paid mérés vagy production apply; az offline implementáció nem emberi PASS. A végrehajtás Claude Code/Antigravity elkülönített részfeladataival, közös Codex integrációval történik.

Technikai ellenőrzés: 93 fájl / 998 teszt, format/docs/typecheck/build/schemas PASS. Nyolcprofilos max6 creative-only offline futás: 48 főági + 2 fork minta, 250 mock transport, nulla failure/repair, 10 olvasói bundle. Emberi H1/H2, külön valódi editor-kalibráció és N09 nem zárult le; új paid/production művelet nem történt.

[PR #48](https://github.com/Muzsy/future_flow/pull/48), első implementációs forrás 3147d33: Verify/Container #321 sikeres, 93 fájl / 998 teszt. A végső promptpontosítás 34 célzott teszttel ellenőrzött; végleges HEAD/CI a PR-ben, self-merge nélkül.


### Valódi v4 részdiagnózis — 2026-10-17

Külön tulajdonosi utasításra tiszta 3809c56 forrással egy alkotói profil három főági és egy alternatív fejezete ténylegesen elkészült: négy végső kapu-PASS, 26 hívás, két javítás, 1.410585 USD accounted, P95 420594 ms. Az ügynöki olvasás konkrét jeleneteket és érdemben eltérő ágakat talált, de a határidős/órakeretes lehetőségek visszatérése nyitott kockázat. A köztes elutasítások részletes oka completion után nem maradt meg; a következő szintetikus eval előtt ez külön diagnosztikai javítás. F05/F06/N08/N09 továbbra PARTIAL/nyitott: független emberi H1/H2, külön editor-kalibráció és ár/idő/rollout döntések hiányoznak. Globális ledger 255 / 8.204535 USD, maradék 1.795465 USD a 10-ből. Nincs éles módosítás vagy ledger-reset. Részletek: STATUS és a mérési runbook.


### 045 — v5 progression/behavior + local repair provenance

F05/F06 follow-up IN PROGRESS, merged PR #48 actual base 058555005e7e85905cf53081bfa18226780cf9ac. [045 részletes végrehajtás](plans/045_fiction_v4_1_real_quality_iteration.md). V1–v4 freeze, külön v5/quality2.3/editorv4, report1.2 változatlan; az ajánlatlánc és azonnali önkorrekció visszatérésének célzott javítása, eval-only elutasítás/javítási bizonyíték. Cél: két profil hat-hat főági fejezete és két fork, majd külön emberi audit. Owner numeric authorization: legfeljebb új 7 USD / kumulatív 15.204535 USD, korábbi ledger megőrzésével. Technical/real/human eredmény külön; N09/production nem része.

045 technikai implementáció kész, PR #49 draft / CI 326 SUCCESS; részletes 14-célos offline próba PASS. Valódi eredmény 8 elfogadott, 1 elutasított, 5 nem generált: alkotói 6+fork kész; munkahelyi második fejezet ismétlődő lezárás miatt elutasított, a planner repair már elfogyott. Nincs teljes kétprofilos bizonyítás vagy quality release. Új 50 hívás / 2,527495 USD, kumulatív 305 / 10,732030 USD, maradék 4,472505 USD az új 7-ből. F05/F06/N08 PARTIAL, N09 nyitott. A következő korrekció a first-draft hivatkozási konzisztenciát és a döntésfelület prózába ismétlését kezeli; nem növeli a javítási limitet. Részletek: STATUS és 045 terv.

### V6 kezdeti végrehajtási checkpoint — 2026-10-18

PR #49 merged (`1e1b4303dd779ad8e8b34970892302583a7f66dd`), a korábbi draft-státuszok történetiek. A [v6 terv](plans/045_fiction_v6_earned_life_evolution.md) végrehajtása folyamatban: külön v6/quality2.4/editorv5, v1–v5 freeze, okságilag kiérdemelt életfejlődés menetrend nélkül, goal/actor regressziók. F05/F06/N08 továbbra PARTIAL; emberi minőség nincs igazolva. Új numerikus owner authority: összesen legfeljebb 8 USD v6, nyitó eredeti ledger 305 / 10.732030 USD, kumulatív ceiling 18.732030 USD; a régi 4.472505 maradék nem adódik hozzá. Stage A 3/3, 15 hívás, 0.741945 USD; eredménye megőrizve.

Stage B lezárult, **11 elfogadott / 2 elutasított / 5 nem generált** a 18 célból: alkotói 4 főági + fork, munkahelyi 5 főági + fork. Mindkét editor ismétlődő lezárást állított meg; a prose-only repair 108751/111155 bájtos kérését a 100000-es transport guard még API előtt blokkolta. A negatív forrás `2e1a127` / sourceHash `713be4849c941ad7d8e03c604b0aa333420cc6bf00e3658c4def0b5ba4a11c5b`, nem átnevezett vagy újrapróbált siker. B: 65 hívás / 3.472645 USD; A+B: 80 hívás / **4.214590 USD accounted**, maradék **3.785410 USD** a jóváhagyott 8-ból. Eredeti ledger **385 / 14.946620 USD**, unknown/open/unassigned 0. A konkrét fejlesztői javítás mindkét guardban explicit creative-eval 192 KiB envelope, minden bájt teljes konzervatív előfoglalásával; generic/runtime default 100000, USD/memory/artifact/max9/one-repair változatlan. A javítás valódi újramérése és a nyolcas ablak/független humán mérés még hiányzik; a munkahelyi történetben már van kiérdemelt, döntéssel elfogadott munkakörváltás, de ez ügynöki olvasás, nem human PASS. F05/F06/N08 PARTIAL, N09 és rollout nyitott. Részletes esetenkénti költség/trace/hiba: [v6 terv](plans/045_fiction_v6_earned_life_evolution.md#stage-b-actual-result--2026-10-18-partial-not-release-evidence).


### Korábbi v6 keretbővítés — 2026-10-18

A tulajdonos a részleges Stage B és a konkrét javítás után **összesen legfeljebb 12 USD v6 fogyasztást** engedélyezett (az eredeti 8 + további 4; nem újraindított keret). A nyitó eredeti 305 / 10.732030 USD ledgerhez tartozó új kumulatív plafon **22.732030 USD**. Jelenleg változatlanul 385 hívás / 14.946620 USD accounted, új v6 fogyasztás 4.214590 USD; fennmaradó authority **7.785410 USD**. A korábbi 3.785410 USD maradék az emelés előtti állapot; a v5 régi maradékát nem adjuk hozzá. Új hívás csak a javított tiszta forrás ellenőrzése után: friss három munkahelyi főági/no-fork előpróba, és csak elfogadható eredménye után külön friss 18-célos mérés. Az eredeti negatív korpusz és költsége megmarad; nincs source-adoption, automatikus reroll, modellváltás vagy production engedély.


A javított transport/price guard és a 12 USD authority közös, stabil forrásellenőrzése kész: **101 fájl / 1076 teszt PASS**, format/docs/typecheck/build/schemas/diff rendben, schema drift nincs. Külön Claude Code read-only follow-up audit: nincs actionable finding. Új paid eredmény még nincs a javításon; következő a tiszta commit/CI utáni friss háromfejezetes előpróba.


### Javított forrás valódi Stage A — 2026-10-18

A javított `490db03` / sourceHash `814d73905850b0036aed691d3d7c8ae5d9782f41cc65f094620da1df08a869e5` friss munkahelyi előpróbája **3/3 elfogadott**, 18 valódi hívás, egy author-package repair. A harmadikban a lezárt vállalás typed opportunity státuszát kellett javítani; az eredeti próza teljesen megmaradt, a valódi javító transport most lefutott. Végső fidelity/editor PASS, reference error/unknown/open/unassigned 0. **0.9418175 USD accounted**, 0.8404001 usage estimate, P50 260135/P95 331250 ms. Eredeti ledger **403 /15.8884375 USD**, teljes v6 fogyasztás **5.1564075 USD**, maradék **6.8435925 USD** a 12-ből. CI332 Verify+Container SUCCESS, 101 fájl/1076 helyi teszt. Root végigolvasás szerint feltételesen alkalmas a hosszabb diagnózisra, de az első két rész cutting/critique/overexplaining mechanizmusa és a hónapritmus továbbra watchpoint. Külön, csak elfogadott szintetikus prózát olvasó Claude Code AI-kritika folyamatban; Stage B döntés ezt is mérlegeli. Ez nem human PASS, teljes B8 bizonyítás vagy production aktiválás.


A külön Claude Code diagnosztikai AI-olvasás a friss háromrészes nyitást megfelelőnek találta a hosszabb próbára, a megismételt túlmagyarázás/önirónia, montázsritmus és halk lezárások watchpointjaival. Root a tényleges választásokkal összevetette a kritikát: végső Stage A döntés **a friss 18-célos B mérés indítható**. Nincs human PASS vagy prompt/kód/kapulazítás; a benchmark ellenőrzi a hosszabb változatosságot. Alkalmazáskód változatlan a CI332 sikeres490db03 forráshoz képest, a dokumentáció külön checkpointot ad az új paid source/cost groupnak.


### Javított v6 Stage B lezárása — 2026-10-18, technikai részleges eredmény

F05/F06/N08 PARTIAL, N09 nyitott. Javított friss B:6 elfogadott/1 timeout miatt sikertelen/11 nem generált a18-ból; a hetedik három180s author-timeoutja megállította a további profil/fork költést. B40 hívás/4.0581025 USD; teljes v6 138hívás/9.214510 USD a12-ből, maradék2.785490 USD. Hét unknown teljes foglalása2.2399275 USD benne marad. Következő offline technikai munka: fix300s csak development-fiction és provider-timeout továbbítása, runtime/prompt/modell/max9/egy-repair változatlan. Teljes új Stage A+B nem fér biztonságosan a maradékba; ilyen fizetős csomag további numerikus authority nélkül nem indul. A terminális korpusz és ledger változatlan, nincs source-adoption vagy human minősítés. Részletes forrás/költség/eset/olvasási bizonyíték a [v6 tervben](plans/045_fiction_v6_earned_life_evolution.md).


### Új numerikus v6 authority — összesen17 USD, 2026-10-18

A tulajdonos a konkrét deadline-javítás és a részleges mérés megismerése után további legfeljebb5 USD-t engedélyezett: **összesen17 USD v6**, nem újraindított keret. Változatlan nyitó305/10.732030 USD, új kumulatív plafon **27.732030 USD**. Aktuális eredeti ledger443/19.946540 USD, eddigi v6 **9.214510 USD**, rendelkezésre álló authority **7.785490 USD**. A hét unknown teljes2.2399275 USD foglalása továbbra benne marad; sem a régi maradékot, sem a régi elutasításokat nem nullázzuk/adjunk hozzá újra. Új cap és negatív pénzügyi ellenőrzések után sikeres exact-source CI szükséges. Ezután friss három career-main/no-fork előpróba, és csak elfogadható eredménye után külön friss18-célos mérés. Várható összköltség6–7 USD, nem garantált szolgáltatói siker. Nincs modell-, minőségkapu-, repair-, runtime-, production- vagy merge-engedély. A korábbi12 USD-re vonatkozó mondatok és keretfüggő leállás történeti állapotok; a már lefutott mérések eredménye/forrása változatlan.


### Deadline-javított friss Stage A lezárása — 2026-10-18

F05/F06/N08 továbbra PARTIAL, N09 nyitott. Friss deadline-javított Stage A (a6e2787, CI336):3 elfogadott,16 hívás,0 repair,1 timeout;1.1314275 USD. Teljes v6 10.3459375 USD, maradék6.6540625 USD a17-ből. Root olvasása szerint alkalmas hosszabb diagnózisra, egy konkrét lezárási kockázattal; külön AI-kritika folyamatban. Következő: ellenőrzött dokumentációs checkpoint és végső olvasási döntés, majd csak elfogadható eredménynél friss18-célos B. Emberi minőség/retention és teljes ablak még nincs igazolva. Részletes bizonyíték: [v6 terv](plans/045_fiction_v6_earned_life_evolution.md).


### Friss v6 mérési és javítási checkpoint — 2026-10-18

A deadline-javított Stage B lezárult: **13 elfogadott /1 elutasított /4 hiányzó** a18 célból,77 valódi hívás/4.4646725 USD. Munkahelyi8+fork kész, kiérdemelt fizetett állásváltással és a meg nem hosszabbított szerződés utáni álláskereséssel; alkotói3+fork kész, negyedik ismétlődő lezárása helyesen elutasított. A kánonhiba korábban elfogyasztotta az egyetlen javítást az editor visszajelzése előtt. Új quality2.5 ezt a két meglévő ellenőrzést közös egyetlen package repair előtt gyűjti össze, ha a max9 headroom engedi;2.4 frozen snapshot megmarad. Új modell/stage/repair/threshold/billing nincs. A javítás offline ellenőrzés alatt, még nincs valódi újramérés. Teljes v6 **14.810610 USD** a17-ből, maradék **2.189390 USD**; eredeti ledger536/25.542640 USD, kilenc lezárt unknown teljes foglalása megtartva. Teljes friss6–7 USD-s mérés további numerikus authority nélkül nem indul. F05/F06/N08 PARTIAL, N09/human/retention nyitott, PR#50 draft, production változatlan. Részletes bizonyíték és korlátok a [v6 tervben](plans/045_fiction_v6_earned_life_evolution.md).


### Új numerikus authority — összesen23 USD v6, 2026-10-18

A tulajdonos a quality2.5 javítás és a teljes sikeres CI338 (c2ac1cb,101 fájl/1091 teszt, Verify+Container SUCCESS) után további legfeljebb6 USD-t engedélyezett, vagyis **összesen legfeljebb23 USD v6 fogyasztást**. A változatlan eredeti baseline305 hívás/10.732030 USD; új kumulatív ceiling **33.732030 USD**. Indulás előtt az eredeti ledger536 hívás/25.542640 USD, teljes v6 **14.810610 USD**, fennmaradó authority **8.189390 USD**. Minden korábbi hiba és kilenc lezárt unknown teljes foglalása benne marad; nincs reset, másolt ledger vagy hozzáadott régi headroom. Ez nem igazolt provider-wallet egyenleg.

A keretkorrekció célzott tesztjei és exact-source CI után friss tiszta forrásból három career-main/no-fork valódi előpróba indulhat; csak elfogadható eredménynél külön friss kétprofilos18-célos mérés. Becsült új összköltség6–7 USD, az eltérésre előfoglalási tartalék marad. Korábbi terminális korpusz/receipt nem adoptálható új forráshoz. Modell/prompt/max9/repair1 és minőségi küszöb változatlan, quality2.5 technikailag ellenőrzött, valódi irodalmi eredménye még nincs. F05/F06/N08 PARTIAL, N09/human/retention/production továbbra nyitott; PR#50 draft, nincs self-merge. A korábbi17 USD-s korlátra és hiányzó további authority-re vonatkozó mondatok történeti checkpointok.


### Quality2.5 valódi előpróba lezárása — 2026-10-18

Friss `2c4e9c8` (CI339 SUCCESS) Stage A **3/3 elfogadott,17 hívás,0 tartalmi javítás**,1.4336775 USD. Két válasz nélkül zárt author-kérés teljes0.668350 USD foglalása megtartva; harmadik próbálkozás sikeres. P50 413464/P95 856182ms, nem elfogadott terméklatencia. Globális ledger553/26.9763175 USD, teljes v6 **16.2442875 USD**, remaining **6.7557125 USD** a23-ból,11 lezárt unknown/0 aktív vagy hozzárendeletlen. Root+teljes háromrészes kiegészítő AI-kritika szerint alkalmas hosszabb diagnózisra, a második opcióközeli mondat fenntartásával; nincs human PASS vagy új tiltás. Feltételes ajánlat megszületik, a jelenlegi állást nem írja felül user döntés előtt. Következő: docs checkpoint+CI/preflight után külön friss18-célos B, becslés5–6 USD, eredeti ledgerből. F05/F06/N08 PARTIAL, N09/human/ár/retention nyitott; PR#50 draft, production változatlan. Részletek a [v6 tervben](plans/045_fiction_v6_earned_life_evolution.md).


### Quality2.5 hosszú mérés — részleges, 2026-10-18

15/18 elfogadott: alkotói8+fork, munkahelyi6; munkahelyi7–8 és fork hiányzik. A következő author teljes előfoglalását a budget guard API előtt megtagadta, nem irodalmi elutasítás történt. B99 valódi hívás/5 repair/6.495380 USD, négy unknown teljes1.3534425 USD foglalással. Globális652/33.4716975 USD; teljes v6 **22.7396675 USD a23-ból**, remaining0.2603325 USD, aktív/hozzárendeletlen0. Új paid futás nem indul. A valós korai editor-gyűjtés4 esetben működött, de mind PASS: kettős hiba kijavítását nem igazolja. A teljes kiérdemelt állásváltás és alkotói/baráti fejlődés mellett ismétlődő túlmagyarázás/hétköznapi NPC-megszakítás és opcióközeli penultimák nyitottak; a gépi PASS nem emberi minőség. F05/F06/N08 PARTIAL, N09/human/retention/ár nyitott; PR#50 draft. Részletek és a forráshoz kötött következő lépések a [v6 tervben](plans/045_fiction_v6_earned_life_evolution.md).


**#81 teljes review — lezárt, 2026-10-25:** a `a666c905 → c68ab037` teljes diff külön ellenőrzése két P2-t talált: a production capability one-off megszakítási takarítását a fixture pótolta; a dokumentált image-only átállás után hiányzott az aktív funded replay út. Javítva a production tartós capability-intent/immutable-ID cleanup, Daily v4 backup/health/archive integráció és az eredeti authorityhoz kötött image-only proof; a motor változatlan. Tíz új regresszió, teljes Python 403 PASS / 11 SKIP. A végső `bc77cc9` saját Verify+Container CI40180444339 sikeres, független re-review APPROVE. A #81 tulajdonosi engedéllyel beolvadt; az új main eredményét külön követjük. Éles művelet nincs. [Scope és kapuk](operations/FUNDED_RUNTIME_UPGRADE_HU.md#teljes-kiadási-review-javításai--8081-2026-10-25).


**2026-10-25 — #81 beolvadt:** main integráció `4fb7b48906235384b78617c807fb3995655842bc`, a reviewed `bc77cc9` fájával és eredeti commitokkal. A rész-PR-k integráltként rendezve, branch-/adattörlés nélkül. A main saját Verify+Container CI40195596461 sikeres; V9-3 DONE, V9-4 PARTIAL és V9-5 PENDING. A célgépes előkészítés a [kiadási runbookban](operations/NARRATIVE_RELEASE_HU.md#main-utáni-célgépes-előkészítés--2026-10-25); SSH, éles telepítés, paid hívás vagy ablakmódosítás nem történt.


**#83 — célgépes read-only felmérés, 2026-10-25:** a #82 dokumentáció beolvadt (`c3e7393`), az eredeti kulcs/hostpin mellett a célgép kapacitása és szűrt Docker/systemd/Daily állapota megfigyelt. Kapacitásminimum PASS; privát age-binárisok jelen vannak, a standalone runner fix PATH-ja még nem teljes; telepített Daily `0b57f7f`, nem v4. A régi mentés/monitor zöld, a v9 image/restore és mai allowance nincs igazolva. Nincs szerverírás vagy paid hívás. V9-4 PARTIAL, V9-5 PENDING. A következő külön engedélyezhető csomag: ellenőrzött eszközút, exact main build és izolált image-próba; utána külön Daily-v4/backup/restore műveleti ablak. [Mért adatok, bizonyítékhatár és sorrend](operations/NARRATIVE_RELEASE_HU.md#megfigyelt-célgépes-állapot--83-2026-10-25-1442-cet).


**#85/#86 — 2026-10-25:** engedélyezett `c3e7393` build sikeres (új immutable image és tiszta main/source binding), a builder eltávolítva; a checkout-wrapper Git fetch hibája külön, az eredeti fájlok/hibareceipt megőrzésével rendezett. Az izolált próba 26m39s után exit 1, a teljes 16-check proof hiányzik. Tíz eredeti konténer változatlan, scoped cleanup és végső régi health/monitor zöld, paid 0. Az ismeretlen kiváltó hibát generic napló miatt nem lehet lokalizálni; #86 privát failure-type/source-location/chain napló előkészített, 17 célzott teszt / teljes Python 409 PASS + 11 SKIP. Saját CI és független review után új source/image diagnosztikus próba szükséges, nincs vak ismétlés vagy audit-PASS. V9-4 PARTIAL és V9-5 PENDING marad; Daily/apply a sikeres célgépes bizonyítékig nem indul. [Részletek és hash-ek](operations/NARRATIVE_RELEASE_HU.md#engedélyezett-image-építés-és-izolált-próba--85-2026-10-25).

**#84 utáni engedélyezett menet — 2026-10-25:** a `7038ae7` merge tree-je az APPROVE reviewjú `25cbb99` fájával egyezik; saját main CI40209173082 Verify+Container SUCCESS. Új, 2 GiB/1 CPU build sikeres, builder eltávolítva, pontos tiszta main/source és immutable image igazolt; az eredeti konténerek változatlanok. A friss izolált próba 29m04s után exit 1; a megőrzött `AssertionError` forráshely alapján a #87 a fixture induló/záró foreign-scope eltérését javítja, és a korai cleanupot fix nonce projekthez köti. Nincs új fixture PASS vagy V9-4 státuszváltás; új forrás CI/review és új célgépes bizonyíték kell. A tíz eredeti konténer változatlan, cleanup teljes, de a régi monitor végső státusza hibás; külön tisztázandó. Az eredeti c3e hibareceipt megmarad. Daily/apply/paid/authority változás nincs. [Pontos eredmények és folytatás](operations/NARRATIVE_RELEASE_HU.md#új-diagnosztikus-célgépes-próba-a-84-után--2026-10-25).


**#88 → main és tényleges image-fixture PASS — 2026-10-25:** reviewed `f7217d7` → main `adf2b95`, azonos tree; saját CI40223702770 Verify+Container SUCCESS. Új, korlátos build után tényleges standalone próba 16/16 és teljes cleanup PASS, tíz eredeti konténer változatlan, paid 0. #76/#85 célgépes image-producer részkapu kész; ez nem éles forrásmentés restore-ja, telepített Daily v4 vagy végső audit. A régi monitor teszt alatti `container_state_changed` jelzése megőrzött; a következő rendes 21:00:57 CET futás igazoltan zöld, ez nem Daily v4 proof. V9-4 PARTIAL/V9-5 PENDING; következő a Daily v4/backup/offsite/restore csomag előkészítése, majd friss DB/Access/Auth/reader és exact-source operátori audit, #77 kohorsz/window/keret, külön apply/paid engedély. [Pontos futás, proofhash-ek és határok](operations/NARRATIVE_RELEASE_HU.md#javított-fixture-célgépes-próbája-a-88-után--2026-10-25).

**#90 — Daily v4 műveleti csomag kész, 2026-10-25:** tulajdonosi jóváhagyással az eredeti privát kliens és a telepített Daily exact `adf2b95` forrásra frissült. Régi offsite sync: öt friss másolat és 19 lejárt helyi managed backup retenciója; friss backup → sync → izolált restore → monitor → proof-bound activate mind PASS. A legújabb mentés 97 táblája/adata egyezik, ciphertext-tamper elutasítás és cleanup sikeres. Hat helyi titkosított archívum hash-ellenőrzött; mindkét timer enabled+active/waiting, mindkét service success/0, tíz eredeti konténer változatlan, API/web healthy. Időzítési szünet kb. 2m22s, app-rollout/restart és éles DB-írás nélkül, paid 0. V9-4 PARTIAL/V9-5 PENDING; következő a friss DB/drain/Access/Auth/reader felmérés és exact-source operátori audit előkészítése. #77 és rendszeres offsite operátori rend külön nyitott. [Mért végrehajtás és proofhash-ek](operations/NARRATIVE_RELEASE_HU.md#daily-v4-végrehajtás-és-visszaellenőrzés--90-2026-10-25).


**Contabo telepítés — 2026-10-26:** a #77/#91 új-window munka külön drafton, a technikai alkalmazásfrissítés előbb következik. A friss readonly felmérésben az éles DB exact036; ezt a #92 strict guarddal és tranzakciós037+038 úttal kezeli. A teljes main-célú független review APPROVE (36/36 saját regresszió), a jelölt saját CI40250405238 és a `6d17fda` merge saját CI40251518673 Verify+Container SUCCESS. Meglévő credentiallel a szigorú Access GET PASS, kanonikus privát input elkészült, új token/policy nincs. Tulajdonosi engedéllyel új `sha256:d85a92f7…0381d60e` image készült, 2GiB/1CPU, tiszta exact-main checkout, builder eltávolítva; mind a tíz eredeti konténer változatlan. Az új standalone szintetikus image-próba **16/16 + cleanup PASS**, 28m24s, teljes tízkonténeres baseline egyezéssel; source/image/bundle és fixture→receipt kötés ellenőrzött. A próba alatti régi Daily-monitor `container_state_changed` jelzése megőrzött; a külön 06:31UTC readbackkor a 06:30UTC rendes monitor ismét zöld, üres alerts, az időzített03:15UTC backup sikeres. Kézi monitor/timer művelet nincs. Installed Daily továbbra adf, a source-bound update és candidate utáni friss backup/restore/apply későbbi kapu. Apply/éles DB-módosítás/paid nincs; V9-4 PARTIAL. [Engedély, main/build és tényleges próbaállapot](operations/NARRATIVE_RELEASE_HU.md#92-main-és-új-célgépes-image--2026-10-26).


**Éles alkalmazásfrissítés — 2026-10-26:** a jóváhagyott6d17fda/d85a92f7 image az eredeti candidate normál explicit recoveryjével élesben fut, schema038/protectedDataUnchanged=true, API/web healthy, worker running; másik hét konténer változatlan, eredeti authority/keret/ablak/admission és legacy/üres cohort megmarad, paid0. Candidate előtti új mentés/offsite/97tábla/1709sor/105config izolált restore PASS, két timer proof-bound visszaaktiválva. Első apply generic migrációs elutasítása és a változatlan036/hash readonly diagnózis megőrzött; utána egy recovery sikeres. A post-deployment038 mentés viszont a valós [#95](https://github.com/Muzsy/future_flow/issues/95) legacy-anchor collectorhibán megállt: V9-4 és #34 emiatt még PARTIAL/nyitott, backup failed nem resetelhető zöldre. Probe-diagnosztika külön[#94](https://github.com/Muzsy/future_flow/issues/94); motorfinomítás nem indul. A jelenlegi app telepítve van; a következő konkrét feladat az új állapot menthetőségének javítása, majd a kis béta előkészítése. [Tényleges sorrend, korlát és bizonyíték](operations/NARRATIVE_RELEASE_HU.md#jóváhagyott-éles-végrehajtás--2026-10-26).

**V9-4 technikai lezárás — 2026-10-26:** #96 tulajdonosi engedéllyel main9088275, reviewed-tree egyezés és saját CI40323512340 Verify+Container SUCCESS. Normál szűk Daily-karbantartás után valódi038 backup/offsite/97-táblás restore, monitor, timeraktiválás és független readback PASS; az alkalmazás6d17fda-n marad, mind a tíz konténer és eredeti keret/ablak/admission/cohort változatlan. A #95 mentési blokk megszűnt, #34 technikai kész. V9-5 PENDING; következő az új béta konkrét #77/#91 window/admission előkészítése és tesztelői alapút, motorfinomítás nélkül. [Sorrend, korlát és bizonyíték](operations/NARRATIVE_RELEASE_HU.md#95-lezárva-éles-daily-mentés-és-restore--2026-10-26).


**#77 megkezdve — 2026-10-25:** tulajdonosi döntés szerint az új 10 USD/háromfős ablak a régi szabályos korai lezárásával indulhat. Külön branchen elkészült a helyi, SERIALIZABLE close-and-seed elszámolási mag és izolált adatbázistesztje; régi limit lezárása költés/history törlése nélkül, négy új account és valódi budget-guard próba. Nincs production CLI vagy éles hatás. A writer-fenced operátor, új authority/journal és Daily/backup/replay/recovery integráció még a #77 része, az issue nem lezárt. V9-4 PARTIAL/V9-5 PENDING marad. [Pontos implementációs határ](operations/NARRATIVE_RELEASE_HU.md#új-bétaablak-korai-lezárással--77-2026-10-25).


**#77 adatbázis-operátori folytatás — 2026-10-26:** a #91 első `35a9a5c` magjának Verify+Container CI-je zöld. Új kódban a strict 038/DB/Auth/drain/policy ellenőrzések és valamennyi nem-account adat hash-védelme körülveszi a keretváltást; elveszett COMMIT-válasz írásmentesen egyeztethető, vegyes vagy már használt állapot nem resetelhető. Belső, TLS-ellenőrzött DB transport készült; a külső root controller/Access/reader/journal/backup/Daily-replay bekötés még nyitott, nincs támogatott éles successor-parancs. Helyi 43/43 célzott teszt és scripts TypeScript PASS, éles művelet/paid 0. Tulajdonosi pontosítás: még nincs tesztelő; a lista nem fejlesztési előfeltétel. Az eszköz általános implementációja és szintetikus próbái folytathatók, a konkrét email/Auth mapping és időpont csak éles aktiválás előtt szükséges. [Pontos implementáció és határ](operations/NARRATIVE_RELEASE_HU.md#adatbázis-operátori-bekötés-és-megszakítás-egyeztetése--2026-10-26).

**Saját fiókos indulási kapu — 2026-10-26:** a tulajdonos a régi ablak/keret szabályos lezárása után kizárólag saját fiókos, legfeljebb3USD-s mért Playwright-utat kér; tesztelői fázis csak teljes, hibamentes belépés/történet/választás/folytatás/kilépés/visszatérés PASS után. A #91 helyi terv külön owner-e2e célt és két3USD accountot kezel, nem aktiválja a háromfős bétát; a belső host-sorrend fault tesztelt, de az éles root adapter/authority integráció még nyitott. A böngésző normál belépési kapun vár tulajdonosi segítségre; régi ablak lezárása, új allowance, paid és E2E-PASS nem történt. V9-4 DONE megmarad, V9-5 PENDING. [Kapu és mérési szerződés](operations/BETA_HU.md#saját-fiókos-éles-út-mint-indulási-kapu--2026-10-26).

**Saját fiókos célgépes kapu lezárt — 2026-10-26:** #91 cf33ba3 merge, teljes APPROVE és saját main-CI PASS; új71e5c2c5 image külön root/PostgreSQL/Docker16+14 check/cleanup PASS, eredeti tíz konténer és runtime változatlan, friss normál monitor zöld. V9-4 DONE megmarad, V9-5 PENDING: konkrét3USD saját fiókos éles successor-csomag, majd a teljes mért Playwright-út a tulajdonos által választott egyértelműen fiktív profillal. Régi ablak/keret változatlan, paid0; tesztelői fázis és háromfős10USD aktiválás nincs. [Tényleges forrás/image/bizonyíték](operations/NARRATIVE_RELEASE_HU.md#91-main-és-saját-fiókos-célgépes-próba--2026-10-26).


**#105 reviewed main és új célgépes build — 2026-10-27:** a `b31464a` jelölt valódi `66062ec` merge-je azonos reviewed tree-t tartalmaz, saját main CI40528401978 Verify+Container SUCCESS. Tulajdonosi engedéllyel 1 CPU/2 GiB új build PASS (`3200b28e` image), a tényleges 16/16+14/14 izolált próba és cleanup PASS, saját main/source/image/bundle/proof-egyeztetés ellenőrzött. A16:47 UTC normál monitor és külön végső tízkonténeres/runtime/timer readback PASS. Következő a már előkészített66062ec/3200b28e éles saját fiókos csomag külön engedélye, majd a teljes mért út. Ez nem serving-app/Daily-frissítés, új allowance vagy paid engedély. Serving6d17fda és Daily03dc190, régi keret/ablak, paid0; a teljes saját fiókos út továbbra nyitott. V9-4 DONE/V9-5 PENDING. [Exact-source eredmények és aktuális kapu](operations/NARRATIVE_RELEASE_HU.md#reader-javítás-main-és-új-célgépes-image--2026-10-27).


**Saját fiókos éles csomag PASS — 2026-10-27 17:07 UTC:** külön tulajdonosi engedéllyel66062ec/3200b28e app és Daily/kliens éles; friss candidate backup/offsite/97tábla–1711sor–125config restore,guarded apply,monitor/timerek és külön readbackPASS. Régi allowance szabályosan lezárt,elszámolás/történetek megőrzöttek; új saját teljes3USD/0költés,ablak2026-10-27T17:12:32Z–2026-11-26T17:12:32Z. V9/cohort csak sajátfiók. A következő feladat már a teljes mért Playwright-út: friss betöltéskor Cloudflare-belépési kapu, tulajdonosnak átadva. Profil/történet/job/providerhívás még0; tesztelői béta nem indulhat teljes hibamentesPASS nélkül. V9-4DONE/V9-5PENDING. [Végrehajtás és proofhatár](operations/NARRATIVE_RELEASE_HU.md#saját-fiókos-éles-keretváltás-pass--2026-10-27).


**Saját fiókos teljes v9-kapu PASS — 2026-10-27 20:34UTC:** normál Chrome/Playwright `/start` profil→két v9 C5 fejezet/egy ténylegesen alkalmazott választás→kilépés→privát hitelesítési kapu→normál friss belépés→azonos történet/choice/elszámolás. Backend237349/283201ms; v9 10task/0.599364USD, a megőrzött legacy kitérővel összes13task/0.671215USD az eredeti3USD-ből,0unsettled. Monitor/runtime/timerekPASS. Előző belépésre váró checkpoint történeti; V9-5PARTIAL,a saját technikai gate kész. Következő a tényleges kis tesztelői kör/admission/külön10USD-s ablak és3./6.fejezeti feedback,új motorfinomítás nélkül. [Proofok és korlátok](operations/NARRATIVE_RELEASE_HU.md#teljes-saját-fiókos-v9-playwright-alapút-pass--2026-10-27).
