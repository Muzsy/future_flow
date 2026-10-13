---
status: canonical
owner: operations
last_reviewed: 2026-10-12
related:
  - ../PRIVACY_SECURITY_CATALOG_HU.md
  - ../WRITER_FENCE_TRANSPORT_HU.md
  - DEPLOYMENT_HU.md
  - RECOVERY_HU.md
---

# Security operations

## 1. Operátori alapelv

Security/privacy műveletek fail-closed módon működnek. Ismeretlen authority, hiányzó proof vagy hibás health esetén a feature/szolgáltatás nem nyílik ki automatikusan.

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
