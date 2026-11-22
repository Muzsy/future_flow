<!--
status: active-supporting
owner: Ákos (döntések), Claude (megvalósítás)
created: 2026-11-22
related: 054_release_path_HU.md
-->

# 055 – Éles költözés tiszta VPS-re, letisztult kiadási út, staging a régi gépen

## Cél

Az éles Alterward egy új, csak neki szánt VPS-re költözik. Ott **letisztult, egyszerű és gyors** rendszer fut:

- egy kiadás kb. 30–45 perc, ennek nagyja a CI;
- egy parancs, és egy tulajdonosi jóváhagyás a kiadási kártyán;
- a biztonsági mag megmarad: mentés, visszaállítás-ellenőrzés, visszaállítható előző image, monitor, riasztás.

**Az új éles gép és a régi gép között nincs közvetlen kapcsolat** (tulajdonosi döntés, 2026-11-22): az éles gép semmiben nem függ a régitől és nem éri el, a régi gépen nincs éles titok és éles adat. A régi gépen a staging fut, saját, elkülönített háttérrel. A régi gépen más projektek is futnak (Hermes kereskedőbot, verloth, darts, dartversenyek, ghost Caddy); ezekhez nem nyúlunk.

## Döntések eddig (2026-11-22)

- Az éles oldal új VPS-re költözik; a régi gépen a staging marad, közvetlen kapcsolat nélkül az éles géppel.
- **Új gép:** Contabo Cloud VPS 6 NVMe (2026), 6 vCPU, 12 GB RAM, 100 GB NVMe, Ubuntu 24.04, IP `169.58.70.195`. A gép rendelkezésre áll.
- **Az image-tároló az új VPS-en lesz.** Az image egyszer, a CI-ben épül, és pontosan az kerül stagingre, majd élesbe (054 KP7).
- **A 054 KP1 célja itt valósul meg, tisztán újraépítve,** nem a régi lánc átalakításával.
- **Alap biztonság kész (2026-11-22):**
  - csak kulcsos SSH (jelszavas belépés kikapcsolva, a root csak kulccsal);
  - `ufw`: bejövő irányban csak a 22-es port;
  - automatikus biztonsági frissítések.

## Állapot

- **F1 (2026-11-22):**
  - **Új gép:** Docker 29.10 és Compose 5.8 (naplóforgatás, `live-restore`), `age`, `jq`, `postgresql-client`; könyvtárszerkezet `/srv/alterward` alatt, szigorú jogosultságokkal.
  - **A Supabase engedi az új gépet:** a TCP- és TLS-kapcsolat rendben, és jelszó nélküli próbára a pooler jelszót kér, vagyis IP-szűrés nincs.
  - **A repóban:** `deploy/prod/compose.prod.yaml` (alkalmazás, saját Caddy, tároló), `deploy/prod/Caddyfile` (a régi szabályok és a tároló), `deploy/prod/README.md`; a Compose és a Caddy-konfiguráció az új gépen ellenőrizve.
  - **A K2 egyszerűsítése:** a tároló csak a `127.0.0.1:5000` címen érhető el a gép saját letöltéseihez, hitelesítés nélkül; kívülről csak a Caddy-n át, a CI feltöltési jelszavával.
- **F2a (2026-11-22, #229):** mentés (`scripts/prod/backup.py`), offsite másolat és visszaállítás-ellenőrzés (`offsite.py`), monitor (`monitor.py`), systemd-időzítők; az új gépen végig kipróbálva eldobható TLS-adatbázissal.
- **F2b–F2d (2026-11-22):**
  - **Kiadás:** `scripts/prod/release.py` a gépen (aláírás-ellenőrzés, kártya, friss visszaállítás-ellenőrzés nélkül nincs váltás, worker-ürítés, automatikus visszaállás), `scripts/prod/ship.py` a helyi gépen (CI, migráció-tiltás, mentés és visszaállítás-ellenőrzés a váltás előtt).
  - **Beállítások (E1):** `scripts/prod/env.py`, zárt kulcslista a számlázási kulcsokkal.
  - **CI:** `release-rehearsal` job (a rövid próba minden PR-en), `publish.yml` (építés, feltöltés, aláírás); kikapcsolva, amíg a tulajdonos be nem állítja a DNS-t, a változókat és a titkokat.

## Kiinduló állapot (a régi gépen mérve)

| Elem                       | Most                                                                                                                                                 | Az új gépen                                             |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Alkalmazás                 | `web`, `api`, `worker` konténer egy image-ből (`deploy/compose.yaml` + `compose.contabo.yaml`)                                                       | ugyanez, ugyanabból a Compose-ból                       |
| Adatbázis és bejelentkezés | Supabase (felhő), TLS CA a szerveren                                                                                                                 | változatlan, csak a kapcsolódó IP változik              |
| Proxy                      | a régi gépen több projekt közös Caddy-je; az Alterward egy blokk benne, Cloudflare Origin tanúsítvánnyal, csak Cloudflare-IP-kről, a `www` átirányít | saját, csak Alterward Caddy ugyanezekkel a szabályokkal |
| Edge                       | Cloudflare (DNS, proxy, Access, a `/preview*` Worker és az ideiglenes fejléc-Worker)                                                                 | változatlan; csak az origin IP változik                 |
| Mentés                     | Daily: napi titkosított mentés, offsite a helyi gépre, visszaállítás-ellenőrzés                                                                      | ugyanez, egyszerűsített eszközzel                       |
| Felügyelet                 | monitor 15 percenként, health projection a GitHub óránkénti ellenőrzésének, recovery-időzítő                                                         | ugyanez az új gépen                                     |
| Kiadás                     | régi lánc: funded/successor/registry próbák, fence, image-plan/apply (054-gyel gyorsítva)                                                            | új, letisztult út (lent)                                |

## Célarchitektúra az új gépen

- **Docker és Compose:** a mostani `deploy/compose.yaml`, egy új, egyszerű `compose.prod.yaml` felülírással.
- **Saját Caddy:** csak a 80 és 443 nyitott kifelé, csak Cloudflare-IP-kről. Cloudflare Origin tanúsítvány; a régi gépről átvisszük, vagy újat kérünk.
- **Az alkalmazás konténerei csak belső Docker-hálózaton érhetők el.** A Docker a publikált portokat a tűzfal mellett nyitja ki, ezért csak a Caddy publikál portot.
- **Image-tároló:** `registry:2`, saját aldomainen (pl. `registry.alterward.com`), Cloudflare-proxy nélkül (a proxy kérésenként kb. 100 MB-ot enged), saját TLS-sel. Feltöltés csak a CI-nek, letöltés csak a szervernek.
- **Rendszeridőzítők:** mentés, monitor, recovery, takarítás.
- **Operátori hozzáférés:** a `alterward-new` SSH-név, külön kulccsal.

## A letisztult kiadási út

1. **PR és CI.**
   - A CI megépíti az image-et, lefuttatja a teszteket és a rövid próbát, aláírja (cosign) és feltölti a tárolóba, ujjlenyomattal (digest).
   - A pineket a `scripts/release-pins.py` számolja, a PR-ben (054 KP3).
2. **Merge** a `gh`-val, csak zöld CI után; a fa-egyezéses szabály szerint nem kell a main CI-re várni (054 D2).
3. **`release --card`** (operátori gépen):
   - ellenőrzés: aláírás, ujjlenyomat, zöld CI;
   - kiadási kártya hash-sel, a tulajdonosnak jóváhagyásra.
4. **`release --approved-card <hash>`:**
   1. Előtte: friss mentés és annak visszaállítás-ellenőrzése, a sor kiürítése, szünet.
   2. Az új image letöltése ujjlenyomat szerint, az aláírás ellenőrzése, konténercsere.
   3. Egészségellenőrzés (web, API, worker, adatbázis TLS). Ha bármi bukik, automatikus visszaállás az előző image-re.
   4. Folytatás, hullám vissza a korábbi kapacitással, monitor, takarítás.
5. **Rövid 040-es próba (a CI-ben):**
   - image-csere egy friss 040-es adatbázison;
   - megszakítás a csere közben, és visszaállás;
   - mentés visszaállítása.

   Nincs valós órás várakozás, nincs történeti lánc.

**Ami nem költözik át:**

- a 038/039-es funded-átállás és próbái;
- a tesztelői és successor-generációk;
- a registry-migráció 039 → 040;
- a történeti pinek és kivételek, a régi szerverhez kötött rekordok és útvonalak.

A régi kód a git-történetben megmarad; a repóból egy külön PR-ben vezetjük ki, a költözés után.

## Költözési forgatókönyv

| Fázis | Lépés                                                                                                                                                                                                                                                                                                                                                                                                                                             | Éles hatás            | Kapu                                                                      |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------- |
| F0    | Ez a terv, és a döntések                                                                                                                                                                                                                                                                                                                                                                                                                          | nincs                 | tulajdonosi jóváhagyás                                                    |
| F1    | Az új gép alapozása: Docker, Caddy, tároló, időzítők, mentés és monitor                                                                                                                                                                                                                                                                                                                                                                           | nincs                 | ellenőrzőlista zöld                                                       |
| F2    | Az új kiadási eszközök és a rövid 040-es próba (PR-ek, CI)                                                                                                                                                                                                                                                                                                                                                                                        | nincs                 | CI zöld                                                                   |
| F3    | **Próbaüzem az új gépen az éles image-dzsel**, éles DNS nélkül (hosts-fájllal vagy ideiglenes aldomainen), bejelentkezés és generálás nélkül                                                                                                                                                                                                                                                                                                      | nincs                 | kijelentkezett oldalak, API-egészség, mentés és visszaállítás az új gépen |
| F4    | **Átállás, rövid bejelentett szünettel:** a régi gépen szünet és friss mentés; az új gépen ugyanaz az image és beállítás; Cloudflare DNS-csere; ellenőrzés; folytatás az új gépen                                                                                                                                                                                                                                                                 | kb. 15–30 perc szünet | tulajdonosi engedély, kiadási kártya                                      |
| F5    | Megfigyelés 24–48 órán át; a régi gép érintetlen, de leállítva marad                                                                                                                                                                                                                                                                                                                                                                              | nincs                 | monitor zöld                                                              |
| F6    | **Az éles Alterward eltávolítása a régi gépről:** a régi éles konténerek, image-ek, `/root/alterward-ops` éles állapota, `/etc/alterward` éles titkai, az éles időzítők, a közös Caddy éles blokkja és Origin tanúsítványa, a régi éles mentések (az új gép első sikeres mentése és visszaállítása után); az éles titkok cseréje (Supabase service role, Stripe webhook-secret, OpenAI-kulcs, Access, továbbiak). A többi projekthez nem nyúlunk. | nincs                 | tulajdonosi engedély                                                      |
| F7    | **Kötések átállítása és staging:** helyi mentésszinkron, offsite mentés, a GitHub egészségellenőrzésének hoszt-titka az új gépre; a staging felállítása a régi gépen elkülönített háttérrel (lent)                                                                                                                                                                                                                                                | nincs                 | minden zöld az új géppel; a két gép között nincs kapcsolat                |

## Visszaállási terv

- **F4 alatt, ha az új gépen bármi nem jó:** DNS vissza a régi gépre. A régi konténerek változatlanok, csak szünetelnek; folytatás a régi gépen. Ez percek kérdése, és az adatbázis közös, ezért adatvesztés nincs.
- **F5 alatt (legfeljebb 48 óra):** a régi gépen az éles Alterward leállítva, de visszakapcsolható állapotban marad hidegtartaléknak; a DNS visszaállítható. Az F6 (az éles elemek eltávolítása) csak az F5 után jön; utána a visszaállás az új gépen, az előző image-re történik.
- **Kiadásnál az új gépen:** automatikus visszaállás az előző image-re, ha az egészségellenőrzés bukik.

## Staging a régi gépen

- **Elkülönítés:** a két gép között nincs közvetlen kapcsolat: nincs közös SSH-kulcs, hálózati kapcsolat, tároló vagy mentésmegosztás, és a régi gép semmilyen hozzáférést nem kap az éles géphez. Mindkettőt csak az operátori gépről érem el, külön kulccsal.
- **Image:** a CI ugyanazt az aláírt image-et (ugyanazzal az ujjlenyomattal) külön-külön tölti fel az éles tárolóba és a staging saját tárolójába, mindegyikhez külön, csak arra jogosult hozzáféréssel. Ugyanaz a kód megy stagingre és élesbe, de a staging nem tölt le az éles gépről.
- **Háttér:** saját Supabase-projekt (adatbázis és bejelentkezés), Stripe tesztmód, Turnstile tesztkulcs, szimulált AI vagy kis, külön AI-keret (E3). Éles titok és éles adat soha.
- **Adatok:** csak szintetikus adat és a két fiktív mintatörténet.
- **Elérés:** Cloudflare Access mögött, csak a tulajdonosnak és az operátornak.
- **Telepítés:** automatikusan minden merge után.
- A régi gépen futó többi projekthez nem nyúlunk; a staging külön Docker-hálózaton fut.

## Méretezés és erőforrás

- Az éles gép nem buildel és nem futtat próbát, csak kiszolgál és tárolja az image-eket; a CPU és a RAM ehhez bőven elég.
- **A lemez a szűk keresztmetszet:**
  - rendszer kb. 10 GB;
  - futó image-ek néhány GB;
  - tároló kb. 10–15 GB;
  - mentések.

  Kötelező az automatikus megőrzés és a 80%-os riasztás.

## Döntések a tulajdonostól

**A teljes terv jóváhagyva (tulajdonos, 2026-11-22), az E1–E6 a javaslatok szerint.** Az E1 részletei: a számlázási kulcsok (Stripe titkos kulcs, webhook-titok, ár, kupon, API-verzió, visszatérési címek, `BILLING_*`) a service-env zárt kulcslistájába kerülnek; formátum-ellenőrzés, a titkok csak hash-elejükkel látszanak, éles módban csak élő kulcs, a kötelező számlázás érvényes kulcs/ár/webhook nélkül nem kapcsolható be, és ezen az úton nem is kapcsolható ki; változtatás után csak olvasó Stripe-ellenőrzés (az ár lekérése); jóváhagyás a kiadási kártyán.

| #   | Kérdés                                                                                                                                         | Javaslat                                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| E1  | A számlázási beállítások (Stripe-kulcsok, árak, `BILLING_*`) a szolgáltatási beállítások részévé válnak, ugyanazzal a tervvel és jóváhagyással | igen; így a successor-lánc nem költözik                            |
| E2  | Image-tároló elvek K1–K7 (alább)                                                                                                               | igen                                                               |
| E3  | Staging AI                                                                                                                                     | szimulált AI alapból, szükség esetén kis, külön keret              |
| E4  | Az átállás időpontja                                                                                                                           | alacsony forgalmú idősáv; a felhasználóknak előre bejelentve       |
| E5  | Cloudflare Origin tanúsítvány                                                                                                                  | új kérése az új géphez (a régit a régi géppel együtt visszavonjuk) |
| E6  | A régi kiadási kód kivezetése a repóból                                                                                                        | a költözés után, külön PR-ben                                      |

**Image-tároló elvek (E2):**

| #   | Kérdés             | Javaslat                                                                                                  |
| --- | ------------------ | --------------------------------------------------------------------------------------------------------- |
| K1  | Feltöltés a CI-ből | saját aldomain Cloudflare-proxy nélkül, saját TLS-sel                                                     |
| K2  | Hozzáférések       | külön, csak feltöltésre jogosult felhasználó a CI-nek (GitHub-secret); a szerver csak letöltésre jogosult |
| K3  | Hitelesítés        | saját aláírókulcs (cosign); a szerver csak aláírt, zöld CI-hez tartozó ujjlenyomatot fogad el             |
| K4  | Staging és éles    | ugyanaz az ujjlenyomat előbb stagingre, majd élesbe                                                       |
| K5  | Megőrzés           | a futó, a mentésekhez szükséges és az utolsó néhány kiadás image-e marad                                  |
| K6  | Tároló kiesése     | helyi build tartalékként                                                                                  |
| K7  | Ellenőrzés         | az első kiadás az új úton teljes ellenőrzéssel                                                            |

## Becslés

| Fázis                                                | Idő                           |
| ---------------------------------------------------- | ----------------------------- |
| F1 alapozás                                          | 1 nap                         |
| F2 új kiadási eszközök, rövid próba, tároló, aláírás | 2–3 nap                       |
| F3 próbaüzem                                         | fél nap                       |
| F4 átállás                                           | fél nap (a szünet 15–30 perc) |
| F5 megfigyelés                                       | 1–2 nap (párhuzamosan mással) |
| F6 eltávolítás és titkok, F7 kötések és staging      | 1,5 nap                       |
| **Összesen**                                         | **kb. 6–8 nap munka**         |

## Kockázatok

- **Supabase hálózati korlátozás:** ha a Supabase-ben IP-szűrés van, az új gép IP-jét fel kell venni (F1-ben ellenőrizzük).
- **Cloudflare:** az origin IP cseréje a DNS-ben; az Access-alkalmazás és a Workerek nem változnak. Az F3 ezt az éles DNS érintése nélkül teszteli.
- **Titkok:** az átvitel csak titkosított csatornán, a repóba és a naplóba semmi nem kerül; az F6-ban a régi gépről törlés és csere.
- **Rejtett kötés a két gép között:** az F7 ellenőrzőlistája minden ismert kötést felsorol (helyi időzítők, GitHub-titkok, operátori szkriptek alapértelmezett `contabo` neve, Cloudflare), és a régi gépen az F6 után egy keresés igazolja, hogy nem maradt éles titok vagy éles adat.
- **Új eszközök hibája:** az első kiadás az új úton teljes ellenőrzéssel megy, és a régi gép az F5 végéig visszaállási pont marad.
- **Docker és tűzfal:** a Docker a publikált portokat a tűzfal mellett nyitja; csak a Caddy publikál portot.
