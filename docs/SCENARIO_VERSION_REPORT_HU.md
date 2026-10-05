# P09 — Teljes ScenarioVersion és új privát élet

2026-10-05 · [Közös sorrend](NEXT_STEPS.md) · [Állapot](STATUS_HU.md) · [Nyilvános terv](PUBLIC_CONTENT_IMPLEMENTATION_PLAN_HU.md).

## Elkészült működés

Külön zárt `scenario-1` szerződés és immutable, angol ScenarioVersion készült. A sablon cím/összefoglaló, alternatív felnőtt identitás, fiktív környezet, 1–5 cél és azok állapota, dátumozott kezdőállapot, munka/hely/pénzügy, tulajdonok, szereplők, készségek, lehetőségek, erőforrások és legfeljebb húsz típusos korlát teljes készletét tárolja. Nem kész történet; nem kap automatikus Official eredetet.

A sablon `goal-1`, `actor-1`, `asset-1`, `opportunity-1`, `constraint-1` típusú helyettesítő kulcsokat használ. A szerver ellenőrzi az egyediséget, pontosan egy aktív főcélt, asset-hivatkozásokat, valós naptári dátumokat, lejáratokat, tényszerű állapotot és kemény korlátokat. Egy kiinduló asset-predikátum ebben a verzióban csak a sablonban szereplő tulajdonra hivatkozhat. A kezdőnap a verzió része, indításkor nem tolódik el csendesen. A korlát lejárata továbbra kizáró végpont.

Minden példányosítás új élet-, ág-, cél-, szereplő-, tulajdon-, lehetőség- és korlátazonosítót ad. A célállapot és asset-predikátum ezekre az új ID-kre hivatkozik. `visibility=private`, `baseProfileVersionId=null`; sem eredeti privát szülő, profil, história, memória, prompt, elfogadott döntés, sem élő Shared-tagság nem kerül át. A v2 motor régi `hu-neutral-v2` környezetazonosítója tárolási kompatibilitásból marad; az új sablon nyelve angol, nyilvános környezetverziója `fictional-neutral-1`.

Az indítás a meglévő Life job/worker, lease, projekt/user költségőr, napi és párhuzamos generálási kvóta útját használja. A sablon mentése és olvasása ingyenes. Az explicit indítás első hat hónapos AI-időszakot kér; költsége a normál AI-keretből származik, nem külön megkerülő generátor fut. Refused kvóta esetén a teljes új élet/ág/eredetkapcsolat visszagörgetődik. A tesztek izolált helyettesítőt használnak; termékben ez nem AI nélküli mód.

## API, verzió és adatkezelés

Minden új útvonal hitelesített és tulajdonosi. `SCENARIO_VERSIONS_ENABLED=false` az alap és a deploy minta; ez a jelenlegi előkészítő API-t zárja. Nyilvános olvasási végpont és scenario UI még nem készült.

| Útvonal | Művelet |
|---|---|
| `GET /api/v2/scenarios` | Saját sablonok aktuális verziói, legfeljebb 100 |
| `POST /api/v2/scenarios` | Új sablon: strict `{template}`, kötelező `Idempotency-Key` |
| `POST /api/v2/scenarios/:id/versions` | Új immutable verzió: `{expectedVersion,expectedHash,template}` és kéréskulcs |
| `GET /api/v2/scenario-versions/:id` | Saját pontos verzió és hash, régi verzió is visszaolvasható |
| `POST /api/v2/scenario-versions/:id/start` | `{templateHash,acknowledged:true}` és kéréskulcs → új privát élet/job |

Owner lock → scenario lock a módosítási sorrend. Ugyanazon kérés újraküldése ugyanazt az eredményt adja; eltérő tartalom ugyanazzal a kulccsal 409. Két konkurens verziómentésből egy nyer, a másik stale revisiont kap. Egy user legfeljebb száz sablont és sablononként száz verziót készíthet. Régi változat indítható a pontos régi hash explicit megerősítésével; egy új verzió nem írja át a korábbi életet.

A 017 additív migráció három saját RLS-táblát ad: `aw_scenarios`, `aw_scenario_versions`, `aw_scenario_starts`. A current-version pointer késleltetetten ellenőrzött FK-val létező verzióra kötött. Owner-composite FK-k és immutable version/start triggerek, anon/authenticated közvetlen jog tiltva. A verzióhoz kapcsolt saját indulás belső provenance, nem public attribution vagy Official engedély. Fiókexport tartalmazza mindhárom táblát; fióktörlés cascade-takarítja. Régi, még 017 nélküli adatbázison az opcionális export kompatibilis marad.

Öt új, kódból exportált JSON-séma: 57 összesen; a korábbi 52 és 001–016 byte szerint változatlan. Fejlesztői Supabase: 001–017 alkalmazva és ismételve; 19 `ff_`, 39 `aw_`, mind a 39 RLS, verified TLS.

## Ellenőrzés és költség

A teljes helyi `pnpm check` sikeres: 354 teszt/30 fájl, formázás, típusellenőrzés, API/worker/Next production build. Tizennyolc új regresszió: zárt DTO, fresh-ID és referenciakonzisztencia, kontakt/belső referencia preflight, locale, dátum/kemény korlát/lejárat, immutable verzió, idempotencia, ownership/anon, consent/default-off, exact hash/ack, közös kvóta és rollback, három privát technikai időszak, export/cascade és RLS.

Két valódi szintetikus Supabase Auth-fiókos, verified TLS HTTP-próba is sikeres: saját létrehozás/replay, másik fiók 404 és anon 401, új verzió/régi visszaolvasás, egyszeri privát start, három technikai időszak, célok/tulajdon és sablon változatlansága, saját export. Mindkét Auth- és DB-fiók ténylegesen törölve. A folyamat csak izolált technikai AI-helyettesítőt használt; nem új generatív minőségmérés vagy Official seed.

Ebben a szeletben új OpenAI/Claude-hívás nincs. A kumulatív OpenAI guard 2.433873375 USD, maradék 2.566126625 USD; Claude guard 2.338015 USD, maradék 2.661985 USD. Az 5–5 USD keret és a régi ismeretlen Claude-foglalások megmaradnak.

## Következő kapu

Ez saját fiókon belüli előkészítés: `status=awaiting_review`, `publicationApproved=false`. A determinisztikus kontakt/UUID preflight nem teljes anonimizálás, tartalmi/nyelvi vizsgálat vagy jóváhagyás. Név, harmadik személy, érzékeny tény és visszaazonosíthatóság teljes review-ja kiadás előtt szükséges. A meglévő text-only curator eredménye erre az új strukturált sablonra nem érvényes.

Következő a külön sanitized, futtatható döntési fork-checkpoint, majd a teljes strukturált Privacy/Content Preview és új teljes-scope review, Publication/Confirm/Official eredetengedély, kis valódi AI seed. A 006 coarse scenario draft és `readyForFork=false` változatlan; nem lesz csendesen futtatható checkpoint. P10–P13, a 50–100 Official Life/20–30 Scenario cél, S3 retention/S4–S7, backup/restore/email és Contabo/Cloudflare élesítési kapuk megmaradnak. Ebben a szeletben éles telepítés, DNS/TLS-aktiválás és production allowance nincs.
