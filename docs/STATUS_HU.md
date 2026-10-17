---
status: canonical
owner: project
last_reviewed: 2026-10-17
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

## Történetminőség – jelenlegi fejlesztési eredmény

Az N00–N07 implementáció (PR #25–#33) és a PR #35–#38 beolvadt. A legutóbbi narratív kód a `fd10b856` merge-ben van; PR #38 pontos forrásán 87 fájl / **906 offline teszt**, Verify és container CI sikeres. A teljes offline korpusz 68 fejezet / 34 pár / 248 mock transport; a mock nem irodalmi minőségbizonyíték.

A PR #38-ban bevezetett selected narrative policy planner v3, külön tervellenőr v1 és writer v3 útvonalat használ. Öt normál feladat, legfeljebb nyolc fizikai kérés és egy globális tartalmi javítás engedett; a régi befagyasztott policy négy/max7 viselkedése megmarad. A tervellenőrzés valódi receipthez és a pontos bemenet/kimenet hashéhez kötött. Monetary budget, lease, privacy, recovery és a 32 KiB artifact-határ változatlan.

Az Issue #43 célzott fejlesztési jelöltje külön megőrzi a két gyenge fix-kánon anyagot és új, mérföldkövet tartalmazó kontrollt ad hozzájuk. Új queue policyban planner v4 / reviewer v2 readiness-kapu készül, változatlan writer v3-mal; régi frozen policyk megmaradnak. Ez még nem új fizetett vagy emberi minőségi eredmény, és nem éles aktiválás.

A 2026-10-15-i kétprofilos, egyidőszakos valódi diagnózis két új első fejezete átment, öt-öt hívással, javítás nélkül; teljes ilyen költségük 0,2674625 USD, egy modellkapun átment fejezetre **0,13373125 USD**. Mindkét külön fix-kánon íróteszt editor-elutasítás lett, momentum 2/5. A tervellenőr befejezetlen mezővégeket is jelzett. Ezek nyitott minőségi problémák; két első fejezet nem igazol többidőszakos vagy független emberi minőséget.

Az összes külön fejlesztési mérés aktuális, visszaolvasott ledgere **229 hívás / 6,79395 USD konzervatív elszámolás**, 6,3036081 USD usage-alapú árbecslés. Nulla ismeretlen használat és nulla hozzárendeletlen foglalás. A tulajdonos az összesített development keretet 10 USD-ra bővítette; **3,20605 USD maradt**. Ez különbözik a bétaablak költésétől; új forrás vagy outputkönyvtár nem nullázza. Az alábbi korábbi összegek dátum szerinti történeti részállapotok.

Részletes authority: [narratív implementáció](plans/NARRATIVE_QUALITY_IMPLEMENTATION_HU.md), [mérési runbook](operations/NARRATIVE_EVALUATION_HU.md), [Issue #24](https://github.com/Muzsy/future_flow/issues/24).

### 2026-10-16-i tényleges részdiagnózis

Az ad6aaa7 readiness-v2 / writer-v3 forrás két új teljes első fejezete átment, a két fix-kánon kontroll nem. A munkahelyi hiba ismétlődő döntési helyzet (momentum 3 / novelty 3), az alkotói hiba jelenetezés (momentum 4 / sceneCraft 3). A külön aef6315 writer-v4 kísérlet azonos alkotói kontrollon ugyanazokat a gyenge pontokat és pontokat adta; a célzott javulás nem igazolt. Ezért az új író alapértelmezetté tétele és kódja visszavonva, a forrás és a negatív mérés megőrizve. A jelenlegi jelölt továbbra writer v3 / planner v4 / reviewer v2.

A két új mérés együtt 39 hívás / 0,82722 USD accounted. Az összesített 140 hívás / 2,985975 USD után 2,014025 USD maradt az eredeti 5 USD-ből; nincs ismeretlen usage vagy hozzárendeletlen foglalás. További többfejezetes és független emberi értékelés szükséges. A green CI nem irodalmi PASS, és éles bekapcsolás nem történt. Részletek: [mérési runbook](operations/NARRATIVE_EVALUATION_HU.md).

## Korábbi creative v1/v2 diagnózis — történeti mérés

Issue #45 / [PR #46](https://github.com/Muzsy/future_flow/pull/46), PR #44 függőséggel készített implementáció. Az író végső candidate/plan/StoryFact/chapter csomagot alkothat; utólagos domain/terv/fidelity/editor ellenőrzés és atomikus mentés, prefix-only fork és withheld/export/delete/recovery védelem készült. Változatlan modell, öt normál/max9 fizikai hívás, egy tartalmi javítás. Új jobok planner/author/reviewer v2 kompakt címkékkel; a ténylegesen mért v1 promptok és régi parser megmaradnak. A memóriában egy visszatérő actor legutóbbi releváns ténye rögzített, nem a teljes korábbi életrajza. Az új struktúra külön 180 másodperces provider-határidőt kap; régi módok határideje változatlan.

A 9ae6311 első commit Verify/Container CI-je sikeres: 90 fájl / 951 teszt. A 5f8ffbd kompaktcímke/memória/diagnosztikai javítás Verify és Container CI-je is sikeres; a későbbi artifact-tömörítési javítás és névazonossági regresszió külön ellenőrzött. A 26 hívásos tényleges v1 próba 0,7089225 USD accounted: az új alkotói „The Bright Rectangle” öt hívásból, javítás nélkül átment (causality/sceneCraft 5, többi 4; 192569 ms). Az új munkahelyi csomagot mindkét tervellenőr csonka 80-karakteres belső decisionPattern miatt állította meg, noha négy tervpontja 4 volt; literary editorig nem jutott. A két régi fixed-canon kontroll továbbra hibás, külön történeti kontroll marad. Ebből nincs teljes minőségi vagy emberi PASS.

A javított **5f8ffbd** forrás új, kompakt v2 diagnózisa négy teljes fejezetet fogadott el: a munkahelyi profil három egymást követő időszakát („The Space Between Two Dates”, „The Empty Minutes”, „The Spare Chair”) és az alkotói profil első fejezetét („The Picture Left Face Down”). Mind a négy öt hívással, tartalmi javítás nélkül ment át; mind a nyolc editor-dimenzió minden esetben 4. A négy elfogadott fejezet összes accounted költsége **0,8917025 USD**, átlaga **0,222925625 USD**; usage-becslésük összesen 0,8411213 USD. Időtartamuk 213648–237389 ms. Ez kis mintás automatikus kapueredmény, nem független emberi minőségbizonyíték.

A munkahelyi fork planner/author/review/fidelity lépése lefutott, de a literary editor előtt a következő teljes előfoglalás már meghaladta a maradék keretet. A fork **nem elfogadott és nem minőségi bukás**, a két alkotói folytatás még nem futott. A v2 diagnózis 24 fizikai hívás / 1,1249425 USD accounted (1,0575049 USD usage-becslés); ez a részleges fork költségét is tartalmazza. A teljes globális ledger 190 hívás / 4,81984 USD, 0,18016 USD maradékkal. A 10 USD-ra bővített keretet a lenti új munkaszakasz rögzíti; nincs ledger-reset.

A végső **8847d2b** kódforrás Verify és Container CI-je (#311) sikeres, **90 fájl / 958 teszt**. A fizetett próba a korábbi 5f8ffbd forráshoz kötött; az utána hozzáadott artifact-tömörítési, azonosítóütközési és történeti promise-memória javítások célzott regresszióval és teljes CI-vel igazoltak, de ez nem a végső forrás fizetett release-proofja. A prompt/policy nem változott közöttük.

Az új `--creative-only` szintetikus olvasói diagnózis elhagyja az ismételt legacy/fixed költséget, választásai naplózott indexválasztások (`reviewed=false`); `complete=false`, `qualityRelease=false`. Az emberi olvasói értékelés, teljes többprofilos folytatás/fork, gazdaságossági és időkorlát-döntés, valamint a pontos target/recovery Linux-rollout proof nyitott. Éles aktiválás, új ablak, modellváltás nincs. [Terv](plans/CREATIVE_FICTION_IMPLEMENTATION_HU.md), [ADR-008](decisions/ADR-008-creative-fiction-final-author-canon.md).

### A korábbi szövegek ügynöki olvasásának megállapítása

Az ügynök a négy elfogadott fejezetet külön is végigolvasta. Erősségük a konkrét tárgyakra épülő jelenetezés, a párbeszéd és a döntés következménye: a munkahelyi szerep ténylegesen változik három fejezeten át, az alkotói profilban pedig egy hibásan olvasott képsorozat átrendezése vezet új lehetőséghez. Ugyanakkor a munkahelyi sorozat rendre hasonló ritmust használ: munkalap/értekezlet → kollégai ellenvetés → Rowan prioritásdöntése → új feladatelosztás → toll és üres válaszhely. Ez tudatosan ellenőrizendő szerkezeti ismétlődés, az automatikus novelty=4 ellenére. A folytatási kedv, szereplők önálló élete és a történet világának szélesedése még valódi olvasói bizonyítékot igényel; a négy kapu-PASS nem jelenti a maximális történetélmény igazolását.


## Szekvenciális minőségjavítás — aktuális implementáció és bizonyíték

[PR #47](https://github.com/Muzsy/future_flow/pull/47), Issue #45. A végső kód **e5e7ed2** Verify/Container CI-je (#318 / 38967483299) sikeres, **90 fájl / 966 teszt**. A későbbi dokumentációs commit nem változtatja meg a mért kódot. Production aktiválás nem történt.

A közvetlen olvasás és a valódi próba négy javítandó pontot azonosított:

- a korábbi excerpt csak a fejezet elejét mutatta, a jelenetmechanizmus és lezárás rejtve maradt;
- a novelty/character/personalization gyenge pontját más dimenzió kompenzálhatta, az editor-verdict önmagában sem zárt;
- a fork az örökölt choice időbélyegeit azonosra cserélte, így az UUID-s rendezés rossz legfrissebb döntést adhatott;
- a módváltáskor a legacy/narrative előzmények vége nem jutott be a creative szekvenciális összevetésbe.

Az új queue planner/author/planReviewer v3, editor v2 és qualityPolicy 2.1.0 snapshotot kap. Report 1.1.0: mind a nyolc score >=4, pass verdict és négy igaz sequenceReview-jelzés szükséges (eltérő drámai szerkezet, eltérő lezárás, érdemi továbblépés, szereplői önállóság), az összehasonlítás pontos owned period-ID lefedésével. Hamis jelzés magas pontok és üres issue-lista mellett is kizáró. Szerkezeti hiba teljes package repairt igényel. Modell, öt normál/max9 fizikai hívás, egy javítás és minden pénzügyi/privacy/fence védelem változatlan. A régi v1/v2 promptok hash-pinnelve és régi reportok olvashatóan maradnak.

A sequenceHistory az utolsó három owned period scene-mechanizmusát és 400/500 karakteres nyitó/záró részletét adja a meglévő összesített 12 KiB keretben. Legacy artifact nélkül a kanonikus eseménycím/összefoglaló a fallback; régi prózából nem gyárt StoryFactot. Withheld esetben történeti betöltés nincs, fork csak prefixet kap. A choice-memória/raw prompt/detail sorrendje az owned aw_history.positiont követi; új fork megőrzi az eredeti elfogadási időbélyeget. Régi job/payload és canonical rekord nem lett átírva, a latest-choice consequence guard nem lazult.

### Tényleges minőségi eredmény

A 04cee85 forráshoz kötött editor-kalibráció elfogadta a korábbi jó első fejezetet, és elutasította a korábban átengedett ismétlődő harmadikat: novelty=3, distinctDramaticStructure/distinctEnding/independentProgression=false. Ez célzott pozitív/negatív kontroll, nem független általános minőségbizonyíték.

Ugyanezen forrás friss creative-only diagnózisa **hat teljes fejezetet** fogadott el: két profil, három-három egymást követő időszak. Mind öt hívás, tartalmi javítás nélkül; minden dimenzió >=4, az alkotói harmadik fejezet prózája 5. A főági fejezetek accounted összköltsége **1,4672925 USD**, átlaga **0,24454875 USD**; usage-becslésük 1,3610067 USD. A p95 generálási idő 295560 ms. A hétköznapi esetek e mérése nem bizonyít általános elfogadási arányt.

Az első fork két planner-hívás után a choice-sorrend hibája miatt megállt (0,1501825 USD), noha a tervezet helyesen az írásos alternatívát vitte tovább. A változatlan eredeti adatok másolatán az új memória már ezt a döntést azonosította legfrissebbként. Az **e5e7ed2** forrás külön friss forkja a két elfogadott korábbi fejezetet explicit forrás/hash-provenance mellett örökölte; a szülő későbbi harmadik részét kizárta. Az új folytatás öt hívással, javítás nélkül, minden pont 4 mellett átment: **0,288855 USD accounted**, 0,2681595 USD usage-becslés. Ez célzott kétforrású continuity regresszió, nem a teljes 04cee85 benchmark új forrásra átnevezése. Az eredeti failed ág és költés megmaradt.

Az ügynöki végigolvasás szerint az új ívek változatosabb oksági helyzeteket adnak. Az alkotói történet a képsorozattól egy másik szerző önálló értelmezésén át anyaggal/fénnyel való kísérletig jut; a munkahelyi főág a korábbi döntés árát viselő ember saját tervéhez, az alternatíva versengő értelmezések és szerepcsere konfliktusához vezet. Ez ügynöki olvasás, nem rögzített független emberi értékelés. Kisebb jelenetezési tömörítésekre az editor továbbra minor megjegyzést tett; a mérésből nem következik hibátlan vagy minden profilra garantált próza.

A mostani munkaszakasz **39 hívás / 1,97411 USD accounted**: 2 kalibráció, 32 teljes diagnosztikai hívás (a két hibás fork-plannerrel), 5 javított fork-hívás. A globális ledger 229 / 6,79395 USD, minden usage ismert és minden foglalás hozzárendelt. A hét elfogadott új fejezet puszta költsége 1,7561475 USD, átlaga 0,2508782 USD; a technikai fork-hibát is ráosztva 0,2723329 USD. Ezek kis mintás, többforrású diagnosztikai számok, nem üzemi árígéretek.

### Nyitott kiadási feltételek

A creative-only választások naplózott indexválasztások, reviewed=false; complete=false és qualityRelease=false megmarad. Független olvasói benchmark, tulajdonosi egységköltség/időkorlát-döntés és pontos target/recovery Linux-rollout proof szükséges. A végső forrás teljes többprofilos release-benchmarkját nem helyettesíti a célzott regresszió. Az éles default legacy/üres cohort, funded ablak és béta-keret változatlan.

## Emberibb történetsorozatok — v4 fejlesztési jelölt, 2026-10-17

Issue #45 új, PR #47 utáni csomagja a [részletes terv](plans/alterward_fiction_human_quality_development_plan_codex.md) szerint implementált offline jelölt. Külön v4 policy, editor v3/report 1.2.0, quality 2.2.0: rendszermechanika prózai láthatatlansága, retorikai és viselkedési változatosság explicit kapukkal. A legutóbbi három raw előzmény mellett legfeljebb nyolc owned compact signature fér ugyanabba a 12 KiB contextbe. A mért v1–v3 működés megmarad.

A fejlesztés offline és szintetikus; új paid történetmérés vagy production mutation nincs. A korábbi 229 hívás / 6,79395 USD ledger nem nullázódik. Az új jelölt emberi minősége még nem mért: H1 háromfejezetes és H2 kétprofilos hatfejezetes olvasói vizsgálat, továbbá editor-kalibráció külön szükséges. Az elsődleges mérce az olvasási élmény és folytatási kedv. F05/F06, a gazdaságossági/időkorlát-döntés és N09 továbbra nyitott.

Helyi technikai ellenőrzés: **93 tesztfájl / 998 teszt PASS**, format/docs/typecheck/build/schemas és diff-check sikeres. A teljes creative-only offline CLI nyolc profil hat-hat főági fejezetét és két alternatív folytatását készítette el: 50 szintetikus minta / 250 mock transport, nulla hiba és nulla repair, 8 main + 2 branch olvasói bundle. Minden minta öt kérést használt, minden creative-only választás reviewed=false; complete=false és qualityRelease=false megmaradt. Ez nem valódi modell- vagy emberi minőségmérés.

Claude Code a prompt/provider részt, Antigravity az evaluation eszközöket készítette; a közös integráció külön ellenőrzött. A csak olvasó Claude kódaudit két észrevétele javítva és regresszióval védett: régi kötelező StoryFactok kronologikus sorrendje, valamint valóban külön periodokat használó vegyes v2/v3/v4 history-teszt. Új emberi release-pontküszöb nincs; a mentett sorozatértékelés újraellenőrzött rating inputhoz és a teljes bundle snapshothoz kötött.
