# AI-modellválasztás és költségoptimalizálás

2026-10-02 UTC · Lezárt mérés az akkor ellenőrzött hivatalos OpenAI-árak, kódvizsgálat, 18 korábbi és 14 új valódi hívás alapján. 2026-10-03-i dokumentációfrissítés: a történeti mérési számok/árak megmaradnak, a jelenlegi nyelvi/scope állapot pontosítva. [Aktuális összes keret/státusz](STATUS_HU.md) · [Dokumentáció](README.md). Kapcsolódó terv: [folytatható alternatív élet](PRODUCT_PLAN_HU.md).

## Következtetés

A feladatonkénti modellválasztás megoldható, és jelentős költségcsökkentést adhat. Az első mérendő kombináció: **Luna eseménygenerálás, Sol történetírás, Sol történetellenőrzés**. A korábbi tokenfogyasztást változatlannak feltételezve ez körülbelül **40% megtakarítás**. Ez ármodellből számolt lehetőség, nem már elért alkalmazásszintű eredmény.

A mostani kis próbában a Luna szabályos eseményeket készített, de a narratívája rövidebb lett a kívántnál, az ellenőrzője pedig finomabb hibát is átengedett. A történet és az ellenőrzés ezért egyelőre Solon marad. A valódi AI-generálás továbbra is a termék alapja. A következő v2-időszakos folyamaton külön kell megmérni a minőséget, a javításokat és a teljes sikeres időszak költségét.

## 1. Technikai megvalósíthatóság

A kódban három AI-feladat van:

| Feladat | Tartalom | Modellválasztás |
|---|---|---|
| `simulation_events` | Profilból/állapotból strukturált események és opciók | `AI_EVENT_MODEL` |
| `story_chapters` | Canonból angol/magyar narratíva | `AI_STORY_MODEL` |
| `story_fidelity` | Narratíva összevetése a cannonnal | **Új:** `AI_CHECK_MODEL` |

Korábban az eseménygenerátor és az ellenőrző ugyanazt a modellt használta. Emiatt egyetlen környezeti változó átállítása mindkettőt olcsóbb modellre vitte volna. A vizsgálat részeként az ellenőrző külön konfigurálható lett. Ha az `AI_CHECK_MODEL` nincs megadva, az eseménymodellt használja, megőrizve a korábbi működést. A mintakonfiguráció mindhárom szerepre Solt állít be; a védett helyi `.env` modelljeit ez a vizsgálat nem módosította.

A Responses API és a Structured Outputs mindkét jelölt modellnél rendelkezésre áll. A saját projekt hozzáférése külön feltétel; a mostani valós próba a Luna elérhetőségét is igazolta. Források: [Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol), [Luna](https://developers.openai.com/api/docs/models/gpt-6-luna).

## 2. Ellenőrzött egységárak

USD / egymillió token, Standard feldolgozás, legfeljebb 272 000 bemeneti token:

| Modell | Bemenet | Cache-olvasás | Cache-írás | Kimenet |
|---|---:|---:|---:|---:|
| `gpt-6.1-sol` | 2,00 | 0,10 | 2,50 | 10,00 |
| `gpt-6-luna` | 0,10 | 0,01 | 0,125 | 0,50 |

A normál bemenet, cache-írás és kimenet Luna-egységára a Sol huszada; a cache-olvasásé a tizede. A hosszú kontextus és eltérő feldolgozási szint más díjjal járhat; a fejlesztői keretőr a nem árazott modellt és a hosszú kontextust elutasítja. A próbában Standard feldolgozást kértünk. [Hivatalos árlista](https://developers.openai.com/api/docs/pricing).

Költségképlet: `(normál bemenet × bemeneti ár + cache-olvasás × cache-ár + cache-írás × írási ár + teljes kimenet × kimeneti ár) / 1 000 000`. A gondolkodási token a teljes kimeneti tokenszám része; külön hozzáadva kétszer számolnánk. [Reasoning és költség](https://developers.openai.com/api/docs/guides/reasoning).

## 3. Mire ment el a korábbi 0,63 USD?

A [korábbi próba](AI_VALIDATION.md) három alapéletet és három alternatív ágat készített, mindent Sol modellel. Az alábbi bontás a szolgáltatói tokenhasználatot tartalmazó helyi naplóból származik.

| Feladat | Hívás | Bemeneti token | Kimeneti token | Költség, USD | Részesedés |
|---|---:|---:|---:|---:|---:|
| Események | 6 | 8 482 | 24 145 | 0,2626460 | 41,7% |
| Történet | 6 | 30 513 | 17 353 | 0,2498035 | 39,7% |
| Ellenőrzés | 6 | 45 572 | 358 | 0,1175010 | 18,7% |
| **Összesen** | **18** | **84 567** | **41 856** | **0,6299505** | **100%** |

A kerekített részarányok összege eltérhet 100%-tól. A kimenet a költség körülbelül kétharmada; a cache-olvasás nulla volt. A 2 121 gondolkodási token a kimenet körülbelül 5%-a, ezért ebben a mintában a reasoning csökkentése önmagában kisebb lehetőség, mint a modellválasztás és a strukturált válasz mérete.

### Változatlan tokenszámmal számolt lehetőségek

| Modellkombináció | A teljes korábbi próbára számolt USD | Megtakarítás |
|---|---:|---:|
| Minden Sol | 0,6300 | — |
| Csak ellenőrzés Luna | 0,5183 | 17,7% |
| **Csak eseménygenerálás Luna** | **0,3804** | **39,6%** |
| Esemény és ellenőrzés Luna | 0,2688 | 57,3% |
| Minden Luna | 0,0315 | 95,0% |

Ezek újraárazott régi tokenmennyiségek, nem új mért eredmények. A táblázat nem számol eltérő szöveghosszal, többlet-gondolkodással, javítással vagy Solra visszalépéssel. A nagyobb elméleti megtakarítású sorokat a jelenlegi minőségi bizonyíték nem indokolja termékbe állítani. A tízéves v1-minta ára nem vetíthető közvetlenül a tervezett hat hónapos időszakra.

## 4. Valódi Luna-próba

Két korábbi, kitalált profil: grafikai portfóliót építő tanuló közeli kapcsolatok nélkül; helyben maradó, 55–64 éves adminisztratív alkalmazott. A tárolt szintetikus válaszokból a profil újraépült, új belső célazonosítóval. Az eseménypróba új seedet használt. A narratíva és ellenőrzés a korábbi mentett Sol-canonból készült, így a narrátort az új eseménygenerálástól külön vizsgáltuk. A teljes Luna-esemény → Sol-történet → Sol-ellenőrzés láncot még külön kell futtatni.

A Luna `reasoning.effort=low` beállítással futott. A kontroll ellenőrző Sol az API alapértelmezett reasoningjét használta. Esemény/narratíva kimeneti maximum 8 000 token, ellenőrzőé 2 048. Ezek a fejlesztői próba korlátai, nem új alkalmazás-alapértékek. A támogatott reasoning-beállítások és alapértékek: [Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), [Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol).

| Vizsgálat | Eredmény |
|---|---|
| Események sémája, időrendje, szereplői, determinisztikus feldolgozása | 2/2 sikeres |
| Luna ellenőr a korábbi, Sol által elfogadott történeteken | 2/2 elfogadta |
| Szándékosan kitalált családi/lakhatási és üzleti múlt felismerése | 4/4 felismerte |
| Luna-narratíva schema/hivatkozás ellenőrzése | 2/2 sikeres |
| Sol ellenőr az új Luna-történeteken | Egy elfogadás, egy időrendi kifogás |
| Fejezethossz | Mind a hat fejezet 184–219 szó; a kért 250–600 szó alatt |
| Luna és Sol ítélete az új két történetről | Mindkét esetben eltérő |

A kreatív történet a szakmai fókusz kialakulását a második év végi portfóliórendezéshez kapcsolta; a canon ezt a 42. hónapra helyezte. A Sol kifogásolta, a Luna ugyanazt a történetet elfogadta. A másik történetnél a Luna a döntési pont bemutatását már meghozott választásként értelmezte, pedig a szöveg kifejezetten nyitva hagyta a választást. A szöveg/canon összevetése alapján ezt téves riasztásnak ítéljük; a Sol elfogadta a történetet.

Ez nem általános pontossági arány vagy bizonyított minőségi rangsor. Két profil és néhány feltűnő hibamondat kevés a checker lecseréléséhez. A próba megmutatja, miért kell finom időrendi és jelentésbeli eseteket is tesztelni. A Sol ellenőr sem tekinthető hibátlan igazságforrásnak; emberi értékelés továbbra is szükséges.

**Költség:** 12 Luna-hívás és 2 Sol-kontroll, összesen **0,0542136 USD**. Minden válasz rendelkezik ismert tokenfogyasztással. Az előzetes 0,25 USD többletkeret és a régi próbákkal közös 1 USD fejlesztői limit alatt maradtunk. A korábbi 5 USD-ből összesen becsült **0,6841641 USD** fogyott, közvetlenül e mérés után körülbelül **4,32 USD** számított maradvány volt; szolgáltatói egyenleget nem kérdeztünk le. A későbbi nyelvi próbákkal frissített összesítés a közös státuszban van.

A nyers válaszok, a két Luna-történet és az egyes lépések auditja a Gitből kizárt `.local/ai-model-eval` alatt található. A korábbi szintetikus jelentéseket és történeteket a próba nem módosította. Supabase-fiókot nem hozott létre, személyes adatot nem küldött, éles életágat nem írt.

## 5. Javasolt feladatonkénti használat

Az alábbi hozzárendelés saját, feladatspecifikus javaslat. Az OpenAI a Lunát körülhatárolt, gyakori feladatokra, a Solt összetettebb, költségérzékeny munkára ajánlja; a konkrét élet-szimulációs minőséget saját próbák mérik. [Modellválasztási útmutató](https://developers.openai.com/api/docs/guides/model-selection).

| Feladat | Induló választás | Bevezetési feltétel |
|---|---|---|
| Strukturált, rövid események/opciók | Luna low/medium jelölt; Sol kontroll és célzott fallback | V2-domainfeltételek és a teljes lánc több időszakos ellenőrzése |
| Angol/magyar történet, jelenetek, érzelmi folytonosság | Sol; low/medium később összehasonlítható | Olvashatóság, hossz, időrend és folytatási vágy emberi értékelése |
| Végső történethűség-ellenőrzés | Sol | Luna csak párhuzamos próba, amíg a finom hibák felismerését nem igazoltuk |
| Későbbi szabad szöveg strukturált mezőkké alakítása | Luna none/low jelölt | Séma, előnézet/jóváhagyás; a már strukturált űrlap nem kap felesleges extra hívást |
| Későbbi emlékezeti összefoglaló | Luna low jelölt | Eseményazonosítókhoz kötött, canonból újraképezhető tények |

A séma, jogosultság, időrend és állapotátmenet ellenőrzése a meglévő domainmotor feladata. Az olcsóbb modell nem lazít ezeken a feltételeken. Az önbevallott modellbizalom vagy `valid=true` nem helyettesíti őket.

Jelölt konfiguráció a későbbi, ellenőrzött teljes próbához:

```dotenv
AI_EVENT_MODEL=gpt-6-luna
AI_STORY_MODEL=gpt-6.1-sol
AI_CHECK_MODEL=gpt-6.1-sol
```

Ez most nem automatikusan aktivált alapbeállítás. A következő rövid időszakos szerződésen először azonos profil/állapot/cél mellett kell összehasonlítani. Hibás eseménynél legfeljebb egy célzott Sol-javítás jöhet, külön költségfoglalással. Kvótahiányra, hitelesítési vagy ismeretlen fogyasztású hálózati hibára nem használunk drágább modellt kerülőútként. A javítás és a fallback is a költség/érvényes időszak mutató része.

## 6. További optimalizálás

- **Rövid időszak és tömör canon:** a tervezett 2–5 eseményhez csak a szükséges mezők, az aktuális állapot és releváns emlékezet kerüljön. A narratíva hosszát az élményhez igazítjuk; a szöveg lerövidítése önmagában nem minőségazonos megtakarítás.
- **Feladatonkénti kimeneti limit:** az ellenőrnek kevesebb kimenet kell, mint a történetnek. A `max_output_tokens` plafon, nem előre felszámított díj. Túl szűk limit csonka, mégis fizetett válaszhoz vezethet. [Reasoning és limitek](https://developers.openai.com/api/docs/guides/reasoning).
- **Cache mérés:** a régi próbában nem volt cache-találat, miközben a bemenet döntő része cache-írásként számlázódott. Stabil prompt/séma/tényprefix és változó adatok elkülönítése vizsgálható. A cache megtakarítása a tényleges újrafelhasználástól függ; a változó szöveg írása drágább lehet a normál bemenetnél. A cache-t nem tekintjük hosszú távú életemlékezetnek. [Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching).
- **Batch/Flex:** későbbi, ráérő szintetikus értékeléshez további 50% díjcsökkentés elérhető lehet. A Batch akár 24 órás feldolgozási ablaka, illetve a Flex lassabb és időnként nem elérhető működése miatt az első interaktív történethez Standard marad. A mostani próba nem Batch/Flex volt. [Batch](https://developers.openai.com/api/docs/guides/batch), [Flex](https://developers.openai.com/api/docs/guides/flex-processing).
- **Checkpoint és célzott javítás:** a már elfogadott eseményeket nem generáljuk újra narratívahiba miatt. Ez a meglévő tartós feladatkezelésre épülő P05 feladat.

## 7. Következő döntési kapu és reprodukció

Az [aktuális backlog](NEXT_STEPS.md) P01–P03 szeletei maradnak elöl. P02-ben a rövid eseménygenerálást feladatonként mérjük, P05-ben a routing, javítás és alkalmazásszintű keret készül el. A következő összehasonlítás a teljes **Luna-esemény → Sol-történet → Sol-ellenőrzés** láncot méri a Sol-kontrollhoz képest, legalább három egymást követő időszakon, majd a P07 különböző esetein.

Mérendő: költség/elfogadott időszak, schema/domain siker, tény- és időrendi hiba, checker téves elfogadás/téves riasztás, javítás/fallback arány, generálási idő, angol és magyar szövegminőség és folytatási szándék. A korábbi modellpróba magyar v1/prompton futott; az új locale-promptok és v2 period együtt még nem minősítettek Luna-routingen. A 20 eset nem írja felül az engedélyezett pénzügyi keretet; a fizetett próbákat fokozatosan futtatjuk.

Az `evaluate-ai-models.ts` a két meglévő helyi szintetikus jelentést használja, közös fogyasztási naplóval. Egyszerre egy fizetett fejlesztői próba futhat; ez a fájlalapú guard nem a többfolyamatos alkalmazás keretkezelése. A keretőr már modellspecifikusan számol Sol és Luna díjakkal; az ismeretlen fogyasztás foglalása megmarad. A vizsgálat akkori változásaira 63 automatizált teszt, formázás, típusellenőrzés és teljes build sikeres.

```powershell
pnpm build:packages
pnpm exec tsx --env-file-if-exists=.env scripts/evaluate-ai-models.ts
# Kizárólag egy már mentett jelölt történeteinek újraellenőrzése:
pnpm exec tsx --env-file-if-exists=.env scripts/evaluate-ai-models.ts 2026-10-02T21-50-51-223Z
```

A parancsok API-kreditet használnak. A forrásprofilok hiánya esetén a próba nem helyettesíti őket személyes adatokkal. Minőségi eltérésnél a jelentés hibát rögzít és a folyamat sikertelen kóddal zárul; ez a jelölt értékelési eredménye, nem infrastruktúrahiba.
