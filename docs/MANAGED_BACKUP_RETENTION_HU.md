# alterward — külön managed Auth-mentések lejárata

2026-10-10 · **Szerveroldali operátori szelet elkészült, automatikus retention még nincs.** [Mentési lefedettség](SUPABASE_RECOVERY_COVERAGE_HU.md) · [Kiadási sorrend](NEXT_STEPS.md).

A [managed capture](../scripts/ops/contabo-managed-recovery.py) manifestje hét napos `expiresAt` időt ad; ez a restore használatát már tiltja lejárat után, de önmagában nem törli a titkosított másolatokat. A külön [lejáratkezelő](../scripts/ops/contabo-managed-expiry.py) ennek szerveroldali törlési részét készíti elő. Nem telepítettünk új timert, és nem töröltünk valódi mentést.

## Pontos határ

- Kizárólag a `/root/alterward-ops/managed-recovery` saját archívumai és a `managed-recovery-2` manifest fogadható el. A napi és régi történeti mentések külön eljárások.
- Root operátor, a napi job és owner activation meglévő lockjai, pontos projektkötés és a **helyi eredeti manifestek teljes halmaza** szükséges. Legfeljebb száz archívum egy batchben; a szerver és a helyi jegyzék eltérése megállítja a műveletet.
- A teljes batch minden friss és régi archívumát ellenőrzi törlés előtt: eredeti 0700 könyvtár, 0600 egyszeres regular fájl, pontos háromfájlos készlet, manifestegyezés és mindkét ciphertext méret/hash. Link, idegen fájl, hiányos capture vagy sérülés esetén nincs törlés. `mtime` nem lejárati authority.
- A capture és expiry UTC, különbségük pontosan hét nap. Az expiry pillanatában a mentés lejárt; az utolsó régi példány sem marad meg korlátlanul. A `check` mód csak leltárt ad, az `apply` külön explicit művelet.
- Linuxon a törlés nyitott eredeti könyvtárhoz kötött, pontos fájlnevekkel történik, rekurzív törlés nélkül. Közvetlenül előtte a batch, könyvtár és fájlok azonossága újra ellenőrzött. Kulcsot, plaintextet, adatbázist vagy szolgáltatást az eszköz nem használ.

Az eredmény csak összesítést és a lejárt manifestek hash-eit tartalmazza; nincs személyes Auth-sor vagy belépési adat. A manifestek a védett operátori csatornán jutnak be, nem shell argumentumban. A forrás még nem integrált automatikus futtató vagy a helyi másolatokat kezelő wrapper.

## Ellenőrzés és hátralévő integráció

Nyolc [célzott eset](../tests/ops/test_managed_expiry.py): pontos hét nap/check, Linux descriptoros törlés és utolsó példány, sérült friss mentés miatti teljes batch-stop, hiányos/idegen/eltérő helyi jegyzék, hibás projekt/idő/scope, hardlink, jogosultság/típus és közben megváltozott batch. Windows alatt hét sikeres, a Linux-törlés egy esete platform miatt kihagyva; valódi Linux-próba és pontos Claude-delta még szükséges.

Az apply nem fájlrendszeri tranzakció. Folyamat/host megszakítása részleges archívumot hagyhat; a következő leltár ezt blokkolja, nem folytat vak rekurzív törlést. Tartós megszakítási napló és célzott recovery még integrációs feladat. A sikeres törlés nem mentéssértetlenségi vagy későbbi szolgáltatás-visszaállítási bizonyíték.

**Nyitott kapuk:** a helyi managed ciphertext/manifest/pointer lejárata, a régi történeti fájlok és JSON-ba ágyazott ciphertext-másolatok kezelése, a teljes felügyelt ütemezés/riasztás és megszakítási helyreállítás. A korábbi privát leltár húsz titkosított helyi másolatot talált, közülük négy JSON-mezőbe ágyazva; ezeket a két új managed fájl törlése nem fedi le. A független visszafejtő kulcspéldány és teljes hosted Auth/fence/promotion továbbra külön hiány. Béta, paid allowance és éles app változatlanul inaktív/owner-only.
