# alterward — privát AI-ellenőrzés a publikálási másolathoz

2026-10-05 · [Státusz](STATUS_HU.md) · [P09 sorrend](NEXT_STEPS.md#p09--publikálható-snapshot-official-scenario-és-kurált-seed) · [Privát előnézeti alap](PUBLIC_DRAFT_FOUNDATION_HU.md) · [Nyilvános terv](PUBLIC_CONTENT_IMPLEMENTATION_PLAN_HU.md).

## Elkészült szelet

A P09 előnézeti alapja angol AI-adatvédelmi és tartalmi pre-screent kapott. A megbízható üzemeltető indíthat ellenőrzést a meglévő tulajdonosi másolaton; a felhasználói API csak a saját eredmény olvasását engedi. Nincs új fizetős kliensvégpont vagy publikáció. Az AI `no_findings` eredménye sem ad kiadási/Official jogosultságot, és nem teljes anonimitási garancia.

A külön zárt bemenet minden címet, összefoglalót, célszöveget, fejezetet, eseményt, döntési kérdést és opciót felsorol. A másolat saját helyi kulcsai szerepelnek benne; forrásfelhasználó/élet/ág/snapshot UUID, privát profil, emlékezet, teljes állapot, nyers prompt és más tag adata nem kerül át. Az összbemenet 70 000 UTF-8 byte alatt marad; túl nagy másolatnál nincs csendes csonkítás vagy részleges scan. Az email/link/telefon/UUID elővizsgálat és a Shared-előzmény miatti lezárás megmarad.

Sol a meglévő checker-beállításon keresztül fut, zárt strukturált kimenettel, `store:false`, legfeljebb 2200 kimeneti tokennel. A [hivatalos Structured Outputs dokumentáció](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses) szerinti SDK-hívást külön szemantikai ellenőrzés követi: ismeretlen/dupla mezőhivatkozás vagy az eredménnyel ellentétes finding elutasított. A szabad próza a rendszerutasítástól elkülönített adat. Az eredmény csak mezőkulcsot, problémakategóriát és javasolt műveletet tárol; nem ismétli meg a feltárt nevet/összeget vagy idézetet, és nem ír új történetet.

## Tartós és tulajdonosi határ

Az új [014 migráció](../database/migrations/014_public_draft_ai_reviews.sql) egy RLS-védett táblát ad. A review a draft, tulajdonos, source revision, snapshot hash, review input hash és policy version értékeihez kötött. A szolgáltató hívása előtt `running` marker készül; a lezárt eredmény és a minimális token/model/hash receipt immutable. Fiók- és áglock alatt az írás újra ellenőrzi az aktív tulajdonost, forrásrevisiont, a lejáratot és a Shared-kaput. A forrás közbeni megváltozása vagy a deleting marker után nincs elfogadott eredmény.

Ugyanahhoz az előnézethez és policyhoz a sikeres ellenőrzés újrahasználható, AI-hívás nélkül. Hibás vagy megszakadt próbát nem indítunk automatikusan újra ugyanazon drafton: új, explicit előnézet szükséges. A részletes szolgáltatói hibaszöveg nem kerül adatbázisba vagy naplóba. A review az account export része, a privát draft/account cascade törli. A korábbi, még 014 nélküli adatbázison az export/törlés kompatibilis marad.

Hitelesített `GET /api/v2/public-previews/:id/review`: saját eredmény, mezőkulcs→mezőútvonal megfeleltetés, `publicationApproved:false`, `Cache-Control:no-store`; anon 401, másik fiók 404. `POST`/approve/publish művelet nincs. A forrás preview változatlanul `awaiting_review`; `readyForFork:false`.

## Üzemeltetői indítás és keret

`PUBLIC_REVIEW_OPERATOR_ENABLED=true` megbízható helyi környezetben engedi a `pnpm review:public --preflight OWNER_UUID DRAFT_UUID` parancsot. Ez nem ír reviewt és nem hív szolgáltatót. A `--run` explicit fizetős vizsgálat. Csak a meglévő `.local/ai-smoke/usage.json` összesített, megőrzött 5 USD naplóval működik; Sol-modellre és egy vizsgálatban legfeljebb 0,25 USD összes foglalásra korlátozott. Ismeretlen fogyasztásnál a foglalás megmarad. A CLI nem éles felhasználói queue: a későbbi termékoldali scan-jobhoz még tranzakciós projekt/user költségőr és sorvezérlés szükséges.

A `pnpm smoke:public:review` az eredeti, valódi AI-val készült [három angol időszakot](examples/AI_V2_ENGLISH_STORY.md) használta negatív kontrollnak, új történetgenerálás nélkül. Egy valós Sol-hívás: 2647 input +239 output token, 0,009006 USD tokenbecslés, 0,0090075 USD konzervatív elszámolás. Öt jelzés: helynév mindhárom fejezetben, konkrét pénzügyi részlet és azonosítható kombináció az elsőben. `review_required` az eredmény. Ez szolgáltatói és adatvédelmi felismerési bizonyíték; a DB/HTTP tesztek ettől külön, izolált technikai fixture-rel futnak. Nem minősít publikálásra késznek egy Official történetet. [Gépi audit és receipt](examples/AI_PUBLIC_REVIEW_ENGLISH_AUDIT_HU.md).

Az OpenAI napló 127 hívást, 2,279753105 USD becsült és 2,365445875 USD konzervatív összköltséget tartalmaz; maradvány 2,634554125 USD, ismeretlen fogyasztás nincs. Claude-hívás nem történt ebben a szeletben; a külön napló változatlan.

## Ellenőrzés és következő kapu

Helyi `pnpm check` és a `14caf62` [main CI verify/container](https://github.com/Muzsy/future_flow/actions/runs/37328921024) sikeres: formázás, típusellenőrzés, **311 teszt/27 fájl**, API/worker/Next production build. Két új public review schema készült, a korábbi 42 változatlan; összesen 44 schema drift nélkül. A 014 a fejlesztői Supabase-on alkalmazva, ismételt migráció checksum-eltérés nélkül sikeres. A Shared-előzmény miatti review-start/read tiltás külön regresszióval ellenőrzött.

A konténeres CI valódi, izolált PostgreSQL/TLS-en igazolta a párhuzamos review-start egyszeriségét, a lezárt eredmény újrafelhasználását és `publicationApproved:false` határát, a forrásváltozás/deleting marker utáni commit elutasítását, account cascade törlést és a kliensszerepek közvetlen hozzáférési tiltását. Mind a 14 migráció és az ismételt futás, a korábbi S0–S3 versenypróbák, web/API/Caddy HTTPS, API401, mindkét üres queue poll és worker-stop sikeres. Az alterward.com helyi route-mintája egress nélküli Caddy adapt-tal parszolva, aktiválás/certkérés nélkül. A CI nulla szolgáltatói AI-hívást és nulla valódi credentialt használ. Az első konténerpróba hiányzó szintetikus Supabase-szerepkör miatt állt meg; a teszt PostgreSQL ezeket a migráció előtt hozza létre, a már alkalmazott 014 változatlan.

A későbbi [privát Privacy/Content Preview felület](PUBLIC_PREVIEW_EDITOR_REPORT_HU.md) és a szöveg szerkesztése elkészült. Még fejlesztendő a fizetett felhasználói scan-job, megbízható kurátor-jóváhagyás, ScenarioVersion/futtatható fork-checkpoint, Publication/Confirm, public/unlisted jogosultság, moderáció/visszavonás és Official seed. Az angol nyelvi minősítést AI-ra bízó döntés nem helyettesíti a tulajdonosi publikálási Confirmot. A Shared-ágak külön, lezárt PII/consent kapuja és az S3 retention-kérdés továbbra megmarad. P10–P13 és S4–S7 a közös terv része.

Az `alterward.com` Cloudflare-domain aktív és bekerült az élesítési tervbe; helyi Caddy-minta már a főcímet és a `www` átirányítást tartalmazza. DNS, Cloudflare TLS, élő Caddy és Contabo alkalmazás nem változott. A következő élesítésnek a mentés/restore, email, valós kiesés, célkörnyezet és külön éles AI-keret ellenőrzése után kell következnie.


## 2026-10-05: szerkeszthető privát Privacy/Content Preview

A [privát angol szerkesztő](PUBLIC_PREVIEW_EDITOR_REPORT_HU.md) elkészült: saját forrásszöveg, mezőszintű ingyenes preflight, idempotens immutable mentés, legutóbbi érvényes copy visszatöltése és teljes mentett tartalomnézet. Az operatori AI-review csak a megfelelő hash/revision és mezőkészlet mellett látható; finding a javítandó mezőre mutat. Mentés/olvasás nem hív AI-t, Shared-előzmény és HU továbbra tiltott. Helyi teljes check: 314 teszt/27 fájl, 48 séma, a korábbi 44 és 001–014 változatlan. Következő a külön fizetett scan-job költségőrrel, curator/ScenarioVersion/sanitized fork-checkpoint/Publication/Confirm; majd P10–P13. Éles bekötés továbbra nincs.
