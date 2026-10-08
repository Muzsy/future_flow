# alterward — üzemeltetői belépés és hivatalos email

2026-10-08 · Felhasználói pontosítás. [Zárt indulási terv](CLOSED_SITE_RELEASE_PLAN_HU.md) · [Telepítés](DEPLOYMENT_HU.md).

| Szerep | Rögzített döntés |
| --- | --- |
| Hivatalos kapcsolati és értesítési cím | **info@alterward.com**; a termékben és adatkezelési tájékoztatóban ez szerepel. |
| Automatikus Auth-levelek feladója | **Alterward <info@alterward.com>**, tényleges felhasználói beállítás; felülírja a korábbi noreply javaslatot. Külön Reply-To nincs, válasz a feladóhoz; tényleges visszaérkezés még tesztelendő. |
| Beérkező levelek | A felhasználó megerősítette a Cloudflare Email Routing továbbítást az info@ címről Gmailre. A továbbítás beállítottként rögzítve; külön ügynöki próbaüzenet nem ment. |
| Üzemeltetői belépés | A felhasználó megadta a külön személyes belépési címet. A pontos érték a helyi, hozzáféréskorlátozott `.local/closed-site-operator/operator-config.json` fájlban van; az első Access Allow és az origin email-lista ebből készítendő. A fájl Gitből kizárt, új checkoutba nem másolódik automatikusan. |
| Saját alterward-fiók | Ugyanez a megadott cím a tervezett Supabase-fiókhoz. Fióklétrehozás, meghívó, tényleges Auth UUID és belépési próba még nincs igazolva. Access beengedés önmagában nem ad fizetett AI-jogot. |
| Automatikus levélküldés | **SMTP2GO, EU-régiós fiók**, `mail-eu.smtp2go.com:587`; külön SMTP-felhasználó/jelszó a felhasználó szerint bekötve a Supabase-be. 100 levél/óra szolgáltatói user limit, tracking/lábléc kikapcsolva; a meghívó Gmailbe megérkezett, de spambe került. A jelszó kizárólag a két szolgáltatónál marad. |
| Auth URL-ek / angol levelek | A Codex a dashboardon elmentette és újranyitással ellenőrizte a `https://alterward.com/account-access` alapértelmezést, a pontos éles és helyi callbacket, valamint nyolc angol HTML-sablont. Új tényleges levélpróba/belépés még nem történt. |

A beérkező továbbítás és a küldőszolgáltató kiválasztása tisztázott. A Supabase Auth meghívó- és jelszóhelyreállító leveleihez a **hosztolt Supabase-projekt Custom SMTP konfigurációját** kell beállítani. A Contabón tárolt környezeti változók önmagukban nem konfigurálják ezt a külön szolgáltatást. Az SMTP2GO API-kulcs önmagában nem helyettesíti az SMTP-felhasználót és jelszót; az API-út külön Send Email Hook integrációt igényelne. A most választott út a meglévő Supabase SMTP, külön új levélküldő komponens nélkül. [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [SMTP2GO hitelesítés](https://support.smtp2go.com/hc/en-gb/articles/12747932085145-Quick-Start-Guide).

A [SMTP2GO/Supabase útmutató](SMTP2GO_SUPABASE_SETUP_HU.md), [angol sabloncsomag](../deploy/supabase-auth/en/README.md) és [aktuális kézbesítési checkpoint](SMTP2GO_DELIVERY_CHECKPOINT_HU.md) a tényleges állapotot rögzíti. A korábban hiányzó dedikált SMTP-hozzáférés már elkészült; nem kérjük ki vagy másoljuk a szolgáltatóknál tárolt jelszót. Következő: új invite/recovery kézbesítés, hitelesítési fejlécek és spam okának vizsgálata, éles callback/jelszóbeállítás/belépés, majd tényleges bejövő válasz. A teljes angol indulási terv megmarad, a levelek is angolok. Az Access team/AUD/policy, a védett Contabo-telepítés és a kötelező részletes Cloud-audit továbbra végrehajtandó. Tesztelők kiválasztása és a fizetett 30 napos időszak a védett indulást követi.
