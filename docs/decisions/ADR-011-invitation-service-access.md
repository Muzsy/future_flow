---
status: canonical
owner: architecture
last_reviewed: 2026-11-01
related:
  - ../DEVELOPMENT_PLAN_HU.md
  - ../product/PRODUCT_HU.md
  - ../product/MONETIZATION_HU.md
  - ../operations/SECURITY_OPERATIONS_HU.md
  - ADR-010-payment-data-and-responsibility-boundaries.md
---

# ADR-011 — Meghívásos személyes szolgáltatás hozzáférési határai

**Status:** Proposed — implementációs szerződés; éles aktiválást nem engedélyez.  
**Date:** 2026-11-01

## Kontextus

A tulajdonos végleges működésű személyes éles szolgáltatást kért, először tíz új meghívottal, majd további tízfős csoportokkal (#131/#132, I01–I07). A meglévő háromfős funded béta ablakát, történeteit és költését meg kell őrizni. A mai Cloudflare-origin kapu statikus, legfeljebb 11 email-címre korlátozott; ezt a `packages/access` kódja szabja meg, nem a Cloudflare szolgáltatói limitje. Három meglévő és tíz új fiók együtt már nem fér ebbe a formába. A kuponlista és a fejezetledger nem meghívási nyilvántartás.

A meglévő backend a Supabase `getUser(token)` eredményével igazolja a nem anonim felhasználót. A web és az API külön Cloudflare Access aláírást ellenőriz. A későbbi tartós admissionnek mindkét határt, a saját adatokhoz való jogot és a pénzügyi elszámolást meg kell őriznie. Az eleven vagy lejárt béta-window nem használható csoportonként új termékjogosultságként.

## Javasolt döntés

1. **Négy külön authority.** A szolgáltatás-admission, az induló kupon, a fejezetledger és az USD-budget külön marad. Meghívás nem ad kupont vagy korlátlan generálást. Új csoport, új belépés vagy új konfiguráció nem nulláz könyvelést és nem újítja meg az ízelítőt. A régi béta-fiókok átvezetése külön megőrzési terv; az új ügyfelek nem kerülnek a fejezetszámlálás alól mentes listára.
2. **Szerver által birtokolt policy.** A szolgáltatás policy-ja verziózott, pozitív revíziójú snapshot: `version`, `revision`, `mode: invitation|open`, `generationEnabled`, `checkoutEnabled`. A tartós regiszter fiókazonosítóhoz kötött `active|revoked` admissiont és revíziót ad. A policy ismeretlen, hiányzó vagy hibás állapota zárt. A lookup `not-found` és `unavailable` külön eredmény; adatbázishiba nyílt módban sem válik jogosultsággá. A tároló a #137 fejlesztési szeletében készül; az operátori és runtime-bekötés külön következik.
3. **Hitelesítés és belépési engedély külön.** A `createAccessIdentityVerifier` kizárólag a szerveroldalon rögzített Cloudflare issuer/audience és az ahhoz tartozó kulcsok alapján ad ellenőrzött subject/email/lejárat eredményt. Ez még nem meghívás. A JWT-ből vagy kérésből kapott `jku`, issuer-URL, email-header, saját `user_metadata` vagy kupon nem jogosultság. Az API saját ellenőrzött Supabase-fiókot és tartós admissiont igényel; a két identitás biztonságos kötése a runtime-integráció része.
4. **Visszavonás és nyitás.** Meghívásos módban a nem listázott felhasználó elutasított. Nyílt módban az ellenőrzött, nem listázott fiók beléphet, de a kifejezett visszavonás érvényes marad. Hiányzó vagy másik felhasználóhoz tartozó snapshot nem enged be. Az `open` modell nem kapcsolja be a Supabase signupot, nem módosít Cloudflare-policy-t, és nem aktív env-kapcsoló; ezek későbbi, külön igazolt műveletek.
5. **Szüneteltetés nem paywall-kikapcsolás.** A generálás és az új Checkout külön szüneteltethető. A szokásos teljes költségstop mindkettőt atomikusan leállítja a későbbi operátori műveletben. A meglévő fejezetek olvasása a jogosult fióknak nem függ fizetéstől. A foglalás lezárása, webhook/reconcile és lemondás nem kapcsolható ki hallgatólagosan; a már megkezdett munkák tartós mentése/elszámolása rendezendő. A runtime-nak a queue és a worker indulási határán is kezelnie kell a pause-versenyt; a tiszta függvény önmagában nem tranzakciós fence.
6. **Adatkontroll megmarad.** Az autentikált export/törlés/account-control jogosultsági út nem függ új admissiontől vagy a policy elérhetőségétől. A hívó továbbra is ellenőrzi az Auth-állapotot, ownershipöt, friss belépést, törlési/billing és writer-fence szabályokat. Az itt adott `allowed` nem kerüli meg ezeket, és nem garantál adatbázis-elérhetőséget kieséskor. Admission-visszavonás vagy sikertelen fizetés nem töröl történetet.

## Implementált első szelet

- `packages/core/src/service-access.ts`: tiszta snapshot-validáció és döntési függvény olvasás/generálás/Checkout/adatkontroll műveletekre; nincs I/O, env-kapcsoló, költség- vagy fejezetmódosítás.
- `packages/access`: az identitás-ellenőrző kinyerve; a mai `createClosedSiteGate` továbbra ugyanehhez az ellenőrzéshez a statikus email-listát kéri. A 11-es legacy korlát, a mai publikus jogi/adatkontroll kivételek és a default-off viselkedés megmaradnak.
- Célzott tesztek: nem meghívott, visszavonás nyílt módban, hibás/felcserélt snapshot, metadata/kupon nem helyettesít admissiont, külön pause-ok, adatkontroll-kiesési út, valódi RSA-aláírások, rögzített kulcsforrás, rossz issuer/audience/idő/identitás, legacy kapu.

Ez **nem kész I01/I04**, és nem tesz tizenhárom embert beengedhetővé a mostani éles konfigurációban. Az alkalmazás még nem használja az új policy-t. Az első szelet nem hozott létre új signupot, táblát, meghívó emailt vagy éles konfigurációt. A következő fejlesztési tárolószeletet az alábbi külön szerződés írja le.

## Tartós tároló és recovery-alap — #137, fejlesztés alatt

A `040_service_access_registry.sql` a singleton `aw_service_policy` és az `ff_users` UUID-gyökérhez cascade-del kötött `aw_service_admissions` táblát adja. Nem tárol emailt, JWT-t, kupont vagy kliensmetadata-másolatot; nincs seed vagy automatikus régi admission. RLS aktív, PUBLIC/anon/authenticated jog nincs. A `ServiceAccessRepository` kizárólag szerveroldali primitív; nem Auth-ellenőrző, meghívó vagy operátori felhatalmazás. A policy/admission szigorúan validált, pozitív safe-integer revíziójú; expectedRevision=0 csak létrehozás, pozitív érték csak azonos revízió frissítése. A konkurens stale írás konfliktus. Az admission író zárolja az aktív fiókgyökeret; törlés alatt nincs feltámasztás. A snapshot egy SQL-olvasásból áll, hiányzó policy/fiók, DB-hiba vagy reconcile-hiány nem ad jogot. Saját export csak saját admissiont tartalmaz; a globális policy nem személyes export.

A `reconcile_required` nem a felhasználó szünetkapcsolója. Natív040 replay true-ra állítja, ezért egy régebbi backup nem éleszthet fel későbbi visszavonást/pause-t. Normál policy-CAS sem törli. Újranyitás csak későbbi, külön bizonyított reconcile-operátorral történhet. Az account-control kivétel és a független billing-reconcile megmarad.

A recovery profilok explicit `historical039` és `registry040`, nincs automatikus DB-alapú visszaesés. A régi operátori capture/replay alapértelmezése továbbra039;040 csak külön kért profillal. A külön039→040 könyvtári bridge tényleges039 replay/független ellenőrzés után megőrzi mind a100 régi táblát és39 eredeti migration-receiptet,040-et atomikusan alkalmazza, majd csak olvasó040 verifierrel újra ellenőrzi az eredeti privacy-követelményeket és az üres új registryt. A040 executor context.sourceCommit/imageId és az eredeti root-held capture/replay fence envelope.sourceCommit külön provenance; mindkettő az intenthez kötött, eltérhetnek, egyik sem írható át utólag. A production-hívó mindkét tényleges forráskötést külön igazolja, a hash formátuma önmagában nem attesztáció. A privilegizált hívónak az intentet a migráció előtt tartósan meg kell őriznie; elveszett válasznál nincs vak SQL-ismétlés. A szintetikus image-fixture nem production-intent tároló vagy operátori audit.

A v1 funded-runtime és a régi038→039 protokoll változatlan. A v2 új capability, teljes billing- és receipt-hash és szigorú migráció-összevetés. Production040 successor/Daily/config és a fennálló fence-hez kötött orchestration [#142](https://github.com/Muzsy/future_flow/issues/142) feladata; enélkül040 nem telepíthető. A teljes serving→jelölt diff, exact-source audit, CI, célgépes és éles felhatalmazás későbbi kapu.

## Web/API/worker runtime — #146, fejlesztési jelölt, 2026-11-02

A `SERVICE_ACCESS_ENFORCEMENT` szigorú true/false profilkapcsoló, alapból false. A Compose ugyanazt a runtime-értéket adja a web/API/worker szolgáltatásnak, web build-arg nélkül; az izolált deployment-preflight a false és true átadást is ellenőrzi, konténerindítás nélkül. OFF mellett a legacy statikus kapu és11-es limit változatlan. ON esetén CLOSED_SITE_ENABLED=true és rögzített Cloudflare issuer/AUD szükséges; a web csak a hitelesített pre-login alkalmazáshéjat engedi tovább. A legacy email-lista nem indul és nem admission-forrás. Az API minden nem kivételes kérésnél ellenőrzi az Access-aláírást, a Supabase `getUser` nem anonim UUID-ját és ellenőrzött emailjét, a két email egyezését és a registry aktuális read-jogát. A getUser eredményét csak az adott kérés belső Symbol-mezője hordozza; kliensheader/metadata nem állíthatja, admission nem kerül sessioncache-be. A route-guard generálásnál és Checkoutnál külön friss policy-akciót ellenőriz az alkalmazási írás előtt.

A saját export/teljes fióktörlés és meglévő billing status/portal külön account-control út marad: bearer/Auth/ownership/reauth, billing- és recovery-feltételeik megmaradnak, új admission vagy működő Access/registry nélkül is. A webhook változatlanul Stripe-aláírású. A tényleges Cloudflare útvonalkivételeket aktiváláskor külön kell ellenőrizni: saját export/törlés/status/portal csak a megfelelő backend Auth-védelemmel legyen elérhető; Checkout vagy általános API-prefix nem kaphat bypass-t. Az origin-szintű teszt nem bizonyít automatikusan edge-elérhetőséget. OPTIONS kizárólag a meglévő CORS preflight kezeléshez jut tovább, nem alkalmazási adathoz. Nem meghívott felhasználó normál kérésből nem kap új ff_users gyökeret vagy admissiont. A signup és a Cloudflare/Supabase konfiguráció változatlan.

Az új profil kötelezően a befagyasztott narrative-fiction-v2/v9-et és fejezetelszámolást használja. A `NarrativeConfig.accessMode=service-admission` a statikus kísérleti cohort helyett az ellenőrzött registryre épül; prompt, választásszám, policy és max-request nem változik. A belső personal Scenario/public-fork LifeRepository factoryk is ugyanezt a v9 alapot kapják az aktív profilban. Explicit legacy konfiguráció nem indíthat gyengébb új jobot; a régi nem-v9 failed job explicit retry-ja elutasított, adata/elszámolása megmarad. A történeti három fiók és régi failed/ready jobok átvezetése ezért aktiválás előtti külön I04 leltár, nem automatikus átírás. Read-only branch lookup nem válik fizetési műveletté.

A queue/retry a saját tranzakciójában friss admission/generation-pause ellenőrzést végez. A személyes worker minden új fizikai providerkérés előtt és az USD-foglalás után is újra ellenőriz; visszautasításkor az ismerten fel nem használt USD-jegyet a meglévő guard nulla használattal rendezi. Már kész eredmény mentése és chapter-consume változatlan, új ízelítő/kupon/keret nincs. Checkoutnál a user-billing-lock megszerzése után, ugyanazon BillingTx kapcsolaton történik az utolsó policy-check; hiányzó hook zártan megáll, második poolkapcsolatot nem foglal.

Ez a forrás nem aktivál éles profilt, nem hív Auth-invite-ot, nem küld emailt és nem enged fizetős próbát. Az operátori admission/pause/reconcile, a három meglévő fiók jogmegőrző átvezetése, az összes szolgáltatás egyező profilja és a production040 release/Daily/recovery #142/I04 feltétele. A teljes meghívás→belépés→fizetett folytatás mért böngészős bizonyítéka I06 kapu; I01/I04/I06 marad PARTIAL.

## Következő integrációs szeletek és elfogadás

1. Tartós tároló és operátori műveletek: schema/migráció, RLS és anon/authenticated tiltás, privacy-katalógus/megőrzés/export/törlés, recovery-baseline, writer-fence és revízió/CAS együtt. Az adatminimalizált email/identitás-kötést még rögzíteni kell; a tartós regiszter nem lehet fiókmanipulációval írható.
2. API/web: minden elérhető alkalmazásút, a közvetlen Auth/API kérések és a pre-login kapu lefedése; nincs rövidre zárt „Cloudflare hitelesített = meghívott” vagy sessionben örökre tárolt admission. A Supabase önregisztráció zárt marad. A backend csak ellenőrzött provider-identitást használ; a saját adatkontroll kivételei nem bővülnek termék-API bypassra.
3. Operátori tartós működés: új csoport felvétele normál, ellenőrzött adatkezelés legyen image/env/új béta-window nélkül; policy/konfigurációváltás és pause/resume auditálható, forrás- és recovery-kapuhoz kötött. A mostani hétgyökeres lánc bővítése/kiváltása külön reviewed változás, nem tetszőleges fájl vagy baseline-őr megkerülése.
4. Célzott integrációs, race és mért böngészős bizonyíték, majd I06 szerint konkrét éles felhatalmazás. Az új modul nem lazítja a befagyasztott motor ellenőrzését: a későbbi kiadásban minden auth/billing kivétel pontos reviewed hash-hez kötendő.

## Források és határ

- [Cloudflare: Validate JWTs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/): ellenőrzött alkalmazástoken, issuer/audience és szerver által ismert kulcsforrás. A példákból token vagy személyes adat nem kerül a repóba.
- [Supabase: inviteUserByEmail](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail) és [Before User Created Hook](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook): a jövőbeli meghívásos Auth-folyamat tervezési forrásai, nem ebben a szeletben telepített hívások/hookok.
- A főág/CI, a célgépes source/image próba, az éles operátori audit és az aktiválás külön eredmény. Ez az ADR nem kiadási waiver és nem új költési engedély.
