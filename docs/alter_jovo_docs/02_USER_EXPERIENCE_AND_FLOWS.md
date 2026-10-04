# alterward — UX és felhasználói folyamatok


**Aktuális megvalósítás:** P01–P05 privát v2 mag integrált; P06 valódi Auth/AI HTTP-próba és fióktörlés sikeres; backup/restore és valós DB-kiesésből recovery még nyitott. Indulás kizárólag angol, magyar elrejtve; P07 AI szerkesztői ellenőrzés, P08 éles béta és használói visszajelzés. [Legújabb felhasználói döntés](../ENGLISH_RELEASE_PLAN_HU.md). [V2 riport](../V2_IMPLEMENTATION_REPORT_HU.md), [státusz](../STATUS_HU.md). A [P09 privát előnézeti alapja](../PUBLIC_DRAFT_FOUNDATION_HU.md) is kész; a teljes közösségi/nyilvános rész továbbra tervezett.

2026-10-03 · A v2 privát folyamat integrált; az alábbi public folyamatok tervezettek. A korábbi kétnyelvű alap elkészült; az aktív termék UI és AI-története kizárólag angol. [Lokalizáció](../LOCALIZATION_HU.md).

## Első saját élet

Új élet → saját/alternatív identitás → 10–15 rövid kérdés és egy fő cél → induló helyzet/korlátok előnézete és jóváhagyása → valódi AI-job → első rövid fejezet/idővonal → nyitott döntés → választás → ugyanazon élet következő időszaka.

A profil célzott ideje 3–4 perc, az első olvasás/döntés körülbelül tíz percen belül célzott élmény. Ez használati teszttel mérendő, nem vállalt SLA. Menthető draft és revision akadályozza meg a két eszköz közötti csendes felülírást. A részletesség nem „jövőpontosság”. Nincs kötelező két kapcsolat vagy teljes személyiségskála.

## Visszatérés és elágazás

A kezdőnézet mentett életeket, utolsó állapotot és függő döntést mutat. **Folytatom ezt az életet:** az aktuális ág headjéből induló új időszak. Függő döntésnél előbb választani kell. **Másik ág innen:** történeti döntés előtti checkpoint és másik választás új ágat ad; a szülő megmarad. Újratöltés és későbbi bejelentkezés visszaállítja a mentett helyzetet.

A v1 `resolve` jelenleg minden választásból gyermekágat készít, tízéves baseline mellett. A két új művelet /api/v2 szerződést kapott, nem nevezzük át a meglévő viselkedést folytatásnak.

## Generálás és olvasás

Valódi jobstage/status látszik, frissítés után visszaolvasható. Hiba biztonságos, a választott felületnyelven jelenik meg; kvóta- vagy konfigurációs hiba nem ad helyettesítő személyes történetet. Nincs hamis százalékos készültség, automatikus korlátlan retry vagy mesterséges várakoztatás. Story, timeline, állapot és döntés együtt segíti a következmények megértését.

Az UI angol alap, elrejtett nyelvválasztóval. Új élet kizárólag angolul készül, későbbi saját ágai a rögzített tartalomnyelvet öröklik. Nyelvváltás nem töröl választ, nem fordítja át a régi canont, nem indít AI-hívást. Több nyelv csak teljes katalógussal és minőségi próbával kerülhet a választóba.

## Discoveryből saját élet

Discovery/kategória/nyelvi szűrő → Official vagy Community életoldal → történet/idővonal/mérföldkövek/döntések → Save, Share, Report vagy **Fork this life**. Save/fork hitelesítést igényel; public olvasás nem. **Start from this decision:** választás előtti sanitized checkpoint. **Personalize scenario:** sablon + saját jóváhagyott profil/cél/korlát, új privát kezdőállapot. A másik szerző privát memóriája és előzménye nem kerül át.

## Publikálás és visszavonás

Élet/ág/időszak kiválasztása → public/unlisted, szerző és indexelés beállítása → PII/tartalmi vizsgálat → **Privacy Preview** → **Content Preview** → a látott hash/revision/scanverzió explicit Confirmja. Módosult vagy lejárt preview új ellenőrzést igényel. Privát folytatás nem frissíti automatikusan a kiadást.

Unlisted titkos link csak snapshotot ad, Discovery/SEO nélkül. Unpublish megszünteti az új olvasást/forkot és a saját cache/index/OG hozzáférést; a privát élet megmarad. A részletes [nyilvános terv](../PUBLIC_CONTENT_IMPLEMENTATION_PLAN_HU.md) az elfogadás alapja.

Reszponzív web indul; natív mobil, értesítések, chat/DM, reakció/követés/komment későbbi, méréssel indokolt bővítés. A választási opciók nem „helyes” életvezetési válaszok.

### 2026-10-04-i megvalósítási frissítés

[Privát béta-riport](../BETA_IMPLEMENTATION_REPORT_HU.md): valódi szintetikus Supabase/Auth/DB/OpenAI HTTP-hurok és teljes fióktörlés sikeres; 159 automatizált teszt. [007 feedback/session szerződés](../BETA_FEEDBACK_AND_METRICS_HU.md): privát űrlap, export/törlés, szerveroldali 30 perces session és sikeres folytatási kohorsz kész. Új angol minta Sonnet auditja rendben. [Contabo-előkészítés](../DEPLOYMENT_HU.md) kész, Linux CI-ben az image-build és production web healthcheck sikeres; teljes Compose/API/worker/Caddy és éles deploy még nincs; backup/restore és valós DB-kiesésből recovery nyitott. A public/community rész továbbra tervezett, a két stratégiai forrás változatlan.
