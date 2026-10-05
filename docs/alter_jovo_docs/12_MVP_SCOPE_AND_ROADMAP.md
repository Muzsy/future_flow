# alterward — MVP és roadmap

**Aktuális állapot (2026-10-04):** P01–P05 privát v2 mag kész; valódi Auth/AI HTTP- és böngészős próba, export, Auth/DB-törlés és kontrollált megszakításból recovery sikeres. P07 új angol minta Sonnet auditja és P08 privát feedback/session-mérés kész; használói minőség kiadás után mérendő. Kizárólag angol indulás, magyar elrejtve. P09 tulajdonosi előnézeti alap, AI-pre-screen és szerkeszthető privát Privacy/Content Preview kész; fizetett scan-job, publishing/Discovery/Official seed/public fork tervezett. [Közös státusz és bizonyíték](../STATUS_HU.md), [indulási döntés](../ENGLISH_RELEASE_PLAN_HU.md). [Contabo-előkészítés](../CONTABO_PREPARATION_REPORT_HU.md) és teljes izolált web/API/worker/proxy CI sikeres; éles deploy, backup/restore, valós DB-kiesésből recovery és email-kézbesítés még nyitott.

**Shared állapot:** S0–S2 és S3 személyes/time/Connections/safety/privacy implementált; teljes kétfiókos Auth/Shared AI/saját AI/export/törlés/recovery sikeres. 001–013 alkalmazva, normál Shared flag-ek false. Nyers/backup-retention, régi személyes próza, billing/grace/deadline és friend release még kapu; P09–P13 és S4–S7 megmarad. [Aktuális bizonyíték](../SHARED_CONTEXT_S3_PRIVACY_AUTH_REPORT_HU.md).

2026-10-05 · [Aktív termékterv](../PRODUCT_PLAN_HU.md) · [Backlog](../NEXT_STEPS.md) · [14 public MVP-elem](../REQUIREMENTS_TRACEABILITY_HU.md).

## Első igazolandó hurok

Rövid identitás/profil és cél → valódi AI-időszak → nyitott döntés → tartós következmény → ugyanazon ág következő időszaka → későbbi visszatérés → történeti másik ág. A kérdés, akarja-e a felhasználó folytatni ugyanazt az életet. V1 tízéves prototípus ehhez technikai alap, nem kész folytatható MVP.

## Fázisok

| Szakasz | Feladatok és kilépés |
|---|---|
| Nyelvi alap | L01 kész a v1/v2-ben; minden új funkció angol; magyar halasztva |
| Tartós személyes alap | P01–P05: v2 tárolás, rövid AI-period, választás/folytatás/fork, 10–15 kérdés, memória és alkalmazáskeret |
| Privát pilot kapu | P06–P08: valós fiókos három időszak/újrabelépés/export/törlés, automatikus/AI angol minőség, ops-kapuk és mérés; használói értékelés kiadás után |
| Official/public alap | P09: külön snapshot/checkpoint/Scenario és kis valódi AI-seed pilot |
| Discovery | P10: public életoldal, kategória/nyelvi szűrő, Save/Share/Report, moderáció és cache/permission |
| Community Publishing | P11: három láthatóság, két preview/Confirm, refresh/unpublish és public adatkezelés |
| Saját élet public forrásból | P12: Fork this life, Start from this decision, Personalize scenario |
| Nyilvános MVP kapu | P13: mind a 14 public elem, privacy/jogosultság és működő kurált kínálat, olvasás→saját élet teszt |
| Későbbi social/platform | Reakció/követés, később komment/szerző, creator sablon/analitika; fizetés/mobil külön |

A két stratégiai forrás eltérő fázisszámozását ez a sorrend egységesíti. A személyes core elsőbbsége megmarad, a közösségi forrás előrébb hozza a nyilvános induló réteget. A privát technikai/emberi pilot korábban is futhat; a nyilvános indulás teljes MVP-t kér.

## Induló paraméterek és kötelezők

Hat hónap alap, tizenkettő a szerződésben; 2–5 esemény/egy 250–600 szavas fejezet/egy nyitott utolsó döntés. 10–15 kérdés, egy fő cél, nulla kapcsolat és unknown adatok kezelése. Áganként egy job, revision/idempotencia/lease, múlt változatlan, saját profil nem íródik át. Export/törlés és privát működés ingyenes. Ezek visszafordítható UX-paraméterek, a biztonsági/integritási feltételek kötelezők.

A 20 determinisztikus eset ×3 időszak elkészült; négy korábbi valódi generatív lánc és az új angol béta-minta auditált. A generatív lefedettség további, kereten belüli bővítése minőségi cél; nem húsz már teljesített fizetett eset. Korlátozott angol béta és későbbi 20–50 használó célkohorsz, előre rögzített mérési definícióval. 50–100 Official Life és 20–30 Scenario összesített nyilvános tartalomcél, előbb kis mért pilot. A darabszámok nem engedélyeznek 5 USD-n túli automatikus generálást.

## Kimarad az első MVP-ből

Komment, DM/chat, követési gráf és reakció; creator payment/marketplace; billing; natív mobil; avatar/kép/hang/VR/real-time multiplayer; habit tracker/coaching/egészségplatform; több száz statisztika és komplex ML-ajánló. Szabad szöveges döntés/összetett compare és mély világmodellek a működő folytatás után. Az angol élmény kötelező; a magyar és további nyelvek halasztottak.

Ha a profilfrikció, általános történet, következményhiány vagy költség megállítja a folytatást, a személyes hurok javítása következik. Nincs még igazolt retenciós küszöb, fizetési arány, naptári release-dátum vagy üzleti eredmény.

## Új S0–S7 fejlesztési szál

S0 foundation → S1 friend determinisztikus izolált teszt → S2 valódi Shared AI → S3 személyes impact/AI-folytatás/Connections + privacy/deletion/moderation kapu → első friend béta. S4 romantic, S5 work/hobby, S6 sport fokozatos; S7 advanced később. A minimális social profile és entitlement S0 alap implementált, billing/ár még nyitott. P09–P13 és a 14 public MVP-elem megmarad. S0 implementált kikapcsolva, DB-alkalmazás és ismétlés sikeres; S1/S2 és S3 személyes backend/time implementált; S3 UI/privacy/release kapu nyitott, S4–S7 tervezett.

[Shared integráció és elfogadások](../SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) · [Változatlan forrás](../plans/README.md).


## S3 személyes integráció — 2026-10-05

Connections angol felület, block/report/moderáció, retained próza PII-redakció/retention és teljes valódi fiókos Shared→saját AI→export/törlés/recovery még S3 kapu. A határidő kiadási alapértéke és entitlement/billing külön döntés; üres deadline mindenkit megvár, 48h javaslat. Mind a négy Shared flag false, Contabo-élesítés később. [Részletes bizonyíték és korlátok](../SHARED_CONTEXT_S3_REPORT_HU.md).


## Shared S3: Connections és biztonság — 2026-10-05

Angol Connections, block/report/moderáció és 011/012 elkészült; ezek dátumozott korábbi bizonyítéka megmarad. A későbbi privacy/Auth szelet felülírja az akkori „megjelenítési döntés/full Auth még hiányzik” státuszt: S0–S2 és S3 személyes/time/Connections/safety/privacy implementált; teljes kétfiókos Auth/Shared AI/saját AI/export/törlés/recovery sikeres. 001–013 alkalmazva, normál Shared flag-ek false. Nyers/backup-retention, régi személyes próza, billing/grace/deadline és friend release még kapu; P09–P13 és S4–S7 megmarad. A felhasználó az érintett közös szöveg elrejtését, a dátum és eredmény megtartását választotta. Új 013 stale-input cancellation és explicit friss retry; a P09 előnézet külön Shared privacy review-t kér. [Részletes megvalósítás, költség és korlát](../SHARED_CONTEXT_S3_PRIVACY_AUTH_REPORT_HU.md).


## 2026-10-05: P09 privát AI-review

[P09 operatori pre-screen](../PUBLIC_AI_REVIEW_REPORT_HU.md): zárt angol copy, minimális problémakategória, 014 privát RLS-tábla, hash/revision/policy/receipt kötés és egyszeri futás. Saját olvasási API, account export/cascade törlés és régi DB-export kompatibilitás ellenőrzött; Shared-előzmény tiltva. 311 helyi teszt, 44 schema (42 korábbi változatlan), egy valódi Sol-negatív kontroll öt jelzéssel. A privát Privacy/Content Preview kész; fizetett scan-job, curator/Publication/Confirm és public release még külön kapu.


## 2026-10-05: szerkeszthető privát Privacy/Content Preview

A [privát angol szerkesztő](../PUBLIC_PREVIEW_EDITOR_REPORT_HU.md) elkészült: saját forrásszöveg, mezőszintű ingyenes preflight, idempotens immutable mentés, legutóbbi érvényes copy visszatöltése és teljes mentett tartalomnézet. Az operatori AI-review csak a megfelelő hash/revision és mezőkészlet mellett látható; finding a javítandó mezőre mutat. Mentés/olvasás nem hív AI-t, Shared-előzmény és HU továbbra tiltott. Helyi teljes check: 314 teszt/27 fájl, 48 séma, a korábbi 44 és 001–014 változatlan. Következő a külön fizetett scan-job költségőrrel, curator/ScenarioVersion/sanitized fork-checkpoint/Publication/Confirm; majd P10–P13. Éles bekötés továbbra nincs.


## 2026-10-05: P09 review-job integráció

A felületről indítható P09 fizetett AI-review elkészült: explicit hozzájárulás, tartós queue/lease, egy attempt/immutable copy, közös projekt/user költségőr, egy pending job/user és gördülő napi kvóta. Újraolvasás/dupla kérés ingyenes, elveszett lease és provider-hiba nem indít automatikus fizetett retryt. 015 alkalmazva/ismételve a fejlesztői DB-n; English/Shared/tulajdonosi/hash/revision kapu és export/törlés integrált. Helyi teljes check: 323 teszt/28 fájl, 50 séma; a korábbi 48 és 001–014 változatlan. A normál feature false, éles allowance 0; publicationApproved false. Következő curator/ScenarioVersion/sanitized fork-checkpoint/Publication/Confirm/Official seed, majd P10–P13; S3 retention, S4–S7 és Contabo/Cloudflare élesítés megmarad. [Aktuális riport](../PUBLIC_REVIEW_JOB_REPORT_HU.md).
