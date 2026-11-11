# alterward — a történetek külső Claude-auditja

2026-10-03 · [Módszer, árak és teljes költség](../CLAUDE_MODEL_EVALUATION_HU.md) · [Nyers gépi eredmények](CLAUDE_EXTERNAL_AUDIT_RESULTS.json).

A [magyar](AI_V2_HUNGARIAN_STORY.md) és [angol](AI_V2_ENGLISH_STORY.md) fő mintát Sonnet 5.5, Opus 5.5 és Fable 5.1 is kánonhűnek, megfelelő nyelvűnek találta. Mindhárom időszakot, a tényleges állapotokat, döntéseket és azok későbbi elfogadását megkapták. A szöveget nem javítottuk át; a felhasználó eredeti magyar értékelésre kijelölt mintája változatlan.

## Fő minták: gépi szerkesztői pontszámok

1–5 pont; ezek a modellek véleményei, nem emberi pontozás vagy retenciós bizonyíték.

| Minta / auditor | Személyes | Koherens | Nyelv | Döntési tét | Kíváncsiság |
|---|---:|---:|---:|---:|---:|
| HU / Sonnet | 4 | 5 | 5 | 5 | 4 |
| HU / Opus | 4 | 5 | 5 | 4 | 3 |
| HU / Fable | 4 | 5 | 5 | 4 | 3 |
| EN / Sonnet | 4 | 5 | 5 | 5 | 4 |
| EN / Opus | 4 | 5 | 5 | 5 | 3 |
| EN / Fable | 3 | 5 | 5 | 4 | 3 |

Az Opus/Fable fő észrevétele: a próza pontos, a kompromisszumok világosak, de óvatos, szerkezetében ismétlődő és kevésbé kelti fel a kíváncsiságot. A HU fő mintában visszatér a biztonság hangsúlyozása. Az EN fő mintában több konkrét jelenet/személyes részlet segíthetne, új kanonikus tények kitalálása nélkül. A jobb feszültség nem jelenthet biztos jövőjóslatot vagy önkényes drámát.

## Luna eseményláncok: szerkesztési észrevételek

A narrátor itt is Sol volt. Opus mindkét háromidőszakos láncot kánonhűnek találta, de több adatfelsoroló ismétlést és kevés megélt tapasztalatot jelzett. A magyar második fejezetben ténylegesen szereplő **„Heti hat órája van.”** harmadik személyre vált a második személyű prózában. A visszajelzést kereső korábbi döntés későbbi szövege inkább a választás felidézése, mint konkrét tapasztalat; ez szerkesztési gyengeség, nem bizonyított canon-ellentmondás.

A kezdeti Haiku/Sonnet auditok téves canon-riasztásokat is adtak: a később elfogadott választás következményét már a korábbi fejezet/endState részében várták, illetve helyes megállapításokat is hibának soroltak. A temporalitás és az issues jelentésének pontosítása után a négy ismételt audit ezeket kánonhűnek találta. A téves riasztásokat nem történethibaként könyveljük el. A nyers JSON-ban megmaradnak.

## Az új Claude-narrátor próbáin talált hibák

A Claude által írt tényleges fejezetek a [magyar minták](CLAUDE_GENERATED_STORIES_HU.md) és az [angol minták](CLAUDE_GENERATED_STORIES_EN.md) dokumentumában olvashatók, az eredeti és javított változatok megkülönböztetésével.

- Haiku HU: tényleges hibás szóhasználat, például **„rágalmazott szokássá vált”** és **„elölökteted”**. A séma/hossz/hivatkozás sikere nem tette elfogadhatóvá a prózát.
- Haiku EN: a megadott 35–44 éves korcsoportból pontos negyvenéves kort állított, illetve a változatlan energiaértékből rendszeres kimerülést talált ki.
- Sonnet EN: a négyórás opcióhoz nem rögzített fele-fele időbeosztást adott. Egy célzott narratívajavítás eltávolította; az eseményeket megtartottuk. Opus ezután kánonhűnek találta, és külön helyi realizmust érintő hangrészletet jelzett. Ez utóbbi önállóan ellenőrzendő szerkesztési megjegyzés.

Ezek kutatási fejezetek, nem az eredeti fő minták. A szereppróbák szintetikus canont használtak; nem kerültek a felhasználó életébe vagy nyilvános Official gyűjteménybe.

## Következő minőségi lépés

A felhasználó a magyar mintákban magyartalanságokat jelzett, ezért a magyar részt halasztotta. A legújabb döntés szerint angol AI szerkesztői ellenőrzés után korlátozott éles béta indul, majd használói visszajelzésekből javítunk; előzetes kézi EN/HU pontozást nem kér. [Aktív indulási terv](../ENGLISH_RELEASE_PLAN_HU.md), [kiadás utáni értékelés](../HUMAN_EVALUATION_AND_PILOT_HU.md). A gépi pontszámok nem emberi eredmények. Az ismétlés, konkrét jelenetek és korábbi választás megélt következménye továbbra szerkesztési feladat; Sol/Sonnet csere előtt azonos kánon mellett angol minőség és teljes javításköltség mérendő.
