# alterward — v2 időszak és tényállapot

[Dokumentációs központ](README.md) · [Közös státusz és keret](STATUS_HU.md) · [A két terv teljes visszakövetése](REQUIREMENTS_TRACEABILITY_HU.md).

2026-10-04 · A v2 szerződés/domain mellett a 003–005 tárolás, /api/v2, AI-worker és rövid onboarding/folytatás is integrált. [Megvalósítás és ellenőrzés](V2_IMPLEMENTATION_REPORT_HU.md).

## Verzió és kompatibilitás

Új `LIFE_CONTRACT_VERSION = 2.0.0`, külön lifeInput/lifeState/periodCandidate/constraint V2-sémák. A régi `CONTRACT_VERSION`, sémaazonosítók, profil/állapot és worker megmaradnak. `pnpm schemas` a v1 export mellett külön `docs/contracts/v2` könyvtárba exportál `urn:alterward:*:2.0.0` azonosítóval.

JSON-séma a strukturális feltételeket, domainmotor az időrendet, referencia-egyezést és átmenetet ellenőrzi. V1 tízéves meg nem választott jövőre nem fűzhető v2-folytatás. Új v2-élet explicit hozható létre; a v1 baseline változatlan.

## Induló élet és állapot

A tárolási/kutatási immutable v2 életbemenet `locale: en | hu` értéket olvas. Az új termékélet és draft request-sémája kizárólag `en` értéket fogad; explicit `hu` 422. Régi HU élet elrejtve, saját exportja megmarad. Egy élet minden időszaka a mentett nyelven készül; felületnyelv-váltás nem módosítja. További nyelv csak teljes katalógus és nyelvi AI-próba után engedélyezhető.

Külön saját/alternatív identitás-pillanatkép, opcionális eredeti profilverzió-hivatkozás, környezet, egy fő cél és opcionális további célok, tényállapot és korlátok. Saját profil nem módosul. A `visibility` csak `private`; publikáció külön, explicit megerősítésű folyamat lesz.

Cél: kategória, leírás, elsődleges/másodlagos prioritás, hónapos horizon, opcionális motiváció és vállalható/kizárt áldozatok. A current_progress megfelelője az állapot goal-ID-val kötött, megjegyzéses active/achieved/abandoned sora; nincs kitalált százalék. Korlátok élet/ág/idő szerint külön listában kapcsolódnak.

Állapot: munkahely/foglalkoztatás, ország/régió/lakhatás, pénznem/pénzügy, valódi tulajdonlista, tartós szereplők, készségek, célállapot, lehetőségek és energia/idő. Ismeretlen opcionális érték `null`, nulla nem hiányzó érték. Nincs kötelező két kapcsolat vagy teljes trait-skála. Fő identitás a bemenetben; `actors` a további szereplők listája.

ID-k egyediek/stabilak. Új szereplő explicit actor_add változással kerül be, utána esemény hivatkozhat rá. Privát címkék/adatok külön sanitized projekció nélkül nem adhatók ki nyilvánosan.

## Tényváltozás és korlát

Zárt típusos változások: munka/hely/pénzügy/erőforrás cseréje, tulajdon hozzáadása/törlése, szereplő/készség hozzáadása, létező cél előrehaladása, lehetőség rögzítése. Nincs tetszőleges JSON-path írás. Egy esemény ugyanazt a tényt nem módosíthatja kétszer; nem birtokolt vállalkozás nem adható el. Munka megszűnése státusz/munkahelytényt változtat; eladott tulajdon további üres átmenettől nem kerül vissza.

Első gépi predikátumok: foglalkoztatási státusz, ország, asset birtoklása és minimum likvid pénz adott pénznemben. Ismeretlen pénz/más pénznem nem bizonyítja a minimumot. Devizaátváltás, adósságmodell és összetett kapcsolatpredikátum későbbi verziózott bővítés.

Korlát: hard/soft, élet-ID, opcionális ág-ID, kezdőnap, opcionális kizáró végdátum és feloldó döntés-ID. Lejárt/még nem érvényes/más élet vagy ág korlát nem alkalmazódik. Csak ténylegesen elfogadott döntési előzmény oldhat fel. Kemény sértés hiba, puha preferencia ID-val figyelmeztetés. Scope és accepted decision lista szerveroldali tárolásból jön, kliens nem adhat meg belső azonosítókat.

`applyFactChangesV2`: forrás módosítása nélkül előfeltétel → másolat → típusos változás → referencia/egyediség/korlát ellenőrzés. Egy esemény atomikus változáskészlet, köztes félállapot nem canon. SQL-tranzakció/lease és commit előtti revision/hash védi a mentést.

## Rövid időszak

Alap hat hónap; szerződés tizenkettőt is elfogad, naptári hónapkezeléssel. Period/branch ID, induló revision, kezdő/végnap, időtáv, cím és 2–5 esemény. Esemény saját ID, nap, szereplők, előfeltételek, változások és opcionális döntés.

`simulatePeriodV2` ellenőrzi ág/revision/kezdőállapot egyezését, időhatárt, időrendet, szereplőket és egyetlen döntést az utolsó eseménynél, az időszak végén. Azonos napon sorrendben alkalmazott események megengedettek. Elavult revision 409-es domainhiba.

A döntés 2–4 opciója javaslat marad, egyiket sem alkalmazza a period-validátor. Canon eseményenként stateBefore/stateAfter és puha korlátjelzések; a végállapot a függő döntés választása előtti állapot. Minden opció végrehajthatóságát ellenőrizzük alkalmazás nélkül; a választási API az egy kiválasztott opciót atomikusan alkalmazza. Séma önmagában nem igazol helyes AI-történetet.

## Ellenőrzés és következő munka

20 új domain-teszt: privát/alternatív és ismeretlen adat, célhivatkozás, munkatényt változtató átmenet, eladás tartóssága, nem választott opció, döntés utáni történet tiltása, idő/revision/ág, kitalált szereplő, duplikált opció/módosítás, lehetetlen előfeltétel, hard/soft és idő/ág/élet/döntés szerinti korlát, pénznem. Korábbi v1 domain-tesztek megmaradnak.

003–005 migráció, tulajdonosi FK/RLS, /api/v2, 6 hónapos valódi OpenAI-worker, választás/folytatás/történeti fork és 12 lépéses angol onboarding kész, magyar a termékben elrejtve. A 006 privát előnézeti és 007 feedback/session migráció is alkalmazva, a valódi angol Auth/AI/UI/export/törlés próba sikeres. [Részletek](V2_IMPLEMENTATION_REPORT_HU.md). Public fork-checkpoint továbbra külön nyilvános szerződés, a privát lifeStateV2Schema nem szolgálható ki.

## Tervezett additív Shared Context kapcsolat

A Life v2 2.0.0 megmarad; a külön Shared Context 1.0.0 szerződés S0-ban elkészült, tizenegy új sémával. A tizennyolc régi JSON-séma és a 001–007 migráció változatlan; a fejlesztői Supabase-on az additív 008/009 is alkalmazva és ellenőrizve. A személyes memory opcionális sharedEvents mezővel bővül majd S3-ban, jogosult és alkalmazott közös canonprojekcióval; a saját Shared memory séma már előkészített, de a Life AI-bemenetbe még nincs bekötve. Régi tárolt jobok mező nélkül is olvashatók. Nem kerül teljes másik WorldState vagy húsz teljes felhasználó az actors listába. A shared aggregátum saját revision/idő/canon; a személyes hatás tervezett lazy és exactly-once adaptere S1/S3. Saját történeti fork nem örököl majd élő shared tagságot; csak a forkpontig engedett történeti memóriát. [Szerződés és idő/concurrency elfogadás](SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) · [Megvalósított S0 és korlátok](SHARED_CONTEXT_S0_REPORT_HU.md).

## S1 határ

[S1 megvalósítás és korlátok](SHARED_CONTEXT_S1_REPORT_HU.md). A külön Shared szerződés hat új server/intent/resolution/memoryImpact sémával bővült, a Life v2 input/state és régi 29 séma változatlan. S1 nem ír személyes branchet és nem materializál: a pending canon memória saját period-inputba emelése S3.
