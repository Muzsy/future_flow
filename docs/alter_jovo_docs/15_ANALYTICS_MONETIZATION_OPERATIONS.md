# alterward — mérés, monetizáció és üzemeltetés


**Aktuális megvalósítás:** P01–P05 privát v2 mag integrált; P06 valódi Auth/AI HTTP-próba és fióktörlés sikeres; backup/restore és valós DB-kiesésből recovery még nyitott. Indulás kizárólag angol, magyar elrejtve; P07 AI szerkesztői ellenőrzés, P08 éles béta és használói visszajelzés. [Legújabb felhasználói döntés](../ENGLISH_RELEASE_PLAN_HU.md). [V2 riport](../V2_IMPLEMENTATION_REPORT_HU.md), [státusz](../STATUS_HU.md). A [P09 privát előnézeti alapja](../PUBLIC_DRAFT_FOUNDATION_HU.md) is kész; a teljes közösségi/nyilvános rész továbbra tervezett.

2026-10-03 · A privát minimális mérés/összesítés kész; fizetés és public analitika tervezett. [Termékterv](../PRODUCT_PLAN_HU.md) · [Költség és státusz](../STATUS_HU.md).

## Elsődleges mérés

**Continuation Rate:** elsőfejezet-vég láthatósági jellel rendelkező gyökéréletek közül később sikeresen folytatottak aránya. A Folytatom kattintási szándék külön proxy. **Continued Life Sessions:** későbbi munkamenetben folytatott egyedi életek száma és külön sikeres folytatási session. A privát mérés szerveroldali 30 perces inaktivitási ablakot használ; sikeres commit és kattintás külön.

Onboarding indítás→első szimuláció; első fejezet megnyitás/befejezés; döntés megjelenés/sikeres mentés; történeti fork; D1/D7/D30 ugyanazon aktivált kohorszban. Kattintás/siker/késleltetés/hiba külön; technikai hiba nem tűnik el a nevezőből. Az [aktív terv](../PRODUCT_PLAN_HU.md) tartalmazza a kezdeti definíciókat. Nincs még validált számszerű retention-küszöb.

## Public funnel

Discovery aktív olvasó → életview → olvasási mélység/befejezés → Save/Share → sign-up → forkindítás → saját élet létrehozása → első AI-időszak → későbbi folytatás. Publish/unlisted/unpublish/report/removal/referral külön. Paid conversion csak későbbi működő payment után. Hosszabb olvasás és egyszeri megnyitás nem ugyanaz.

Analitika minimális opaque ID/locale/feature/idő/error/eredmény. Nincs történet/cél/profil/prompt/kapcsolatnév/auth vagy unlisted token. Optional analytics/consent/retention véglegesítendő; dashboard nem privát profilböngésző. A történeti AI-run audit nem kész termékanalitika.

## Monetizációs irány

Ingyenes: privát működés, adathozzáférés/export és törlés; Discovery/Official/Community olvasás, Save, Share, Publish. Saját AI-generálás/fork/personalize korlátozható. Későbbi prémium: több aktív élet/generálás, mélyebb szimuláció, stílus és külön formázott narratív dokumentum. Adatjogok és privacy nem kerülnek paywall mögé. Pontos ár, ingyenes darabszám, billing provider és subscription nincs eldöntve vagy megvalósítva.

Nincs „fizess jobb jövőért”, félelem/sérülékenység alapú upsell, személyiségadat eladás vagy hitelképességi API. A hipotézist használat és egységköltség támaszthatja alá.

## Költség és ops

Mérendő event/story/check/summary/redaction task, token/price version, sikeres period/folytatás/public fork ára, P50/P95 és hibák/javítás/fallback költsége. Projekt/user keretfoglalás és concurrent reservation P05. A helyi single-process smoke-guard nem szolgáltatói hard spend limit, és nem teljes app budget.

Queue mélység, lease/heartbeat, provider/DB/auth hibák, invalid arány, latency és spend anomaly, deletion/revocation/cache hiba monitorozandó. Request/job/life ID supporthoz, tartalom nélkül. Staging/prod credential, mentés/visszaállítás, Auth-siker/DB-hiba helyreállítása, admin jogosultság/audit és incidensfelelős indulási feladat. Main commit nem deploy.

Official tartalom költsége előzetes kis v2 seedméréssel becsülendő. 50–100 élet/20–30 sablon nem jelent korlátlan paid futtatást. Már elköltött és megmaradt kísérleti keret egy helyen, a [státuszban](../STATUS_HU.md); régi riportok az akkori állapotot őrzik.

### 2026-10-04-i megvalósítási frissítés

[Privát béta-riport](../BETA_IMPLEMENTATION_REPORT_HU.md): valódi szintetikus Supabase/Auth/DB/OpenAI HTTP-hurok és teljes fióktörlés sikeres; 159 automatizált teszt. [007 feedback/session szerződés](../BETA_FEEDBACK_AND_METRICS_HU.md): privát űrlap, export/törlés, szerveroldali 30 perces session és sikeres folytatási kohorsz kész. Új angol minta Sonnet auditja rendben. [Contabo-előkészítés](../DEPLOYMENT_HU.md) kész, Linux CI-ben az image-build és production web healthcheck sikeres; teljes Compose/API/worker/Caddy és éles deploy még nincs; backup/restore és valós DB-kiesésből recovery nyitott. A public/community rész továbbra tervezett, a két stratégiai forrás változatlan.

### Contabo üzemeltetési audit

A [2026-10-04-i belső audit](../CONTABO_SERVER_AUDIT_HU.md) szerint a jelenlegi kapacitás korlátozott bétára megfelelőnek tűnik. Indulás előtt rendezendő: root/jelszavas SSH és megengedő helyi INPUT policy, a közös Caddy három lejárt tanúsítványa/egy kézfogási hibája, elkülönített alterward hálózat/route, függő reboot és csomagkarbantartás, külön külső/config/secret és Supabase mentés/restore. A meglévő alkalmazásspecifikus backup timerek sikeres státusza nem teljes VPS-restore bizonyíték. OpenAI/Auth hálózati TLS és a projekt CA-jával DB TLS rendben; valódi éles generálás és telepítés nem történt. A szerver módosítása külön üzemeltetési lépés, a kísérleti keretek változatlanok.
