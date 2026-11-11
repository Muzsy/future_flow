# alterward — elfogadott bétaütemezés

2026-10-10 · [Következő lépések](NEXT_STEPS.md) · [Teljes termékterv](PRODUCT_PLAN_HU.md) · [Shared-terv](SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md).

A felhasználó döntése: **először legfeljebb tízfős személyes béta, utána külön öt baráti pár Shared-tesztje, továbbra legfeljebb tíz fővel.** Húszfős bővítés és automatikus, barátonként egy külső meghívás nincs engedélyezve. A teljes P01–P13 és Shared S0–S7 terv megmarad; ez a kiadási sorrend pontosítása.

## Első kör: személyes történetek

Angol felület és valódi AI-generálás; saját élet, döntés/folytatás, ellenőrzött meglévő Official életből saját indulás, Scenario és személyes Scenario. A meglévő 15 élet / öt Scenario kínálat megmarad. Megfigyelendő: belépés, első saját történet, döntés, folytatás, érthetőség/hihetőség, hiba és visszajelzés. Saját export, visszavonás és törlés megmarad.

A Shared teljes egészében kikapcsolva marad: `SHARED_CONTEXTS_ENABLED`, `SHARED_FRIEND_ENABLED`, `SHARED_CONNECTED_ENABLED`, `SHARED_WORLD_ENABLED` és a Shared-generálás flagje false. A bétaaktiválás előellenőrzése a tényleges tíz vagy kevesebb UUID-nál ellenőrzi, hogy nincs korábbi aktív Shared-tagság vagy megtanult személyes Shared-emlék. A 2026-10-10-i teljes fejlesztői/éles adatbázis read-only leltárban mindkét mennyiség nulla, de ez nem helyettesíti a későbbi aktuális UUID-ellenőrzést.

A meglévő tízfős szerveroldali beléptetési korlát változatlan. A teljes oldal név szerinti Access/origin hozzáférése, a saját Supabase-fiók és a fizetett UUID-jog külön ellenőrzés. Egy belső Shared-meghívó nem ad hozzáférést az egész zárt webhelyhez. Nyílt regisztráció vagy továbbadható webhely-belépő nem készül.

A tényleges meghívottaknak előre jelezni kell az angol `Alterward` feladót, az `info@alterward.com` címet és a spam mappa ellenőrzését. A két saját Auth-levélhez a szolgáltató Delivered státuszt adott, de mindkettő Gmail spambe érkezett; a hitelesített domain és a három PASS nem inbox-garancia. Meghívás után címzettenként a megérkezés/spam és sikeres HTTPS-belépés ellenőrzendő, külön a fizetett UUID-aktiválástól. Nincs automatikus ismételt küldés vagy nyitott signup a levél keresésének helyettesítésére. [Provider-bizonyíték és pontos határ](SMTP2GO_DELIVERY_CHECKPOINT_HU.md).

## Második kör: öt baráti pár

Előbb kötelező a törölt/kilépett/blokkolt résztvevőkhöz kapcsolódó régi személyes szöveg olvasási, export- és AI-input határának megvalósítása, a teljes privacy/retention és Shared kiadási ellenőrzés, valódi páros működési próba és pontos Claude Cloud-audit. A most elkészült karanténos restore-replay és a közös minimális szövegprojekció önmagában ezt nem teljesíti.

Operátori név szerinti engedélyezéssel öt külön kétfős `friend_group` teszt indulhat. Mindkét tag saját fiókot és saját ágat használ, a korábbi személyes történetük változatlan marad. Vizsgálandó: meghívás/elfogadás/visszautasítás, közös AI-esemény, valódi saját döntések, késlekedő válasz és közben saját folytatás, az eredmény későbbi megismerése, revision-verseny, kilépés, blokk/jelentés, fiók- és élettörlés, munkamegszakítás és helyreállítás. Romantic, Connected és World kiadás későbbi lépés.

Ehhez nem kell automatikus külső barátmeghívást vagy húszfős beléptetést fejleszteni. A párok résztvevői külön kiválaszthatók; a tényleges engedélyezett létszám egyszerre továbbra legfeljebb tíz.

## Költség és aktiválás

A jóváhagyott teljes induló keret változatlanul 10 USD: 8 USD OpenAI + 2 USD Claude. A kínálat külön 6 + 1 USD plafonból készült, a tesztelői rész legfeljebb 2 + 1 USD. A közös személyes felső korlát 0,50 USD, a tényleges indulástól rögzített harminc nap; nincs automatikus új időszak vagy új keret.

A 3 USD közös használati rész tíz főnél átlagosan 0,30 USD/fő, húsz főnél 0,15 USD/fő lenne: ez egyszerű keretosztás, nem szolgáltatói árajánlat vagy ígéret a generálások számára. A második tesztkör sem kap automatikusan új keretet vagy hosszabbítást. Indítása előtt az első kör tényleges költéséből és a szükséges páros próbákból külön becslés készül.

Most továbbra csak a tulajdonosi oldal aktív. Tesztelőlista, fizetett engedély és használati időszak nem lett aktiválva e döntéssel.
