# alterward — külön managed Auth-mentések lejárata

2026-10-10 · **Szerveroldali operátori szelet és helyi naplózott fájlkezelés elkészült; automatikus retention még nincs.** [Mentési lefedettség](SUPABASE_RECOVERY_COVERAGE_HU.md) · [Kiadási sorrend](NEXT_STEPS.md).

Új helyi szelet: [helyi managed retention](LOCAL_MANAGED_BACKUP_RETENTION_HU.md), 23 Windows- és 23 tényleges Linux-eset, valódi kernelzár/megszakítás utáni folytatás, izolált Python-runtime célpróba és valódi törlés nélküli check. Claude low-jelzései javítva, pontos delta új konkrét finding nélkül; automatikus expiry továbbra külön integrációs kapukra vár. Az alábbi szerveroldali bizonyítékokat ez nem írja felül; a szerver megszakítási naplója és a teljes összehangolt futtató még külön feladat.

A [managed capture](../scripts/ops/contabo-managed-recovery.py) manifestje hét napos `expiresAt` időt ad; ez a restore használatát már tiltja lejárat után, de önmagában nem törli a titkosított másolatokat. A külön [lejáratkezelő](../scripts/ops/contabo-managed-expiry.py) ennek szerveroldali törlési részét készíti elő. Nem telepítettünk új timert, és nem töröltünk valódi mentést.

## Pontos határ

- Kizárólag a `/root/alterward-ops/managed-recovery` saját archívumai és az `alterward-managed-recovery-2` manifest fogadható el. A napi és régi történeti mentések külön eljárások.
- Root operátor, a napi job és owner activation meglévő lockjai, pontos projektkötés és a **helyi eredeti manifestek teljes halmaza** szükséges. Legfeljebb száz archívum egy batchben; a szerver és a helyi jegyzék eltérése megállítja a műveletet.
- A teljes batch minden friss és régi archívumát ellenőrzi törlés előtt: eredeti 0700 könyvtár, 0600 egyszeres regular fájl, pontos háromfájlos készlet, manifestegyezés és mindkét ciphertext méret/hash. Link, idegen fájl, hiányos capture vagy sérülés esetén nincs törlés. `mtime` nem lejárati authority.
- A capture és expiry UTC, különbségük pontosan hét nap. Az expiry pillanatában a mentés lejárt; az utolsó régi példány sem marad meg korlátlanul. A `check` mód csak leltárt ad, az `apply` külön explicit művelet.
- A helyi operátor friss UTC-órája és a szerveróra legfeljebb öt perccel térhet el. Lejártnak csak akkor minősül a mentés, ha **mindkét óra szerint lejárt**. Két egyformán rossz óra vagy hamisított operátori kérés ellen ez nem idő-attesztáció; a védett helyi wrapper külön szükséges.
- Linuxon a törlés nyitott eredeti könyvtárhoz kötött, pontos fájlnevekkel történik, rekurzív törlés nélkül. Közvetlenül előtte a batch, könyvtár és fájlok azonossága újra ellenőrzött. Kulcsot, plaintextet, adatbázist vagy szolgáltatást az eszköz nem használ.

Az eredmény csak összesítést és a lejárt manifestek hash-eit tartalmazza; nincs személyes Auth-sor vagy belépési adat. A manifestek a védett operátori csatornán jutnak be, nem shell argumentumban. A forrás még nem integrált automatikus futtató vagy a helyi másolatokat kezelő wrapper.

## Ellenőrzés és hátralévő integráció

Tizenöt [célzott eset](../tests/ops/test_managed_expiry.py): pontos hét nap/check, Linux descriptoros törlés és utolsó példány, sérült friss mentés miatti teljes batch-stop, hiányos/idegen/eltérő helyi jegyzék, hibás projekt/idő/scope, hardlink, jogosultság/típus és közben megváltozott batch. Külön root-/archívum-/fájlcsere és rmdir előtti csere, mindkét valódi flock ütközése/feloldása, ismeretlen kérésmező/nonroot, hibás/eltérő óra és mindkét órás expiry. Windows alatt kilenc sikeres, hat Linux-specifikus eset kihagyva.

Az első `df7a0b0` forrás nyolc esetét a Contabón ténylegesen lefuttattuk, mind sikeres kihagyás nélkül. A 2026-10-10T14:57:55Z olvasási check egy aktuális managed archívumot teljes helyi manifestegyezéssel és két ciphertext-hashsel igazolt; lejárt/törölt archívum nulla, kulcsolvasás/decryption/DB-írás/levél/paid AI nulla, kilenc futó konténer változatlan. A [pontos df7a0b0 verify/container CI](https://github.com/Muzsy/future_flow/actions/runs/38061646421) sikeres.

A javított **1b7c4061c82ec3a282d36d8610ad1370cc73c9c4** forrás mind a **tizenöt Linux-esete ténylegesen sikeres, kihagyás nélkül**, és a 2026-10-10T15:04:17Z új check mindkét órával elfogadott, egy eredeti archívummal, nulla lejárt/törölt példánnyal. Kilenc futó konténer változatlan, fixture eltakarítva, kulcsolvasás/decryption/DB-írás/levél/paid AI nulla. A kliens `Z` formátumú UTC-t küldött, amit a tényleges szerver-Python elfogadott; régebbi Python kompatibilitását ebből nem állítjuk. A [pontos javított verify/container CI](https://github.com/Muzsy/future_flow/actions/runs/38062126295) sikeres.

A `df7a0b0` Claude-forrásaudit nem talált törlési scope-/frissességi/adatszivárgási hibát. EXP-01 low hipotézis: hibás szerveróra; peer-clock ellenőrzés és a két óra minimuma beépítve. EXP-02 low: a legutolsó csereablakok és lockok tesztlefedettsége; hét új eset kész. EXP-03 info: a ténylegesen eltávolított archívumokat számláljuk. EXP-04 info: a hashcheck lockütközése napi mentést halaszthat; az operátori futás a **03:15 UTC napi mentéstől és negyedórás ellenőrzés időpontjától távol**, korlátozott batchben történjen. Ez auditjelzés és saját ellenőrzés, nem négy igazolt éles hiba vagy teljes retention-jóváhagyás.

A pontos `1b7c406` Claude-delta EXP-01/02/03 javítását forrásból elfogadta, EXP-04-et a dokumentált operátori határnak minősítette; új konkrét finding nincs, read-only/szintetikus próba blokkolása false. Claude nem futtatott tesztet vagy látott privát/prod bizonyítékot; a tényleges célpróba a saját runtime-eredményünk. A név szerinti unlink és az utolsó stat közti, kizárólag root írhatóságú maradék ablakot nem állítjuk megszüntetettnek.

Az apply nem fájlrendszeri tranzakció. Folyamat/host megszakítása részleges archívumot hagyhat; a következő leltár ezt blokkolja, nem folytat vak rekurzív törlést. Tartós megszakítási napló és célzott recovery még integrációs feladat. A sikeres törlés nem mentéssértetlenségi vagy későbbi szolgáltatás-visszaállítási bizonyíték.

**Nyitott kapuk:** a helyi managed ciphertext/manifest/pointer lejárata, a régi történeti fájlok és JSON-ba ágyazott ciphertext-másolatok kezelése, a teljes felügyelt ütemezés/riasztás és megszakítási helyreállítás. A korábbi privát leltár húsz titkosított helyi másolatot talált, közülük négy JSON-mezőbe ágyazva; ezeket a két új managed fájl törlése nem fedi le. A független visszafejtő kulcspéldány és teljes hosted Auth/fence/promotion továbbra külön hiány. Béta és paid allowance inaktív; az éles app továbbra csak tulajdonosi hozzáféréssel fut.
