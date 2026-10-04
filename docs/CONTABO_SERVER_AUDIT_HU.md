# alterward — Contabo szerveraudit

2026-10-04 · [Telepítési terv](DEPLOYMENT_HU.md) · [Aktuális állapot](STATUS_HU.md).

## Következtetés

**A teljes alkalmassági audit még nem zárható le:** a megadott hozzáférési fájlból kiolvasott felhasználó/jelszó párost az SSH-szerver elutasította. A hálózati elérhetőséget és a telepítési tervet ellenőriztük, de CPU/RAM/tárhely, belső szolgáltatások, frissítések, tűzfal és mentések még nem vizsgálhatók. Ezekre nem adunk becsült szerveradatot vagy „gond nélkül üzemeltethető” minősítést.

Az alkalmazás architektúrája alkalmas saját Linux szerveres működésre: Next web, Nest API és folyamatos worker; Supabase adatbázis/Auth és OpenAI külső szolgáltatás. Helyi AI-modell vagy GPU nem szükséges. A konkrét Contabo gép kapacitása és biztonságos együttélése a meglévő szolgáltatásokkal továbbra igazolandó.

## Ellenőrzött tények

Mérés: 2026-10-04, körülbelül 08:04–08:09 UTC / 10:04–10:09 Europe/Budapest. Kizárólag a felhasználó által megadott gépet vizsgáltuk, három célzott TCP-porttal; széles port- vagy hálózatszkennelés nem történt.

| Vizsgálat | Eredmény | Mit igazol? |
|---|---|---|
| SSH / TCP 22 | Elérhető; a megismételt kapcsolatban ugyanaz a rögzített hostkulcs | A távoli SSH-szolgáltatás elérhető |
| SSH banner | `OpenSSH_9.6p1 Ubuntu-3ubuntu13.19` | Ubuntu csomagra utaló szolgáltatásazonosító; nem helyettesíti az OS belső ellenőrzését |
| SSH hitelesítési módok | `publickey`, `password` | A szerver felkínálja ezeket; sikeres belépés nem történt |
| Megadott belépési páros | Egy jelszavas kísérlet elutasítva | Belső audit hozzáférés nélkül nem végezhető el |
| HTTP / TCP 80 | Elérhető, `308 Permanent Redirect`, `Server: Caddy` | Az adott címen már webes proxy válaszol |
| HTTPS / TCP 443 | TCP elérhető; IP-címes TLS-kézfogás `SSLError` | A port elérhető, de ebből nem igazolható érvényes HTTPS |
| TCP-kapcsolódás | Körülbelül 31–47 ms a helyi gépről | Pillanatnyi kapcsolódási idő; nem terhelési vagy rendelkezésreállási mérés |

Az IP-címes TLS-hiba nem bizonyítja, hogy egy meglévő domain tanúsítványa hibás. A megfelelő hostname/SNI, DNS és tanúsítvány vizsgálata külön szükséges. A Caddy automatikus HTTPS-éhez a konfigurált név, megfelelő DNS, elérhető portok és tartós tanúsítványtár szükséges. [Caddy dokumentáció](https://caddyserver.com/docs/automatic-https).

Az SSH-hostkulcs az első kapcsolatban rögzítve lett a helyi, repón kívüli védett titokmappában; a következő kapcsolat ezt ellenőrizte. Ez első használatkor rögzített bizalom: a kulcsot még nem hasonlítottuk össze külön Contabo/VNC csatornából származó ujjlenyomattal. Hostkulcsváltozásnál nincs automatikus elfogadás.

## Telepítési tervben feltárt eltérés

A jelenlegi [Compose](../deploy/compose.yaml) saját Caddy konténerből publikálná a 80/tcp, 443/tcp és 443/udp portokat. A megadott szervercímen már webes szolgáltatás válaszol. **A változatlan Compose-csomag indítása előtt a tényleges portfoglalást és a meglévő proxy szerepét meg kell vizsgálni.** Egy második proxy ugyanazon IP/port párra nem tud kötni.

Ha a meglévő Caddy más oldalakat szolgál ki, célszerű az alterward új hostname-jét azon keresztül kiszolgálni. A végleges megoldás az inventártól függ:

- Hoston futó Caddy esetén csak loopbackre kötött web/API upstream, külön alterward Compose-proxy nélkül; a Node-portok nem kerülhetnek nyilvános interfészre.
- Konténeres közös Caddy esetén elkülönített belső Docker-hálózat, új hostname-route, nyilvános web/API-portok nélkül.
- Külön proxy csak valóban szabad cím/port vagy később jóváhagyott átszervezés mellett.

Ezek tervezési lehetőségek, nem telepített változtatások. A meglevő proxy beállítását nem olvastuk be és nem módosítottuk. Az `API_TRUST_PROXY=1` csak ténylegesen egyetlen megbízható proxy-hop és zárt API mellett maradhat; több proxy esetén klienscím/rate-limit ellenőrzés és a bizalmi beállítás újraértékelése kell. [Caddy reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).

## A belépés után még szükséges vizsgálatok

| Terület | Mérendő adat és elfogadási feltétel |
|---|---|
| OS és architektúra | Tényleges disztribúció/verzió, kernel, 64 bit, támogatott Docker Engine; a bannerből nem dönthető el |
| CPU | vCPU, aktuális load/CPU steal, meglévő szolgáltatások; nem csak a csomag névleges mérete számít |
| RAM | Teljes és elérhető memória, swap, más munkaterhelések, később tényleges háromfolyamatos memóriahasználat |
| Tárhely | Szabad hely és inode, Docker image/cache/logok és előző release helye; nincs automatikus takarítás |
| Futó szolgáltatások | Caddy helye/verziója, listener tulajdonosok, konténerek, más oldalak és függőségeik |
| Docker/Compose | Telepített verzió és daemon állapot; a meglévő csomagokat nem cseréljük le audit közben |
| Hálózat | Szerverről DNS/TLS OpenAI, Supabase Auth, DB és image-registry felé; érvényes tanúsítvány-ellenőrzéssel, fizetős AI-hívás nélkül |
| SSH és tűzfal | Effektív root/jelszó/kulcs beállítás, engedett portok, IPv4/IPv6, brute-force védelem; meglévő hozzáférés megőrzendő |
| Frissítések | Csomaglisták kora, elérhető frissítések és reboot igény; audit közben nincs update/reboot |
| Mentés és helyreállítás | VPS/config/secrets és külön Supabase mentés; dokumentált és ténylegesen kipróbált restore |
| Megfigyelés | Healthcheck, folyamat-újraindulás, logméret, külső elérhetőség és értesítési felelős |

Kapacitásról csak a fenti adatok és későbbi futásmérés alapján lehet dönteni. Kis béta esetén először egy worker és korlátozott generálás javasolt; a jelenlegi három szerep külső AI-t használ, így az API-szolgáltató válaszideje és költségkerete is korlát. Ez nem felhasználószámra adott kapacitásígéret. Image-et lehet később CI-ben építeni, hogy a production gépet ne terhelje a teljes Next build.

Dockerrel a publikált konténerportok UFW-szabályokat megkerülhetnek; ezért a későbbi tűzfalaudit a Docker-szabályokat és tényleges külső elérhetőséget is ellenőrzi. [Docker tűzfal-dokumentáció](https://docs.docker.com/engine/network/packet-filtering-firewalls/).

## Titokkezelés és végrehajtási határ

A felhasználó által megadott `env/contabo_auth.txt` helyén maradt, de az örökölt olvasási jogok megszűntek; csak a jelenlegi Windows-felhasználó, SYSTEM és helyi rendszergazdák kaptak hozzáférést. Az `env/` könyvtár Git- és Docker-kizárás alatt áll. Jelszó, belépési név és szervercím nem került ebbe a riportba vagy a verziózott fájlokba.

Nem történt szervertelepítés, csomagfrissítés, szolgáltatásleállítás, restart, tűzfalmódosítás vagy fizetős AI-hívás. Az SSH-elutasítás után nem próbáltunk más felhasználóneveket/jelszavakat. A helyi hostkulcs-rögzítés és a hozzáférési fájl ACL-védelme helyi változtatás.

A teljes audit folytatásához az SSH-adatokat kell tisztázni. A Contabo ügyfélpanel és a VPS operációs rendszerének belépése külön hozzáférés; a szolgáltató a szerver IP/felhasználó adatait a „Your login data!” levélben jelöli meg. Nem indítottunk jelszó-visszaállítást vagy szerver-újratelepítést. [Contabo csatlakozási útmutató](https://help.contabo.com/en/support/solutions/articles/103000286843-how-do-i-connect-to-my-server-).

## Éles indulás előtti sorrend

1. Működő SSH-hozzáférés és a fenti belső audit lezárása.
2. Meglévő Caddy/oldalakhoz illeszkedő konkrét telepítési konfiguráció; portütközés feloldása a meglévő működés megőrzésével.
3. Kijelölt hostname, DNS, HTTPS és Supabase Auth redirect/site URL. Domainvásárlás továbbra későbbi felhasználói döntés.
4. Éles titkok checkouton kívül, például `/etc/alterward/runtime.env`; megfelelő CA-jogok és külön production keret. A fejlesztői 5–5 USD napló nem production allowance.
5. Teljes Compose/API/worker próba, tényleges klienscím/rate-limit, korlátozott Auth/AI UI smoke és folyamat-helyreállítás.
6. Mentés/visszaállítás és előző image-re történő rollback ellenőrzése; ezután korlátozott angol béta.

A `298bdca` runtime commit Linux image-buildje és production web healthcheckje már sikeres [GitHub CI-ben](https://github.com/Muzsy/future_flow/actions/runs/37164982359). Ez az alkalmazás csomagolásának bizonyítéka, nem a Contabo gép kapacitásának vagy teljes éles működésének tesztje.
