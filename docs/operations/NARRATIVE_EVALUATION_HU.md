---
status: active-supporting
owner: personal-simulation
last_reviewed: 2026-10-15
related:
  - ../plans/NARRATIVE_QUALITY_IMPLEMENTATION_HU.md
  - NARRATIVE_RELEASE_HU.md
---

# Személyes történetminőség: reprodukálható összehasonlítás

## Bizonyítékok és korlátok

A `scripts/evaluate-narrative.ts` N08 mérőeszköz kizárólag a repository nyolc kitalált tesztprofilját fogadja. Minden mód saját tartós, helyi PGlite adatbázist használ a valódi queue/worker/budget/checkpoint/commit útvonallal. Nincs production DB, Auth, saját tesztelői fiók vagy operátori állapot. Az offline mód alapértelmezett, nem hoz létre fizetett SDK-klienst, általános OPENAI_API_KEY mellett is mock transportot használ. A program nem tölti be automatikusan a projekt .env fájlját.

Három külön vizsgálat készül:

- Teljes pipeline: nyolc profil, három időszak, legacy és narrative-v1, 48 fejezet és 24 páros értékelés. Eltérő planner kimenetek megengedettek, ezért ez a teljes rendszer teljesítménye.
- Azonos kánon: nyolc fixture-authored, domain-validált eseménysor és jelenetterv, két writer út, 16 fejezet és nyolc pár. A tervhez nincs hamis planner receipt; ez nem alkalmazási period commit. Első draftokat hasonlít, nincs javítás.
- Alternatív ág: az első két profil második döntésénél ellenkező, előre rögzített szemantikai irány, négy fejezet és két pár. Valódi saját-history fork, a szülő harmadik fejezete nem kerül a child memóriába.

Összesen 68 fejezet és 34 vak pár. A normál offline út 222 mock transporthívás; valódi hiba/javítás több kísérletet igényelhet. Ez **működési bizonyíték, nem irodalmi minőség**. Az editor modell pontjai diagnosztikai adatok, nem független értékelés.

## Offline futtatás és folytatás

Node 24 és a rögzített pnpm/dependency környezet szükséges. A repo gyökeréből:

```text
pnpm evaluate:narrative --mode offline --out .local/narrative-evaluation/offline-reviewed-source
```

A forráscommit, a tényleges harnessfájlok/migrációk hash-e, modellek, seed és paid project hash kötött. Változó source/models/project esetén új mérési könyvtár kell. Azonos parancs újraindítása a mentett állapotot használja: teljes periodot vagy validált, megfelelő request/output hashhez kötött fix-writer választ nem generál újra. A corpus `.run.lock` fájlja kizárja az egyidejű írót; fizetett módban egy közös paid-run lock is van. SIGKILL után a lockot csak az előző processz igazolt leállása után lehet rendezni; automatikus stale-lock törlés nincs.

A `report.json` tartalmazza a nyers kitalált fejezeteket, kánont, terveket, receipteket, hibaeredményeket, fizikai slotokat, transporthívásokat, latencyt és choice mappinget. A `summary.json` összesít. A `human-review/index.html` olvasható A/B csomag; a `blind-key.json` külön, értékelőnek nem átadandó. A `human-review/ratings-template.json` szándékosan null pontokat tartalmaz. A program hibánál csak safe hibakódot ír, SDK-hiba vagy titokfragmentum nem kerül konzolra.

## Döntések szemantikai párosítása

A profilhoz és időszakhoz előre rögzített intent tartozik; a két rendszer eltérő option ID-ját soha nem párosítjuk puszta tömbindex szerint. Egyértelmű, konzervatív szöveges egyezés folytathatja a fejlesztési futást, de minden mapping emberi szemantikai review-ja kötelező a releasehez. Többértelmű döntés megáll és `choiceReviewRequests` rekordban megadja az options/decisionHash/intent adatot.

A `--choices-file <JSON>` tömb minden eleme: fixtureId, mode (`legacy` vagy `narrative-v1`), periodIndex (0–2), branchKind (`main` vagy `fork`), optionId, decisionHash, intent, legalább 40 karakteres rationale, reviewed=true. Hash és intent pontos egyezése szükséges. Duplikált kulcs elutasított. Már elkészült fejezetnél a review csak a már kiválasztott optiont igazolhatja; más option nem írhatja át a mérési múltat. Review után ugyanazon corpus újraindítása frissíti az értékelési mappingeket és a vak csomagot, provider-költés nélkül.

## Külön engedélyezett fizetett futás

Az elfogadott fejlesztési terv külön emberi engedélyt kér a fizetett benchmarkhoz. Szükséges a konkrét approval azonosító, legfeljebb 5 USD **összesített fejlesztési keret**, valamint külön fejlesztési OpenAI project és project/service-account kulcs. A személyes béta éles kulcsát/windowját/ledgerét nem használjuk. A fájlban tárolt kulcs útvonalát kell az operátornak átadni, a kulcsot nem chatben.

Csak explicit átadott `NARRATIVE_EVAL_API_KEY`, `NARRATIVE_EVAL_PROJECT_ID`, `NARRATIVE_EVAL_PROJECT_CONFIRMATION=dedicated-development` olvasható; általános OPENAI_API_KEY fallback nincs. Az environment marker a kezelő nyilatkozata, nem OpenAI project-ownership API-bizonyíték; a külön fejlesztési projektet az operátornak ellenőriznie kell. Titokfájl a repo/image/report része nem lehet.

```text
pnpm evaluate:narrative --mode paid --allow-paid --budget-usd <APPROVED_TOTAL_USD> --approval-id <APPROVAL_ID> --out .local/narrative-evaluation/paid-reviewed-source
```

Tiszta committed forrás kell. Az SDK explicit OpenAI végpontot, megadott projectet, default service tier-t, store=false-t és nulla SDK retryt használ. A közös provider parser retry minden fizikai kísérlete valódi admission/reservation előtt ellenőrzött; narrative period legfeljebb hét slot, egy globális tartalmi javítás. Fix-canon pár legfeljebb hét összesített slot. Nem ismert usage után teljes reservation marad elszámolt; budget denial sem adja vissza a már elfoglalt slotot.

A `.local/narrative-evaluation/paid-usage.json` globális ExperimentAiBudget ledger és `budget-bindings.json` source/case binding minden új out könyvtár mellett is megmarad. Új out/approval nem nullázza. Minden fizetett futás ugyanabból a kijelölt mérőcheckoutból történjen; másik worktree/checkout nem jelent új engedélyezett keretet. Átköltözéskor a ledger/binding eredeti byte-jainak ellenőrzött megőrzése külön kötelező, üres ledgerrel nem folytatható az engedély. Költség: tényleges usage-alapú becslés, konzervatív accounted összeg, ismeretlen usage és peak reservation külön. Ez nem számla. Az árlista 2026-10-15-i hivatalos default/short-context listához kötött; hét nap után új ellenőrzés nélkül nincs paid futás. Modellt/árat csak új review-zott source-ban lehet változtatni. A hard cap kimerülése incomplete mérés, nem ok a keret önálló emelésére.

## Emberi minőségkapu

Az értékelő a vak csomagot kapja, nyers modellpontokat/módazonosítót nem. Minden párt értékeljen: A/B preferencia vagy tie, nyolc dimenzióban 1–5 pont, legalább egy konkrét, valódi bekezdésre mutató indok. A pairHash az adott változatok pontos snapshotjához köt. Megváltoztatott szöveghez régi pontozás nem használható. További reviewerek nem növelik a független mintapárok számát; párszintű többségi döntés, bizonytalan vagy tie-többség esetén tie számít.

```text
pnpm evaluate:narrative --mode assess --out <CORPUS> --ratings-file <HUMAN_JSON> --max-mean-cost-usd <OWNER_USD_PER_CHAPTER> --max-p95-ms <OWNER_P95_MS>
```

A két pozitív költség/idő plafont a tulajdonos állítja be; program nem talál ki termékszabályt. Assessment újraolvassa a globális költségledgert és ellenőrzi a teljes narrative fejezetenkénti költséglefedettséget. A szigorú release kapu feltételei együtt: teljes paid corpus; mind a 34 pár hash-bound emberi értékelése; a 24 full párból legalább húsz nem tie; ezek legalább 70%-ában narrative preferencia; öt kritikus dimenzió átlagban legalább négy; nulla hard failure/unknown financial usage/unassigned reservation/privacy probe failure; minden elfogadott választás reviewed; költség és p95 a külön megadott plafonon belül. Wilson 95% intervallum tájékoztató, nem automatikus felmentés.

Rövid profilrészhalmaz, offline mock, hiányzó pontozás, csupán editor pass vagy hiányzó üzemeltetési plafon mindig zárt release kapu. A negatív vagy hiányos eredmény is megmarad; forrásjavítás után új source-bound corpus és új értékelés szükséges.
