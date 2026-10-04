# alterward — angol béta és használói visszajelzés

2026-10-04 · [Elfogadott indulási terv](ENGLISH_RELEASE_PLAN_HU.md) · [Bizonyíték és keret](STATUS_HU.md) · [Backlog](NEXT_STEPS.md).

A felhasználó átnézte a mintákat, magyar fogalmazási hibákat jelzett, és a magyar részt elhalasztotta. Angolul nem kíván mély nyelvi minősítést végezni: az angol szerkesztői döntést az AI-ra bízta, majd éles visszajelzésekből javítunk. A korábbi indulás előtti kézi EN/HU pontozási/pilot kapu ezért felülírva. Ez nem azt jelenti, hogy a korábbi emberi minőségteszt sikeres volt.

## Indulás előtti ellenőrzés

Automatikus domain/kánon/nyelv/hozzáférés/költség és AI angol szerkesztői ellenőrzés szükséges. A [háromidőszakos angol fő mintát](examples/AI_V2_ENGLISH_STORY.md) Sonnet, Opus és Fable gépileg auditálta; kánon és nyelv rendben, ismétlés és visszafogott kíváncsiság szerkesztési észrevétel. A [Claude narrátorpróbák](examples/CLAUDE_GENERATED_STORIES_EN.md) hibás és javított változata külön jelölt. Ezek nem emberi pontszámok vagy retenciós bizonyítékok. [Részletes audit](examples/CLAUDE_EXTERNAL_AUDIT_HU.md).

P06 tényleges Auth/AI HTTP-hurok és Auth/DB-törlés sikeres; a böngészős bizonyíték a [2026-10-04-i béta-riportban](BETA_IMPLEMENTATION_REPORT_HU.md) található. Az új, v3 narrátorral készített angol kétszakaszos mintát Sonnet kánonhűnek és nyelvileg helyesnek minősítette. Backup/restore és valós DB-kiesésből recovery, későbbi Contabo-telepítés és külön éles költségkeret még szükséges. Az első béta csak a technikailag kész, privát angol életmotorra korlátozható; a public/community képességek saját privacy/moderációs ellenőrzés után nyílnak.

## Visszajelzés a kiadás után

A privát általános és fejezethez kötött [visszajelzésküldő űrlap](BETA_FEEDBACK_AND_METRICS_HU.md) kész. Rövid önkéntes értékelés vagy konkrét hibahely elegendő; teljes privát profil/történet beküldése nem követelmény. Az alábbi szempontok az éles visszajelzés elemzésére szolgálnak, nem a tulajdonosnak küldött új angol vizsgalap.

| Szempont | Mit vizsgálunk? |
|---|---|
| Személyesség | A kiinduló helyzet, cél és korlát alakítja a történetet? |
| Következetesség | Megmarad a választás következménye; van új vagy eltűnő fontos tény? |
| Hihetőség | Hétköznapi, arányos fejlődés és kitalált szcenárióérzet? |
| Döntési tét | Érthető a haszon, kockázat és áldozat? |
| Érdeklődés | Folytatná, másik ágat próbálna vagy abbahagyná; miért? |
| Angol fogalmazás | Természetes, világos, változatos; ismétlés és nyelvi hiba? |

A magyar újraindítása külön későbbi döntés. Modell/prompt csere azonos kánon mellett mérendő, a javítás teljes költségével; a meglévő kis mintából nincs automatikus provider/model váltás. Kritikus hozzáférési/adatkezelési/kánonhiba gyors hibajavítás, nyelvi és élménybeli észrevétel következő verzióba kerül.

## Mérési és pénzügyi korlátok

A click/success proxy mellett `pnpm metrics:private` már olvasásvég-kohorszra épülő continuationRate és szerveroldali 30 perces sessionhöz kötött sikeres/későbbi folytatás számokat is ad. `pnpm feedback:report` tartalom nélküli kategória/szándék összesítés. [Pontos definíciók](BETA_FEEDBACK_AND_METRICS_HU.md). Fejezetvég láthatósága nem bizonyított elolvasás. Retenciós és keresleti állítás nincs igazolva.

Az indulás kis angol béta, a 20–50 használó későbbi célkohorsz. A két Sol-lánc konzervatív átlagos háromidőszakos költsége ebben a kis mintában körülbelül 0,21 USD; húsz hasonló lánc körülbelül 4,21 USD, ötven 10,52 USD. A valós változat/javítás/foglalási plafon eltérhet. A folyamatosan csökkenő, a státuszban nyilvántartott OpenAI fejlesztői keretből nem indul automatikusan teljes nyilvános pilot; a külön Claude kutatási keret sem éles generálási keret. [Teljes napló és maradvány](STATUS_HU.md).

Előbb külön éles AI-keret, a meglévő Contabo telepítési/ops-kapui és szűk hozzáférési limitek, utána a mérés alapján bővítés. Heti visszajelzés-áttekintés terv, automatizálás még nincs beállítva.
