---
status: canonical
owner: project
last_reviewed: 2026-10-16
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

Az összes külön fejlesztési mérés **140 hívás / 2,985975 USD konzervatív elszámolás**, 2,7473466 USD usage-alapú árbecslés, minden használat ismert és nulla hozzárendeletlen foglalás. Az eredeti összesített 5 USD keretből 2,014025 USD maradt. Ez a fejlesztési projekt ledgere, nem a bétaablak költése; új változat vagy outputkönyvtár nem nullázza.

Részletes authority: [narratív implementáció](plans/NARRATIVE_QUALITY_IMPLEMENTATION_HU.md), [mérési runbook](operations/NARRATIVE_EVALUATION_HU.md), [Issue #24](https://github.com/Muzsy/future_flow/issues/24).

### 2026-10-16-i tényleges részdiagnózis

Az ad6aaa7 readiness-v2 / writer-v3 forrás két új teljes első fejezete átment, a két fix-kánon kontroll nem. A munkahelyi hiba ismétlődő döntési helyzet (momentum 3 / novelty 3), az alkotói hiba jelenetezés (momentum 4 / sceneCraft 3). A külön aef6315 writer-v4 kísérlet azonos alkotói kontrollon ugyanazokat a gyenge pontokat és pontokat adta; a célzott javulás nem igazolt. Ezért az új író alapértelmezetté tétele és kódja visszavonva, a forrás és a negatív mérés megőrizve. A jelenlegi jelölt továbbra writer v3 / planner v4 / reviewer v2.

A két új mérés együtt 39 hívás / 0,82722 USD accounted. Az összesített 140 hívás / 2,985975 USD után 2,014025 USD maradt az eredeti 5 USD-ből; nincs ismeretlen usage vagy hozzárendeletlen foglalás. További többfejezetes és független emberi értékelés szükséges. A green CI nem irodalmi PASS, és éles bekapcsolás nem történt. Részletek: [mérési runbook](operations/NARRATIVE_EVALUATION_HU.md).

## Új alkotói működés — implementált jelölt, minőségmérés folyamatban

Issue #45 / [PR #46](https://github.com/Muzsy/future_flow/pull/46), PR #44-re épülő külön ág. Az író végső candidate/plan/StoryFact/chapter csomagot alkothat; utólagos domain/terv/fidelity/editor ellenőrzés és atomikus mentés, prefix-only fork és withheld/export/delete/recovery védelem készült. Változatlan modell, öt normál/max9 fizikai hívás, egy tartalmi javítás. Új jobok planner/author/reviewer v2 kompakt címkékkel; a ténylegesen mért v1 promptok és régi parser megmaradnak. A memóriában egy visszatérő actor legutóbbi releváns ténye rögzített, nem a teljes korábbi életrajza. Az új struktúra külön 180 másodperces provider-határidőt kap; régi módok határideje változatlan.

A 9ae6311 első commit Verify/Container CI-je sikeres: 90 fájl / 951 teszt. A későbbi kompaktcímke/memória/diagnosztikai javítás külön ellenőrzés alatt. A 26 hívásos tényleges v1 próba 0,7089225 USD accounted: az új alkotói „The Bright Rectangle” öt hívásból, javítás nélkül átment (causality/sceneCraft 5, többi 4; 192569 ms). Az új munkahelyi csomagot mindkét tervellenőr csonka 80-karakteres belső decisionPattern miatt állította meg, noha négy tervpontja 4 volt; literary editorig nem jutott. A két régi fixed-canon kontroll továbbra hibás, külön történeti kontroll marad. Ebből nincs teljes minőségi vagy emberi PASS.

Aktuális globális fejlesztési ledger: **166 hívás / 3,6948975 USD accounted**, 3,4185621 USD usage-becslés; nulla ismeretlen usage és hozzárendeletlen foglalás. Az eredeti 5 USD-ből **1,3051025 USD** maradt. Az új `--creative-only` szintetikus olvasói diagnózis elhagyja az ismételt legacy/fixed költséget, választásai naplózott, nem emberi indexválasztások; nem teljes kiadási benchmark. Éles aktiválás, új ablak, modellváltás vagy ledger-reset nincs. [Terv](plans/CREATIVE_FICTION_IMPLEMENTATION_HU.md), [ADR-008](decisions/ADR-008-creative-fiction-final-author-canon.md).

## Gazdaságosság és termékdöntés

A történetminőség elsődleges. A havi 8 fejezet, opcionális 4-es kiegészítő, egyszeri 3-as próba, rollover, 0,70 USD teljes fejezetköltség és 18 USD megtartott havi bevétel **modellezési javaslat**, nem elfogadott ár vagy implementált csomag. Alacsonyabb, tartósan igazolt költségnél 12–24 fejezetes változat is vizsgálandó.

A teljes, valós kódra és mérésekre épített [gazdaságossági javaslat](plans/PERSONAL_STORY_ECONOMICS_PROPOSAL_HU.md) a kanonikus [monetizációs modell](product/MONETIZATION_HU.md) supporting anyaga. Billing, személyes fejezetszámláló vagy új éles allowance nincs aktiválva. A Shared Free/Explorer/Connected/World slotok és sponsored Guest szabályok változatlanok.

## Operátori host és működés

A normál reader/funded és kézi daily backup/sync/restore/monitor Linuxra átvétele PR #21-ben elkészült, az eredeti privát state ellenőrzött átvételével és valódi operátori alkalmazással. Ezekhez Windows-agent nem szükséges. A korábbi Windows scheduler és owner-image deployment nem része ennek az átállásnak.

A már funded futó alkalmazás új narratív runtime-ra frissítésének külön Linux operátori támogatása még hiányzik: [Issue #34](https://github.com/Muzsy/future_flow/issues/34). Ez nem az eredeti adatátvétel hiánya, és nem indok az ablak vagy ledger visszaállítására. A narratív rollout előtt exact-source audit/CI, migráció- és promptkompatibilis recovery, drain/fence/reconcile, target/apply és utólagos readback kell.

A Contabo/Cloudflare, backup/TLS/privacy/writer-fence védelmek és a supporting runbookok megmaradnak. Privát credential, résztvevői email/UUID és teljes operátori proof nem része ennek a dokumentációnak.

## Aktív prioritások és nyitott kapuk

1. **N08:** többfejezetes és alternatív ágas minőség, fix-kánon mérőanyag elégtelen előrehaladása, befejezetlen tervmezők vizsgálata, valódi vak emberi értékelés és külön tulajdonosi ár/idő plafon. Emberi döntéspárosítást nem pótolunk kitalált jóváhagyással.
2. **N09 / Issue #34:** támogatott Linux funded-upgrade és teljes release/recovery proof, majd külön kontrollált rollout. A főág nem azonos a productionnel.
3. **P08:** meglévő béta visszatérési/folytatási és feedback-mérése, megmaradt E2E korlátok ellenőrzése; további résztvevő csak saját admission kapuval. A már alkalmazott első meghívást és ablakot nem kell újrakezdeni.
4. **Gazdaságossági pilot / B01:** a minőség, fejezetköltség, tartalommennyiség és fizetési hajlandóság alapján külön csomag/ár döntés, utána billing implementáció.
5. **Shared:** owner downgrade után end/archive/revoke adatkontroll rendezése és targeted Guest kétfős E2E; friend beta csak a personal eredmények után. Public/community és további nyelvek külön későbbi kiadás.

A részletes státuszok a [fejlesztési tervben](DEVELOPMENT_PLAN_HU.md), a jövőbeli sorrend a [roadmapben](ROADMAP_HU.md) találhatók. Ez a frissítés nem végzett éles műveletet vagy új fizetett AI-hívást.
