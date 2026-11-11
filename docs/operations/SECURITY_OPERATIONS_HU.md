---
status: canonical
owner: operations
last_reviewed: 2026-11-01
related:
  - ../PRIVACY_SECURITY_CATALOG_HU.md
  - ../WRITER_FENCE_TRANSPORT_HU.md
  - DEPLOYMENT_HU.md
  - RECOVERY_HU.md
---

# Security operations

## 1. Operátori alapelv

Security/privacy műveletek fail-closed módon működnek. Ismeretlen authority, hiányzó proof vagy hibás health esetén a feature/szolgáltatás nem nyílik ki automatikusan.

### Meghívásos személyes éles hozzáférés — fejlesztési határ, 2026-11-01

Az [ADR-011](../decisions/ADR-011-invitation-service-access.md) szerinti első kódszelet különválasztja a hitelesített Cloudflare-identitást és az alkalmazás-admissiont. A tiszta service-policy külön kezeli a meghívás/nyílt módot, az új generálás és Checkout szünetét; lookup-hiba vagy hibás snapshot zárt. A kupon, a fejezetledger és az USD-budget ettől független. Saját user_metadata vagy aláíratlan email-header nem jogosultság.

A runtime-integráció még nincs kész: a jelenlegi statikus kapu és 11-es címlimit megmarad. A következő tartós store/migráció/privacy-recovery, API/web és operátori szeleteknek együtt kell megőrizniük az Auth/ownership/reauth, data-control és writer-fence védelmeket. Az új tiszta policy nem állítja le önmagában a workert, nem nyitja meg a regisztrációt, és nem váltja ki a későbbi éles auditot vagy aktiválási engedélyt.

### Fizetős személyes generálás határa — main, #138/#139

Az API közös Auth-guardja enforce módban az ellenőrzött handler szerveroldali `ChapterBilledGeneration` metadata-ját igényli a generálási műveleteknél. Kliensbody, útvonalszöveg vagy user_metadata nem állítja ezt. A meglévő béta-admission és a személyes foglalás/fogyasztás továbbra külön kapu. Az ismeretlenül jelölt generálás zárt; a v1/Shared/review sorokat a tényleges worker nem claimeli ebben a módban. A sorok nem törlődnek és nem válnak személyes fejezetté. Aktiválás előtt az érintett régi függő munkákat külön ellenőrizni kell; a kapcsoló önmagában nem rendezi el őket. A folyamatos szolgáltatói USD-budget/pause, a tartós admission és a mért kiadás még külön feladat.

### Személyes provider-dispatch — fejlesztési jelölt, #140

Enforcement mellett a foglalás, paid grant és subscription projection egy SQL-snapshotból olvasható, aktív fiókhoz és tényleges futó job/élő lease-hez kötve. Hiányzó, idegen, feloldott vagy elfogyasztott foglalás zárt; refund/revocation/reconcile új kérést tilt. A korábbi béta explicit mentessége az API-éval azonos, nem származhat kuponból vagy a külön USD-budget ügyféllistájából, és csak az eredeti tesztelői ablak végéig (2026-11-28 01:17:38 CET, kizárólagos) él: minden fizikai kérés előtt az adatbázis órájával újraellenőrzött, hibás óra esetén zárt. Új USD-időszak nem hosszabbítja. Enforcement OFF esetén az új billing-ellenőrzés lekérdezés nélküli no-op.

A valódi provider-wrapper minden alkalmazásszintű retry előtt újra ellenőriz. A második ellenőrzés az USD-budget előfoglalása után történik, így az annak várakozása alatt megváltozott jogosultság vagy lejárt lease sem jut új szolgáltatói kéréshez. Az összeillesztett guard ekkor a már ismerten fel nem használt USD-ticketet nulla tokennel rendezi; a finanszírozott próbálkozás metaadatai és a nulla költségű ticket megmaradnak. Nem a teljes attempt-történet nullázódik. A már elindult kérés visszamenőleges megszakítása nem garantált; ez nem globális, azonnali pause.

Az ellenőrzés nem módosít ledger-/költséglimitet és nem váltja ki a writer/privacy védelmeket. A már kész kimenet durabilis mentése és a reserved/released foglalás fogyasztása változatlan. A retry a PostgreSQL által visszaadott kanonikus jobazonosítóra foglal; régi, nem kanonikus kulcsok aktiválás előtti egyeztetése külön kontroll, nincs automatikus átírás/reset. A tartós service-policy/admission még nincs runtime-ba kötve, ennek pause/resume kapuja külön feladat.

## 2. Fő védelmi rétegek

- Cloudflare Access és origin boundary;
- külön web/API/worker secret scope;
- TLS verify-full a DB felé;
- root-only operátori fájlok és SSH host pin;
- privacy acknowledgement és account-state check;
- DB grants/RLS/catalog verification;
- writer fence recovery alatt;
- budget/rate-limit/entitlement fail-closed;
- encrypted backup és külön recovery identity;
- külső availability/private monitor.

## 3. Secret policy

Tilos:

- secretet Gitbe tenni;
- browser `NEXT_PUBLIC_*` változóba admin/DB/AI kulcsot adni;
- provider kulcsot reportba/logba másolni;
- recovery identityt backup archívummal azonos trust boundaryn tárolni;
- TLS ellenőrzést convenience miatt kikapcsolni.

## 4. Security change gate

Jogosultság, privacy, recovery vagy exposure változtatásnál minimum:

1. canonical security/privacy hatás leírva;
2. célzott regressziós teszt;
3. teljes CI;
4. ha runtime/ops érintett, izolált fixture/rehearsal;
5. rollback/emergency-disable út ellenőrizve;
6. secret-free proof.

## 5. Writer fence

Recovery/authority bizonytalanság alatt:

- writers stop/fence;
- queue/lease/idegen writer állapot ellenőrzendő;
- fence feloldása csak valid post-check után;
- eltérés esetén zárva marad.

## 6. Monitoring

A monitor feladata detektálás, nem vak automatikus recovery.

Különösen:

- availability;
- private service health;
- backup/retention állapot;
- félbeszakadt personal beta transition;
- unexpected exposure/config drift.

Riasztás után az aktív runbook szerint kell eljárni.

## 7. Account data controls

Export, delete, revoke és biztonsági/lifecycle kontrollok nem függhetnek AI elérhetőségtől. Fizetési downgrade nem teheti elérhetetlenné a szükséges adatkontroll műveleteket; ilyen kódállapot release-riskként kezelendő.

## 8. Történeti security reportok

Audit/report csak azt bizonyítja, hogy egy adott source/state mellett egy adott ellenőrzés sikerült. Új deploy/migration/authority változás után a releváns ellenőrzést meg kell ismételni; régi report nem globális garancia.

## 9. Access rights és onboarding útvonalhatár

A saját export/delete rights edge-kivétel nem fedheti el a védett onboarding hozzájárulást. A `/api/v1/me` public destination leszármazottakat is érinthet; az apex és www `/api/v1/me/consent` útvonalait ugyanazon fő béta-alkalmazás specifikus destinationjeivel kell védeni, megőrizve annak AUD-ját és Allow policyját. Az origin assertion-, method-, ownership- és friss-auth ellenőrzése változatlan. A konkrét konfiguráció, readback, utópróba és rollback: [Cloudflare Access runbook](../CLOUDFLARE_ACCESS_CONFIGURATION_HU.md#onboarding-consent-útvonal-ütközésének-javítása--2026-10-13).

## Meghívásos runtime profil — #146, fejlesztési határ

SERVICE_ACCESS_ENFORCEMENT alapból false. Az új profilhoz ugyanazon reviewed source/image, minden web/API/worker folyamatban egyező flag, CLOSED_SITE_ENABLED=true + pinned issuer/AUD, fejezetelszámolás és frozen v9 szükséges. A legacy11-címes lista OFF profilban marad; a flag nem állítja át a Cloudflare policyt vagy a Supabase signupot. Aktív profilban a backend az Access-aláírást és a getUser által ellenőrzött email/UUID-t köti össze, majd friss szerver-registryt kér. Metadata/email-header vagy kupon nem authority; identitás csak request-local Symbolban él.

Saját export/teljes fióktörlés/billing-management Auth/ownership/reauth útja admission- vagy registrykiesésben megmarad, a provider webhook aláírása külön kötelező. Új generálás/Checkout pause és visszavonás esetén költés előtt zárt; a kész eredmény elszámolása megmarad. A régi failed nem-v9 job újrapróbálása aktív profilban nem futhat gyengébb policyval. A három régi béta-fiók és a régi jobok átvezetése külön leltár/operátori jóváhagyás.

A production040, a tartós admission/pause/reconcile operátor és a tényleges provider-policy módosítás #142/I04 és I06 külön kapu. Ez nem éles aktiválás. Referencia: ADR-011; Cloudflare JWT validation és Supabase getUser aktuális hivatalos dokumentációja ellenőrizve2026-11-02.
