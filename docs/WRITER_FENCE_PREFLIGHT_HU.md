# alterward — helyreállítási írásstop előellenőrzése

2026-10-11 · [Kiadási sorrend](NEXT_STEPS.md) · [Elfogadott béta-korlát](PERSONAL_BETA_RECOVERY_LIMIT_HU.md).

Friss folytatás: [külön root `plan`/`drill` transport és v2-envelope](WRITER_FENCE_TRANSPORT_HU.md) implementált és helyben céltesztelt; pontos audit, CI és tényleges célpróba következik. Az alábbi alap állapotgépe nem önálló transport.

A [root végrehajtó](../scripts/ops/contabo-writer-fence.py) nyilvános parancsfelülete jelenleg csak `plan`: nem állít meg szolgáltatást, nem készít helyreállításra használható authorityt és nem kapcsol vissza kiszolgálást. A callback-alapú állapotgép a későbbi transport előkészítése; önmagában nem fizikai writer-fence bizonyíték.

Az előellenőrzés az eredeti napi mentési és tulajdonosi kernelzárakat használja, az eredeti tulajdonosi manifest hash-ét kéri, és ellenőrzi a telepített napi eszköz forrásait. Csak a három eredeti web/API/worker azonosító, image, compose-tulajdonos, egészséges futás és `unless-stopped` újraindítási politika fogadható el. Ismert automatikus konténer-újraindító jelenlétében megáll. Ellenőrzött adatbázis-TLS-en, read-only snapshotban számolja a függő munkákat, lease-eket és más aktív klienskapcsolatokat. Nem cserél le szerverkonfigurációt.

Az állapotgép sorrendje web → API → kiürülés → worker; két stabil, megállított állapotban vett titkosított capture szükséges. A próbamód csak a ténylegesen megállított eredeti saját konténereket indíthatja vissza fordított sorrendben, ellenőrzött origin-határ mellett. A recovery mód hibánál sem indít vissza szolgáltatást. Megváltozott saját vagy idegen futásnál nincs automatikus visszaindítás. A változó health-napló önmagában nem újraindulás. A checkpoint nem tartalmaz környezeti titkot vagy idegen konfigurációt.

Tizenkét célzott állapotgép-próba sikeres: sorrend, recovery hold, aktív munka/zár, változó capture, hibás ciphertext, részleges stop-hiba, külső újraindítás és ártalmatlan health-probe változás. A valódi szerveres `plan`, pontos Claude-forrásaudit és CI külön bizonyíték; eredményüket az elvégzésük után rögzítjük.

Következő: auditált stop/capture transport, tartós és lejáró mode/nonce/forrás/eredeti konténerazonosító kötés, explicit recovery authority és a még fennálló fizikai fence ellenőrzése replay előtt. A próbamód eredménye nem éles recovery-engedély. A karanténos utóellenőrzés és teljes biztonsági katalógus ellenőrzése után sincs automatikus újranyitás.

Az alkalmazás 9eb7732, a napi/managed automatizálás 1525943 marad. Shared, tesztelői jogosultság, AI-keret és harmincnapos időszak inaktív; teljes Supabase-vesztéskor az oldal az elfogadott béta-korlát szerint zárva marad.
