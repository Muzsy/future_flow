# alterward — őrzött tulajdonosi alkalmazásfrissítés

2026-10-09 · [Első aktiválás](CONTABO_OWNER_ACTIVATION_RUNBOOK_HU.md) · [Auth-javítás](AUTH_CALLBACK_HARDENING_REPORT_HU.md) · [Kiadási kapuk](NEXT_STEPS.md).

Az első indító nem írhatja felül a már futó projektet. Az új [upgrade-indító](../scripts/contabo-owner-upgrade.mjs) külön, csak image-cserére szolgáló eljárást ad: ugyanaz az egy tulajdonos, Access/CA, nulla keret, öt üres queue, hálózatok és teljes Compose-alak. Új jogosultság, titokrotáció, migráció és adatbázis-visszaállítás kívül esik ezen az eljáráson. Az éles image még 35f9889; az alábbi eljárás implementáció és ellenőrzési terv, nem megtörtént upgrade.

## Előkészítés

1. Pontos, tiszta main forrás, sikeres helyi ellenőrzés/CI és Claude Cloud forrásaudit. Megőrzött korábbi build/stage-proof és image ID; új, korlátozott Contabo-build és elkülönített runtime-próba. A privát `owner-upgrade-rehearsal-baseline.json` egy korábban sikeresen próbált, helyben megőrzött eltérő image build-proofja; nem titok vagy új provider-kulcs.
2. Az [elkülönített próba](../scripts/ops/contabo-owner-upgrade-fixture.py) két külön image között valódi háromszolgáltatásos cserét, szándékosan sikertelen post-check utáni régi image/config visszaállítást és sikeres új kiadást ellenőriz. Szintetikus DB, belső fixture-hálózat és átmeneti CA; termelési adat/provider/proxy nem érintett. A fixture saját renderelést használ, ezért a termelési render/manifest/Access előellenőrzés külön kötelező. A sikeres proof az ops fájlok hash-éhez kötött; utólag módosított script nem alkalmazható ugyanazzal a proofval.
3. Az operátor a védett helyi bizonyítékokat és root-only szerverkonfigurációt ellenőrzi. A korábbi age-titkosított config-mentés megmarad. A [szerveroldali előkészítés](../scripts/ops/contabo-owner-upgrade.py) a teljes régi env/manifest/config/CA/source-hash-t, tényleges futó image/env/health/korlátokat és a közös proxy hálózati tagságát ellenőrzi.

```text
node scripts/contabo-owner-upgrade.mjs --prepare-upgrade
```

Az eredeti környezetből kizárólag az image-tag sora változhat. A candidate külön root-only könyvtárba kerül, a korábbi négy runtime-fájl immutable példányával; a régi stage nincs vakon felülírva. A teljes Compose-konfigurációból csak a három image térhet el. A frozen Compose teljes újrarenderelése, változatlan Access/CA és a többi futó konténer egyezése kötelező. E lépés nem indít konténert vagy DB-kapcsolatot.

## Alkalmazás és visszaállítás

```text
node scripts/contabo-owner-upgrade.mjs --apply-upgrade
```

Azonos ops-hash és előkészítési proof kell. Előbb read-only, CA/hostname-ellenőrzött kliens TLS-ben mind az öt queue üressége igazolandó. Csak a saját web/API/worker áll le szabályosan; utána második queue-próba. `--no-deps`, tiltott image-pull és pontos image ID mellett csak e három szolgáltatás jön újra létre. Nincs közös Caddy-restart/reload, DNS-csere, hálózatleválasztás vagy DB-restore. Rövid tulajdonosi leállás várható.

A post-start őr a tényleges image/env/port/health/erőforrásokat, négy anonim 403/no-store választ, az eredeti proxy-hálózatot és minden más futó konténert ellenőrzi. Csak ezután kerülnek a candidate runtime-fájlok fsync/atomikus cserével a fő operátori könyvtárba. Az előkészítési archívum és apply-journal megmarad; részleges fájlcsere nem tekinthető sikeres kiadásnak.

Normál kivétel, SIGHUP/SIGTERM/SIGINT és sikertelen post-start őr után a korábbi ellenőrzött fájlok és image visszatöltése, majd ugyanaz a health/origin/foreign guard fut. SIGKILL, hosthiba vagy elveszett SSH-válasz esetén az operátor előbb a privát journal és futó állapot alapján tisztázza az eredményt. Vak ismételt apply tiltott. Szükség esetén külön, pontos bizonyítékra kötött recovery:

```text
node scripts/contabo-owner-upgrade.mjs --recover-upgrade
```

Visszavont vagy megváltozott Access/CA, más alkalmazás/proxy drift, sérült rollback-bytes vagy függő job esetén hibakapu: kézi, csak saját alkalmazást érintő vizsgálat szükséges. Régi DB-mentés nem kerül kiszolgálásba. A jogosultságok és privacy-állapot nem visszaállítható configból vagy adatsnapshotból.

## Ellenőrzési állapot

Az új helyi ops-csomag **34 Python-tesztje** sikeres; ebből 11 új upgrade-guard, ideértve hibás post-check és részleges config-promóció utáni teljes visszaállítást. Ezek kontrollált unit-próbák, nem szerveren végrehajtott upgrade-bizonyítékok. A végső konténeres fixture, konkrét új ops Cloud-audit és éles előkészítés/upgrade még követendő.

Sikeres tényleges frissítés után pozitív owner UI, helyes használt-link üzenet és névtelen tiltások ismét ellenőrzendők; új titkosított config-backup készítendő. A 7 napos napi mentési ütemezés/privacy-replay, monitoring, inbox és tesztelői hozzáférés külön kapu marad. A teljes P01–P13 / Shared S0–S7 és a 10 USD, legfeljebb tízfős béta nem változik.
