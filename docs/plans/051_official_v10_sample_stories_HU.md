---
status: active-supporting
owner: public-content
related:
  - ../OFFICIAL_PUBLICATION_REPORT_HU.md
  - ../OFFICIAL_SEED_REPORT_HU.md
  - ../EXTERNAL_PUBLIC_EXPOSURE_REPORT_HU.md
  - 050_profile_menu_and_account_page_HU.md
---

# 051 – Regisztráció nélkül olvasható v10-es mintatörténetek

Tulajdonosi döntések: 2026-11-16/17. Végrehajtó: Claude.

## Cél

Két ingyenes, regisztráció nélkül olvasható, keresőkben megjelenő mintatörténet a felhasználóknak ma adott **v10**-es motorral, továbbá egy rövid, a stílusba illő bemutatkozó szöveg a főoldalon és az ingyenes első fejezet jelzése.

## Döntések

| Téma | Döntés |
| --- | --- |
| Motor | v10 (a történetirány-űrlap útja, `branch.input.story`), nem a régi időszakos életmotor |
| Darabszám | 2 történet × 4 fejezet |
| AI-keret | 3 USD összesen (generálás + tartalmi review); mérési pont az első fejezet után |
| Hangnem | a lehető legéletszerűbb, hétköznapi emberekkel, drámai fordulat nélkül |
| 1. történet | **Az előléptetés**: 40-es évei elején járó logisztikai koordinátor, házas, két iskolás gyerek, lakáshitel; csoportvezetői ajánlat |
| 2. történet | **Haza a szülővárosba**: 30-as évei közepén járó elvált irodai asszisztens egy gyerekkel, drága albérlet, segítségre szoruló édesanya egy kisvárosban |
| Láthatóság | nyilvános, keresőkben indexelve (csak ez a két történet) |
| Főoldal | rövid leírás az alkalmazásról, ár nélkül, „az első fejezet ingyenes” jelzéssel |

## Mi van már meg (éles: 9cc0b56)

- Hivatalos eredetlánc: Official start → normál AI-jobok → tartalmi csomag → AI tartalmi review → kurátori átnézés → Official LIFE eredetengedély → privát előnézet → megerősítés (`OFFICIAL_PUBLICATION_REPORT_HU`, `OFFICIAL_SEED_REPORT_HU`).
- 16 aktív, nyilvános hivatalos történet (régi motor, 2026-10-08), indexelési engedély nélkül.
- Külső kitettség és indexelés kóddal kész, alapból kikapcsolva (`PUBLIC_EXTERNAL_EXPOSURE_ENABLED=false`): `/api/public/external/:slug`, sitemap, OG-kép, `curation:exposure` operátori CLI.
- A fikciós jobok rögzítik a `narrativeGenerationBinding`-et és a `receiptOrder`-t.

## Hiányok

1. **Az Official indulás a régi motort indítja.** `ScenarioRepository.start` a sablonból életbemenetet készít, de `story` nélkül és narratív motorbeállítás nélkül hozza létre az életet.
2. **A bizonyíték-ellenőrzés csak a régi formátumot ismeri.** `validateOfficialLifePeriod` és az `officialLifeReceiptSchema` a `life_period`/`life_chapter`/`life_fidelity` feladatokat várja.
3. **Bejelentkezés nélkül az API minden nyilvános olvasást elutasít.** Szolgáltatási módban csak a `publicApiException` lista megy át; a hivatalos olvasó és a külső kitettség nincs rajta. A weboldalak már most átmennek.
4. **A főoldalon nincs bemutatkozás és ingyenes fejezet jelzés.**

## Megoldás – migráció nélkül

### M1. v10-es hivatalos forrás

- `scenarioTemplateSchema`: opcionális `story` mező a történetirány-adatokkal. A meglévő sablonok és lenyomataik változatlanok; generált szerződések frissítése (`pnpm schemas`).
- `instantiateScenarioTemplate` átadja a `story`-t az életbemenetbe.
- Csak az operátori Official indulás kapja meg a narratív motorbeállítást (`narrative-fiction-v2`), így az első és a további fejezetek a felhasználókéval azonos v10-es úton készülnek. A normál forgatókönyv-indítás viselkedése nem változik.

### M2. Fikciós bizonyíték-ellenőrzés

- `officialLifeReceiptSchema` és az Official evidence bővítése a fikciós feladatokkal (tervezés, írás, review, ellenőrzés), a meglévő számlázott-foglalási egyezés megtartásával (`aw_budget_reservations`).
- Új ág a `narrative-fiction-v2` periódusokra: `narrativeGenerationBinding` forrás- és artefakt-hash, a mentett fikciós artefakt és fejezet egyezése, receipt-sorrend, döntés és állapotlánc. A régi ág változatlan.
- Új `OFFICIAL_LIFE_SOURCE_VERSION` a fikciós evidence-hez; a meglévő engedélyek érvényesek maradnak.

### M3. Operátori generálás

- Fiktív mintafiók a két hétköznapi profillal (sablonok a repóban, privát adat nélkül).
- A katalógus-seed mintájára operátori fázisok: forgatókönyv-review → forrásengedély → Official start → fejezetenként külön, explicit lépés → választás → következő fejezet. Nincs automatikus újrapróba vagy publikálás. Egyetlen tartós költségablak, a normál felhasználói keret érintetlen.
- **Mérési pont:** az első fejezet után a tényleges költség alapján döntés a folytatásról. Ha a 2×4 fejezet nem fér a 3 USD-be, megállás és tulajdonosi döntés.

### M4. Publikálás és nyilvános olvasás

- A meglévő csomag → tartalmi review → kurátori átnézés → eredetengedély → előnézet → megerősítés lánc, nyilvános láthatósággal.
- `publicApiException`: csak olvasó, pontos útvonal-minták a hivatalos olvasóra (`GET /api/public/official-lives/:slug`) és a külső kitettségre (`GET /api/public/external/:slug`, `GET /api/public/external/sitemap`). Más nyilvános API nem nyílik meg. Biztonsági review kötelező.
- Kitettség bekapcsolása: `PUBLIC_EXTERNAL_EXPOSURE_ENABLED`, `PUBLIC_SITE_URL`, `API_INTERNAL_URL`; a két történetnek `index` mód a `curation:exposure` CLI-vel. Minden más oldal `noindex` marad.
- Cloudflare: a weboldalak most is átmennek; a megvalósításkor ellenőrizni kell, hogy az API és a sitemap is anonim módon elérhető-e a peremen.

### M5. Főoldal

- Hős-szekció: egy mondat arról, mi ez (AI-val írt, fiktív alternatív élettörténetek a megadott kiindulópontból és a választásaidból).
- „Hogyan működik” blokk három lépésben, valamint egy mondat arról, hogy nem jóslat és nem tanács.
- „Az első fejezet ingyenes” a főoldali gombnál és a regisztrációs oldalon.
- Linkek a két mintatörténetre, ha élnek. A szövegeket a tulajdonos jóváhagyja kiadás előtt.

## Kiadási sorrend

| Lépés | Tartalom | Kiadás |
| --- | --- | --- |
| R1 | M1 + M2 + M4 kód (kitettség kikapcsolva) + M5 | egy image-kiadás, séma nélkül |
| R2 | M3 operátori generálás az élesen futó R1 kóddal | nincs image; operátori lépések, fizetős |
| R3 | M4 publikálás, kitettség bekapcsolása, indexelés | konfiguráció + operátori CLI |

## Kockázatok

- **Biztonsági határ:** az anonim API-kivétel csak a hivatalos, publikált, aktív másolatot adhatja vissza; minden más útvonal zárva marad.
- **Minőség:** a mintának jónak kell lennie; a tartalmi review és a kurátori átnézés nem hagyható ki. A kedvezőtlen fejezet újragenerálása a keret terhére megy.
- **Indexelés:** a keresők által már mentett tartalom nem vonható vissza garantáltan.
- **#210:** a sablon-szerződés és a story-labels fájlok ütközhetnek; a pineket mindkét oldalon újra kell számolni.
