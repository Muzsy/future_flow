# alterward — root írásstop-próba és recovery-envelope

2026-10-11 · [Előfeltételek](WRITER_FENCE_PREFLIGHT_HU.md) · [Kiadási sorrend](NEXT_STEPS.md).

A [végrehajtó](../scripts/ops/contabo-fence-drill.py) két explicit műveletet támogat: `plan` és `drill`. Produkciós recovery/replay vagy újranyitás parancs nincs. A `plan` ugyanazzal a kilenc ellenőrzött forrásfájllal és pinned image-dzsel indít egy rövid, csak olvasó segédkonténert; az alkalmazásokat nem állítja le. A `drill` megállítja és fordított sorrendben visszaindítja a három eredeti tulajdonosi szolgáltatást, két stabil titkosított megfigyeléssel és végső origin-ellenőrzéssel.

Mindkét művelet az eredeti napi és tulajdonosi zárakat tartja. A végrehajtott transport saját forrásának SHA-ja is ellenőrzött. Csak az eredeti owner image és manifest, a workerhez már kapcsolt dedikált kimenő hálózat, a meglévő DB-CA és a három szükséges szerveroldali környezeti adat használható. A segédkonténer SMTP/AI-kulcs, port és új hálózat nélkül, nonroot, csak olvasható, korlátozott erőforrású, Docker-naplózás nélküli folyamat. A privát környezeti fájl tmpfs-ben van; a megfigyelés stdoutja közvetlenül, memóriában titkosul az eredeti age-recipientre. Csak összesítés és ciphertext-hash marad, személyes azonosítók nem kerülnek riportba.

A tartós root checkpoint mode/nonce/forrás/eredeti szolgáltatásazonosító/megállítási állapot és legfeljebb tizenöt perces lejárat alapján köt. Ismeretlen vagy fennálló korábbi fence-nél megáll. SIGKILL-nél a kézzel megállított, `unless-stopped` konténerek zárva maradnak; a checkpointból kézi vizsgálat szükséges. A segédfolyamat százhúsz másodperces, a DB/API-várakozás külön korlátokkal van behatárolva.

A [v2 envelope](../scripts/lib/privacy-fence-envelope.ts) összeköti a forrás-, manifest-, projekt- és fence-hash-t, az Auth-digestet és az alkalmazási állapotot. A [capture CLI](../scripts/capture-privacy-authority.ts) ellenőrzi a tényleges TLS-peert és a hosted projekt egyezését, majd ugyanazon read-only snapshothoz egyezteti az Authot és az alkalmazási alapot. A `drill`, régi v1 fixture, lejárt vagy módosított envelope nem recovery-engedély. A validátor sem önálló fizikai bizonyíték: a későbbi root replay-transportnak kell frissen ellenőriznie a fennálló fence-t és a változatlan forrást.

Helyi bizonyíték: 16 Python célpróba, 5 envelope-próba, 4 Auth-bekötési próba és scripts TypeScript sikeres. A sikertelen drain és egyidejű idegen/saját újraindulás mellett az eredeti, igazolt worker-ID megállítását is megkíséreljük, majd elutasítjuk a megváltozott bizonyítékot. A húsz másodperces Auth-leltári határ után új oldal nem indul. Az aktív kliensmegfigyelés minden DB-szerepre kiterjed.

Az előző d1daf30 `plan` Contabo-próbája 01:47 UTC-kor sikeres: három szolgáltatás ellenőrzött, függő munka/lease/más aktív kliens 0, stop és authority 0. A [pontos CI](https://github.com/Muzsy/future_flow/actions/runs/38103007476) és Claude-forrásaudit sikeres; az audit két kisebb hibája fent javítva. A mostani transport pontos auditja, CI-je és tényleges `plan`/`drill` még következik. Fizikai fence kaput ezek nélkül nem zárunk le.

A teljes biztonsági katalógus, held-recovery replay kötés, béta-kompatibilis monitor, további hibapróbák és végső kiadási audit megmarad. App 9eb7732, napi/managed eszköz 1525943, Shared és tesztelői AI-keret változatlan/inaktív.
