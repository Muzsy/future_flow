# alterward — hitelesített mentés és nyilvános link

2026-10-07 · [Dokumentációs központ](README.md) · [Teljes backlog](NEXT_STEPS.md).

## Elkészült viselkedés

A P10 Discovery után az angol Official és Community olvasóban bejelentkezve elmenthető egy aktív nyilvános élet. A `/saved` saját lista a jelenleg olvasható példány címét és összefoglalóját mutatja; visszavont, elrejtett, törölt vagy eredetengedélyét elvesztett példányból nincs olvasható tartalom. A mentés egy privát hivatkozás, nem külön történetmásolat és nem hozzáférési engedély.

- `GET /api/v2/saved-lives`: saját lista, page 1–100, pageSize 1–24, alapérték 12. Zárt query; hibás mező/tömb/oldalérték 422.
- `GET /api/v2/saved-lives/:slug`: aktuálisan olvasható angol public példány saját mentési állapota.
- `PUT /api/v2/saved-lives/:slug`: zárt üres JSON body, hitelesített saját mentés. Ismétlés ugyanazt az állapotot adja, a mentés ideje nem változik. Legfeljebb 500 mentés/fiók, tulajdonosi lock alatt; meglévő mentés a limitnél is újraolvasható.
- `DELETE /api/v2/saved-lives/:slug`: saját hivatkozás idempotens eltávolítása; visszavonás vagy a kiadási readerflag lekapcsolása után is működik, amíg a mentési funkció és a fiók aktív.
- Minden útvonal bearer Auth, szerveroldali user ID, no-store és a meglévő IP-rate-limit alatt fut. Anonim mentés, idegen user ID, secret token és unlisted élet kizárt. `SAVED_LIVES_ENABLED=false` az alapérték; a valódi `.env` és a normál kiadási flag-ek változatlanok.

## Tárolás, visszavonás és törlés

Az additív `026_saved_public_lives.sql` az `aw_saved_lives` táblát hozza létre. Saját user FK, pontosan egy Community vagy Official publication FK, mentési idő és technikai saját rekordazonosító; user+publication unique. Nincs cím, történet, checkpoint, forráshash, másik user ID vagy token tárolva. RLS és anon/authenticated REVOKE; közvetlen böngészős DB-hozzáférés tiltott.

A mentés a teljes aktuális kiadási olvasón halad át: immutable copy/review/curator, English locale, public visibility, aktív owner és Official esetén aktív, pontos eredetengedély. A mentő és a kiadó userlockjait azonos sorrendben vesszük fel; a mentő update lockja egyszerre a kvótát és a párhuzamos ismétléseket védi. Az ellenőrzés és az FK-beszúrás egy tranzakció.

A saját listán minden kártya ugyanezt az élő olvasói ellenőrzést kapja. A 404-gyé vált példánynál csak a korábbi nyilvános slug, savedAt és null card marad; „Life unavailable” és „Remove save” látszik. Integritási és más DB-hibánál a teljes kérés sikertelen, nincs részben ellenőrzött történet. A mentés nem örökíti át a korábbi olvasási engedélyt. Fizikai publication- vagy usertörlés az FK-kon törli az érintett mentést.

A saját friss Auth-export a mentésekből kizárólag `slug` és `saved_at` mezőt tartalmaz. Nem exportálja másik tulajdonos privát publication UUID-ját, történetét vagy eredetadatait. A korábbi fióktörlés/deleting/recovery folyamatok megmaradnak; saját törölt fiók mentései kaszkáddal eltűnnek.

## Angol felület és megosztás

A két public olvasó Save/Remove save, a bejelentkezett fő navigáció Saved lives hivatkozást kapott. Saját lista: lapozás, loading/üres/hibás/default-off állapot, visszavont elem eltávolítása. Accountváltás és unmount eldobja a régi választ; tab elrejtése törli a kártyákat, visszatérés/fókusz és látható állapotban 30 másodperc újraellenőrzi a listát. Nincs localStorage-ban mentett történet. A hálózati újraolvasás nem AI-hívás.

A „Copy public link” kattintás újra beolvassa a teljes aktuális anonymous public példányt, strict DTO-val ellenőrzi a slugot, eredetet, láthatóságot és angol nyelvet. A megosztott URL csak az oldal saját originje és a validált `/lives/…` vagy `/official-lives/…` slug: nincs fragment, secret token, query, tracking, privát ID vagy történetszöveg. Ha clipboard nem érhető el, ellenőrzött, kijelölhető angol public link jelenik meg. Unlisted olvasóban nincs Save vagy public Share vezérlő.

Ez egyszerű nyilvános linkmegosztás. Tartalomfüggő OG, indexelési opt-in, cache-purge és social referral még P10/P11 feladat. A mostani publication-kontraktus és DB kifejezetten noindex; nem kapcsoltunk be SEO-t egy link másolásával. Már másokhoz eljutott nyilvános URL visszavonás után ugyanúgy 404, a címzett korábbi másolatát a rendszer nem tudja visszahívni.

## Ellenőrzés és pontos korlát

Helyi teljes `pnpm check` sikeres: format, típusok, **481 teszt/41 fájl**, API/worker/Next production build és dinamikus `/saved` oldal. 10 új izolált PGlite/HTTP regresszió: strict public URL, default-off/query, dedupe/ownership/export, secret/unlisted/readerflag, withdraw/hide/deleting/cascade, Official revoke, 500-as limit, RLS/client denial, hitelesített no-store API. Ezek technikai fixture-ek, nem helyettesítik a valódi AI-tartalmat.

Fejlesztői Supabase 001–026 alkalmazva és ismételve; régi migrációk változatlanok, 19 ff_ és 56 aw_/56 RLS. A valódi háromfejezetes angol Official mintán két külön disposable Supabase Auth-fiók mentett/olvasott/exportált: három concurrent PUT egy FK-rekord, másik account listája üres és DELETE-je nem törli az első mentését, unlisted/withdrawn kizárt, no-store/default-off és minimális DTO/export sikeres. Mindkét próbafiók friss Auth HTTP DELETE-je, tényleges Supabase- és DB-törlése, mentések kaszkádja ellenőrizve. A seed owner teljes exportja az exportidő kivételével változatlan; mindkét AI-napló hash-e változatlan. A kapcsolódó valódi client TLS socket encrypted és certificate authorized.

A próba kezdeti TLS-ellenőrzése tévesen a pooler mögötti PostgreSQL backend-statisztikából következtetett a klienskapcsolatra, ezért a próbafiókok létrehozása előtt megállt. A client socket és a kötelező CA-ellenőrzés alapján javítottuk; az első hibás bizonyíték védett helyi fájlként megmaradt. A regressziós teszthelperek két hibás lifecycle-hívását javítottuk, semmilyen jogosultsági kaput nem kapcsoltunk ki.

112 generált séma; a régi 108, 001–025, stratégiai és Shared források, ZIP, archívum és valódi történetek változatlanok. Az izolált valódi PostgreSQL/CA TLS smoke additívan teszteli a concurrent mentést, ellentétes irányú userlockokat, account/export elkülönítést, withdraw/unsave és deletion race/recovery/cascade/RLS határokat. **Az új runtime main CI eredménye még ellenőrizendő**; az előző Discovery [CI](https://github.com/Muzsy/future_flow/actions/runs/37537224387) sikeres. A pozitív böngészős/visual Save/Share/Discovery/Official UI-próba továbbra nyitott; a korábbi eszközkorlátot nem kerültük meg. HTTP/build nem böngészős bizonyíték.

## Keret és következő feladat

Új fizetős AI-hívás: **0**. OpenAI guard-maradék 2.254014125 USD; Claude 2.62877 USD, a külön kumulatív 5–5 USD keret és korábbi ismeretlen usage-foglalások változatlanok. Ezek becsült költségőrértékek, nem élő kreditegyenlegek.

Következő P10: hitelesített Report, tartós moderation queue/abuse dedupe és trusted warning/hide/remove folyamat; tartalom nélküli olvasási/mentési/megosztási metrikák; kurált kollekciók; explicit SEO/OG/permission/cache-kapu és pozitív UI-próba. P11–P13/public fork/personalization, S3 retention és S4–S7, P06 valós kiesés/backup/restore/email, Contabo/Cloudflare/domain/TLS/tűzfal/éles allowance megmarad. Nem történt Contabo-telepítés vagy domainmódosítás, a P10 és a teljes public MVP még nincs kész.
