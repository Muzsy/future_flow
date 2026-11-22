<!--
status: active-supporting
owner: Ákos (döntések), Claude (megvalósítás)
created: 2026-11-20
related: 053_next_release_bundle_HU.md
-->

# 054 – A kiadási út gyorsítása

## Cél

Egy alkalmazáskiadás (kód → élesben) **legfeljebb 1,5–2 óra** legyen, ebből az operátori figyelem **egy tulajdonosi jóváhagyás és egy parancs**. Normál esetben nincs kézi beavatkozás. A biztonsági lépések megmaradnak: mentés élesítés előtt, visszaállítás-ellenőrzés, fence, visszaállítható régi image, zöld CI, tulajdonosi engedély.

## A mai út (mért, az utolsó öt kiadás, 2026-11-17–19)

| #   | Lépés                                                              | Idő                                                             |
| --- | ------------------------------------------------------------------ | --------------------------------------------------------------- |
| 1   | PR CI                                                              | 38–44 perc                                                      |
| 2   | Main CI a merge után                                               | 36–42 perc                                                      |
| 3   | Külön kiadási pin-commit, PR, CI, merge, main CI (két kiadásnál)   | +40–80 perc                                                     |
| 4   | Szerveres build                                                    | 9–17 perc                                                       |
| 5   | Szerveres izolált image-próba                                      | 90–107 perc                                                     |
| 6   | Tulajdonosi engedély az auditfájlhoz (külön kérés, az ablak előtt) | változó                                                         |
| 7   | Karbantartási ablak                                                | 26–40 perc; öt ablakból kettő megszakadt, újra kellett indítani |

Sorban **3,5–5 óra**, sok kézi lépéssel.

## Sürgős (KP0 lelet, 2026-11-22)

- **Az éles AI-költségkeret ablaka 2026-12-07 10:44 UTC-kor lezárul** (`AI_BUDGET_WINDOW_START=2026-11-06T10:44:00Z`, `AI_BUDGET_WINDOW_END=2026-12-07T10:44:00Z`, `AI_BUDGET_WINDOW_REQUIRED=true`; 45 USD projekt, 6 USD felhasználó). Utána minden AI-hívás `AI_BUDGET_WINDOW_CLOSED` hibát kap, a fizető felhasználók sem generálhatnak.
- **Állás 2026-11-22-én:** 1,33 USD a 45-ből (3%), 3 felhasználói fiók.
- **Teendő:** az új ablakot (dátumok, keretek) a tulajdonos hagyja jóvá, és a december 7. előtti kiadási ablakban élesítjük (környezeti változás a service-env tervben). A 054-es kiadásnak ezért december 7. előtt meg kell történnie, vagy külön környezeti változás kell.
- Hosszabb távon az ablak lejárta előtt riasztás kell (a monitorba), és a megújítás a kiadási kártya része legyen.

## Feltárt felesleg

| #   | Megállapítás                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Bizonyíték                                                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| F1  | **Ugyanaz a nagy funded próba kiadásonként ötször fut.** A CI-ben két jobban (`container`: `smoke-deployment`; `image-rehearsal`), mindkettő a PR-en és a mainen is, és még egyszer a szerveren. Mindkét CI-job külön építi ugyanazt az image-et.                                                                                                                                                                                                                                            | `.github/workflows/ci.yml` (a `container` job megjegyzése: „complete funded fixture, including the chained successor case”) |
| F2  | **A próbaidő zöme várakozás, nem munka.** A successor-esetek valós órával kivárják egy „tulajdonosi ablak” kezdetét (`START_LEAD = 12 perc`), láncolt esetekben többször is. Ezt a `success`, a `postcheck` és az `interruption-staged` is lefuttatja.                                                                                                                                                                                                                                       | `scripts/ops/contabo-beta-successor-fixture.py`; szerveren: `postcheck` 37,6, `success` 33,9 perc a 90-ből                  |
| F3  | **A próbák nagy része régi átállási utakat játszik újra:** 038→039 funded átállás, reader/tester-béta successor-generációk, 039→040 registry-migráció. Az éles rendszer kb. 2026-11-06 óta 040-es sémán fut; a megőrzött 28 helyi mentés a legrégebbitől (2026-11-14, `0b82cd5`) kezdve mind 040 utáni.                                                                                                                                                                                      | Daily mentési manifestek; `STATUS_HU.md` (1d312d2/schema040)                                                                |
| F4  | A main CI ugyanazt a fát ellenőrzi újra, mint a PR CI, ha a main közben nem mozdult.                                                                                                                                                                                                                                                                                                                                                                                                         | merge commitok fája = PR merge-ref fája                                                                                     |
| F5  | A kiadási pinek (`REVIEWED_IMAGE_CHANGES`, `REGISTRY_040_CHANGE_HASHES`) kézzel, néha külön commitban készülnek, ami még egy teljes CI-kör.                                                                                                                                                                                                                                                                                                                                                  | 9d6add2, 2021058                                                                                                            |
| F6  | **Visszatérő kézi beavatkozások az ablakban:** a régi `funded-active-proof-capability` rekord félretétele, ütközés az óránként négyszer futó `alterward-recovery` időzítővel (restore, fence), a fence-terv átmeneti elutasítása (plan-encryption, observer), a 15 percnél régebbi aktív proof.                                                                                                                                                                                              | minden kiadási jelentés                                                                                                     |
| F7  | A Daily `--update` minden ablakban lefut, akkor is, ha a Daily szkriptjei nem változtak. Az élesítés utáni teljes mentés, visszaállítás és fence a szolgáltatás szünetelése alatt fut.                                                                                                                                                                                                                                                                                                       | ablak-napló                                                                                                                 |
| F8  | A tulajdonosi engedély több részletben jön: a kiadásra külön, az auditfájlra külön, az ablak előtt. Ilyenkor a folyamat áll.                                                                                                                                                                                                                                                                                                                                                                 | beszélgetés                                                                                                                 |
| F9  | **Szerveren felgyűlt maradványok:** 145 build- és próbakönyvtár, 57 `daily/previous-*`, 4 elavult capability-rekord. A lemez 76%-on áll (109/145 GB).                                                                                                                                                                                                                                                                                                                                        | `/root/alterward-ops`                                                                                                       |
| F10 | Az óránkénti „external availability” GitHub-ellenőrzés 2026-11-18 óta piros. Ok: a helyi gép óránkénti mentésszinkronja (`alterward-recovery-sync`) a forrásfájljai hash-ére rögzített, és a kiadásonként előretolt operátori checkoutban két rögzített fájl változott (`contabo-daily.mjs`, `pnpm-lock.yaml`), ezért „pin-mismatch” miatt leállt. 2026-11-21-én újratelepítve (`--remove`, `--install`), a szerveres egészségjelentés újra zöld. A szerveres mentések végig rendben voltak. | `managed-sync-state.json`, health projection                                                                                |

## Célállapot

| #   | Lépés                                                                                                                                                                                                       | Idő                                                    | Ki         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------- |
| 1   | PR: kód + automatikusan számolt kiadási pinek                                                                                                                                                               |                                                        | fejlesztő  |
| 2   | PR CI: egy image-build, a funded próba egyszer, csak az élő utakra                                                                                                                                          | kb. 15–20 perc                                         | CI         |
| 3   | Merge. A main CI fut, de a szerver nem vár rá.                                                                                                                                                              |                                                        |            |
| 4   | `release` parancs: build → rövid izolált próba (párhuzamosan a main CI-vel)                                                                                                                                 | kb. 30–40 perc                                         | szerver    |
| 5   | Kiadási kártya a tulajdonosnak (commit, változott fájlok, próba-receipt, terv-hash); **egy jóváhagyás**, amely az auditfájlt, az image-apply-t és az ablakot is fedi                                        |                                                        | tulajdonos |
| 6   | Ablak, egy parancs, felügyelet nélkül: szünet → mentés + visszaállítás-ellenőrzés → fence → apply → health → resume. Az élesítés utáni mentés, visszaállítás és fence már nyitott szolgáltatás mellett fut. | kb. 15–20 perc szünet, plusz kb. 15 perc utóellenőrzés | szkript    |
| 7   | Élő ellenőrzés és jelentés                                                                                                                                                                                  | 5 perc                                                 |            |

Összesen **kb. 1,5 óra**, ebből 2–3 lépés emberi figyelmet igényel.

## Munkacsomagok

### KP0 – Leltár: élő és történeti utak (csak olvasás, 0,5 nap)

- Minden fixture-esetről és operátori útról eldöntendő, hogy az élesben futó 040-es rendszer kiadásánál még átmegy-e rajta valami. Ha nem, történeti.
- **Feltételek a kivezetéshez:**
  - (a) Egyetlen megőrzött helyi vagy offsite mentés sem igényel 040 előtti visszaállítási utat (az offsite listát is ellenőrizni kell).
  - (b) Egyetlen élő parancs (Daily, fence, funded-upgrade, service-env, recovery) sem hívja.
  - (c) A tesztelői ablak (2026-10-29 – 2026-11-28) és a hozzá tartozó successor-mechanizmus élő-e még a mostani hullám- és admission-rendszer mellett.
- **Kimenet:** táblázat „élő / történeti / 11-28 után történeti” besorolással, és minden kivezetendő elemhez a fájlok és tesztek listája.

### KP1 – Történeti utak kivezetése (1,5–2 nap)

- A KP0 szerint történeti kód, fixture-esetek, tesztek és pinek eltávolítása; a dokumentációban történetiként rögzítve. Git-történetben megmarad.
- A valós órás várakozás (F2) a successor-esetekkel együtt megszűnik.
  - Ha a tesztelői ablak 11-28-ig még élő, a kivezetés addig vár, vagy csak a már lezárt részek mennek ki.
  - Óraállítást nem vezetünk be: a „no clock seam” tudatos biztonsági döntés volt.
- **Elfogadás:** a megmaradt próba lefedi az élő kiadás minden lépését (image-csere a mostani sémán, megszakítás minden állapothatáron, visszaállítás, aktív proof). A szerveres próba legfeljebb 30 perc, a CI `container` jobja legfeljebb 20 perc.

### KP2 – CI átszervezése (1 nap)

- Egy image-build jobonként helyett egy közös build; a funded próba egyszer fut (F1).
- A fence-kapu a ma megkövetelt három job helyett az új jobkészletet fogadja el (`scripts/contabo-fence-operator.mjs`).
- **Döntés kell (D2):** a main CI zöldje helyett elfogadható-e egy olyan PR CI zöldje, amely ugyanarra a fa-hashre futott. Ha igen, a main CI-re várás teljesen kiesik. Ha nem, a main CI marad, de a szerveres lépések nem várnak rá.

### KP3 – Kiadási pinek automatikusan (0,5–1 nap)

- `scripts/ops/release-pins`: az élesen futó commitból és a változott fájlokból kiszámolja a `REVIEWED_IMAGE_CHANGES` bejegyzést, a `REGISTRY_040_CHANGE_HASHES` értékeket és a hozzájuk tartozó tesztelvárásokat.
- A CI ellenőrzi, hogy a pinek naprakészek; a pinek mindig a PR-ben vannak, külön commit nincs (F5).

### KP4 – Egyparancsos kiadás (1,5 nap)

- A mostani kézi ablak-szkript a repóba kerül, folytatható állapottal (`release status`, `release resume`):
  - capability-rekord kezelése a zárak alatt (F6);
  - várakozás a recovery-időzítőre a restore és a fence előtt (F6);
  - friss aktív proof közvetlenül a fence előtt (F6);
  - egyszeri, naplózott újrapróba az ismert átmeneti fence-elutasításokra (F6);
  - a Daily `--update` csak akkor fut, ha a Daily szkriptjei változtak (F7);
  - hiba esetén automatikus visszaállás nyitott szolgáltatásra, a hiba okával.
- Az élesítés utáni mentés, visszaállítás és fence a resume után fut, de a Daily aktiválása csak ezek zöldje után (F7). Az ellenőrzéseket ez nem gyengíti, csak a szünet lesz rövidebb.

**A 053-as kiadás tapasztalatai (2026-11-20), a KP4 része:**

- A `--free N` a foglalt helyeket a hullámzárás válaszából próbálta kiolvasni, pedig azt csak a `status` adja vissza. Javítás: a `status` eredményéből olvasson.
- A kapacitásemelés pontos megerősítést kér (`--approve-added` = új kapacitás − régi kapacitás); a szkript fixen 0-t küldött, ezért a záró hullámnyitást a rendszer elutasította.
- Ha az ablak még a Daily letiltása előtt áll meg, a visszaállítás ne hívja a Daily `--activate`-et (ilyenkor hibát jelez, bár az időzítők futnak).

- Az operátori checkout előretolása után a `release` parancs ellenőrizze a helyi mentésszinkron rögzítéseit (`contabo-recovery-sync-timer.mjs --inspect`, `pinsCurrent`). Ha változtak, az ablak végén telepítse újra a jóváhagyott forrásból; különben a szinkron csendben leáll, és órákkal később a külső ellenőrzés jelez.

- **Ideiglenes peremjavítás törlése:** a mintatörténet fejlécét (2026-11-22) egy Cloudflare Worker (`alterward-sample-header-fix`, útvonal `alterward.com/official-lives/*`) javítja egy beszúrt stílusszabállyal, mert a `<header className="sample-header">` elemet elkapta a felső menüsáv általános `header` szabálya. A végleges javítás (`<div>`) ezen az ágon van; annak kiadása után a Workert és az útvonalát törölni kell.

### KP5 – Egy tulajdonosi jóváhagyás (0,5 nap)

- A szkript kiadási kártyát készít:
  - forrás commit, változott fájlok;
  - CI-futás, próba-receipt;
  - image-terv hash, megerősítő kifejezés;
  - várható szünet.
- A tulajdonos egyszer hagyja jóvá. Ez fedi az auditfájl megírását a pontos commitra, az image-apply-t és az ablakot.
- Ha a terv vagy a commit a jóváhagyás után változik, új jóváhagyás kell. Az auditfájl és a kiadásonkénti engedély megmarad; csak egy kérés lesz belőle (F8).

### KP6 – Takarítás és megfigyelés (0,5–1 nap)

- **Első takarítás kész (2026-11-20, tulajdonosi engedéllyel):** 37 régi Alterward image és 139 build- és próbakönyvtár törölve, a lemez 76%-ról 55%-ra csökkent (109 → 79 GB). A törölt elemek listája a szerveren: `diagnostics/delete-images-20261120.txt`, `diagnostics/delete-dirs-20261120.txt`. Más projektek image-eihez nem nyúltunk.
- **Megőrzési szabály, automatikusan a `release` parancs végén:**
  - **Image-ek:** megmarad az élesen futó image, valamint minden image, amelyre megőrzött helyi mentés hivatkozik (`ownerImage`). Az előző éles image ezzel együtt a visszaállítási pont. Minden más `alterward:contabo-*` image törölhető.
  - **Könyvtárak:** az utolsó két kiadás `image-*` build-könyvtára és `target/*` próbakönyvtára marad, a többi törölhető; a `daily/previous-*` mappákból az utolsó 3.
  - Csak `alterward:contabo-*` image-et és az Alterward saját könyvtárait érinti. A törölt elemek listája a `diagnostics/` alá kerül.
- Az elavult capability-rekordok kezelése a KP4 része.
- Az „external availability” ellenőrzés javítása vagy kikapcsolása indoklással (F10).
- A Daily tartós javítása (összegző inventory, a 16 MiB-es határ figyelése) is ide tartozik (053 C4).

### KP7 – Egyszer épített image a CI-ből (külön terv, következő kör)

- A CI által épített és ott ellenőrzött image digestre kötve kerül a szerverre (privát registry, csak olvasó token). A szerveres build és próba megszűnik.
- További kb. 30–40 perc megtakarítás, de új hitelesítési adat és ellátási lánc. Külön terv és döntés kell.

## Ami nem változik

- Mentés élesítés előtt, és a mentés visszaállíthatóságának ellenőrzése élesítés előtt.
- Fence-terv és fence-próba élesítés előtt és után.
- Visszaállítható előző image, folytatható és naplózott műveletek, zárak.
- Zöld CI a teljes tesztkészlettel (unit, integráció, build, séma).
- Kiadásonkénti tulajdonosi engedély és auditfájl.

## Sorrend és összehangolás a 053-mal

1. **KP0** leltár, azonnal.
2. **KP3** és **KP6** (kicsik, azonnal hasznosak, nincs kiadási kockázat).
3. **KP1** és **KP2**, a KP0 eredménye szerint.
4. **KP4** és **KP5**.
5. **Az első kiadás már az új eszközökkel, de még a teljes próbával fut.** Mivel az operátori szkriptek változnak, ez a kör szándékosan teljes próbát kap. Ez a kiadás viszi a 053 tartalmát (mintatörténetek láthatósága, motorjavítások) is, így nem kell külön kör.
6. Utána minden alkalmazáskiadás már az új úton megy.

A 053 többi része (A, B, D) a 054-gyel párhuzamosan fejleszthető ágakon; a kiadás a 054 elkészülte után egyszer történik.

## Becsült ráfordítás

KP0: 0,5 · KP1: 1,5–2 · KP2: 1 · KP3: 0,5–1 · KP4: 1,5 · KP5: 0,5 · KP6: 0,5–1 nap. **Összesen kb. 6–7 nap.** Fizetős AI-hívás nincs.

## Tulajdonosi döntések (2026-11-22)

| #   | Kérdés                                                                                                    | Döntés                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| D1  | A KP0 alapján történetinek bizonyult utak teljes kivezetése (kód, tesztek, CI, szerver)                   | jóváhagyva; a tesztelői ablakhoz (2026-11-28-ig) kötött részek csak az ablak lejárta után |
| D2  | A main CI helyett elfogadható a PR CI zöldje azonos fa-hash esetén                                        | jóváhagyva                                                                                |
| D3  | Egy jóváhagyás a kiadási kártyán (auditfájl + apply + ablak); terv- vagy commit-változásnál új jóváhagyás | jóváhagyva                                                                                |
| D4  | Megőrzés: a futó és a mentésekhez szükséges image-ek, az utolsó két kiadás könyvtárai                     | jóváhagyva; az első takarítás kész (2026-11-20)                                           |
| D5  | CI-ben épített image (KP7)                                                                                | az 055 része; az image-tároló az új VPS-en lesz (tulajdonosi döntés)                      |
