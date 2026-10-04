# alterward — mérés, monetizáció és üzemeltetés

**Aktuális állapot (2026-10-04):** P01–P05 privát v2 mag kész; valódi Auth/AI HTTP- és böngészős próba, export, Auth/DB-törlés és kontrollált megszakításból recovery sikeres. P07 új angol minta Sonnet auditja és P08 privát feedback/session-mérés kész; használói minőség kiadás után mérendő. Kizárólag angol indulás, magyar elrejtve. P09 tulajdonosi előnézeti alap kész, publishing/Discovery/Official seed/public fork tervezett. [Közös státusz és bizonyíték](../STATUS_HU.md), [indulási döntés](../ENGLISH_RELEASE_PLAN_HU.md). [Contabo-előkészítés](../CONTABO_PREPARATION_REPORT_HU.md) és teljes izolált web/API/worker/proxy CI sikeres; éles deploy, backup/restore, valós DB-kiesésből recovery és email-kézbesítés még nyitott.

2026-10-04 · A privát minimális mérés/összesítés kész; fizetés és public analitika tervezett. [Termékterv](../PRODUCT_PLAN_HU.md) · [Költség és státusz](../STATUS_HU.md).

## Elsődleges mérés

**Continuation Rate:** elsőfejezet-vég láthatósági jellel rendelkező gyökéréletek közül később sikeresen folytatottak aránya. A Folytatom kattintási szándék külön proxy. **Continued Life Sessions:** későbbi munkamenetben folytatott egyedi életek száma és külön sikeres folytatási session. A privát mérés szerveroldali 30 perces inaktivitási ablakot használ; sikeres commit és kattintás külön.

Onboarding indítás→első szimuláció; első fejezet megnyitás/befejezés; döntés megjelenés/sikeres mentés; történeti fork; D1/D7/D30 ugyanazon aktivált kohorszban. Kattintás/siker/késleltetés/hiba külön; technikai hiba nem tűnik el a nevezőből. Az [aktív terv](../PRODUCT_PLAN_HU.md) tartalmazza a kezdeti definíciókat. A privát session/fejezetvég/folytatás összesítés működik; D1/D7/D30 kohorsz és public funnel még terv. Nincs validált számszerű retention-küszöb.

## Public funnel

Discovery aktív olvasó → életview → olvasási mélység/befejezés → Save/Share → sign-up → forkindítás → saját élet létrehozása → első AI-időszak → későbbi folytatás. Publish/unlisted/unpublish/report/removal/referral külön. Paid conversion csak későbbi működő payment után. Hosszabb olvasás és egyszeri megnyitás nem ugyanaz.

Analitika minimális opaque ID/locale/feature/idő/error/eredmény. Nincs történet/cél/profil/prompt/kapcsolatnév/auth vagy unlisted token. Optional analytics/consent/retention véglegesítendő; dashboard nem privát profilböngésző. A történeti AI-run audit nem kész termékanalitika.

## Monetizációs irány

Ingyenes: privát működés, adathozzáférés/export és törlés; Discovery/Official/Community olvasás, Save, Share, Publish. Saját AI-generálás/fork/personalize korlátozható. Későbbi prémium: több aktív élet/generálás, mélyebb szimuláció, stílus és külön formázott narratív dokumentum. Adatjogok és privacy nem kerülnek paywall mögé. Pontos ár, ingyenes darabszám, billing provider és subscription nincs eldöntve vagy megvalósítva.

Nincs „fizess jobb jövőért”, félelem/sérülékenység alapú upsell, személyiségadat eladás vagy hitelképességi API. A hipotézist használat és egységköltség támaszthatja alá.

## Költség és ops

Mérendő event/story/check/summary/redaction task, token/price version, sikeres period/folytatás/public fork ára, P50/P95 és hibák/javítás/fallback költsége. Projekt/user keretfoglalás és concurrent reservation P05-ben elkészült. A helyi single-process smoke-guard nem szolgáltatói hard spend limit, és nem teljes app budget.

Queue mélység, lease/heartbeat, provider/DB/auth hibák, invalid arány, latency és spend anomaly, deletion/revocation/cache hiba monitorozandó. Request/job/life ID supporthoz, tartalom nélkül. Staging/prod credential, mentés/visszaállítás, Auth-siker/DB-hiba helyreállítása, admin jogosultság/audit és incidensfelelős indulási feladat. Main commit nem deploy.

Official tartalom költsége előzetes kis v2 seedméréssel becsülendő. 50–100 élet/20–30 sablon nem jelent korlátlan paid futtatást. Már elköltött és megmaradt kísérleti keret egy helyen, a [státuszban](../STATUS_HU.md); régi riportok az akkori állapotot őrzik.

### Contabo üzemeltetési audit

A [2026-10-04-i belső audit](../CONTABO_SERVER_AUDIT_HU.md) szerint a jelenlegi kapacitás korlátozott bétára megfelelőnek tűnik. Az auditkori root/jelszavas SSH az alábbi végrehajtásban már szűkítve. Indulás előtt rendezendő: megengedő helyi INPUT policy, a közös Caddy három lejárt tanúsítványa/egy kézfogási hibája, elkülönített alterward hálózat/route, függő reboot és csomagkarbantartás, külön külső/config/secret és Supabase mentés/restore. A meglévő alkalmazásspecifikus backup timerek sikeres státusza nem teljes VPS-restore bizonyíték. OpenAI/Auth hálózati TLS és a projekt CA-jával DB TLS rendben; valódi éles generálás és telepítés nem történt. A szerver módosítása külön üzemeltetési lépés, a kísérleti keretek változatlanok.

[Engedélyezett folytatás](../CONTABO_PREPARATION_REPORT_HU.md): SSH-jelszavas tiltás és új kulcsos hozzáférés ellenőrzött, meglévő kulcs megmaradt. Konfiguráció/proxy-storage mentés készült, mind a 25 hash ellenőrzött; elkülönített erőforráskorlátos Contabo-csomag és közös proxy merge/adapt sikeres. TLS/storage/ACME javítás, tűzfal, teljes backup/restore és egyeztetett kernel-reboot továbbra nyitott; más alkalmazásokat nem indítottunk újra. [Teljes CI](https://github.com/Muzsy/future_flow/actions/runs/37194453326) sikeres: web/API/worker/proxy, izolált DB TLS/migrációk és üres worker-leállítás, valós adat és fizetett AI nélkül; 159 automatizált teszt és build is sikeres. Domain és külön éles AI-keret még nincs, deploy nem történt.
