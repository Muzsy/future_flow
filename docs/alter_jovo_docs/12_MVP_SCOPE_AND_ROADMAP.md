# alterward — MVP és roadmap

**Aktuális állapot (2026-10-04):** P01–P05 privát v2 mag kész; valódi Auth/AI HTTP- és böngészős próba, export, Auth/DB-törlés és kontrollált megszakításból recovery sikeres. P07 új angol minta Sonnet auditja és P08 privát feedback/session-mérés kész; használói minőség kiadás után mérendő. Kizárólag angol indulás, magyar elrejtve. P09 tulajdonosi előnézeti alap kész, publishing/Discovery/Official seed/public fork tervezett. [Közös státusz és bizonyíték](../STATUS_HU.md), [indulási döntés](../ENGLISH_RELEASE_PLAN_HU.md). [Contabo-előkészítés](../CONTABO_PREPARATION_REPORT_HU.md) és teljes izolált web/API/worker/proxy CI sikeres; éles deploy, backup/restore, valós DB-kiesésből recovery és email-kézbesítés még nyitott.

**Új követelmény:** Shared Context S0–S7 tervezett, még nincs implementálva. [Integrációs terv](../SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md).

2026-10-04 · [Aktív termékterv](../PRODUCT_PLAN_HU.md) · [Backlog](../NEXT_STEPS.md) · [14 public MVP-elem](../REQUIREMENTS_TRACEABILITY_HU.md).

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

S0 foundation → S1 friend determinisztikus izolált teszt → S2 valódi Shared AI → S3 személyes impact/AI-folytatás/Connections + privacy/deletion/moderation kapu → első friend béta. S4 romantic, S5 work/hobby, S6 sport fokozatos; S7 advanced később. A minimális social profile és entitlement alap most terv, billing/ár még nyitott. P09–P13 és a 14 public MVP-elem megmarad. Minden S-pont tervezett, következő helyi szelet S0.

[Shared integráció és elfogadások](../SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) · [Változatlan forrás](../plans/README.md).
