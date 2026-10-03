# alterward — tesztelés és minőség


**Aktuális megvalósítás:** P01–P05 privát v2 mag integrált; P06–P08 valós/emberi kapu nyitott. [V2 riport](../V2_IMPLEMENTATION_REPORT_HU.md), [státusz](../STATUS_HU.md). A [P09 privát előnézeti alapja](../PUBLIC_DRAFT_FOUNDATION_HU.md) is kész; a teljes közösségi/nyilvános rész továbbra tervezett.

2026-10-03 · [Ellenőrzött állapot](../STATUS_HU.md) · [AI-próba](../AI_VALIDATION.md) · [Nyelvek](../LOCALIZATION_HU.md).

## Meglévő bizonyíték és határ

139 automatizált teszt sikeres, köztük 20 determinisztikus eset ×3 időszak; négy valódi EN/HU Sol/Luna lánc ×3 időszak. [Aktuális bizonyíték és korlát](../V2_IMPLEMENTATION_REPORT_HU.md). Valódi Auth-fiókos és emberi minőségi kapu nyitott.

## Kötelező technikai invariánsok

- Canon múlt és profilpillanatkép változatlan; nem létező szereplő/esemény/cél/asset nincs.
- Rendezett idő, ág/revision egyezés, nincs választás utáni történet függő döntésnél.
- Tényleges munka/tulajdon/hely/pénz változás és aktív hard korlát; unknown nem hamis tény.
- Egyszeri választás/job/commit, dupla kérés, restart/lease-vesztés és concurrent revision védelem.
- Saját/másik felhasználó/token nélküli hozzáférés, RLS, friss auth export/törlés, törlés közbeni worker-visszaírás tiltása.
- Locale kompatibilitás, katalóguskulcs/interpoláció/kérdőív egyezés, immutable életnyelv, EN/HU AI-hivatkozások és régi HU job.
- Kérési foglalás, kvóta nem retryolódik, ismeretlen fogyasztás nem tűnik el, hibaköltség elszámolt.

## P07 generatív és emberi kapu

Legalább 20 különböző szintetikus eset, három egymást követő period és eltérő választások. Domain/jogosultság/adatkezelés minden esetben sikeres. Angol és magyar emberi értékelés: személyesség, hihetőség, következetesség, érdeklődés, érthetőség és folytatási vágy; külön ismétlés/általánosság/jóslásérzet/új tartós tény. Fix szövegegyezés helyett canon és hibakategória.

Modell/prompt/routing csere azonos state/cél mellett teljes láncot mér: cost/accepted period, idő, invalid/repair/fallback, checker téves elfogadás/riasztás, nyelvi minőség. Az AI-ellenőr nem arany igazságforrás. Paid esetek fokozatosan, foglalással; 20 eset nem engedi túllépni az 5 USD összkeretet. Valós felhasználói export nem tesztfixture.

## P13 public kapu

Private/unlisted/public anon/owner/other/moderator mátrix, tokenváltás, lejárt/módosított preview és explicit hash-Confirm; harmadik személy PII; eredetbadge; dupla Save/Publish/Fork; revoke közbeni olvasás/fork; cache/OG/sitemap törlés; raw private DTO/checkpoint szivárgás; report-visszaélés; export/törlés és forrásattribution; public döntési checkpoint egyszeri választása. Nyilvános fork első három saját időszaka is ellenőrizendő. Olvasás/nyelvváltás/Save/Share nem növeli OpenAI-hívásszámot.

## Release és pilot

P06 valós integrációs böngészős próba és ops helyreállítás; P07 technikai/nyelvi minőség; P08 20–50 résztvevős EN/HU használati pilot; P13 teljes public gate. Auth/privacy/adatvesztés/canon corruption release blocker, átlagos 18/20 élmény nem mentesít. Retenciós cél a következő értékelt kohorsz előtt rögzítendő. Teljesítmény/terhelés/backup-restore/riasztás külön mért indulási feladat, nem már teljesített SLA.
