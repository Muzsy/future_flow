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

Az eredeti környezetből kizárólag az image-tag sora változhat. A candidate külön root-only könyvtárba kerül, a korábbi és új négy runtime-fájl külön hash-eivel; a régi stage nincs vakon felülírva. A teljes Compose-konfigurációból a három image és a bizonyított image-forráshoz pontosan egyező `build.context` útvonal térhet el; a Dockerfile, build-args, env, erőforrások és hálózatok változatlanok. A frozen Compose teljes újrarenderelése és Access/CA őre kötelező. E lépés nem indít konténert vagy DB-kapcsolatot.

Ez a frissítő a már domainhez kapcsolt, futó tulajdonosi kiadásra készült: a proxy-hálózat nem saját tagja pontosan a meglevő közös Caddy. Az indulás előtti üres hálózathoz továbbra az első aktiváló való; emiatt nem kell korábban bekötni a proxyt vagy lazítani a védelmet.

## Alkalmazás és visszaállítás

```text
node scripts/contabo-owner-upgrade.mjs --apply-upgrade
```

Azonos ops-hash és előkészítési proof kell. Előbb read-only, CA/hostname-ellenőrzött kliens TLS-ben mind az öt queue üressége igazolandó. Csak a saját web/API/worker áll le szabályosan; utána második queue-próba. `--no-deps`, tiltott image-pull és pontos image ID mellett csak e három szolgáltatás jön újra létre. Nincs közös Caddy-restart/reload, DNS-csere, hálózatleválasztás vagy DB-restore. Rövid tulajdonosi leállás várható.

A post-start őr a tényleges image/env/port/health/erőforrásokat, négy anonim 403/no-store választ és az eredeti proxy-hálózatot ellenőrzi. A más alkalmazások állapotát az apply kezdetekor rögzített pillanatképhez hasonlítja, eltérés külön proofmező: egy idegen app független restartja nem állítja le az egészséges saját visszaállított verziót. Csak ezután kerülnek a candidate runtime-fájlok fsync/atomikus cserével a fő operátori könyvtárba. Az előkészítési archívum és apply-journal megmarad; részleges fájlcsere nem tekinthető sikeres kiadásnak.

Normál kivétel, SIGHUP/SIGTERM/SIGINT és sikertelen post-start őr után a korábbi ellenőrzött fájlok és image visszatöltése, majd ugyanaz a health/origin/network guard fut. A journal a leállítás előtt tartósan mentett; állapota `applying`, `applied`, `rolled-back`, `rollback-failed` vagy `recovered`, változtatása fsync/atomikus csere. SIGKILL, hosthiba vagy elveszett SSH-válasz esetén az operátor előbb a privát journal és futó állapot alapján tisztázza az eredményt. Vak ismételt apply tiltott. Szükség esetén külön, pontos bizonyítékra kötött recovery:

```text
node scripts/contabo-owner-upgrade.mjs --recover-upgrade
```

A recovery kizárólag megszakított/rollback-failed állapotban engedett; sikeres új kiadást nem görget vissza véletlenül. Tudatos alkalmazási rollbackhez külön művelet szükséges:

```text
node scripts/contabo-owner-upgrade.mjs --rollback-upgrade
```

Visszavont vagy megváltozott Access/CA, proxy-hálózati drift, sérült korábbi/candidate bytes vagy függő job esetén hibakapu: kézi, csak saját alkalmazást érintő vizsgálat szükséges. A recovery az ismeretlen runtime-fájlváltozást már leállítás előtt elutasítja. Sikertelen apply-rollback esetén csak a saját szolgáltatások állnak le, megváltozott jogokat nem írunk felül. Régi DB-mentés nem kerül kiszolgálásba. A jogosultságok és privacy-állapot nem visszaállítható adatsnapshotból.

## Ellenőrzési állapot

Az új helyi ops-csomag **38 Python-tesztje** sikeres; ebből 15 új upgrade-guard, ideértve hibás post-check/részleges config-promóció utáni teljes visszaállítást, idegen jogváltozás megőrzését, szigorú build-context ellenőrzést, módosított candidate archívum tiltását és független szomszéd-restart jelentését. Ezek kontrollált unit-próbák, nem szerveren végrehajtott upgrade-bizonyítékok.

A 3fb861b Cloud-audit hat megfigyelést adott, kritikus/high vagy jogosultság-/provider-bypass nélkül. UPG-01 build.context hipotézisét a tényleges régi/új termelési renderer read-only összevetése igazolta: kizárólag `/services/web/build/context` tért el. A szűk normalizálás után a valódi összevetésben **nulla eltérő mező**, változatlan runtime-env és konténerek; ideiglenes fájlok eltávolítva, DB/provider/új konténer nélkül. UPG-02 indulás előtti állapotra vonatkozó aggálya a már aktivált oldalnál nem érvényes; e támogatási határ explicit. UPG-03/04/05 miatt az operatív pillanatkép, journal/recovery és hat teljes ops-fájl hash-kötése erősödött. UPG-06 miatt a proof neve `fixtureMutationsPassed`, és az ott nem próbált útvonalak külön szerepelnek. A fixture a valódi foreign állapotot hasonlítja; a production render/host/secret/proxy-membership helyett szigorúan szintetikus adaptert használ. Végső konténeres fixture, új pontos delta-audit és éles előkészítés/upgrade még követendő.

Sikeres tényleges frissítés után pozitív owner UI, helyes használt-link üzenet és névtelen tiltások ismét ellenőrzendők; új titkosított config-backup készítendő. A 7 napos napi mentési ütemezés/privacy-replay, monitoring, inbox és tesztelői hozzáférés külön kapu marad. A teljes P01–P13 / Shared S0–S7 és a 10 USD, legfeljebb tízfős béta nem változik.
