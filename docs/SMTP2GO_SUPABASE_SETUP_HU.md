# alterward — SMTP2GO és Supabase Auth levelezés

2026-10-08 · SMTP-bekötés és első spambe érkezett meghívó a felhasználó által igazolva; a Codex az éles Auth URL-eket és nyolc angol sablont elmentette és újranyitással ellenőrizte. [Pontos bizonyíték és hátralévő próbák](SMTP2GO_DELIVERY_CHECKPOINT_HU.md) · [Email-szerepek](OPERATOR_EMAIL_CONFIGURATION_HU.md) · [Zárt indulás](CLOSED_SITE_RELEASE_PLAN_HU.md) · [Cloud-audit](CLAUDE_CLOUD_PRELAUNCH_AUDIT_PLAN_HU.md).

## Rögzített beállítások

| Mező | Érték / állapot |
| --- | --- |
| Szolgáltató | Meglévő SMTP2GO EU-régiós fiók; a régió a felhasználó által megerősített. |
| SMTP host és port | `mail-eu.smtp2go.com`, **587, STARTTLS**; 2525 alternatíva, ha a kapcsolat indokolja. Titkosítatlan küldésre nincs visszaesés. |
| Feladó email / név | **`info@alterward.com` / `Alterward`**, tényleges beállítás a felhasználó szerint. Felülírja a korábbi noreply javaslatot. |
| Válaszcím / kapcsolat | Külön Reply-To nincs; válasz a feladó `info@alterward.com` címére, Cloudflare Email Routing → privát Gmail. Válasz tényleges visszaérkezése még nincs igazolva. |
| Domainvédelem | Az alterward.com hitelesített, DKIM/SPF/DMARC rendben és a fiók csak @alterward.com feladót enged: felhasználói megerősítés. Élő levél fejlécével még ellenőrizendő. |
| Hozzáférés | Dedikált SMTP-felhasználó és generált jelszó elkészült; kizárólag SMTP2GO/Supabase tárolja a felhasználó szerint. API-kulcs nincs, helyi/VPS jelszómásolat nem szükséges. |
| SMTP2GO user limit / követés | **100 levél/óra**, tracking és leiratkozó lábléc kikapcsolva: felhasználói megerősítés. A Supabase külön Auth-limitjét nem helyettesíti. |

Az SMTP2GO dokumentációja szerint a megadott `mail-eu.smtp2go.com` EU **és UK** fogadó szervereket használ; kizárólag EU fogadó szerverhez `mail-eu2.smtp2go.com` választható. A felhasználó által megadott hostot rögzítettük, nem állítjuk róla, hogy EU-only. Az EU-ra rögzített HTTPS API végpont `https://eu-api.smtp2go.com/v3/`; az `api.smtp2go.com` globális végpont. Az SMTP-út most nem használ API-kulcsot. [SMTP2GO régió](https://support.smtp2go.com/hc/en-gb/articles/12974008254873-EU-Data-Center), [API régiós végpontok](https://developers.smtp2go.com/docs/endpoints).

## Hozzáférés és beállítási hely

A jelenlegi alkalmazás Supabase Authon keresztül kezeli a meghívókat és jelszóhelyreállítást. **A hosztolt Supabase-projekt Custom SMTP beállítása küld**, nem az alterward Contabo-folyamata. Szerveres környezeti változók tárolhatják a beállítás forrását, de ezeket az alkalmazás jelenleg nem olvassa fel és nem szinkronizálja a Supabase-hez. [Hivatalos Supabase útmutató](https://supabase.com/docs/guides/auth/auth-smtp).

1. SMTP2GO **Sending → SMTP Users**: külön alterward-felhasználó, erős egyedi jelszó, @alterward.com küldőkorlátozás megtartása. A fiók fő belépési jelszavát nem használjuk. A linkek épsége és a minimális adatkezelés érdekében a dedikált felhasználónál click/open tracking kikapcsolva; nincs BCC audit vagy email-archiválás bekapcsolása. [SMTP-felhasználók](https://support.smtp2go.com/hc/en-gb/articles/12747932085145-Quick-Start-Guide), [kapcsolók](https://developers.smtp2go.com/docs/api-features-guide).
2. A felhasználó már megadta a jelszót a hosztolt Supabase-ben; **nem kell újra megadni vagy a VPS-re másolni**. A [titokmentes sablon](../deploy/supabase-smtp.env.example) opcionális későbbi operátori referencia, nem automatikusan betöltött Compose/app konfiguráció. Hozzáférési érték nem kerül chatbe, Gitbe, `NEXT_PUBLIC_*` változóba, buildbe, naplóba vagy Claude-audit csomagba.
3. Supabase **Authentication → SMTP Settings / Custom SMTP**: a felhasználó elmentette a fenti host/port/user/password és feladó értékeket, és meghívót kézbesített. A Codex nem olvasta ki vagy változtatta meg a jelszót. STARTTLS tényleges használata és a kézbesített fejlécek még ellenőrizendők. API-alapú konfiguráláshoz külön Supabase Management hozzáférés kellene; a meglévő `service_role` kulcs nem ilyen hozzáférés.
4. A feladó maga `info@alterward.com`, így külön Reply-To vagy új küldési integráció nem szükséges. Az angol sablonok ezt a címet adják segítségkéréshez is. A cím szerinti válaszút és a tényleges visszaérkezés külön bizonyíték; ez utóbbi még nincs tesztelve.

SMTP2GO HTTPS API-kulcs a szolgáltató API-ját hitelesíti, **nem a Supabase SMTP user/password mezőit**. Külön Send Email Hook nélkül nem helyettesíti a most szükséges SMTP-hozzáférést. [API-hitelesítés](https://developers.smtp2go.com/reference/authentication), [Supabase Send Email Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook).

## Zárt béta és limitek

- **Elmentett és újranyitással ellenőrzött Site URL:** `https://alterward.com/account-access`; explicit invite/recovery cél ugyanez. Engedett Redirect URL-ek: ez a pontos éles cím és külön `http://localhost:3000/account-access` a helyi fejlesztéshez. Nincs wildcard, az alapértelmezés többé nem localhost. Az alapértelmezett Auth-cél az Account access felület, mert itt állítható be a jelszó és gyakorolhatók a sajátadat-jogok. [Redirect beállítás](https://supabase.com/docs/guides/auth/redirect-urls).
- Supabase nyilvános önregisztráció kikapcsolva, szükséges email/password belépés megtartva; kizárólag operátori meghívás. Ezt a Supabase API-n keresztül is ellenőrizzük, nem csak a hiányzó Register gombból következtetünk rá.
- **Nyolc angol sablon elmentve**, tárgy/HTML forrásuk az [installációs csomagban](../deploy/supabase-auth/en/README.md). A végső felhasználói pontosítás szerint a levelek is angolok; magyar sablon nem kerül ki. Újranyitott előnézetből a teljes HTML ellenőrzött, a Supabase preview hozzáadott CSS-ét leválasztva; négy tárgy külön visszaolvasása maszkírozott. A jelszó- és emailváltozási notification kapcsoló továbbra false. [Email templates](https://supabase.com/docs/guides/auth/auth-email-templates).
- A szolgáltatói aktuális havi/napi és friss domainhez tartozó korlátot a dashboardon kell visszaellenőrizni. A felhasználó kb. 1000 levél/hó ingyenes csomagot jelzett. Az új Custom SMTP-hez a Supabase kezdetben 30 levél/óra limitet dokumentál; a tényleges beállítás ellenőrizendő, induláskor nem emeljük automatikusan. Hibás SMTP/quota esetén nincs korlátlan újraküldés vagy más fizetős szolgáltatóra átállás. [Supabase limitek](https://supabase.com/docs/guides/auth/auth-smtp).

A Cloudflare Access egyszer használatos belépési kódját a Cloudflare küldi; ez a külön belépési réteg nem használja automatikusan az SMTP2GO/Supabase kvótát. Az Access Allow, az origin email-lista és a Supabase-fiók külön beállítás marad. A levelezés bekötése nem aktiválja az AI-keretet vagy a harmincnapos tesztidőszakot.

## Indulás előtti bizonyíték

A kész, védett célkörnyezetben az üzemeltetővel egyeztetett saját címre valódi invite és recovery szükséges. Igazolni kell a kézbesítést, From/Reply-To és DKIM/SPF/DMARC fejlécet, a HTTPS callbacket, jelszóbeállítást és belépést, majd a lejárt/újrahasznált link és a tiltott signup elutasítását. Kizárt tesztelő továbbra elérheti a saját export/törlés felületét; a helyreállítás nem ad katalógus- vagy fizetett AI-jogot. Bejövő válasz továbbítását külön kell igazolni.

A riport csak időpontot, titokmentes konfigurációt, eredményt és szolgáltatói státuszt tartalmazhat. A tényleges régió, küldési limit, követés kikapcsolása, kézbesítés és fejléc bizonyítéka a részletes Cloud-audit csomagba kerül; a hiányzó élő próbák külön hiányként maradnak. **Jelen állapot:** felhasználó által beállított SMTP és spambe kézbesített invite; Codex által elmentett és visszaellenőrzött Auth URL-ek/nyolc angol HTML-sablon. Új tényleges kézbesítés, inbox/spam ok, éles callback/belépés és bejövő válasz még ellenőrizendő. [Részletes checkpoint](SMTP2GO_DELIVERY_CHECKPOINT_HU.md).
