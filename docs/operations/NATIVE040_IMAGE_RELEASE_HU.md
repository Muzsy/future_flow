---
status: active-supporting
owner: operations
related:
  - DEPLOYMENT_HU.md
  - LINUX_OPERATOR_HU.md
  - FUNDED_RUNTIME_UPGRADE_HU.md
---

# Native040: a Stripe-lemondás javításának élesítése

A [#185 javítása](https://github.com/Muzsy/future_flow/pull/185) felismeri a Stripe
rugalmas előfizetéseinél a ciklus végére beállított lemondást. A javítás
főágra került (`878ec93`), de a Contabo korábbi image-e (`1d312d2`) ezt még
nem tartalmazza. A meglévő 040-es migráció, a három billing-konfigurációs
lépés és a szolgáltatásprofil története megmarad.

## A váltás és a helyreállítás

- A `contabo-service-env.py image-plan --request <privát JSON>` az új image
  pontos commitját, tagjét és digestjét ellenőrzi, összeveti a termékforrást
  az éppen futó release-szel, és csak a már átnézett Stripe-módosítást fogadja
  el. A célgépes, izolált próba mind az öt eredeti bizonylatát ugyanahhoz a
  source/image párhoz köti. A forráskönyvtárnak tartalmaznia kell a régi
  release commitját is a Git előzményeiben.
- A kérés formátuma `alterward-service-image-request-1`. A `build` mező
  kulcsai: `commit`, `imageId`, `imageTag`, `sourceDirectory`. További
  mezők: `rehearsalDirectory` (új, privát célgépes bizonyítékkönyvtár),
  `backupManifestPath` (`daily/backups/<run-id>/manifest.json`),
  `restoreProofPath` (`daily/status/registry-restore.json`). Az abszolút
  könyvtárak a szerver privát ops könyvtára alatt legyenek.
- Előfeltétel a felülvizsgált Daily és operátori forrás, a lezárt hullám, a
  szüneteltetett generálás és checkout, az üres feldolgozási sor, valamint
  a legfrissebb mentés és az ahhoz tartozó érvényes natív 040 restore. A
  szolgáltatásprofilra és a Compose konfigurációra vonatkozó ellenőrzés
  minden futtatáskor megismétlődik. A váltás előtti restore még a régi
  `1d312d2` image-et használja, de már az új operátorforrással. A replay
  guard csak a lent felsorolt, jóváhagyott (image, forrás-commit, fájlkészlet)
  hármasokat fogadja el, fájlonként SHA-256-tal rögzítve; a többi restore
  szabálya változatlan.
- Az `image-apply` a tulajdonos által jóváhagyott teljes tervhash-t és
  a terv által kiírt `activate-service-image … generation …` mondatot
  kéri. A service-operator és a két Daily zár alatt dolgozik. Csak a három
  alkalmazáskonténert állítja le és cseréli; az új Compose-ban csak a
  három image-azonosító más, a `server.env` bájtra azonos marad. Nincs
  migráció vagy adatbázis-visszatöltés.
- Ha az új image indulása vagy ellenőrzése meghiúsul, a korábbi fájlok,
  pin és image visszaállítását újra ellenőrzi. Megszakítás után a
  `resume --operation-id …` az eredeti jóváhagyott tervhez kötött.
  Az új profil aktiválása előtt a már elindult, de még nem profilozott
  image a konkrét művelet `rollback-service-image …` mondatával
  visszaállítható. Aktiválás után nincs kézi fájlcsere vagy vak újrapróba.
- Sikeres váltás után az új futó image-ről kell új mentés, offsite-másolat
  és izolált 040 restore. A régi image-re kiállított restore-bizonylat nem
  érvényes az újhoz. Az új proof megőrzi az eredeti migrációs azonosítót,
  és külön kötődik a jóváhagyott profilhoz, image-hez és buildhez.
  Zöld monitor után következik a timerek ellenőrzése.

## Az indulási sorrend

1. A váltóeszköz független forrásellenőrzése és főági CI-je, majd az éles
   build és az izolált célgépes próba.
2. A jóváhagyott karbantartás és az image-váltás, majd az új mentés és
   restore igazolása.
3. A már létező, ciklus végére lemondott előfizetés állapotának újbóli
   ellenőrzése az Alterwardban és az elszámolás egyeztetése; az engedélyezett
   próba pénzügyi lezárása. A már sikeresen feldolgozott Stripe-esemény
   ugyanazzal az ID-val duplikátum, így a kézi újraküldés nem frissíti a
   tárolt státuszt. Először ellenőrizni kell, érkezett-e új, aláírt
   előfizetési esemény. Ha nem, az operátori egyeztetéshez külön, pontosan
   meghatározott, terhelés nélküli lépés kell. A helyi image-próba igazolta,
   hogy egy új előfizetés-frissítési esemény a `canceling` státuszt adja,
   számla, kupon és fejezetjóváírás változása nélkül. Új előfizetés vagy
   történetgenerálás a javítás ellenőrzéséhez nem kell.
4. A nyitási terv szerint A8 lezárása, a fennmaradó kilenc hely
   megnyitása, az éles regisztráció és a 24 órás figyelés.

A tesztadatokkal készült helyi Docker-image ellenőrzési eszköz. Nem a célgépes
kiadási image, és nem ad engedélyt az éles váltásra.

## A Discover javítás kiadása

A [#187](https://github.com/Muzsy/future_flow/pull/187) a katalógus és az olvasók öt
webes fájlját változtatja meg. Az image-váltó ezeket kizárólag a futó
`efed82a` forrás közvetlen kiadási utódjaként, az öt fájl teljes listájának és
SHA-256 lenyomatának egyezésekor fogadja el. Az eredeti Stripe-váltás
engedélye a saját korábbi forrásához kötött. A 039 → 040 migráció történeti
próbája az eredeti migrációt és az első natív 040 image-et a megőrzött
commitokból ellenőrzi.

A kiadás előtt fel kell jegyezni az éles hullám aktuális kapacitását,
foglalt helyeit és állapotát. A rövid váltáshoz a felvétel, a generálás és a
Checkout szünetel. A jóváhagyott váltás, mentés, izolált restore és zöld
monitor után az eredeti szolgáltatási állapotot kell helyreállítani. A hullám
visszanyitása az eredeti teljes kapacitással, nulla hozzáadott hellyel
történhet, ha a váltás előtt nyitva volt és a visszaolvasáskor van szabad
hely. Az éles próba egy meglévő fiókkal ellenőrzi a Discover listát és egy
hivatalos történet megnyitását.

## A párhuzamos fejezetgenerálás kiadása

A worker egy folyamatban több, különböző felhasználóhoz tartozó jobot futtat (lásd [ARCHITECTURE_HU](../architecture/ARCHITECTURE_HU.md#appsworker)). A változás három termékfájlt érint: `apps/worker/src/main.ts`, az új `apps/worker/src/job-pool.ts` és `packages/database/src/index.ts`. Az image-váltó ezeket kizárólag a futó `0bbdb06` forrás közvetlen kiadási utódjaként, a három fájl teljes listájának és SHA-256 lenyomatának egyezésekor fogadja el (`REVIEWED_IMAGE_CHANGES`); a `REGISTRY_040_CHANGE_HASHES` két érintett, már pinelt fájlja (`main.ts`, `database/src/index.ts`) ebben a kiadásban frissített lenyomatot kap (nem a main lenyomatát); az új `job-pool.ts` csak a `REVIEWED_IMAGE_CHANGES` bejegyzésben szerepel. Több összevont PR esetén a végleges bejegyzés az utolsóként mergelt PR-ban készül, az összes érintett fájlra. Ez megtörtént: a `0bbdb06` bejegyzése egyetlen közös kiadást köt, amely a worker poolt, az ÁSZF/első ingyenes fejezet szövegváltozását és az előfizetői meghívót együtt tartalmazza (23 termékfájl, a teljes lista és lenyomat a `REVIEWED_IMAGE_CHANGES`-ben; a teszt a bájtokat a reviewed merge commitból olvassa, nem a munkafából). Az előző, három fájlos bejegyzés ezzel felváltva. Compose- és env-változás nincs: a szolgáltatási profil alapértéke hat slot, a worker pool tíz kapcsolat, a konténerlimitek változatlanok, így a váltás a szokásos image-only út. **Kiadási ellenőrzőlista (Ákos):** (1) a Supabase Session pooler mérete legalább annyi legyen, mint a 15 kapcsolat (worker 10 + API 5) plusz a mentés és az operátori hozzáférések tartaléka; ha kisebb vagy bizonytalan, a kiadás előtt `WORKER_CONCURRENCY`/`DATABASE_POOL_MAX` csökkentése vagy a pooler emelése kell, mert a kapcsolatkorlát elérésekor a jobok nem a költségvédelem, hanem az adatbázis-kapcsolat miatt állnak; (2) az OpenAI-szervezet rate-limitje hat egyidejű hívást bírjon; (3) a worker leállítása előtt 0 `running` job legyen (a leállás megvárja a futó jobokat, 120 s után SIGKILL, ilyenkor a lejárt lease-ű job újra claimelhető). A váltás után a worker naplóban a `{"workerConcurrency":6}` sort és az első napokban a `AI_RATE_LIMIT` hibakódú jobokat, valamint az `unknown` USD-foglalások számát kell figyelni. Visszaállítás: az előző image (`rollback-service-image …`).

## A Web UI javítások kiadása

A [#188](https://github.com/Muzsy/future_flow/pull/188) a webes felület 14 fájlját
változtatja meg (favicon, dinamikus bejelentkezési fejlécállapot és a történetoldali
gombelrendezés). Az image-váltó ezeket kizárólag a futó `283e53e` forrás közvetlen
kiadási utódjaként, a 14 fájl teljes listájának és SHA-256 lenyomatának egyezésekor
fogadja el. A korábbi Discover- és Stripe-váltások engedélye a saját korábbi
forrásához kötött. A 039 → 040 migráció történeti próbája az eredeti migrációt
és az első natív 040 image-et a megőrzött commitokból ellenőrzi.

## A regisztráció-visszajelzés pinjei

A regisztráció utáni „Levél elküldve” visszajelzés (#198) három már pinelt fájlt módosít: `apps/web/components/experience.tsx`, `apps/web/lib/i18n/messages.ts` és `packages/contracts/src/error-messages.ts` (új fájl: `apps/web/lib/signup-mail.ts`, nem pinelt). A `REGISTRY_040_CHANGE_HASHES` három lenyomata a #198 ágán a módosított bájtokra frissült, hogy a regisztrációs pin-teszt zöld maradjon. Ez nem kiadási engedély: a `REVIEWED_IMAGE_CHANGES` és a `REVIEWED_REGISTRY_REPLAY_EXCEPTIONS` bejegyzés ezekre a fájlokra (a `packages/contracts/src/error-messages.ts` replay-kivételével együtt) a következő image-kiadás végleges PR-jában készül, a futó Generation 9 (`0b82cd5`) forrás közvetlen utódjaként, az összes érintett termékfájlra.

## Az éles image-build időkorlátja

A célgépes image-build (`contabo-target.py`, `build`) `docker buildx build` lépésének időkorlátja 3600 s (korábban 1200 s). A builder 1 CPU-ra és 2 GiB memóriára korlátozott marad, és a szerver többi folyamatával osztozik a gépen; terhelés alatt a build 20 percnél tovább tartott és háromszor időtúllépéssel állt le (2026-11-11). Az emelés csak a várakozási plafont érinti: az erőforráskorlátok, a build-argumentumok, a forrásellenőrzés és a takarítás változatlanok. A kiadási kapuk és a `REVIEWED_IMAGE_CHANGES` nem változnak. A build ne érje el a 04:15-ös (magyar idő) napi mentést.

## A Daily historikus táblája

A `contabo-daily.py` `HISTORICAL_040_CHANGE_HASHES` táblája az archivált, első schema-040 successor-terv (`beta-successor-5`) pontos lenyomatait őrzi, ezért befagyasztott: új kiadás csak a `REGISTRY_040_CHANGE_HASHES` táblát frissítheti. A #176 tévedésből három bejegyzését is módosította, ezért az új Daily a `proxy-config-capture` fázisban az archívum-ellenőrzésnél elbukott („Exact bounded source-bound039 to040 plan required"), és mentés nem készülhetett. A javítás visszaállítja az eredeti három lenyomatot, és egy teszt rögzíti a tábla tartalmát.

## A natív 040 restore replay-kivételei

A `scripts/lib/funded-replay.mjs` replay-védelme alapból elutasítja, ha az
éppen futó image forrása és az operátorforrás között a `database`, a
`packages` vagy a függőségi/build bemenetek eltérnek. A kiadás előtti, friss
natív 040 restore a _régi_ image-en fut az új operátorforrással, ezért a
kiadott csomaghoz előre átnézett, szűk kivétel kell. Egy kivétel csak akkor
érvényes, ha egyszerre teljesül: a bizonylat `alterward-funded-replay-2`,
schema 40, `registry040`; a futó image digestje és forrás-commitja pontosan az
adott bejegyzésé; az eltérő útvonalak listája _pontosan_ a bejegyzés
fájlkészlete (se több, se kevesebb); és minden fájl SHA-256-ja az operátor
forrás-commitban egyezik a bejegyzés lenyomatával. Minden más fájl, lenyomat
vagy image elutasítva marad (fail closed). A főág továbbhaladása is
érvényteleníti a kivételt, ha a pinelt fájlok bájtjai változnak.

| Futó image (forrás)                  | Fájlkészlet                                                                                                                                                                                | Kiadás                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `sha256:2bc94ef6…202050` (`1d312d2`) | `packages/core/src/billing-stripe.ts`                                                                                                                                                      | #185 Stripe-lemondás                                                           |
| `sha256:a93bb2ba…a3c8a` (`0bbdb06`)  | kilenc `packages/` fájl: `contracts` (`error-messages`, `privacy-consent`), `core` (`billing-referral`, `billing`, `index`), `database` (`billing`, `index`, `referral`, `service-access`) | #194 worker pool, #176 ÁSZF, #193 előfizetői meghívó; operátorforrás `4b0d7b7` |

A teljes lenyomatok a `REVIEWED_REGISTRY_REPLAY_EXCEPTIONS` táblában vannak,
és a `tests/ops/funded-replay.test.mjs` bizonyítja, hogy bármely más image,
fájl, bájt vagy többlet-/hiányzó útvonal elutasított. Új kiadáshoz új, külön
átnézett bejegyzés kell; meglévő bejegyzés nem bővíthető csendben.
