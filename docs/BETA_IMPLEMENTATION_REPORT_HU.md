# alterward — privát béta megvalósítás és valódi próbák

2026-10-04 · [Státusz és keret](STATUS_HU.md) · [Sorrend](NEXT_STEPS.md) · [Feedback és metrikák](BETA_FEEDBACK_AND_METRICS_HU.md).

## Elkészült változás

P06 admin kulcs biztonságosan beállítva/HTTP 200-zal ellenőrizve. Additív 007 migráció alkalmazva a fejlesztési Supabase-ban; az összes 17 aw_ tábla RLS-védett. 001–006 és a két stratégiai forrás változatlan. P08 privát visszajelzési űrlap, Auth-védett/idempotens/napi limites tárolás, export/törlés és szerveroldali session/folytatási mérés kész. Külön adminfelület még nincs.

P07 narrátorprompt: konkrét jelenet, elfogadott választás következménye, kevesebb ismételt keretfelsorolás; nincs új kitalált tartós tény engedélyezve. Minden éles AI-szerep továbbra Sol. Új [angol kétszakaszos minta](examples/AI_BETA_ENGLISH_STORY.md), korábbi értékelési minták változatlanok.

## Valódi Auth/DB/OpenAI HTTP-próba

`pnpm smoke:auth --run` két külön előre megerősített, szintetikus Supabase-fiókkal: valódi jelszavas belépés; draft mentés/visszaállítás; életlétrehozási idempotencia; idegen fióknak 404; valódi első angol fejezet; választás és ugyanazon ág folytatása; történeti másik választásból generált fork az eredeti canon módosítása nélkül; privát feedback; friss-hitelesítéses export az új adatokkal; tényleges Auth-törlés és a teljes DB-gráf takarítása. Mindkét tesztfiók eltávolítva. Emailt nem küldtünk.

Privát nyers bizonyíték: `.local/auth-smoke/a41ab55f-195a-4125-8bd9-01df1f3f36ce/report.json`, szintetikus canon és mentett próza. Egy korábbi megszakadt próba ismert fizetett eseményhívása is megmaradt a közös naplóban; nem töröltük a költségét.

## Böngészős ellenőrzés

Elkülönített helyi web/API, valódi szintetikus Auth és OpenAI: belépés, mind a 12 angol onboarding-lépés, mentett utolsó lépés újratöltése, első fejezet, választás és második fejezet. Az első fejezet és a mentett választás a második mellett megmaradt. Üres feedback angol validálási hibát ad; fejezethez kötött és általános feedback sikeresen mentődött, látható visszaigazolással. A lista a mentett angol életet mutatta.

Mérés a tesztadat takarítása előtt: első fejezetvég-kohorsz 1, sikeresen folytatott 1; sikeres élet/session pár 1, későbbi session 0. Két szintetikus feedback. Ez integrációs bizonyíték, nem 100%-os használói megtartás. A szerveroldali inaktivitás/fiókváltás/hiba/retry viselkedés fizetés nélküli regresszióban ellenőrzött.

Privát képernyőképek: `.local/beta-feedback-form.png` és `.local/beta-feedback-saved.png`. A párhuzamos build/dev cache-ütközést külön, a production `.next` mappán kívüli tesztelői kimenettel oldottuk meg. Kijelentkezés/új valódi belépés után mindkét fejezet és a korábbi választás visszaolvasható. A böngészős letöltés tényleges JSON-fájlját is ellenőriztük: saját fiók, 1 élet, 2 fejezet, 2 feedback, 2 session. Az új lap külön kliens/session-azonosítót kapott. A CUA download-eseménye időtúllépést adott, de a letöltött fájl létezett és helyes volt; a bizonyíték átkerült a kizárt `.local/browser-beta/downloaded-export.json` fájlba. A valódi Auth/DB-törlést a HTTP-próba igazolja. A böngészős tesztfiók, két feedback és session, valamint az ideiglenes credential fájl eltávolítva; takarítás után az összesítés nullás.

## Megszakadt törlés tényleges helyreállítása

Külön valódi, szintetikus Auth-fiókon szándékosan megálltunk a tényleges Auth-törlés után, még a DB-confirm/cleanup előtt. Az adatbázisban `deleting` fiók és `awaiting_auth` marker maradt. A valós `privacy:recover` CLI ellenőrizte a hiányzó Auth-fiókot, folytatta a DB-törlést, és eltávolította a fiókot és a tesztfeedbacket. Nulla AI-hívás. Privát `.local/browser-beta/recovery-report.json`. Ez kontrollált megszakításból valódi Auth/DB/CLI recovery, nem mesterséges tesztadapter; tényleges DB-kiesés és backup/restore nem volt.

## Külső Sonnet audit és költség

Egy célzott Sonnet low audit, 1500-as kimeneti plafon, 9600 számolt bemeneti token. Tényleges usage 9600 input / 183 output, cache nélkül; tokenár-becslés 0,02103 USD, konzervatív guard 0,02583 USD. Az időbeli kánont és elfogadott választásokat megőrző rövidített csomag UUID-aliasokat használ. Idézet/verdikt helyileg validált. Eredmény: kánonhű, helyes angol, hibajegyzék üres; személyesség 4/5, koherencia 5/5, nyelv 5/5, döntési tét 4/5, kíváncsiság 4/5. Korlátozott béta szerkesztői alapjának megfelelő; valódi olvasói ítélet nincs még.

Összes megőrzött OpenAI-kísérlet: 98 hívás, becsült 1.875437905 USD, konzervatív 1.925238375 USD, maradt 3.074761625 USD, ismeretlen usage 0. Claude: 49 próbálkozás, becsült 1.7526709 USD, konzervatív 2.318045 USD, maradt 2.681955 USD; a korábbi 2 usage nélküli HTTP 400 teljes foglalása megmarad. Ezek naplóalapú költségek, nem szolgáltatói kreditegyenlegek.

## Ellenőrzés és következő kapuk

159 automatizált teszt, típusellenőrzés és formázás sikeres; API/worker és Next production build sikeres, a helyi cache-ütközés után a web build megismételve. Kódból exportált v2 feedback/continue sémák. Hat új regresszió: Auth/ownership, fejezethatár, idempotencia/limit, export/törlés, szerveroldali session és kattintás/hiba/retry/siker/visszatérés. Nincs fizetett hívás a CI-ben.

[Contabo](DEPLOYMENT_HU.md): Docker/Compose/Caddy előkészítés és GitHub Linux konténer-build/web healthcheck munkafolyamat. Helyi Docker nincs, a CI eredménye külön ellenőrizendő. A konkrét Contabo szerverre telepítés/domain/HTTPS/Auth URL és külön éles AI-keret későbbi feladat. Backup/restore, valós Auth-siker/DB-hiba admin recovery és email-kézbesítés továbbra nincs igazolva. P09–P13 publishing/Discovery/moderáció/public fork még fejlesztendő; a korábbi privát előnézeti alap nem kész publikálás.
