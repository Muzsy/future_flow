---
status: canonical
owner: operations
last_reviewed: 2026-10-12
---

# Testing és quality gates

## Normál repository gate

```bash
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm schemas
```

Dokumentációs CI bevezetése után `pnpm docs:check` is kötelező dokumentációt érintő PR-ben.

## Verify workflow

A GitHub Verify pipeline a repository alap quality gate-je. Többek között ellenőrzi:

- frozen dependency installt;
- formázást;
- backup/source archive boundary-kat;
- root-only reader/security contractokat;
- TypeScript typechecket;
- automatizált teszteket;
- production buildet;
- closed-site production web buildet live credential nélkül;
- sémagenerálást és eltérést;
- container build/deployment/TLS határokat.

Merge csak a releváns kötelező ellenőrzések sikeres lefutása után.

### Teljes funded CI-próba időkerete — #101, 2026-10-27

A `smoke-deployment.mjs` izolált, root jogosultságú funded fixture-je fizikai mentést/visszaállítást és successor-várakozásokat is végrehajt. A teljes gyermekfolyamat CI-kerete15perc, a külön image-rehearsalt és építést is futtató Container job felső határa40perc. A sikeres fixture tényleges `fundedFixtureElapsedMs` időtartama a CI-naplóba kerül; a mérés nem elfogadási proof. Az egyedi parancsok határai, watchdogok, ellenőrzések és a production/provider időkorlátok változatlanok. Nincs automatikus retry vagy sikertelen ellenőrzés átugrása.

Indok: a89aa943 main [CI40463665750](https://github.com/Muzsy/future_flow/actions/runs/40463665750) első Container-kísérletét a korábbi600000ms külső keret megszakította (`spawnSync sudo ETIMEDOUT`), miközben a Verify sikeres. Az egyező tracked tree korábbi sikeres PR-smoke-ja kb.9m11s volt. Ez szűk időtartalékot jelez, de az eredeti timeout mélyebb oka nem bizonyított; az eredeti failure megmarad. A módosított keret elfogadásához saját tényleges Container CI szükséges, nem elég a konfiguráció ellenőrzése. Célgépes művelet továbbra csak a konkrét main saját sikeres CI-je és az arra érvényes tulajdonosi felhatalmazás mellett indulhat.

## Célzott tesztek

Az alap suite nem helyettesíti a domain-specifikus próbát.

Külön ellenőrzés kell például:

- migration/schema változás;
- backup/recovery;
- Auth/privacy/writer fence;
- Shared concurrency/entitlement;
- AI routing/budget;
- deployment/TLS/secret boundary.

## Paid AI

CI alapértelmezésben nem költhet éles AI keretet. Valódi provider E2E csak explicit budgettel, dokumentált célból és megfelelő cleanup/receipt mellett engedett.

## Hibajavítási elv

Tesztet ne lazíts pusztán azért, hogy zöld legyen. Előbb döntsd el, hogy:

1. runtime bug;
2. hibás/elavult teszt;
3. megváltozott elfogadott contract;
4. környezeti/runner hiba.

Contract változásnál a kanonikus dokumentáció ugyanabban a PR-ben frissítendő.

## Személyes narratív baseline

`tests/narrative-baseline.test.ts`: nyolc kitalált profil, rögzített dátumok és stabil UUID-k; a valódi personal worker három feladata és a kanonikus döntés/folytatás három időszakon át, szolgáltatási hívás nélkül. A fixture-próza nem történetminőségi pass bizonyíték. A teljes fejlesztés acceptance és külön paid/humán benchmark gate-je: `../plans/NARRATIVE_QUALITY_IMPLEMENTATION_HU.md`.

N01 célzott kör: narrative-memory, narrative-ai-context, life-ai, life-job-recovery, shared-privacy, life-api és life-persistence. A narrative-memory teszt valódi migrációkból épített PGlite adatbázison ellenőrzi a cohort/default-off utat, a megőrzött choice-t, prefix-forkot, withheld SQL olvasást, UTF-8 limitet és context checkpoint újrahasználatot. Szolgáltatási hívás helyett test transport/fixture provider.

N02: narrative-contracts és narrative-quality suite. Negative cases: idegen candidate/event/branch/option, scene időrend, actor introduction/provenance, Shared identity, thread deadline/reused ID, hamis editorial pass, hibás paragraph/event reference, artifact hash/receipt/delta eltérés. A két szólimit külön ellenőrzött; egy jó rövidebb narrative fejezet nem bukik a puha célhosszon. A generated narrative sémák új namespace-ben vannak, régi V2 diff nélkül.

N03: narrative-storage.test.ts ellenőrzi a null legacy periodot, kötelező/atomikus új mellékletet, stale payload és hamis receipt/fidelity/body elutasítását, own exportot, explicit web/public projekciót, RLS-t és immutable/cascade szabályt. A privacy restore proof mentésében új mellékletes periodok szerepelnek a törölt fiókhoz és élethez; replay után ezek hiánya külön ellenőrzött. Az új recovery baseline csak izolált migration mérésből frissül, éles adatbázison teszt nem fut.

N04: narrative-ai.test.ts a négy új task strict outputját, két locale és modellroutingját, a valódi projected request/receipt hash-t, untrusted szöveg- és inventoryhatárt, withheld/oversize stopot, budget denialt, transport retry számlázását és incomplete/schema-error kezelését ellenőrzi. Az editor csak a végső fejezetet és valódi one-based bekezdéseket kapja, nem írói önértékelést. A mock prose/score és a stub kulcs nem valódi API vagy minőségmérés.

N05: narrative-worker.test.ts 18 offline integrációs próba tényleges OpenAiProvider + DatabaseAiBudget + PGlite admission mellett, kizárólag mock transporttal. Saved stage crash, response-before-checkpoint loss, one planner/editor repair, seven physical slots incl transport retry/budget denial, stale/expired/operator lease, true-flag/body/memory/reference tamper és ceiling utáni zero-call commit vizsgált. Régi lease/retry és privacy restore regressziókkal együtt 81 célzott teszt sikeres. Ezek kontroll- és recovery tesztek, nem emberi minőségmérés; éles szolgáltatáshoz nincs kapcsolat.

N06 célzott proof: narrative-integration három tényleges worker/DB commit, alternatív saját fork, withheld SQL query trace, UTF-8 whole-profile omission és Shared alias/ID blacklist + deletion utáni artifact export projekció. Public fork/personalized scenario regresszió külön igazolja az üres saját narratív reference prefixet. A szöveg/score fixture továbbra nem emberi irodalmi értékelés.

N07 proof: canon-dependent editorial failure négy hívás után megáll, korábbi fejezet/choice megmarad és retryAvailable=false. Budget denial megtartja admitted slotját, egy bounded retry ugyanazt a számlálót folytatja; exhausted/null count partial claim provider nélkül záródik. Fully bound checkpoint attempt=5/count=7 mellett új hívás nélkül retry/commit képes. Lokális CSS/markup olvasási fixture 1280 desktop és 390 mobile szélességen vizsgált, vízszintes overflow nélkül és elérhető wrapped decision gombokkal; ez nem authenticated production E2E. 1em paragraph gap segíti a hosszabb jelenetek olvasását.

Withheld actor follow-up reprodukció: a korábbi core validátor elfogadott egy historical actor origin maphez kötött profil-deltát memory.withheld=true esetén (új negatív teszt a fix előtt hibázott). A javítás után ezt elutasítja, az aktuális periodban szabályosan bevezetett új fikciót engedi. A Shared deletion integráció ugyanilyen valós, tárolt actor_add/profil prefixből igazolja a delta tiltását és a PRIVATE_PROFILE_CUE kizárását az új requestből.


## Narrative quality workstream N08

A `pnpm evaluate:narrative` alapból kizárólag offline kitalált profilokkal fut. A `tests/narrative-evaluation.test.ts` a teljes 68-fejezetes worker/fixed-canon/fork corpus, a provider-hívás nélküli resume, szemantikai review, blind snapshot, emberi értékelési küszöbök és tartós költségelszámolás regresszióját tartalmazza. A teljes corpus teszt explicit 180 másodperces timeoutot kap; ez nem növeli globálisan a suite limitjét. Mock szöveg/editor score nem minőségbizonyíték. Valódi paid benchmark és emberi review csak a [külön mérési runbook](NARRATIVE_EVALUATION_HU.md) szerint; a release kapukat a [kiadási előkészítés](NARRATIVE_RELEASE_HU.md) őrzi.

A tervellenőrzött N08 út célzott tesztjei: narrative-plan-review (strict policy/max8 marker párosítás, computed négy dimenziós gate, foreign reference, withheld/inventory projekció, régi teljes prompt byte-hash, külön checker budget/receipt); narrative-worker új ág (öt hívás, writer előtti tervjavítás, második elutasításnál zero prose, stale/hamis review proof, mentett review és bound ready recovery, nyolcadik slot és kilencedik tiltás, változatlan régi hétkéréses ág). A teljes offline harness immár 248 mock transporttal futtatja a 68 fejezetet és 34 párt. Ez továbbra folyamat- és pénzügyi kontrollbizonyíték; tényleges történetminőséget csak valódi szövegmérés és független humán olvasás igazolhat.
