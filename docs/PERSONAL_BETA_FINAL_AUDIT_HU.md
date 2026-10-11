# alterward — összesített személyesbéta-audit

2026-10-11 · [Aktiválási terv](PERSONAL_BETA_ACTIVATION_PLAN_HU.md) · [Kiadási sorrend](NEXT_STEPS.md) · [Korábbi részletes Cloud-audit](CLAUDE_CLOUD_PRELAUNCH_AUDIT_REPORT_HU.md).

A Claude Cloud Sonnet 5.5 Message 113 a `71fab49e0e726fe86c1db8bc2dc069485123d873` pontos forrását ellenőrizte. Eredmény: **0 Critical, 0 High, 1 Medium, 8 Low**. A Medium a tesztelői konfiguráció aktiválásának hiányzó eljárása; a jelenlegi nulla keretű, kizárólag tulajdonosi telepítésben nem talált kiadást tiltó hibát. **A tesztelői béta még nem kész és nem aktív.**

## Az audit és a működési bizonyíték külön szerepe

A mostani olvasás a fizetett API-belépések, worker-claim/költségfoglalás, origin JWT, Auth, törlés/export, Compose, tulajdonosi frissítő és monitor forrását vizsgálta. A backup/fence/restore eszközök korábbi pontos commit-auditjaira támaszkodott; ezeket és a kikapcsolt Shared teljes kódját nem olvasta újra. Forrásolvasáson kívül nem futtatott alkalmazást vagy tesztet, nem kapott titkot/éles felhasználói adatot és nem módosított szolgáltatást. A Cloud-elszámolás külön keret; a UI kontextus- és heti százaléka nem dolláregyenleg.

Az operátor önállóan igazolta a telepített `9eb7732` alkalmazás/migráció/deploy fájlok változatlanságát, a 70fa held privacy-restore-t, a c2 monitor/mentés telepítését és a 71 teljes izolált hibapróbát. [Worker bizonyíték és pontos CI](CONTABO_ISOLATED_WORKER_CRASH_HU.md), [monitor és 97 táblás offsite restore](PERSONAL_BETA_MONITOR_HU.md), [held replay](HELD_RECOVERY_REHEARSAL_HU.md). A kilenc valódi egészségi jelző 11:18 UTC-kor pozitív és tetszőleges SSH-parancs elutasított. A belépett angol tulajdonosi felület frissítéssel ellenőrzött. Az audit nem bizonyítja önállóan e tényleges futásokat.

## M-1 — igazolt, nyitott tesztelői kapu

A [tulajdonosi frissítő](../scripts/ops/contabo-owner-upgrade.py) csak az image-taget változtathatja. A [tulajdonosi validator](../scripts/ops/contabo-target.py) egyetlen emailt, üres UUID-listát, nulla allowance-t és üres időszakot követel. A [napi monitor](../scripts/ops/contabo-daily.py) a helyes személyes béta-konfigurációt már ismeri, de a futó env-et és frozen Compose-ot a manifest hash-éhez köti. Kézi env-szerkesztés megkerülné a kiadási eljárást és helyesen drift-riasztást okozna.

Javítás: külön, hash-ellenőrzött személyesbéta-előkészítés, naplózott alkalmazás/kikapcsolás és nulla keretes tulajdonosi állapotra történő visszaállítás, teljes szintetikus célpróbával. A meglévő owner-only kapuk megmaradnak. Az első [tiszta konfigurációs policy](../scripts/ops/contabo-personal-beta-policy.py) és hat szemantikai regresszió elkészült: legfeljebb tíz email–UUID pár, tulajdonossal legfeljebb tizenegy origin-email, pontos API/worker egyezés, 2 USD / 0,50 USD plafon, friss harmincnapos ablak, worker-only kulcs és minden más konfiguráció változatlansága. Az eredeti állapot visszaadásához a teljes aktuális candidate-nak egyeznie kell.

Ez még csak memóriában működő előkészítési/ellenőrzési alap, nincs deployment- vagy meghívási végpontja. A root-only fájlok, manifest/hash, friss Auth/DB-megfigyelés, tartós napló, szolgáltatásváltás és rollback célpróbája **még nincs kész**. M-1 nem zárható le ezek nélkül. [Pontos végrehajtási sorrend](PERSONAL_BETA_ACTIVATION_PLAN_HU.md).

## Low megállapítások önálló értékelése

| Jelzés                                           | Értékelés és következő lépés                                                                                                                                                                                                                                                                |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L-1 — új időablakkal új költségszámla nyitható   | Igazolt operátori határ: az alkalmazás nem újít automatikusan, de root új dátumokkal új számlát hozhat létre. A policy már elutasít nem nulla korábbiablak-számlálót; ez nem éles SQL-bizonyíték. A végrehajtó friss, önálló READ ONLY DB- és korábbi aktiválási naplóellenőrzése még kell. |
| L-2 — nyitott fejlesztői alapflag                | A telepített zárt env, nulla keret és monitor védi a kiadást; általános fejlesztői default átírása nem szükséges a jelenlegi owner-kiadásban. A candidate nem módosíthatja a site/beta flaget.                                                                                              |
| L-3 — kézzel felsorolt fizetett útvonalak        | A tizenkét jelenlegi enqueue-belépést Claude és a korábbi admission-tesztek egyeztették. Jövőbeli, új route automatikus inventory-regressziója hasznos következő védelem; a providerfoglalás független admission-őre megmarad.                                                              |
| L-4 — átmeneti job-sorok nem részei az exportnak | A felhasználói életadatok exportja és belső feldolgozási adatok határa dokumentálandó/újra ellenőrzendő. Ez nem állítás az export teljes adatvédelmi megfelelőségéről; új szöveg/adat kihagyása külön javítási ok.                                                                          |
| L-5 — szűk tartalék és konzervatív foglalás      | A közös 2 USD OpenAI-rész előbb elfogyhat, mint a tíz egyéni 0,50 USD plafon. Nincs garantált fejezetszám, csendes keretemelés vagy olcsóbb, nem mért modellcsere. Az első tényleges paid folyamat költségét rögzítjük.                                                                     |
| L-6 — Access iat/óraeltérés                      | Szigorú ellenőrzés átmeneti 403-at okozhat; hitelesítést nem lazítunk. Az éles óra/Access-egyezés a későbbi aktiválási előellenőrzés része.                                                                                                                                                 |
| L-7 — Cloudflare IP-lista frissessége            | 2026-10-11-én a forrásban szereplő mind a 15 IPv4 és 7 IPv6 prefix pontosan egyezett a hivatalos listával. [IPv4](https://www.cloudflare.com/ips-v4), [IPv6](https://www.cloudflare.com/ips-v6). Proxy/firewall/DNS nem módosult; tényleges későbbi aktiválás előtt újra ellenőrzendő.      |
| L-8 — belső magyar Auth-hibaüzenet               | Claude szerint a felhasználói hibakód fordítása angol, a belépett éles UI angol. Nem igazolt megjelenítési hiba; angol Auth-regresszió megmarad.                                                                                                                                            |

A Claude szövege a `/health` kivételt a két saját fiókjogi végponttal együtt említi. Pontosítás: az egészségjelzés nem igényel saját Supabase-belépést; a saját export/törlés igényel hitelesítést és friss Auth-időt. Ez nem új jogosultság vagy feloldott védelmi kapu.

## A valódi béta előtti még szükséges bizonyíték

Az M-1 eszköz és pontos audit/CI/szintetikus váltás–visszaállítás után a tényleges kiválasztottak friss email–Auth UUID egyezése, aktív/törlésmentes/Shared-adatmentes állapota, a Cloudflare és origin azonos névsora, sikeres saját HTTPS-belépése és az egyszeri költségidőszak kell. Valós providerkulcs/egress/költségfoglalás és teljes paid böngészős folyamat ebben a Contabo-stackben még nincs kipróbálva; ezek a jóváhagyott használati keretből, tényleges kezdéskor ellenőrizhetők.

A Gmail spamhelyzet, az elfogadott zárt kézi újraépítés teljes Supabase-vesztéskor, az izolált hibapróba host-reboot/prod-worker-kill határa és a későbbi Shared-kör kapui megmaradnak. Tesztelő nem kapott új hozzáférést vagy levelet, keret/harmincnapos ablak nem aktiválódott és új alkalmazási providerhívás nulla.
