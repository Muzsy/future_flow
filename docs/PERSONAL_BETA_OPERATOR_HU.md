# alterward — az egyszeri személyes AI-keret operátora

2026-10-11 · [Aktiválási terv](PERSONAL_BETA_ACTIVATION_PLAN_HU.md) · [Olvasói operátor](PERSONAL_BETA_READER_OPERATOR_HU.md) · [Fiókmegfigyelő](PERSONAL_BETA_ADMISSION_OBSERVATION_HU.md).

Implementált, még kiadás előtt ellenőrzendő eszköz: [Windows loader](../scripts/contabo-personal-beta.mjs), [szerveroldali vezérlő](../scripts/ops/contabo-personal-beta.py) és [inert célpróba](../scripts/ops/contabo-personal-beta-fixture.py). A forrás megírása nem bétaaktiválás. Pontos CI, értékelt Claude-audit, fizikai célpróba és az új konfiguráció-archiválási policy telepítése még szükséges. Jelenleg app 827d72a / Daily 72da446 fut, csak tulajdonosi hozzáféréssel, nulla személyes kerettel és inaktív harminc nappal.

## Műveletek és határok

- `--inspect`: a valódi root-manifest és a három futó szolgáltatás megfigyelése; nem kér kulcsot, seed-adatot vagy fiókírást.
- `--fixture`: külön belső hálózat, a korábban ellenőrzött app-image és három inert Node-folyamat. Sikeres váltás, hibás provider/UUID/window candidate miatti emergency disable és post-check-hiba utáni eredeti nulla-visszaállás. A fizikai Docker/fájl/stop/promotion és stdinre adott, exportokat és top-level awaitet tartalmazó JS végrehajtása valós; a DB/Auth/TLS/mentési kapu és a forrásrender explicit tesztillesztés. Ez nem valódi felhasználó vagy paid worker próbája.
- `--prepare-personal FILE`: védett, pontos `participants`, `projectUsd`, `userUsd`, `startsAt`, `endsAt` mezőjű kiválasztás, kizárólag a már alkalmazott olvasói névsor pontos sorrendű email–UUID párjaival. Az OpenAI-kulcs csak a folyamat védett környezetéből olvasható; a selectionben és nyilvános riportban nincs kulcs. A root candidate privát env/frozen Compose fájlja titkosított mentésbe kerülhet. Az előkészítés nem indít konténert, időszakot vagy providerhívást.
- `--apply-personal`: a rooton már előkészített kulcsot és terms-fájlt ellenőrzi; új helyi kulcs nem kell. Egyszeri váltás, új apply/új időszak automatikusan nem engedett.
- `--disable`: a meglévő napi és aktiválási lockok mellett saját szolgáltatások stop-first leállítása és kizárólag az olvasói operátor eredeti, ellenőrzött tulajdonosi nullaállapotának visszaállítása. A funded candidate, annak kulcsa, aktuális kerete, új audit/CI vagy telepített napi policy nem feltétele a stopnak. Sérült eredeti bizonyíték esetén zárva marad; korábbi jogosultságot vakon nem aktivál. A Cloudflare-kapu külön ellenőrzendő.

Minden mód a meglévő, host-pinnelt root SSH-kulcsot használja. A loader önmagát és futtatás előtt importált függőségeit a pontos main commitból ellenőrzi; a Python-modulok és a Node-megfigyelő gitből kötött bytejai kerülnek a szerverre. Előkészítés/apply csak pontos értékelt audit, verify/container CI és fizikai fixture-bizonyíték után engedett. A régi image-only/fence operátor továbbra elutasítja a funded receiptet; külön személyes runtime-digest készült, a hét mezős root-manifest byte-szerződése változatlan.

## Tartós sorrend és visszaállítás

Az első `transition.json` intent a stop előtt tartós. A megfigyelő még hiányzó `journal.json` mellett, tényleges Docker-inspectből megőrzött és leállított eredeti három szolgáltatással ellenőrzi a pontos Auth/application párt, seed/legacy kivételt, DB/TLS-identitást és friss read-only queue/lease/idegen writer határt. A `journal.json` külön, egyszeri, tartós provider-exposure napló; közvetlenül a friss held megfigyelés után, az első fájlpromóció és konténerindítás előtt jön létre. Rollback vagy disable nem törli. Egy korábbi transition vagy exposure-napló tiltja az automatikus újrapróbálást és megújítást; további kör külön felülvizsgált archiválási eljárás.

Azonos app-image, CA, team/AUD, origin olvasói címek, erőforrások, hálózatok és proxy mellett csak a policy pontos személyes UUID/keret/worker-kulcs/window és három szükséges paid-start flag mezője változhat. Shared, publikáló/operátori és külső kitettségi flag továbbra tiltott. Maximum 2 USD OpenAI, 0,50 USD/user, pontosan harminc nap; Claude-audit maximum 1 USD külön tartalék, nincs Claude runtime-kulcs vagy automatikus átcsoportosítás.

Az indulás előre megadott UTC ideje az előkészítéskor legfeljebb tizenöt percre lehet. Az apply legalább öt perc, az első indulás legalább három perc ellenőrzési tartalékot kér, és a befejező ellenőrzésnek a kezdés előtt kell lefutnia. Ez a rövid tartalék az előkészítés/mentés/restore idejét is figyelembe veszi; nem hosszabbítja a harminc napot hiba után. Ha a rendelkezésre álló idő elfogyott, zárva marad, nem írjuk át automatikusan a windowt.

## A konkrét előkészítés mentési kapuja

A napi archívum új `PERSONAL_ARCHIVE_POLICY_VERSION=1` szabálya csak a root-only személyes candidate négy fájlját, terms/prepared/transition/journal/observation állományokat és legfeljebb nyolc privát megszakítási temp-bizonyítékot vesz fel. Az eredeti owner-zero továbbra az olvasói original könyvtárban marad. Ismeretlen név, alias, hardlink vagy nyilvános jogosultság tilt.

Apply előtt kötelező a tényleges candidate utáni mentés, helyi titkosított másolat és izolált offsite restore. A vezérlő a rooton rögzített, friss, telepített forráshoz kötött restore státusz pontos runját keresi a szerver archívumaiban. Az encrypted/hash/config/DB-row/cleanup bizonyíték és az aktuális reader/personal előkészítési fájlok összes hashének egyezése szükséges. Egy régi owner-restore, puszta darabszám, workstationbeli „backup kész” állítás vagy hiányzó candidate nem elég. Nem élő adatbázis-visszaállítás történik.

## Hátralévő ellenőrzés

Helyben tizenegy vezérlő/hibaút/backup-binding és három Node-receipt próba sikeres; a megfigyelő nyolc nyilvános szintetikus SQL- és hét Python-adapterpróbával bővült. Az öt új POSIX személyes archívumteszt Windows alatt kimarad, Linuxon még futtatandó. Teljes helyi Python ops: 292 próba, 232 sikeres, 60 platformfüggő kihagyás. Pontos forrásaudit/CI/fizikai célpróba, archívum-policy telepítése/mentés/restore és fork-permission/capability egyeztetés következik. Valódi tesztelőlista, meghívás, első belépés és friss held pármegfigyelés külön kapu marad.
