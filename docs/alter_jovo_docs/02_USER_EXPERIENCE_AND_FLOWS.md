# alterward — UX és felhasználói folyamatok

**Aktuális állapot (2026-10-04):** P01–P05 privát v2 mag kész; valódi Auth/AI HTTP- és böngészős próba, export, Auth/DB-törlés és kontrollált megszakításból recovery sikeres. P07 új angol minta Sonnet auditja és P08 privát feedback/session-mérés kész; használói minőség kiadás után mérendő. Kizárólag angol indulás, magyar elrejtve. P09 tulajdonosi előnézeti alap, AI-pre-screen és szerkeszthető privát Privacy/Content Preview kész; fizetett scan-job, publishing/Discovery/Official seed/public fork tervezett. [Közös státusz és bizonyíték](../STATUS_HU.md), [indulási döntés](../ENGLISH_RELEASE_PLAN_HU.md). [Contabo-előkészítés](../CONTABO_PREPARATION_REPORT_HU.md) és teljes izolált web/API/worker/proxy CI sikeres; éles deploy, backup/restore, valós DB-kiesésből recovery és email-kézbesítés még nyitott.

**Shared állapot:** S0–S2 és S3 személyes/time/Connections/safety/privacy implementált; teljes kétfiókos Auth/Shared AI/saját AI/export/törlés/recovery sikeres. 001–013 alkalmazva, normál Shared flag-ek false. Nyers/backup-retention, régi személyes próza, billing/grace/deadline és friend release még kapu; P09–P13 és S4–S7 megmarad. [Aktuális bizonyíték](../SHARED_CONTEXT_S3_PRIVACY_AUTH_REPORT_HU.md).

2026-10-05 · A v2 privát folyamat integrált; az alábbi public folyamatok tervezettek. A korábbi kétnyelvű alap elkészült; az aktív termék UI és AI-története kizárólag angol. [Lokalizáció](../LOCALIZATION_HU.md).

## Első saját élet

Új élet → saját/alternatív identitás → 10–15 rövid kérdés és egy fő cél → induló helyzet/korlátok előnézete és jóváhagyása → valódi AI-job → első rövid fejezet/idővonal → nyitott döntés → választás → ugyanazon élet következő időszaka.

A profil célzott ideje 3–4 perc, az első olvasás/döntés körülbelül tíz percen belül célzott élmény. Ez használati teszttel mérendő, nem vállalt SLA. Menthető draft és revision akadályozza meg a két eszköz közötti csendes felülírást. A részletesség nem „jövőpontosság”. Nincs kötelező két kapcsolat vagy teljes személyiségskála.

## Visszatérés és elágazás

A kezdőnézet mentett életeket, utolsó állapotot és függő döntést mutat. **Folytatom ezt az életet:** az aktuális ág headjéből induló új időszak. Függő döntésnél előbb választani kell. **Másik ág innen:** történeti döntés előtti checkpoint és másik választás új ágat ad; a szülő megmarad. Újratöltés és későbbi bejelentkezés visszaállítja a mentett helyzetet.

A v1 `resolve` jelenleg minden választásból gyermekágat készít, tízéves baseline mellett. A két új művelet /api/v2 szerződést kapott, nem nevezzük át a meglévő viselkedést folytatásnak.

## Generálás és olvasás

Valódi jobstage/status látszik, frissítés után visszaolvasható. Hiba biztonságos, jelenleg kizárólag angolul jelenik meg; kvóta- vagy konfigurációs hiba nem ad helyettesítő személyes történetet. Nincs hamis százalékos készültség, automatikus korlátlan retry vagy mesterséges várakoztatás. Story, timeline, állapot és döntés együtt segíti a következmények megértését.

Az UI angol alap, elrejtett nyelvválasztóval. Új élet kizárólag angolul készül, későbbi saját ágai a rögzített tartalomnyelvet öröklik. Nyelvváltás nem töröl választ, nem fordítja át a régi canont, nem indít AI-hívást. Több nyelv csak teljes katalógussal és minőségi próbával kerülhet a választóba.

## Discoveryből saját élet

Discovery/kategória/nyelvi szűrő → Official vagy Community életoldal → történet/idővonal/mérföldkövek/döntések → Save, Share, Report vagy **Fork this life**. Save/fork hitelesítést igényel; public olvasás nem. **Start from this decision:** választás előtti sanitized checkpoint. **Personalize scenario:** sablon + saját jóváhagyott profil/cél/korlát, új privát kezdőállapot. A másik szerző privát memóriája és előzménye nem kerül át.

## Publikálás és visszavonás

Élet/ág/időszak kiválasztása → public/unlisted, szerző és indexelés beállítása → PII/tartalmi vizsgálat → **Privacy Preview** → **Content Preview** → a látott hash/revision/scanverzió explicit Confirmja. Módosult vagy lejárt preview új ellenőrzést igényel. Privát folytatás nem frissíti automatikusan a kiadást.

Unlisted titkos link csak snapshotot ad, Discovery/SEO nélkül. Unpublish megszünteti az új olvasást/forkot és a saját cache/index/OG hozzáférést; a privát élet megmarad. A részletes [nyilvános terv](../PUBLIC_CONTENT_IMPLEMENTATION_PLAN_HU.md) az elfogadás alapja.

Reszponzív web indul; natív mobil, értesítések, chat/DM, reakció/követés/komment későbbi, méréssel indokolt bővítés. A választási opciók nem „helyes” életvezetési válaszok.

## Connections és Shared döntés — tervezett UX

S3-ban angol Connections dashboard és context-idővonal készül. Saját ág → secure invite → másik fiók saját ág/tier/idő/privacy ellenőrzése → explicit accept → valódi Shared AI → saját intent → lezárás → saját AI-folytatásban hatás. Mások válasza lezárásig rejtett; pending impact jelzés, leave/archive/report/block. Romantic invite önmagában nem kapcsolat. Nincs AI nélküli friend demo és nincs chat.

[Shared integráció és elfogadások](../SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) · [Változatlan forrás](../plans/README.md).


## Shared S3: Connections és biztonság — 2026-10-05

Angol Connections, block/report/moderáció és 011/012 elkészült; ezek dátumozott korábbi bizonyítéka megmarad. A későbbi privacy/Auth szelet felülírja az akkori „megjelenítési döntés/full Auth még hiányzik” státuszt: S0–S2 és S3 személyes/time/Connections/safety/privacy implementált; teljes kétfiókos Auth/Shared AI/saját AI/export/törlés/recovery sikeres. 001–013 alkalmazva, normál Shared flag-ek false. Nyers/backup-retention, régi személyes próza, billing/grace/deadline és friend release még kapu; P09–P13 és S4–S7 megmarad. A felhasználó az érintett közös szöveg elrejtését, a dátum és eredmény megtartását választotta. Új 013 stale-input cancellation és explicit friss retry; a P09 előnézet külön Shared privacy review-t kér. [Részletes megvalósítás, költség és korlát](../SHARED_CONTEXT_S3_PRIVACY_AUTH_REPORT_HU.md).


## 2026-10-05: szerkeszthető privát Privacy/Content Preview

A [privát angol szerkesztő](../PUBLIC_PREVIEW_EDITOR_REPORT_HU.md) elkészült: saját forrásszöveg, mezőszintű ingyenes preflight, idempotens immutable mentés, legutóbbi érvényes copy visszatöltése és teljes mentett tartalomnézet. Az operatori AI-review csak a megfelelő hash/revision és mezőkészlet mellett látható; finding a javítandó mezőre mutat. Mentés/olvasás nem hív AI-t, Shared-előzmény és HU továbbra tiltott. Helyi teljes check: 314 teszt/27 fájl, 48 séma, a korábbi 44 és 001–014 változatlan. Következő a külön fizetett scan-job költségőrrel, curator/ScenarioVersion/sanitized fork-checkpoint/Publication/Confirm; majd P10–P13. Éles bekötés továbbra nincs.


## 2026-10-05: P09 review-job integráció

A felületről indítható P09 fizetett AI-review elkészült: explicit hozzájárulás, tartós queue/lease, egy attempt/immutable copy, közös projekt/user költségőr, egy pending job/user és gördülő napi kvóta. Újraolvasás/dupla kérés ingyenes, elveszett lease és provider-hiba nem indít automatikus fizetett retryt. 015 alkalmazva/ismételve a fejlesztői DB-n; English/Shared/tulajdonosi/hash/revision kapu és export/törlés integrált. Main CI sikeres: 324 teszt/28 fájl, 50 séma; a korábbi 48 és 001–014 változatlan. A normál feature false, éles allowance 0; publicationApproved false. Következő curator/ScenarioVersion/sanitized fork-checkpoint/Publication/Confirm/Official seed, majd P10–P13; S3 retention, S4–S7 és Contabo/Cloudflare élesítés megmarad. [Aktuális riport](../PUBLIC_REVIEW_JOB_REPORT_HU.md).


## 2026-10-05: P09 text-curation állapot

A P09 tulajdonosi beküldés és trusted text-curation nyilvántartás elkészült: explicit consent, aktuális immutable copy és no_findings AI-review, idempotens beküldés, védett operatori lista/döntésfájl, egyszeri változatlan döntés, English/Shared/ownership/revision/hash/expiry/törlés kapu, export/cascade és 016 RLS-migráció. Scope text_only, publicationApproved false. Teljes ScenarioVersion/sanitized fork-checkpoint és azok ellenőrzése, Publication/Confirm/Official eredetengedély/seed még hátravan; majd P10–P13. 52 séma, a korábbi 50 és 001–015 változatlan; fejlesztői DB 001–016 alkalmazva/ismételve, 19 ff_ és 36 aw_/36 RLS. Új AI-hívás nincs; a közös OpenAI/Claude keretek, S3 retention/S4–S7 és Contabo/Cloudflare kapuk megmaradnak. [Aktuális riport](../PUBLIC_TEXT_CURATION_REPORT_HU.md).
