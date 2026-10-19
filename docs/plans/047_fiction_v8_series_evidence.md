---
status: active-supporting
owner: agents
created: 2026-10-19
base_commit: 98bdfc3
predecessor_pr: 51
issue: 45
workstream: F05/F06 quality follow-up
state: offline-candidate
paid_provider_calls_authorized: false
production_authorized: false
related:
  - 046_fiction_v7_narrative_economy.md
  - ../decisions/ADR-008-creative-fiction-final-author-canon.md
  - ../operations/NARRATIVE_EVALUATION_HU.md
---

# 047 — v8 fikciós jelölt: determinisztikus sorozatbizonyíték, névpaletta és költségmentes ellenőrzés

## Állapot — 2026-10-19

A v7 (PR #51, draft) mérése és két független olvasat után ez a terv rögzíti, mit javítunk a v8-ban, és hogyan ellenőrizzük **fizetős modellhívás nélkül**. A v8 a v7 ágából indul, mert a PR #51 merge-éről a tulajdonos még nem döntött. A jelölt offline implementált; valódi mérés nem futott (a v7 keretből 0,775 USD maradt, új futás csak új számszerű engedéllyel). Production, cohort, billing és entitlement nem változik.

## Diagnózis: mi maradt a v7 után

| Tünet (v7 olvasat) | Ok | Miért nem elég egy újabb promptszabály |
| --- | --- | --- |
| „Neither of you…” 7×, azonos alakú csendes lezárások | az editor csak a legutóbbi 3 fejezet nyitó/záró részletét és kategória-címkéket lát | a szerkesztő a saját címkéit megbízhatatlanul adja (az `overexplain_while_other_busy` egyszer sem szólalt meg, minden flag igaz), tehát az ismétlés mérése nem bízható rá |
| visszatérő ütem: a másik javasol → a hős bosszúsan ellenáll → félig enged | ugyanaz a modell-alapértelmezés minden fejezetben | az ütem neve eddig nem szerepelt a promptban; ez az egy pont kap célzott, rövid szöveget |
| Niamh Byrne minden futásban, Kavanagh/Doyle/Orla/Maeve több szereplőn | a modell kedvenc ír nevei; minden profil `IE`; nincs per-élet változatosság | a „használj változatos nevet” szabály nem hat, ha a modell mindig ugyanabból a szűk eloszlásból választ |
| a nővér sosem jelenik meg, az anya egyszer, a barát névtelen | a profilokban csak szerepcímke volt („Fictional older sister”), és senki nem számolta, ki tűnt el | a v7 private-life szabály nem tudja, hogy egy személy hány fejezete hiányzik |
| az alkotói szál az 5. fejezettől topog, nem jut el külső olvasóig | a goal typed állapota fejezeteken át nem változik, és ezt senki nem jelzi | az earned-evolution szöveg megvan; hiányzik a tény, hogy a cél hány fejezete áll |
| a három munkahelyi szöveg cselekményváza azonos | futások közti modell-prior; egy életen belül csak a 3 fejezetes ablak látszik | futások közti ismétlést egy élet promptja nem láthat; ezt mérni kell, és a névpaletta/ledger csökkenti |

## Döntések és megvalósítás (v8 / quality2.7)

Kiválasztott tuple: planner/author/reviewer **v8**, editor **v7**, fidelity v1, qualityPolicy **2.7.0** (`fictionV8Policy()`, `fictionPolicy()`), report 1.3.0 / signature 1.1.0 változatlan sémával. A 2.7.0 a 2.6.0 összehangolt javítási útját örökli; kérés-, repair-, byte- és budget-guard nem változik. A v1–v7 prompt-bájtok befagyasztva (a v7 hash-ek tesztje változatlanul zöld), a v8 szöveg a v7 végére fűzött kiegészítés.

1. **Determinisztikus sorozatnapló (`seriesLedger` 1.0.0).** A szerver minden saját fejezetből kiszámolja (`packages/core/src/fiction-series.ts`, `fictionSeriesLedgerFrom`): több fejezetben visszatérő mondatnyitások és ötszavas fordulatok (darab + fejezetszám), az utolsó hat fejezet záró mondata, a megadott pár/család/barát szereplők jelenléte (hány fejezet eseményében szerepeltek, mióta nem), és célonként, hány fejezete nem változott a typed goal-állapot. Csak quality2.7 contextben lehet, saját 3 KiB-os határa van, withheld memóriánál nem kerül be. Ezek tények, nem kvóták: a v8 szöveg kifejezetten kimondja, hogy egyik szám sem ír elő eseményt.
2. **Szerkesztői bizonyíték (`seriesEchoFindings`).** Az editor kérése determinisztikus listát kap arról, hogy az új fejezet narrációja hol használja újra a naplóban már visszatérő nyitást vagy fordulatot. Az editor v7 ezt mért tényként kezeli: ≥2 előfordulás vagy két különböző találat esetén `distinctRhetoricalShape=false`, a záró mondatot a `recentClosings`-hoz méri, és a „javaslat–bosszús ellenállás–félig engedés” ütem ismétlésére nem adhat `behavioralVariety=true`-t. Kapu-, séma- és repair-szabály nem változik; a gépi mérés a modell önértékelését pontosítja, nem írja felül.
3. **Per-élet névpaletta (`castingProjection`).** Kérésenként, tárolás nélkül számolt, az élet azonosítójából seedelt 10 keresztnév + 8 családnév az ország (IE, GB, US, HU, illetve hu locale) készletéből, az életben már használt névtagok kizárásával. A készletből szándékosan kimaradtak a v7 alapértelmezései (Niamh, Byrne, Kavanagh, Doyle, Orla, Maeve). Ajánlás, nem engedélylista: bármely más helyhez illő név megengedett, meglévő szereplő nem nevezhető át.
4. **Visszatérő ütem és cselekményváz.** Egy rövid v8 szakasz megnevezi a két mért mintát (javaslat → ellenállás → félig engedés; jelentkezés → próba → ajánlat → hívás), és azt kéri, hogy ha az előzmény ezt mutatja, a periódus a hős saját tettén, kudarcán vagy elutasításán forduljon. Ez nem kvóta és nem ütemterv.
5. **Mérési profilok.** Minden kitalált alapkapcsolat keresztnevet kapott (`Fictional older sister Clodagh`, `Fictional school friend Nessa` stb.). Ez új sourceHash-t ad; a v6/v7 korpusz nem egészíthető ki v8 forrással.

Nem változik: automatikus kánon-javítás (ADR-008), a v7 túlmagyarázás-jelzése (megmarad, de nem építünk rá), ütemterv vagy fejezetszám-alapú szabály (a tulajdonos 2026-10-17-i döntése szerint tilos).

## Költségmentes ellenőrzés

Három szint, egyik sem hív fizetős modellt és nem ír a ledgerbe:

1. **Determinisztikus egység- és integrációs tesztek** (`tests/fiction-v8-candidate.test.ts`, `tests/fiction-worker.test.ts`): a ledger, a visszhang-találatok, a névpaletta és a context-határok szintetikus „v7-szerű” prózán; a következő job contextjében valódi adatbázison át megjelenik a napló; a v7 prompt-hash-ek változatlanok. CI-ben fut.
2. **Offline sorozat-audit a már legenerált fejezeteken:** `pnpm narrative:audit --out <dir> <run-dir>...` a tárolt `report.json`-okból számol: ismétlődő nyitások/fordulatok, fejezetenként mit jelzett volna a v8 editor-bizonyíték, záró mondatok, névgyakoriság, magánéleti szereplők említése, futások közti közös teljes nevek és fordulatok, azonos profil azonos fejezetének lexikai átfedése. Ez a v6/v7 baseline; a következő mérés ugyanezzel a paranccsal hasonlítható. Eredmény: lásd [Baseline](#baseline--v6v7-audit).
3. **Elfogadási küszöbök a következő engedélyezett méréshez** (ugyanazzal az audittal, humán olvasás mellett, nem helyette): egyetlen nyitás sem jelenik meg egy szekvenciában 4-nél többször; a futások közti közös teljes nevek száma 0; minden megadott alapkapcsolat legalább egyszer szerepel 8 fejezetben; az editor-bizonyíték által jelzett fejezetek aránya a v7 baseline alatt marad. A küszöb nem release gate; a tulajdonos és a független olvasás dönt.

### Helyi Codex mint ingyenes futtató

A tulajdonos javaslata (2026-10-19): a gépén telepített Codex CLI ugyanazzal a modellel, előfizetésből futtathatná a generálást. Vizsgálat eredménye: lásd [Codex vizsgálat](#codex-vizsgálat--2026-10-19).

## Baseline — v6/v7 audit

Kitöltendő a tulajdonos gépén futtatott `pnpm narrative:audit` eredményével.

## Codex vizsgálat — 2026-10-19

Kitöltendő.

## Következő lépés

Exact-source CI és kódátnézés után, új számszerű engedéllyel: friss háromfejezetes munkahelyi előpróba (kb. 0,77 USD a v7 alapján), majd az audit és rövid humán olvasás; csak elfogadható eredménynél teljes kétprofilos mérés. Merge és production csak a tulajdonos kifejezett engedélyével.
