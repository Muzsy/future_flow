# alterward — üzemeltetői belépés és hivatalos email

2026-10-08 · Felhasználói pontosítás. [Zárt indulási terv](CLOSED_SITE_RELEASE_PLAN_HU.md) · [Telepítés](DEPLOYMENT_HU.md).

| Szerep | Rögzített döntés |
| --- | --- |
| Hivatalos kapcsolati és értesítési cím | **info@alterward.com**; a termékben és adatkezelési tájékoztatóban ez szerepel. A küldendő Auth-levelek tervezett Reply-To címe is ez. |
| Automatikus Auth-levelek feladója | **Alterward <noreply@alterward.com>**, a felhasználó által javasolt feladó. A Reply-To fejléc tényleges támogatását és értékét külön igazolni kell. |
| Beérkező levelek | A felhasználó megerősítette a Cloudflare Email Routing továbbítást az info@ címről Gmailre. A továbbítás beállítottként rögzítve; külön ügynöki próbaüzenet nem ment. |
| Üzemeltetői belépés | A felhasználó megadta a külön személyes belépési címet. A pontos érték a helyi, hozzáféréskorlátozott `.local/closed-site-operator/operator-config.json` fájlban van; az első Access Allow és az origin email-lista ebből készítendő. A fájl Gitből kizárt, új checkoutba nem másolódik automatikusan. |
| Saját alterward-fiók | Ugyanez a megadott cím a tervezett Supabase-fiókhoz. Fióklétrehozás, meghívó, tényleges Auth UUID és belépési próba még nincs igazolva. Access beengedés önmagában nem ad fizetett AI-jogot. |
| Automatikus levélküldés | **SMTP2GO, EU-régiós fiók**, a felhasználó által megadott SMTP-host `mail-eu.smtp2go.com`, 587/STARTTLS; 2525 alternatíva. A domain, DKIM/SPF/DMARC és az @alterward.com feladókorlátozás felhasználó által megerősített. Külön SMTP-felhasználó/jelszó még készítendő; Supabase SMTP-beállítás és tényleges kézbesítés még nincs igazolva. |

A beérkező továbbítás és a küldőszolgáltató kiválasztása tisztázott. A Supabase Auth meghívó- és jelszóhelyreállító leveleihez a **hosztolt Supabase-projekt Custom SMTP konfigurációját** kell beállítani. A Contabón tárolt környezeti változók önmagukban nem konfigurálják ezt a külön szolgáltatást. Az SMTP2GO API-kulcs önmagában nem helyettesíti az SMTP-felhasználót és jelszót; az API-út külön Send Email Hook integrációt igényelne. A most választott út a meglévő Supabase SMTP, külön új levélküldő komponens nélkül. [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [SMTP2GO hitelesítés](https://support.smtp2go.com/hc/en-gb/articles/12747932085145-Quick-Start-Guide).

A [konkrét SMTP2GO/Supabase beállítási és ellenőrzési útmutató](SMTP2GO_SUPABASE_SETUP_HU.md) és a [titokmentes operátori sablon](../deploy/supabase-smtp.env.example) elkészült. Következő: külön SMTP-hozzáférés biztonságos elhelyezése, a Supabase-beállítás tényleges végrehajtása, angol levélsablonok és `/account-access` redirect, majd ellenőrzött meghívás/helyreállítás. A Reply-To értéke jelenleg szándék, nem konfigurált fejléc. Fizetős előfizetés és próbaüzenet e rögzítéssel nem indult. Az Access team/AUD/policy, a védett Contabo-telepítés és a kötelező részletes Cloud-audit továbbra végrehajtandó. Tesztelők kiválasztása és a fizetett 30 napos időszak a védett indulást követi.
