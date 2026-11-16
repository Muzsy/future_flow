---
status: active-supporting
owner: web
related:
  - ../product/MONETIZATION_HU.md
  - ../operations/NATIVE040_IMAGE_RELEASE_HU.md
---

# 050 – Profilmenü és Fiókom oldal

Tulajdonosi döntések: 2026-11-16. Megvalósítás: a #213 ágán (közös fejléc, Vissza gomb, személyes indulási ajánlat), egy kiadásban.

## Probléma

- A bejelentkezett fejlécben a zöld, kitöltött kijelentkező gomb a legerősebb elem, mindig kéznél van, és kérdés nélkül kiléptet. Kijelentkezéskor a helyi, félbehagyott életpálya-vázlat törlődik (`clearLifeDraftCache`).
- A fiókhoz tartozó funkciók szét vannak szórva: előfizetés a menüben, meghívó a számlázási oldalon, adatletöltés és fióktörlés a menüből el nem érhető `/account-access` oldalon.

## Döntések

1. **Profilmenü** a fejléc jobb szélén, mindkét fejlécben (alkalmazás és nyilvános oldalak): kezdőbetűs kör, lenyíló lista.
   - felirat: a bejelentkezett e-mail-cím;
   - Fiókom (`/account`), Előfizetés (`/billing`), Adatvédelem (`/privacy`);
   - elválasztó, Kijelentkezés.
2. **A fő menüben csak tartalmi pontok:** Discover · Forgatókönyvek · (Mentettek) · Életágaim · Új élet · (Kapcsolatok) · (Publikált példányok). A zárójelesek csak bekapcsolt funkciónál.
3. **Kijelentkezéskor mindig megerősítés** a profilmenün belül („Biztosan kijelentkezel?” → Kijelentkezés / Mégse).
4. **A meghívó kártya a számlázási oldalról a Fiókom oldalra költözik.**
5. **Az adatletöltés és a fióktörlés a Fiókom oldalon közvetlenül elérhető.** Az API 5 percen belüli bejelentkezést kér hozzájuk (`requireRecentAuthentication`), ezért a fiókoldal a `/account-access` újrabelépési, jelszó- és adatműveleti blokkját használja (beágyazott mód: saját cím, bevezető és kijelentkező gomb nélkül).
6. A `/account-access` önálló oldal változatlanul megmarad, mert kijelentkezve, lezárt hozzáférés vagy alkalmazáshiba esetén is el kell érni rajta az adatjogokat.
7. A kódbeli `nav.profile` kulcs („Start a life / Új élet”) átnevezése `nav.startLife`-ra, hogy ne keveredjen a profilmenüvel.
8. Kijelentkezett állapotban a zöld „Belépés” gomb marad.

## Fiókom oldal (`/account`)

| Blokk | Tartalom |
| --- | --- |
| Fiók | e-mail-cím, a fiók létrehozásának dátuma |
| Előfizetés | állapot, fejezetegyenleg, link a `/billing`-re |
| Meghívó | a korábbi számlázási kártya (meghívó létrehozása, másolás, beváltott/visszavont állapot) |
| Biztonság és adatok | újrabelépés, jelszó-visszaállító e-mail, új jelszó, adatletöltés, fióktörlés |
| Jogi | Adatvédelem, ÁSZF |

Fejléc és Vissza gomb, mint a többi önálló oldalon. Kijelentkezve belépésre irányító szöveg.

## Nem része

- Önálló jelszócsere-folyamat új backenddel, e-mail-cím módosítása, megjelenítendő név.
- A `/privacy` és a `/privacy-notice` összevonása.
- A `/account-access` blokk magyar fordítása (élesben csak az angol nyelv engedélyezett).

## Elfogadás

- A bejelentkezett fejlécben nincs zöld kijelentkező gomb; a kijelentkezés csak a profilmenüből, megerősítés után történik.
- Discover, számlázás, ÁSZF, Fiókom és az alkalmazás oldalai ugyanazt a fő menüt és profilmenüt mutatják.
- A meghívó kártya csak a Fiókom oldalon van.
- A Fiókom oldalról friss újrabelépés után az adatletöltés és a fióktörlés működik.
- Mobilon a profilkör a menügomb mellett van, a lista nem lóg ki.
