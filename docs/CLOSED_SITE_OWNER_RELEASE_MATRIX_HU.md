# alterward — az első védett telepítés konfigurációja

2026-10-09 · [Elfogadott kiadási sorrend](CLOSED_SITE_RELEASE_PLAN_HU.md) · [Cloud-audit](CLAUDE_CLOUD_PRELAUNCH_AUDIT_PLAN_HU.md).

A [titokmentes owner overlay](../deploy/closed-site-owner.flags.env) az első, kizárólag üzemeltetőnek elérhető Contabo-telepítés konkrét konfigurációja. Ez előkészített kiadási mátrix; még nem szerverre mentett vagy aktivált beállítás. A teljes P01–P13 / Shared S0–S7 terv és a későbbi tízfős béta megmarad.

| Terület | Első telepítés |
| --- | --- |
| Webhely | Access + origin JWT/email gate aktív; pontosan egy üzemeltetői email, tesztelő nincs |
| Auth | Nyilvános signup tiltott; meghívás és saját fiókjogok külön Supabase-hitelesítéssel |
| Kínálat | A meglévő 15 jóváhagyott Official élet, öt Scenario, Discovery és Featured collection olvasható az Access mögött |
| Kiadási jogosultság | Community publication, új curator/review/release operator műveletek kikapcsolva |
| Fizetett művelet | Bétaőr aktív, UUID-lista üres; minden provider/project/user allowance 0, időszak üres és kötelező |
| Továbbindítás | Fork starts és Scenario personalization kikapcsolva; normál saját élet generálását az üres béta-lista és nulla költségkeret tiltja |
| Külső kitettség | Indexelés, sitemap/OG/external exposure kikapcsolva; Access a védett deep linkeket is lefedi |
| Shared | Mind a négy Shared flag kikapcsolva |
| Saját jogok | Account access/privacy/static asset szűk kivétel; saját export/törlés hitelesítést igényel |

Az `OFFICIAL_PUBLICATIONS_ENABLED=true` valós, szerveroldali `PUBLICATION_LINK_SECRET` értéket igényel. A már előállított snapshotokhoz a meglévő védett titkot használjuk; új titok vagy hamis fixture nem helyettesíti. Az Access team/AUD és az email-lista a dashboardról ellenőrzött privát konfigurációból kerül a szerverre. SMTP-jelszó nem kerül a Contabóra vagy az image-be.

Az overlay értékeit a teljes, checkouton kívüli, root-only server env-be kell egyesíteni. A Compose induló folyamat környezete nem írhatja felül ezt a fájlt; a célpróba indítója külön kiszűri az örökölt alkalmazási változókat. A tényleges összeállított Compose-konfiguráció, portok és futó web/API/worker értékek ellenőrzendők. A közös sablon false alapértékei nem jelentik e konkrét kiadás aktiválását.

A tesztelők meghívása, UUID-jogosultsága, fizetett 30 nap és szükséges start/saját funkció flag-ek későbbi külön konfiguráció. A fenntartott 2 USD OpenAI + 1 USD Claude és közös 0,50 USD/user limit ekkor léphet életbe; a deploy nem indítja el az időszakot. A fizetett út későbbi aktiválása külön negatív/pozitív próbát igényel.

## Visszaállítási határ

A jelen backup-végrehajtó kizárólag hálózat nélküli, eldobható restore-fixture-be állít vissza, és nem indít kiszolgálót. Nincs éles adatbázis-restore parancs vagy automatikus failover. Régi DB-mentés nem cserélheti le a szolgáló adatbázist, amíg a mentés óta történt fiók-/élet-törlés, Shared vetület és publikáció-/forrás-visszavonás egyeztetése és saját-auth ellenőrzése nem igazolt. Ha az aktuális állapot nem bizonyítható, a szolgáltatás leállítva marad. A sikeres 97 táblás adat-integritáspróba ezt a külön privacy-replay kaput nem teljesíti.

A retention időtartamáról feltett 7/14 napos kérdésre még nincs válasz; 7 nap az előkészítési javaslat, ütemezett megőrzés/törlés nincs bekapcsolva. Teljes Auth/grant/Storage helyreállítás és a privacy replay a tesztelői használat előtt rendezendő operációs feladat. A Claude-audit e hiányokat kifejezetten értékelje, és ne tekintse őket végrehajtott bizonyítéknak.
