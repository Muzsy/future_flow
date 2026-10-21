---
status: canonical
owner: project
last_reviewed: 2026-10-20
related:
  - ROADMAP_HU.md
  - DEVELOPMENT_PLAN_HU.md
  - product/PRODUCT_HU.md
  - architecture/ARCHITECTURE_HU.md
---

# Alterward — aktuális projektállapot

Ez a dokumentum a fejlesztési főág állapotát és az utolsó igazolt operatív eredményt külön kezeli. A dokumentációfrissítés nem production deployment és nem friss élő health-ellenőrzés.

## Kiadási és bétaállapot

Az első személyes tesztelő reader-hozzáférése, első belépése és a 30 napos funded ablak kanonikus Linux-operátori aktiválása megtörtént. Az alkalmazott UTC ablak **2026-10-13T22:11:21Z–2026-11-12T22:11:21Z**, a projektmaximum 2 USD, a felhasználói maximum 0,50 USD. Nincs automatikus hosszabbítás vagy újraindított költségkeret.

Az utolsó igazolt böngészős E2E (2026-10-14) három valódi fejezetet, két folytatási ciklust, mentett választásokat, újranyitást, visszabelépést és friss hitelesítés utáni exportot ellenőrzött. A kilenc provider-task elszámolt összege 0,188585 USD; ez a béta adatbázis-elszámolása, nem szolgáltatói számla. A következő generálást a 3/UTC-nap, 1 párhuzamos kérés korlát megállította. A későbbi új-munkamenetes sikeres folytatás nem igazolt. A megtartott fiók destruktív törlése nem volt része a próbának.

A webhely továbbra zárt személyes béta; Shared és nyilvános/community launch nincs engedélyezve. A főág új narratív kódja még nem került productionbe: a default legacy/üres narrative cohort megmarad. A régi operátori kiadást dokumentációfrissítés vagy új fejlesztési commit nem cseréli le.

## Termékterületek

| Terület | Állapot | Következő határ |
|---|---|---|
| Private Personal Simulation | implementált és egy tesztelővel valódi E2E-ben ellenőrzött | irodalmi minőség, későbbi visszatérés és szélesebb pilot |
| Új személyes narratív pipeline | N00–N07 kész; N08/N09 nyitott | teljes paid/human benchmark és külön operátori rollout |
| Official Lives / Scenario | technikai alap és angol katalógus létezik | nem általános publikus launch-engedély |
| Community / Public | jelentős foundation kész, release-gated | privacy/moderation/cohort és explicit launch |
| Shared Context | foundation kész, első személyes körben OFF | owner downgrade kontroll és kétfős friend beta |
| Sponsored Guest | targeted friend részvétel implementált | host/participant és privacy feltételek megtartása |
| Előfizetés / billing | nincs kész fizetési rendszer | B01: provider, lifecycle és szerveres entitlement |
| Magyar termékkiadás | halasztott | angol UI és történet az induló scope |

## Történetminőség — aktuális fejlesztési jelölt

A főág és a fejlesztési jelölt külön állapot: a v5 előfeltétel PR #49 beolvadt (`1e1b4303dd779ad8e8b34970892302583a7f66dd`); a v6 **[PR #50](https://github.com/Muzsy/future_flow/pull/50) mért checkpointként 2026-10-18-án beolvadt** (`f755a57aca37ee6a2e995400c76fc0394f1cdc88`, a tulajdonos kifejezett engedélyével). Ez fejlesztési főág-állapot, nem production aktiválás: a default legacy/üres narrative cohort változatlan. A beolvadt v6 snapshot planner/author/reviewer v6, editor v5, fidelity v1 és **qualityPolicy 2.5.0** (`fictionV6Quality25Policy()`). Az új fejlesztési jelölt a [046 v7 terv](plans/046_fiction_v7_narrative_economy.md): új creative jobok planner/author/reviewer v7, editor v6, fidelity v1, **qualityPolicy 2.6.0**, report 1.3.0/signature 1.1.0 snapshotot kapnak; 2026-10-19-i valódi mérése részleges: Stage A 3/3, Stage B 15/18 (1 elutasított, 2 hiányzó), 6,61496 USD, eredeti ledger 765 / 40,08666 USD; human PASS nincs. A régi policyk és prompt-bájtok megmaradnak; normál öt, legfeljebb kilenc fizikai kérés és egy globális tartalmi javítás engedett. A quality2.5 az editor visszajelzését elegendő szabad kéréshely esetén a fidelity-hibát javító egyetlen package repair előtt is összegyűjti; a végső kapuk nem lazultak.

### Legutóbbi valódi mérés

A külön háromfejezetes quality2.5 előpróba 3/3 elfogadott szöveget adott. Az utána külön indított, friss hosszú mérés eredménye **15 elfogadott / 0 irodalmilag elutasított / 3 hiányzó** a 18 célból:

| Profil | Elfogadott főági fejezet | Alternatív harmadik fejezet | Hiányzik |
| --- | ---: | --- | --- |
| Alkotói | 8 | elkészült | nincs |
| Munkahelyi | 6 | nem készült el | főági 7–8 és alternatív 3 |

A munkahelyi hetedik planner-kérése elkészült, de a következő author teljes előfoglalását a pénzügyi guard még API előtt megtagadta (`SMOKE_BUDGET_EXCEEDED`). Ez nem visszakapott gyenge történet vagy teljes mérési siker. A különböző forrású korábbi részleges korpuszokat nem adjuk össze új teljes mérésként.

A mért forrás `cb8b539d11d8d364cee1798aa6fe5164d6c9f681`, sourceHash `d05fb027bf589169b19fa16c51ae1e6a63480d83844c16e310f89d914cd36512`; a mérés előtt Verify+Container CI340 SUCCESS. A futás 99 valódi transportot, 16 trace-t, 94 elfogadott receiptet és öt egyszeri package repairt tartalmaz. A source/project/manifest/trace kötéseket lezárás után visszaellenőriztük. A későbbi, kizárólag dokumentációs `56062a8` lezárás Verify+Container CI341 eredménye SUCCESS; ez nem új paid forrás vagy generálás. Az alkalmazáskód teljes CI338 ellenőrzése 101 fájl / 1091 teszt volt.

### Irodalmi megállapítás és korlát

Mind a 15 elfogadott végső szöveg és az eltérő köztes próza teljes ügynöki olvasása megtörtént, a végső body-hashek egyeztetve. Az alkotói történet a portfóliótól saját munkákon át egy barátság és közös portrérajzolás eltérő elvárásaiig jut. A munkahelyi történetben valódi fizetett megbízás és később elfogadott állásváltás történik; a következő fejezetben egy folyamatváltozás feleslegessé teszi a főszereplő útmutatóját. A kitalált diagnosztikai főágon a harness az első opciót választja; a fork eltérő választással indul. Ez nem valódi emberi tesztválasz vagy szemantikai párosítási jóváhagyás.

Külön Claude Code előfizetéses AI-kritika mind a nyolc alkotói és hat munkahelyi főági fejezetet végigolvasta, mindkét szálat tovább olvasná, konkrét oksági törést nem talált. A body-only olvasásból eredő téves agency-kifogást és a kötelező hat hónapos hossz hibaként kezelését külön addendum helyesbítette. Ez nem független emberi bizonyíték.

Nyitott kockázat az ismételt túlmagyarázás/elfoglalt mellékszereplő mechanizmusa, néhány választási útvonalat túl közvetlenül felidéző bekezdés és a hónapváltások hasonló prózai ritmusa. A motívumok néha érdemben más szerepet kapnak; nincs új név-, szereplő-, helyszín- vagy fordulatkvóta. Minden végső gépi score legalább 4, mind a hét flag igaz, de **stabil kiváló minőség és emberi megújítási hajlandóság még nincs igazolva**.

### Költség és futási állapot

| Mutató | Visszaellenőrzött érték |
| --- | ---: |
| Eredeti globális ledger | 652 kérés / 33.4716975 USD accounted |
| V6 változatlan nyitó baseline | 305 kérés / 10.732030 USD |
| V6 összesített elszámolás | 347 kérés / 22.7396675 USD |
| Jóváhagyott összes v6 keret | 23 USD |
| Fennmaradó v6 authority | 0.2603325 USD |
| Legutóbbi hosszú mérés | 6.495380 USD accounted |
| Aktív / hozzárendeletlen foglalás | 0 / 0 |

Mind a 15 globálisan lezárt, ismeretlen használatú kérés teljes konzervatív foglalása megmaradt; nincs ledger-reset vagy új fizetős futás. Az accounted nem számla vagy provider-wallet egyenleg. A hosszú mérés elfogadott fejezeteinek P50 ideje 361067 ms, P95 ideje 852171 ms; ez nem elfogadott termék-SLA. A maradék nem fedezte a következő teljes előfoglalást.

## Következő fejlesztési és kiadási kapuk

F05/F06/N08 **PARTIAL**, N09 **PARTIAL/nyitott**. Következő sorrend:

1. Az ismétlődő jelenetmechanizmusok és az első draft kánon-/állapotkonzisztenciájának célzott korrekciója: **offline implementálva a v7 jelöltben** ([046](plans/046_fiction_v7_narrative_economy.md)). A periódusonkénti egy új visszatérő szereplős korlát a v7-ben narratív ökonómiai elvre cserélődött; a lezáró szakasz egésze nem építheti újra a döntési ágakat; a túlmagyarázás sorozatszintű mintajelzés (nincs kvóta); a mérési profilok 1–2 magánéleti alapkapcsolatot kaptak. Automatikus kánon-normalizálás nincs (ADR-008). A v7 mérés (15/18) és független olvasás után a sorozatszintű ismétlés (nyitások, lezárások, ütem, névkészlet, eltűnő magánélet, álló cél) kódszintű kezelése a **v8 jelöltben offline kész** ([047](plans/047_fiction_v8_series_evidence.md)); ellenőrzése fizetős hívás nélkül: tesztek, CI és `pnpm narrative:audit` a meglévő v6/v7 korpuszon.
2. Verziózott javítás, regressziók, külön audit és exact-source CI után friss valódi előpróba, majd csak elfogadható eredménynél teljes kétprofilos nyolcfejezetes mérés és két alternatív ág. Az új teljes méréshez további számszerű költségengedély kell; a terminális korpusz nem címkézhető át.
3. Független emberi, 17 kérdéses sorozatértékelés és folytatási/megújítási visszajelzés. Az AI nem töltheti ki az emberi értékelést. Zárt narratív bétában ezt és a teljes kétprofilos mérést a 2026-10-19-i tulajdonosi döntés szerint a tesztelők visszajelzése helyettesíti (első kör: 10 USD, 3 tesztelő, v7); nyilvános vagy fizetős kiadáshoz továbbra is kötelező. [Kapurend](operations/NARRATIVE_RELEASE_HU.md#zárt-narratív-béta-kapurend--tulajdonosi-döntés-2026-10-19).
4. Külön N09 target/recovery, migráció-, envelope-, timeout- és kontrollált Linux funded-runtime rollout bizonyíték, majd explicit éles apply engedély. A fejlesztési 192 KiB/300 s nem automatikus production konfiguráció; a runtime default 100000 bájt/180 s határa külön nyitott.

**Prioritás (tulajdonosi döntés, 2026-10-20): az élő világ (v9) a béta elé került.** A zárt béta jelöltje a v9 policy-generáció lesz (planner/author/reviewer v9, editor v9, qualityPolicy 2.8.0; a tárolt 6b–6g payloadok még a v8 editor-szöveget hordozzák), saját fizetős mérésen; a v8 befagyott. Az offline szakasz (0–5. fázis) folyik: a v8 baseline rögzítve ([terv, D függelék](plans/alterward_v8_living_world_feasibility_audit_2026-10-20.md)), a szereplőállapot forrása a fejezet-artifact ([ADR-009](decisions/ADR-009-character-state-artifact-fold.md)). Az offline szakasz lezárása után (2026-10-21, Ákos 19:44 magyar idő döntése) a v9 fidelity-bukásból az editor előzetes olvasása nélkül javít (a fidelity-kiváltású fejezet 8 hívás a korábbi 9 helyett), és új `life_fiction_editor.v9` promptot kap; a `qualityPolicyVersion` 2.8.0 marad, mert a v9 opt-in és nincs telepítve ([4/h](operations/NARRATIVE_EVALUATION_HU.md), [terv D.8](plans/alterward_v8_living_world_feasibility_audit_2026-10-20.md)). A Codex-próbák (kvóta, nem USD) a független review után indulnak, a fizetős mérés külön engedélyt igényel. A 6–8. fázis (humán olvasás, fizetős mérés, N09 rollout) új költségengedélyt és tulajdonosi döntést igényel. Ez nem production aktiválás és nem fizetős futás engedélye.

Az árazás, havi fejezetmennyiség, billing és szélesebb pilot továbbra külön döntés; a minőségi küszöböt költség miatt nem csökkentjük. Shared és nyilvános launch nincs engedélyezve.

## Részletes források és történeti bizonyíték

- [Aktív v6 végrehajtási terv](plans/045_fiction_v6_earned_life_evolution.md): pontos mérési források, az összes korábbi negatív eredmény, javítás és költség.
- [Mérési runbook](operations/NARRATIVE_EVALUATION_HU.md): reprodukció, bizonyítéktípusok és emberi értékelés.
- [Kiadási kapuk](operations/NARRATIVE_RELEASE_HU.md), [architektúra](architecture/ARCHITECTURE_HU.md), [AI routing](AI_MODEL_ROUTING_HU.md).
- [Fejlesztési sorrend](DEVELOPMENT_PLAN_HU.md), [gazdaságossági javaslat](plans/PERSONAL_STORY_ECONOMICS_PROPOSAL_HU.md), [Linux-operátor](operations/LINUX_OPERATOR_HU.md).

A korábbi v1–v5 és v6 részdiagnózisok a részletes tervek/runbook történeti fejezeteiben megmaradnak. Nem írják felül e jelenlegi állapotot, és nem pótolják a hiányzó minőségi kapukat.
