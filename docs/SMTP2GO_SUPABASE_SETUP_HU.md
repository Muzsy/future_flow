# alterward — SMTP2GO és Supabase Auth levelezés

2026-10-08 · Elfogadott szolgáltató, előkészített beállítás; éles SMTP és kézbesítés még nincs igazolva. [Email-szerepek](OPERATOR_EMAIL_CONFIGURATION_HU.md) · [Zárt indulási terv](CLOSED_SITE_RELEASE_PLAN_HU.md) · [Cloud-audit](CLAUDE_CLOUD_PRELAUNCH_AUDIT_PLAN_HU.md).

## Rögzített beállítások

| Mező | Érték / állapot |
| --- | --- |
| Szolgáltató | Meglévő SMTP2GO EU-régiós fiók; a régió a felhasználó által megerősített. |
| SMTP host és port | `mail-eu.smtp2go.com`, **587, STARTTLS**; 2525 alternatíva, ha a kapcsolat indokolja. Titkosítatlan küldésre nincs visszaesés. |
| Feladó email / név | `noreply@alterward.com` / `Alterward`. A Supabase külön mezőibe kerülnek, nem egy összefűzött emailcímként. |
| Tervezett Reply-To / kapcsolat | `info@alterward.com`; bejövő Cloudflare Email Routing → privát Gmail. |
| Domainvédelem | Az alterward.com hitelesített, DKIM/SPF/DMARC rendben és a fiók csak @alterward.com feladót enged: felhasználói megerősítés. Élő levél fejlécével még ellenőrizendő. |
| Hozzáférés | Külön alkalmazási SMTP-felhasználó és jelszó még készítendő; értékük kizárólag védett környezetbe kerül. |

Az SMTP2GO dokumentációja szerint a megadott `mail-eu.smtp2go.com` EU **és UK** fogadó szervereket használ; kizárólag EU fogadó szerverhez `mail-eu2.smtp2go.com` választható. A felhasználó által megadott hostot rögzítettük, nem állítjuk róla, hogy EU-only. Az EU-ra rögzített HTTPS API végpont `https://eu-api.smtp2go.com/v3/`; az `api.smtp2go.com` globális végpont. Az SMTP-út most nem használ API-kulcsot. [SMTP2GO régió](https://support.smtp2go.com/hc/en-gb/articles/12974008254873-EU-Data-Center), [API régiós végpontok](https://developers.smtp2go.com/docs/endpoints).

## Hozzáférés és beállítási hely

A jelenlegi alkalmazás Supabase Authon keresztül kezeli a meghívókat és jelszóhelyreállítást. **A hosztolt Supabase-projekt Custom SMTP beállítása küld**, nem az alterward Contabo-folyamata. Szerveres környezeti változók tárolhatják a beállítás forrását, de ezeket az alkalmazás jelenleg nem olvassa fel és nem szinkronizálja a Supabase-hez. [Hivatalos Supabase útmutató](https://supabase.com/docs/guides/auth/auth-smtp).

1. SMTP2GO **Sending → SMTP Users**: külön alterward-felhasználó, erős egyedi jelszó, @alterward.com küldőkorlátozás megtartása. A fiók fő belépési jelszavát nem használjuk. A linkek épsége és a minimális adatkezelés érdekében a dedikált felhasználónál click/open tracking kikapcsolva; nincs BCC audit vagy email-archiválás bekapcsolása. [SMTP-felhasználók](https://support.smtp2go.com/hc/en-gb/articles/12747932085145-Quick-Start-Guide), [kapcsolók](https://developers.smtp2go.com/docs/api-features-guide).
2. A [sablon](../deploy/supabase-smtp.env.example) másolata védett, Git-checkouton kívüli környezetbe kerülhet, például `/etc/alterward/supabase-smtp.env`, csak az üzemeltető számára olvasható jogosultsággal. `AUTH_SMTP_USERNAME` és `AUTH_SMTP_PASSWORD` tartalmazza a két hozzáférési értéket. Nem kerülnek chatbe, Gitbe, `NEXT_PUBLIC_*` változóba, buildbe, naplóba vagy Claude-audit csomagba. Ez **operátori konfigurációforrás**, nem automatikusan betöltött Compose/app konfiguráció.
3. Supabase **Authentication → SMTP Settings / Custom SMTP**: host, port, SMTP user/password, sender email és sender name beállítása a fenti táblázatból. STARTTLS tényleges használata ellenőrizendő. API-alapú konfiguráláshoz külön Supabase Management hozzáférés kellene; a meglévő `service_role` kulcs nem ilyen hozzáférés. Bejelentkezett dashboardon is elvégezhető; most nem indult ilyen módosítás.
4. A Supabase Custom SMTP dokumentált mezői nem tartalmaznak külön Reply-To beállítást. Az `AUTH_SMTP_DESIRED_REPLY_TO` ezért csak a kívánt fejlécet rögzíti. A tényleges szolgáltatói lehetőséget és a kézbesített fejlécet ellenőrizzük; HTML-sablonban szereplő kapcsolati cím nem állít emailfejlécet. Az angol levelekben mindenképpen legyen `info@alterward.com` kapcsolati hivatkozás. Ha a külön fejléc nem támogatott, a megoldást dokumentált szolgáltatói beállításból vagy külön küldési integrációból kell kialakítani; nem jelöljük késznek pusztán az env mezőtől.

SMTP2GO HTTPS API-kulcs a szolgáltató API-ját hitelesíti, **nem a Supabase SMTP user/password mezőit**. Külön Send Email Hook nélkül nem helyettesíti a most szükséges SMTP-hozzáférést. [API-hitelesítés](https://developers.smtp2go.com/reference/authentication), [Supabase Send Email Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook).

## Zárt béta és limitek

- Supabase Site URL: `https://alterward.com`; invite/recovery cél: pontosan `https://alterward.com/account-access`. A tényleges hívások is ezt adják `redirectTo` értéknek. Meglévő szükséges helyi fejlesztési címek külön, pontosan felsorolva; általános éles wildcard nincs. [Redirect beállítás](https://supabase.com/docs/guides/auth/redirect-urls).
- Supabase nyilvános önregisztráció kikapcsolva, szükséges email/password belépés megtartva; kizárólag operátori meghívás. Ezt a Supabase API-n keresztül is ellenőrizzük, nem csak a hiányzó Register gombból következtetünk rá.
- Meghívó-, recovery- és a használt biztonsági értesítések angol sablonjai ellenőrizendők: alterward márkanév, helyes HTTPS cél, érthető teendő és info@ kapcsolati hivatkozás. Belépési link/token nem kerül riportba. [Email templates](https://supabase.com/docs/guides/auth/auth-email-templates).
- A szolgáltatói aktuális havi/napi és friss domainhez tartozó korlátot a dashboardon kell visszaellenőrizni. A felhasználó kb. 1000 levél/hó ingyenes csomagot jelzett. Az új Custom SMTP-hez a Supabase kezdetben 30 levél/óra limitet dokumentál; a tényleges beállítás ellenőrizendő, induláskor nem emeljük automatikusan. Hibás SMTP/quota esetén nincs korlátlan újraküldés vagy más fizetős szolgáltatóra átállás. [Supabase limitek](https://supabase.com/docs/guides/auth/auth-smtp).

A Cloudflare Access egyszer használatos belépési kódját a Cloudflare küldi; ez a külön belépési réteg nem használja automatikusan az SMTP2GO/Supabase kvótát. Az Access Allow, az origin email-lista és a Supabase-fiók külön beállítás marad. A levelezés bekötése nem aktiválja az AI-keretet vagy a harmincnapos tesztidőszakot.

## Indulás előtti bizonyíték

A kész, védett célkörnyezetben az üzemeltetővel egyeztetett saját címre valódi invite és recovery szükséges. Igazolni kell a kézbesítést, From/Reply-To és DKIM/SPF/DMARC fejlécet, a HTTPS callbacket, jelszóbeállítást és belépést, majd a lejárt/újrahasznált link és a tiltott signup elutasítását. Kizárt tesztelő továbbra elérheti a saját export/törlés felületét; a helyreállítás nem ad katalógus- vagy fizetett AI-jogot. Bejövő válasz továbbítását külön kell igazolni.

A riport csak időpontot, titokmentes konfigurációt, eredményt és szolgáltatói státuszt tartalmazhat. A tényleges régió, küldési limit, követés kikapcsolása, kézbesítés és fejléc bizonyítéka a részletes Cloud-audit csomagba kerül; a hiányzó élő próbák külön hiányként maradnak. **Jelen állapot: dokumentáció és sablon kész; hozzáférés, éles Supabase SMTP-konfiguráció és próbalevelek még nincsenek igazolva.**
