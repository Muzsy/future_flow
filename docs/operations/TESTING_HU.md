---
status: canonical
owner: operations
last_reviewed: 2026-11-01
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

A `smoke-deployment.mjs` izolált, root jogosultságú funded fixture-je fizikai mentést/visszaállítást és successor-várakozásokat is végrehajt. A teljes gyermekfolyamat CI-kerete15perc, a külön image-rehearsalt és építést is futtató Container job felső határa40perc. A sikeres fixture tényleges `fundedFixtureElapsedMs` időtartama a CI-naplóba kerül; a mérés nem elfogadási proof. Az egyedi parancsok határai, watchdogok, ellenőrzések és a production/provider időkorlátok változatlanok. Nincs automatikus retry vagy sikertelen ellenőrzés átugrása. A successor-fixture lánca (owner → reader → tester) a `schema-039` generációval zárul: a fixture-adatbázis csak szintetikusan lép vissza 038-ra, a valódi image migrál, az első kísérlet a DB-írás előtt megszakad és az explicit recovery fejezi be (`schemaMigration`, `schemaRecovery`, `billingDefaultsGuard`).

Indok: a89aa943 main [CI40463665750](https://github.com/Muzsy/future_flow/actions/runs/40463665750) első Container-kísérletét a korábbi600000ms külső keret megszakította (`spawnSync sudo ETIMEDOUT`), miközben a Verify sikeres. Az egyező tracked tree korábbi sikeres PR-smoke-ja kb.9m11s volt. Ez szűk időtartalékot jelez, de az eredeti timeout mélyebb oka nem bizonyított; az eredeti failure megmarad. A módosított keret elfogadásához saját tényleges Container CI szükséges, nem elég a konfiguráció ellenőrzése. Célgépes művelet továbbra csak a konkrét main saját sikeres CI-je és az arra érvényes tulajdonosi felhatalmazás mellett indulhat.

### Párhuzamos CI-jobok — 2026-10-31

A CI három, egymástól független jobból áll, amelyek párhuzamosan futnak: `verify`, `container` és `image-rehearsal`. Korábban az image-rehearsal a `container` job második, a smoke után következő lépése volt, ezért a teljes futás ≈ 44 perc volt. Most mindkét container-szintű job a saját image-buildjét használja:

- `container`: image build, `verify-deployment.mjs`, `age` telepítés, `smoke-deployment.mjs`; artifact: `funded-upgrade-ci-proof`.
- `image-rehearsal`: image build, `age` telepítés, a rehearsal-szkript által rögzített PostgreSQL digest előzetes `docker pull`-ja (a rehearsal maga szándékosan nem húz le semmit), majd a változatlan rehearsal és proof-validáció; artifact: `funded-image-rehearsal-proof`.

Egyetlen ellenőrzés sem esett ki, a timeoutok jobonként 45 percesek (a smoke-fixture külső 30 perces határa változatlan). A successor-fixture ablakainak kezdési előnye (`START_LEAD` a `contabo-beta-successor-fixture.py`-ban) 10 perc: a #119 ezt 4 percre csökkentette, de az egyprocesszoros célgépen (Contabo) a tester-lépés `now`-ja és a `verify_serving` közötti idő meghaladta a 4 percet, így a célgépes izolált rehearsal `Owner trial start already reached` hibával megbukott (az éles szerveren ekkor semmi nem futott). Hosztolt CI-n ez a szakasz kb. 100 s (143–168 s tartalék a 240 s-ból, PR #119), a célgépen több mint 240 s volt; a 10 perc a korábban bizonyított, biztonságos méret. A lánc ettől függetlenül ténylegesen megvárja az owner-ablak indulását, így a `container` job futásideje kb. 6 perccel nő. Célzott teszt (`test_successor_fixture_timing.py`) rögzíti, hogy a lead legalább 10 perc.

A release-kapuk (`assertExactFenceCiJobs` a `scripts/contabo-fence-operator.mjs`-ben, amelyet a fence/funded/personal-beta/successor operátorok használnak) pontosan a három jobot követelik meg sikeresen; a régi, kétjobos futás már nem fogadható el. Ha a GitHubban kötelező státuszellenőrzés (branch protection) van beállítva, annak az `image-rehearsal` nevet is tartalmaznia kell; a `container` név változatlan.

### Billing-foglalás és TTL-takarítás sorrendje — 2026-11-01

A #128 merge utáni `03d8d81` főági [CI41262355164](https://github.com/Muzsy/future_flow/actions/runs/41262355164) konténeres próbája a `smoke-billing.mjs` negyedik esetében `BILLING_RESERVATION_MISSING` hibával megállt. A próba a szigorú, önálló `consumeChapterForUser` segédfüggvényt versenyeztette a TTL-takarítással: ha a takarítás futott előbb, a felszabadított foglalást ez a függvény elutasította. A sikeres éles fejezetmentés a `consumeGenerationChapter` függvényt használja, amely a felszabadított foglalást is elfogyasztja a mentés tranzakciójában.

A javított PostgreSQL-próba ezt az éles elszámolási függvényt ellenőrzi: terhelés → takarítás, takarítás → terhelés és valódi párhuzamos végrehajtás, majd azonos mentés ismétlése. A két mentett fejezet foglalásának mindenképpen `consumed`, a két érintetlenének `released` állapotban kell végződnie; a korábbi megengedő „consumed vagy released” állítás helyett. A `billing-gate.test.ts` külön, valódi fejezetmentéssel igazolja, hogy a korábban visszaadott ízelítő egyszer elfogy, az azonos kérés nem terhel újra, és a következő fejezet már előfizetést igényel. Nincs hibanyelés, őrlazítás vagy alkalmazáskód-változás; a teljes PostgreSQL/fixture bizonyítékot a javítás saját CI-je adja.

**Helyi célzott bizonyítás:** a CI-vel egyező digestű PostgreSQL 17 képen, külön `internal` Docker-hálózaton a javított negyedik eset változatlan törzse mindhárom sorrendben, tíz ismétléssel (30 eset) PASS. A korábbi `consumeChapterForUser` visszahelyettesítése determinisztikusan `BILLING_RESERVATION_MISSING` hibát adott a takarítás-először esetben. A próba nem állított be CI-identitást, nem hívott szolgáltatót; az ideiglenes adatbázis és hálózat takarítása sikeres. A billing-gate/store és a pool-hibakezelés célzott tesztjei 29/29 PASS. Ez nem a teljes konténeres CI vagy a célgépes release-próba helyettesítése.

### Személyes worker-dispatch fejezetkapuja — #140

A `billing-dispatch.test.ts` a valódi 039 migráción, PGlite SQL-tárolóval és a tényleges OpenAI provider-wrapperrel fut; csak az SDK kliens válasza helyettesített. Külső AI-hívás vagy költés nincs. A teszt a worker saját konfigurációját és guard-összeillesztését használja. Negatív eseteknél igazolja a nulla fizikai SDK-hívást, korai elutasításnál a nulla USD-előfoglalást is. A foglalás hiánya/idegen tulajdonosa/feloldása/fogyasztása, a job-lease lejárata/cseréje, visszatérítés/reconcile, adatbázishiba és az alkalmazásszintű retry közbeni visszavonás külön eset. A valódi `DatabaseAiBudget` foglalása utáni visszavonás/lease-lejárat nulla használattal rendezi a ticketet, nem hoz létre fejezetfogyasztást. A pozitív eset valódi USD-settlementet is ellenőriz.

Külön regresszió őrzi a természetes ciklusvég után már meglévő fizetett foglalást, a kanonikus UUID-re történő explicit retry-t és annak friss TTL-jét, az OFF módot, a régi béta szűk mentességét és ettől független USD-ablakát. A C5 physical-request számláló foglalás hiányában nem lép tovább; a már kész C5 kimenet billing-kiesés és korábbi TTL-feloldás mellett is menthető és egyszer elszámolható, új AI-kérés nélkül. A számlázási ellenőrzés nem jelent mért szolgáltatói vagy éles operátori próbát.

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


### Registry040 host/image elfogadás — #142/#149 jelölt

A `alterward-beta-successor-fixture-5` külön registry receipt: a korábbi23 successor kapu mellett `registryMigration`, `registryLostOutputRecovery`, `registryIntentBound`, `registryBillingConfigStages`, `registryCandidatePrivacyRestore`, `registryNativePrivacyRestore` kötelező. A version4 változatlan marad a régi műveletekhez, és nem használható040 release-hez.

A fixture a production `quarantine.replay()` transportot használja valódi publikus PostgreSQL dump-pal, adat-only clean restore-ral, TLS-sel, actual image-dzsel és ellenőrzött cleanup-pal. A hosted Auth-inventory csak itt szintetikus, az éles verified observer határa változatlan. A postcheck-recovery eset újabb tízperces várakozás nélkül, változatlan jövőbeli funded window mellett járja végig a040 → sandbox → live → enforce ágat. A másik lánc a már érvényesített039 billing felett migrál, és elveszett COMMIT-kimenetből SQL-ismétlés nélkül áll helyre.

A staged alkalmazás DB-postcheckje verzióhoz kötött: a régi funded/successor út039-et és a változatlan v1 megőrzési szabályt, a két explicit registry purpose040-et és a teljes v2 runtime pontos egyezését követeli. A hálózati, worker-stop, újraindítási, konfigurációs, origin- és idegenkonténer-kapuk közösek és változatlanok. A protokollregresszió minden v2 mező driftjét és mindkét irányú hibás sémát elutasítja.

A #151 javítás CI smoke child-kerete40perc, Container job60perc; a standalone image-job45perc marad. A korábbi30/45 és15/40perces bejegyzések történetiek. A növelés oka: azonos reviewed tree-n a PR Container25,1perc után sikeres, a main Container30percnél időtúllépett, miközben a main standalone próba sikeres volt. Az egyedi műveleti határidők, watchdog és a valódi10perces várakozás változatlanok. A szintetikus fixture fix esetneves start/complete futásidőket ad kizárólag stderrre; külső timeoutnál ez lokalizálja az utolsó fázist. A szülő saját temp-takarításának hibája továbbra FAIL, de nem dob új kivételt az eredeti hiba helyére. Nincs sudo rm vagy root-jogosultság-lazítás: a megmaradt0700 könyvtár nem sikeres cleanup. Az új source-hoz a konkrét saját CI és exact-source review eredménye kell; a fixture-protokoll léte nem sikeres futás vagy éles engedély. A mért futásidőt a CI rögzíti, provider/AI hívás nincs.


A külön adatbázisba történő bináris comparison restore nem in-place upgrade: a DB-identitás eltér, a PostgreSQL pedig a default ACL-t NULLként vagy explicit, más sorrendű bejegyzésekként tárolhatja. A fixture ezért mindkét példány változatlan reviewed runtime/catalog ellenőrzése után külön, konzisztens read-only megfigyelésben **minden** katalóguskomponenst és az összes kibontott jogosultságot összeveti (grantor, recipient, privilege, grant option; sorrendtől/default reprezentációtól függetlenül). Csak ennek teljes egyezése után normalizálja a bináris comparison nyers ACL-katalógushashét; az összes adat-, billing-, receipt-, registry- és policy-hash továbbra egyezik. Az éles v2 source/candidate/migration guard nyers katalógushashe és jelentése változatlan. A `fixture-restore-catalog.test.ts` a valódi SQL ACL-oda-vissza utat és sorrendet, valamint a megváltozott grantot, grant optiont, sequence/function/schema-jogot és RLS-t ellenőrzi; eltérés nem válhat egyenlővé. [PostgreSQL16 ACL-függvények](https://www.postgresql.org/docs/16/functions-info.html).


### Korlátos nyílt admission — valódi PostgreSQL próba

A `tests/service-admission.test.ts` (PGlite + valódi HTTP-kapu) minden CI-futásban lefut. A `tests/service-admission-postgres.test.ts` csak akkor fut, ha a `SERVICE_ADMISSION_PG_URL` egy eldobható, helyi `ff_admission_test*` adatbázisra mutat (a séma törlődik): `createdb ff_admission_test && SERVICE_ADMISSION_PG_URL=postgres://localhost/ff_admission_test pnpm vitest run tests/service-admission-postgres.test.ts`. Négy független pool, 80 párhuzamos regisztráció: pontosan a kapacitásnyi admission, ugyanaz a fiók többszörös érkezésre egy hely, zár nélküli (mutált) kód elbukik. A CI `verify` job a futó gépen előre telepített PostgreSQL-t indítja el egy eldobható szerepkörrel és adatbázissal (véletlen jelszó, nincs titok a repóban), így a próba CI-ben is lefut. Ez nem image-rehearsal és nem éles audit.

### #150 scoped service-operation prototípus

A `service-operations.test.ts` teljes040 sémás PGlite adatbázison20 esetet futtat: három meglévő+10+10 admission reset nélkül; paused bootstrap és Auth/root sorrend; stale és konkurens intent-CAS; teljes batch rollback; hibás provider-UUID/anonymous/email/ban/deleted/metadata; Auth-kiesés alatti revoke; restore-zár megőrzése; readonly committed/uncommitted/lost-output readback; törölt root nem támad fel; provider-várakozás alatti intentlejárat; context/hash/extra-field elutasítás. Minden eset után az eredeti USD-account és consumed taster sor változatlan. Ez célzott könyvtári bizonyíték: valódi többkapcsolatos PG/törlés-verseny, lockra várakozás alatti lejárat és actual-image/root-journal E2E továbbra a teljes #150 elfogadási feltétele, nincs belőle promotion-proof.


## Service-operátor kliens — #179

`node --test tests/ops/service-operator-client.test.mjs`: zárt argv, source/script/parancs-kötött jóváhagyás, abszolút kapacitás és explicit added-places, emergency csak pause/close, valódi Python-loader 0700/0600 fájlokkal/hash-sel/takarítással és scrubbed envvel, Python-parser paritás, pinned SSH, szigorú commit-válasz. Az eldobható committed main checkoutból futó tényleges CLI helyettesített SSH-val bizonyítja a privát intent/result/failure megőrzését, a raw stderr titok kizárását és a vak retry hiányát. Production/root/valódi SSH vagy AI-hívás nincs; ez nem A8 vagy célgépes bizonyíték. A Verify job külön futtatja. A meglévő `test_service_operator.py`, `service-operator-e2e.test.ts` és többkapcsolatos adatbázispróba a root/DB logika külön regressziója.

2026-11-06 helyi célzott eredmény: az új kliens 13/13 Node-tesztje és a meglévő root operátor 37/37 Python-tesztje PASS. A helyi teljes suite, a PR saját CI-je és a későbbi main CI külön bizonyíték; a célzott eredmény nem éles jóváhagyás.


## Teljes SPR-konfigurációs archívum — #181

`python3 -B -m unittest discover -s tests/ops -p 'test_service_profile_config_archive.py'`: a valós SPR-író0400 generációját a teljes `extended_config_archive` útvonalba kapcsolja, valódi jogosultságolvasókkal, a legacy/funded fixture többi adatának megtartásával. Ellenőrzi az archívumbeli bájt/hash azonosságot és a változatlan0400 élő módot; a korábbi0600 generációt; és a generic/nemgeneration0400, public/group mód, unknown név, hardlink/symlink/idegen UID elutasítását. Tíz eset; a javítás nélküli kódon a pozitív0400 eset ugyanazzal a 484→92 `Private regular file required` hibával bukik, mint a célgépes mentés. A CI meglévő teljes Python-discovery lépése futtatja. Nincs SSH, Docker, éles DB vagy providerhívás.

2026-11-06 helyi eredmény: az új10/10 eset PASS; a teljes Python-kör856teszt OK/11meglévő SKIP; docs:check, format:check és diff-check PASS. A PR/új főág CI és a célgépes mentési folytatás külön kapu, ez nem éles backup-PASS.


## K-A tényleges célgépes elfogadás — 2026-11-06

A #182 saját CI 42267626224 és a main `4f2380c` saját CI 42272725638 mindhárom jobja SUCCESS. A külön engedélyezett célgépes végrehajtásban mindkét backup/offsite/103-táblás izolált restore sikeres; a két mentés közt csak a külön jóváhagyott bootstrap policy-sora változott, másik 102 tábla sorszáma és adathash-e azonos. Natív040 rehearsal: 103 forrástábla egyezik,102 review-zott tábla / 226 FK, független post-replay verifier, eredeti ID/image, idegen konténerek állapota és cleanup PASS. Friss normálmonitor `alerts: []`, két timer enabled/active. Ez tényleges operátori bizonyíték, de nem mért böngészős A8, Stripe-fizetés vagy publikusnyitás. [Források, időpontok és korlátok](NARRATIVE_RELEASE_HU.md#k-a-üzemeltetési-helyreállítás-pass--2026-11-06).
