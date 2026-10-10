# alterward — felügyelt mentési életciklus

2026-10-10 · [Aktuális kiadási sorrend](NEXT_STEPS.md) · [Managed egyeztetés](MANAGED_RETENTION_RECONCILIATION_HU.md) · [Véges történeti másolatok](LEGACY_RECOVERY_RETENTION_HU.md) · [Korlátozott külső figyelés](PRIVATE_HEALTH_MONITOR_HU.md).

## Elkészített működés

A [külön végrehajtó](../scripts/ops/contabo-recovery-lifecycle.py) és [telepítő](../scripts/ops/contabo-recovery-install.py) két saját systemd unitot készít elő. Negyedóránként ellenőriz; legalább 23 órás utolsó sikeres capture után új managed mentést készít. A PostgreSQL 17 kliens a már működő API kapcsolati adatait és ellenőrzött TLS-ét használja; új adatbázis-jelszó vagy visszafejtő age-kulcs nincs telepítve. A [Node-katalógus](../scripts/ops/managed-catalog.mjs) repeatable-read/read-only exportált snapshotját ugyanaz a dump használja. Csak az Auth/Storage kezelt adatai és a public biztonsági szerkezet kerül a külön mentésbe; a napi public adatmentés önálló marad. Régi sessionök, bearer/tokenadatok és folyamatban lévő uploadok kizárva; új kezelt tábla vagy Auth-oszlop zárt megállás és adatvédelmi felülvizsgálat.

A privát katalógus és a dump csak pipe/memória és az elkülönített `/run` tmpfs munkaterület útján halad. A két titkosított fájl és az eredeti manifest tartós fsync után, teljes csomagként atomikusan kerül a managed archive rootba. Sikeres capture külön tartós metadatarekordot kap, mielőtt egy későbbi történeti expiry hibázhatna. A következő futás így nem gyárt új dátumot a már elkészült mentésnek.

Saját napi/owner kernel-lock alatt fut. A folytató futás előbb az egész saját scratch/pending készletet ellenőrzi; link, hardlink, idegen bejegyzés vagy eltérő, címkézett konténer esetén az első törlés előtt megáll. Csak az elkülönített memóriaterület saját klienskonténere, ideiglenes fájljai és a használható archívumon kívüli, új, félkész titkosított csomag takarítható. Teljes, eredeti archívumra ez a takarítás nem vonatkozik. Nincs rekurzív törlés. A saját munkaterület SIGKILL utáni tényleges recovery-próbája még külön célgépi kapu.

## Lejárat és hibajelzés

A managed manifest eredeti `capturedAt + 7 nap` határa és a három beiratkozott történeti művelet eredeti konzervatív határa változatlan. A szerveres expiryhez független, friss, TLS-ellenőrzött GitHub HTTPS-válasz `Date` fejléce és a szerver UTC-órája szükséges; legfeljebb öt perc eltérés engedett, a korábbi idő dönt. Redirect, cache Age, hiányzó/eltérő idő vagy hálózati hiba esetén nincs expiry. Ez időeltérés-ellenőrzés, nem kompromittált root vagy két egyformán hibás óra elleni bizonyíték. Capture után az idő újra lekérdezve; hosszú futás nem használ régi peer-időt.

A régi konfigurációs/alkalmazási archívumok törlésének előfeltétele egy legfeljebb 26 órás, teljes, projektazonos managed mentés és sikeres, forrásazonos napi alkalmazásmentés. A történeti scope kizárólag a már egyeztetett három enrollment; a helyi JSON-mezőkhöz a szerveres művelet nem fér hozzá. Linuxon a történeti unlink/rmdir eredeti, ellenőrzött könyvtárdeszkriptorhoz viszonyított. Torn intentnél nem készül pótló metadata és nem történik automatikus törlés: operátori karantén/eredeti napló-helyreállítás kell. Az eredeti naplók és a metadata-only history megmaradnak; a meglévő kapacitáskorlátok továbbra zárt hibát adnak.

A [kilenc állapotjelző projekciója](../scripts/ops/contabo-health-projection.py) telepített lifecycle esetén a backup egészségbitbe beleszámítja a pontos lifecycle/script/unit hash-t, fél óránál frissebb sikeres státuszt, legfeljebb 26 órás managed capture-t, TLS-t, független időt és a változatlan konténereket. A külső válasz változatlanul kilenc boolean, UTC-idő és source-hash; privát katalógus vagy hiba nincs benne. A külön [forrásfrissítő](../scripts/ops/contabo-health-install.py) csak az ellenőrzött előző projection-hash-t cserélheti, minden `authorized_keys` byte, meglévő kulcs, parancs és eredeti lejárat változatlan. Nem terjeszti ki az SSH-jogot.

Kernel-lock foglaltságnál a futás nem frissíti sikeresnek a régi státuszt; a következő timer próbálkozik. Tartós lock/hálózat/capture/expiry hiba vagy stale státusz a GitHub ellenőrzésén keresztül jelezhet. A külső schedule, included Actions-keret és emailút ismert korlátai megmaradnak. A helyi gép offline állapotának és a helyi másolás hibájának külön külső jelzése még nincs ebben a szerveres szeletben.

## Telepítési és ellenőrzési sorrend

A [Windows operátor](../scripts/contabo-recovery.mjs) csak pontos, commitolt forrással és eredeti SSH/hostpinnel működik. Telepítés előtt a három történeti run meglévő szerver/helyi policy-digest egyezése szükséges; az installer ezt a szerveren újra ellenőrzi. A timer kezdetben inaktív. `--run` tényleges systemd szolgáltatásfutást és friss, forrásazonos státuszt követel. `--activate` csak friss sikeres capture/TLS/idő/konténer bizonyíték után engedett. A külön `--disable` csak ezt az egy timert tiltja, mentést nem töröl.

```powershell
node --env-file=.env scripts/contabo-recovery.mjs --install
node --env-file=.env scripts/contabo-recovery.mjs --run
node --env-file=.env scripts/contabo-recovery.mjs --status
node --env-file=.env scripts/contabo-recovery.mjs --activate
```

**Aktuális kapu: még nincs telepítve vagy aktiválva.** Helyi ordering/clock/freshness/hibaút próbák elkészültek; a Linux fájlkezelés, pontos Claude-forrásaudit/CI és kontrollált új capture/offsite/izolált rehearsal következik. A meglévő alkalmazás és napi mentés fut, tesztelői/AI-jogosultság és harmincnapos keret inaktív. A helyi managed/történeti periodikus sync/expiry és annak ellenőrzése további szelet. Teljes hosted GoTrue/login, privacy-authority/fence/promotion és béta-kompatibilis runtime-monitor nincs lezárva.
