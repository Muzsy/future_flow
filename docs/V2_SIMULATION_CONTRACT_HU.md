# alterward — v2 időszak és tényállapot

2026-10-03 · P01 első elkészült szelete. A `packages/contracts/src/life-v2.ts` és `packages/core/src/life-v2.ts` tartalmazza a szerződést és a determinisztikus validátort. Ez könyvtári alap: az API, worker és adatbázis továbbra is v1. Nem kész folytatási funkció.

## Verzió és kompatibilitás

Új `LIFE_CONTRACT_VERSION = 2.0.0`, külön lifeInput/lifeState/periodCandidate/constraint V2-sémák. A régi `CONTRACT_VERSION`, sémaazonosítók, profil/állapot és worker megmaradnak. `pnpm schemas` a v1 export mellett külön `docs/contracts/v2` könyvtárba exportál `urn:alterward:*:2.0.0` azonosítóval.

JSON-séma a strukturális feltételeket, domainmotor az időrendet, referencia-egyezést és átmenetet ellenőrzi. V1 tízéves meg nem választott jövőre nem fűzhető v2-folytatás. Migráció és explicit új v2-élet még nincs bekötve.

## Induló élet és állapot

A még nem élesben tárolt v2 életbemenet kötelező `locale: en | hu` mezőt tartalmaz: egy élet minden időszaka ezen a nyelven készül; felületnyelv-váltás nem módosítja. További nyelv csak teljes katalógus és nyelvi AI-próba után engedélyezhető.

Külön saját/alternatív identitás-pillanatkép, opcionális eredeti profilverzió-hivatkozás, környezet, egy fő cél és opcionális további célok, tényállapot és korlátok. Saját profil nem módosul. A `visibility` csak `private`; publikáció külön, explicit megerősítésű folyamat lesz.

Cél: kategória, leírás, elsődleges/másodlagos prioritás, hónapos horizon, opcionális motiváció és vállalható/kizárt áldozatok. A current_progress megfelelője az állapot goal-ID-val kötött, megjegyzéses active/achieved/abandoned sora; nincs kitalált százalék. Korlátok élet/ág/idő szerint külön listában kapcsolódnak.

Állapot: munkahely/foglalkoztatás, ország/régió/lakhatás, pénznem/pénzügy, valódi tulajdonlista, tartós szereplők, készségek, célállapot, lehetőségek és energia/idő. Ismeretlen opcionális érték `null`, nulla nem hiányzó érték. Nincs kötelező két kapcsolat vagy teljes trait-skála. Fő identitás a bemenetben; `actors` a további szereplők listája.

ID-k egyediek/stabilak. Új szereplő explicit actor_add változással kerül be, utána esemény hivatkozhat rá. Privát címkék/adatok külön sanitized projekció nélkül nem adhatók ki nyilvánosan.

## Tényváltozás és korlát

Zárt típusos változások: munka/hely/pénzügy/erőforrás cseréje, tulajdon hozzáadása/törlése, szereplő/készség hozzáadása, létező cél előrehaladása, lehetőség rögzítése. Nincs tetszőleges JSON-path írás. Egy esemény ugyanazt a tényt nem módosíthatja kétszer; nem birtokolt vállalkozás nem adható el. Munka megszűnése státusz/munkahelytényt változtat; eladott tulajdon további üres átmenettől nem kerül vissza.

Első gépi predikátumok: foglalkoztatási státusz, ország, asset birtoklása és minimum likvid pénz adott pénznemben. Ismeretlen pénz/más pénznem nem bizonyítja a minimumot. Devizaátváltás, adósságmodell és összetett kapcsolatpredikátum későbbi verziózott bővítés.

Korlát: hard/soft, élet-ID, opcionális ág-ID, kezdőnap, opcionális kizáró végdátum és feloldó döntés-ID. Lejárt/még nem érvényes/más élet vagy ág korlát nem alkalmazódik. Csak ténylegesen elfogadott döntési előzmény oldhat fel. Kemény sértés hiba, puha preferencia ID-val figyelmeztetés. Scope és accepted decision lista később szerveroldali tárolásból jön, nem megbízható kliensbemenet.

`applyFactChangesV2`: forrás módosítása nélkül előfeltétel → másolat → típusos változás → referencia/egyediség/korlát ellenőrzés. Egy esemény atomikus változáskészlet, köztes félállapot nem canon. SQL-tranzakció/lease-védelem a következő szelet.

## Rövid időszak

Alap hat hónap; szerződés tizenkettőt is elfogad, naptári hónapkezeléssel. Period/branch ID, induló revision, kezdő/végnap, időtáv, cím és 2–5 esemény. Esemény saját ID, nap, szereplők, előfeltételek, változások és opcionális döntés.

`simulatePeriodV2` ellenőrzi ág/revision/kezdőállapot egyezését, időhatárt, időrendet, szereplőket és egyetlen döntést az utolsó eseménynél, az időszak végén. Azonos napon sorrendben alkalmazott események megengedettek. Elavult revision 409-es domainhiba.

A döntés 2–4 opciója javaslat marad, egyiket sem alkalmazza a period-validátor. Canon eseményenként stateBefore/stateAfter és puha korlátjelzések; a végállapot a függő döntés választása előtti állapot. Választási mentés/folytatási API és az opciók teljes végrehajthatósági vizsgálata a következő szelet/P02–P03. Séma önmagában nem igazol helyes AI-történetet.

## Ellenőrzés és következő munka

20 új domain-teszt: privát/alternatív és ismeretlen adat, célhivatkozás, munkatényt változtató átmenet, eladás tartóssága, nem választott opció, döntés utáni történet tiltása, idő/revision/ág, kitalált szereplő, duplikált opció/módosítás, lehetetlen előfeltétel, hard/soft és idő/ág/élet/döntés szerinti korlát, pénznem. Korábbi v1 domain-tesztek megmaradnak.

Következő P01-szelet: additív `003+` migráció időszakokkal, ág-head/revisionnel, választásokkal, folytatási jobbal; tulajdonosi FK/RLS, v1 visszaolvasás és explicit új v2-élet. Ezután P02 valódi rövid OpenAI-generálás, P03 ugyanazon ágon folytatás. Public fork-checkpoint külön nyilvános szerződés lesz, nem a privát lifeStateV2Schema kiszolgálása.
