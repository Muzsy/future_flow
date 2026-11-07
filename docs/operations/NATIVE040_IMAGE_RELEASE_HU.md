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
  guard csak ennél a konkrét régi digestnél és csak a jóváhagyott Stripe-fájl
  pontos eltérését fogadja el; a többi restore szabálya változatlan.
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
