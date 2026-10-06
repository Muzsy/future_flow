# alterward — külön Official publikálás és megerősítés

2026-10-06 · [Dokumentáció](README.md) · [Eredetbizonyíték](OFFICIAL_LIFE_PROVENANCE_REPORT_HU.md) · [Következő lépések](NEXT_STEPS.md).

## Elkészült működés

A külön `official-publication-1` kiadási szerződés a már meglévő, ellenőrzött Official LIFE eredetengedélyhez köti a teljes végleges történetmásolatot és a kiválasztott döntési pontokat. Az eredetengedély önmagában továbbra sem publikálás. Külön privát előnézet, majd a pontos másolatot engedélyező explicit megerősítés szükséges. A korábbi `publication-1` Community szerződés, a 96 korábbi JSON-séma és a 001–024 migráció változatlan.

Az angol felületen az ellenőrzött forrással rendelkező másolatnál külön Official előnézet és megerősítés jelenik meg. A tulajdonos public vagy unlisted elérhetőséget, anonim vagy a saját nyilvános handle-jéhez kötött szerzői jelölést választhat. A beállítások módosítása és az előnézet lejárata törli a hozzájárulást. Official címke ellenőrzött forrás nélkül nem jelenik meg. A saját publikációs listából a már kiadott Official másolat a privát történet folytatása és az előkészítés lejárata után is kezelhető.

## Pontos jogosultsági kapu

Az új tulajdonosi `POST /api/v2/official-publication-previews` az aktuális teljes review/curator kötés mellett az előzetes trusted ScenarioVersion, root-life és job eredetét, minden időszak és választás canon-/fejezet-/fidelity-láncát, a provider receipt-eket és lezárt pontos tokenelszámolást is újra ellenőrzi. Kötelező a már létező, aktív, azonos bundle/content/evidence hash-hez kötött Official LIFE grant és az aktív, aktuális Scenario source. Az általános API nem hozhat létre eredetengedélyt, nem végez fizetett AI-hívást és nem adhat Official címkét kliensparaméterből.

A privát előnézet legfeljebb 15 percig és legfeljebb a forrás-előkészítés lejártáig érvényes. A binding tartalmazza a teljes review/curator és az Official grant/evidence kötést; külön snapshot és preview hash védi az összes megtekintett szöveget, tényt és beállítást. `POST /api/v2/official-publications/confirm` kötelező `acknowledged=true`, exact preview ID/hash és saját idempotenciakulcs mellett ismét ellenőrzi az aktuális kaput. Megváltozott privát forrás, lejárt előnézet vagy visszavont eredetengedély mellett nincs új kiadás.

A Confirm ismétlése a már kiadott másolat jelenlegi állapotát adja vissza, lejárt előkészítés vagy visszavonás után is. Egy ismételt kérés nem aktiválhat újra visszavont, elrejtett vagy eltávolított másolatot. A későbbi privát folytatás és az új ScenarioVersion nem írja át a történeti kiadást; explicit eredetengedély-visszavonás megszünteti annak olvasását.

## Olvasás és életciklus

| Felület | Hozzáférés és határ |
|---|---|
| `/official-lives/official-…` | Csak public másolat, angol olvasó; szerveroldali `GET /api/public/official-lives/:slug` |
| `/official-unlisted#…` | Unlisted másolat; a titkos kód kizárólag URL-fragment és Bearer fejléc, nem query/path/referrer |
| `/publications` | Hitelesített saját Community és Official másolatok; pontos revision/hash és külön consent kell a visszavonáshoz/linkcseréhez |
| Privát moderáció | `pnpm moderation:official-publication -- --list`, illetve védett request file + explicit `--apply`; nincs HTTP moderáció vagy grant endpoint |

A névtelen DTO csak slugot, kiadási dátumot, láthatóságot és a szűkített kiadott tartalmat tartalmazza. Nem tartalmaz user/life/branch/bundle/grant ID-kat, provenance/receipt adatot, belső hash-eket vagy titkos linkkódot. A szerver az aktív owner, publication, LIFE source és parent Scenario source mellett a tárolt exact grant/evidence/copy hash-kötést is ellenőrzi. Másolatonként elkülönített `official-publication-1` HMAC-névtér van; a Community token nem válik Official tokenné. A DB és az idempotencia nem tárol nyers Bearer kódot.

A kiadott szöveg immutable. A titkos link cseréje érvényteleníti a régit. Tulajdonosi withdraw, trusted hide/remove, bármely szülő eredetengedély visszavonása és a fióktörlési marker megszünteti az olvasást. A 025 migráció a LIFE vagy Scenario source terminal revocation tranzakciójában a hozzá tartozó aktív/elrejtett Official másolatokat is visszavonja és minimális audittal rögzíti az okot; a fiók helyreállítása nem állítja vissza ezeket. Saját export és fizikai cascade törlés mindhárom új táblát lefedi.

Az olvasó `no-store` kéréseket használ, elhagyott/újrafókuszált lapon törli és újra ellenőrzi a megjelenített példányt, és 30 másodpercenként frissít. Nincs indexelés, fork, story-SSR, story-OG vagy böngészőben tartósan mentett történet. Már elolvasott vagy külön lementett szöveg visszahívása nem lehetséges.

## Konfiguráció és tárolás

`OFFICIAL_PUBLICATIONS_ENABLED=false` az alapérték. Az engedélyezett API-hoz a meglévő védett, 64 hex karakteres `PUBLICATION_LINK_SECRET` is kell; a két publikálási típus külön HMAC-névteret használ. A normál kiadási flag nem engedélyezi az operatori source grant/start/revoke műveleteket. Az operatori műveletek továbbra a külön `OFFICIAL_LIFE_OPERATOR_ENABLED=false` kapun túl érhetők el. A tényleges helyi és éles konfigurációt e fejlesztés nem aktiválja.

`025_official_publications.sql`: `aw_official_publication_previews`, `aw_official_publications`, `aw_official_publication_actions`; exact owner/bundle/grant/preview összetett FK-k, immutable másolat/binding/audit, szűkített terminal lifecycle, RLS és anon/authenticated közvetlen tiltás. A fejlesztői Supabase-on 001–025 alkalmazva és ismételve; 19 ff_ és 55 aw_/55 RLS, CA-val ellenőrzött TLS; Auth/admin konfiguráció elérhető. E körben nem maradt új tesztfelhasználó vagy publikus seed a fejlesztői adatbázisban.

## Ellenőrzés és bizonyíték határa

A helyi teljes `pnpm check` sikeres: 463 teszt/39 fájl, format/types/API/worker/Next production build. Az ezután hozzáadott Official lejárati próba is sikeres, a teljes új célzott fájl 11/11; az összes jelenlegi teszt száma 464. Az izolált PostgreSQL CI-helper bővült párhuzamos exact preview/Confirm, unlisted linkcsere, source-revoke/withdraw, törlés/reader verseny, recovery/export/cascade/RLS ellenőrzéssel. Az új main [CI](https://github.com/Muzsy/future_flow/actions/runs/37507371476) verify/container sikeres a `9850a6ae` runtime commiton: 464 teszt/39 fájl, 105 séma drift nélkül, format/types/API/worker/Next production build; izolált PostgreSQL/CA TLS 001–025 és ismétlés, párhuzamos Official preview/Confirm/linkcsere/source-revoke és deletion-reader/recovery/export/cascade/RLS. Minden 71 korábbi P09/Shared proof megmarad, web/API verified HTTPS és worker tiszta leállás, egress tiltva, paid CI AI 0. 105 JSON-séma készült, a korábbi 96 változatlan. A sémák és migrációk alkalmazása a meglévő forrásdokumentációkat nem módosítja.

A pozitív automatizált adatok izolált, szimulált trusted provider receipt és tokenelszámolás fixture-ek. Ezek technikai jogosultsági próbák, nem valódi AI-generált Official történetek, nem valódi kurátori minősítés és nem kiadási seed. Az új HTTP- és storage-műveletekhez fizetett AI-hívás nem szükséges; e kör új OpenAI/Claude hívásainak száma 0. A valódi angol többidőszakos seed teljes AI-lánca, saját review/curator/source engedélye és külön Claude-audit a következő fejlesztési rész.

A böngészős ellenőrzést az eszköz biztonsági URL-szabálya elutasította a localhost lap kiválasztásánál; megkerülés nem történt. A felületi bizonyíték ebben a körben a kliens exact hash/binding vizsgálata, a szigorú DTO-k és a sikeres production build. Teljes pozitív böngészős/Supabase Auth próba e funkción még nincs.

OpenAI guard-maradék **2,520186625 USD**, Claude **2,661985 USD**; a két külön 5 USD keret és a korábbi ismeretlen foglalások megmaradnak. Contabo-deploy, Cloudflare/DNS/TLS aktiválás nem történt. P10 Discovery, P11 közösségi/privacy flow, P12 public fork, P13 MVP-kiadás; S3 retention/régi személyes próza/billing/grace/deadline, S4–S7; továbbá backup/restore/email/éles ops változatlanul a teljes terv részei.


### Pontos runtime CI-lezárás

Az új main [CI](https://github.com/Muzsy/future_flow/actions/runs/37507371476) verify/container sikeres a `9850a6ae` runtime commiton: 464 teszt/39 fájl, 105 séma drift nélkül, format/types/API/worker/Next production build; izolált PostgreSQL/CA TLS 001–025 és ismétlés, párhuzamos Official preview/Confirm/linkcsere/source-revoke és deletion-reader/recovery/export/cascade/RLS. Minden 71 korábbi P09/Shared proof megmarad, web/API verified HTTPS és worker tiszta leállás, egress tiltva, paid CI AI 0. A lokális Docker hiányában a konténeres eredmény a fenti GitHub-futásból származik. A pozitív fixture-ek továbbra technikai, izolált szimulált receipt/adatbázis-elszámolások, nem valódi Official seed. A hiányzó pozitív böngészős/Auth kiadási próba és a valódi angol AI-lánc/Claude-audit megmarad következő feladatnak.


### Későbbi valódi AI/Auth pilot

Az első [valódi angol háromrészes Official seed](OFFICIAL_SEED_REPORT_HU.md) elkészült: külön új forrás/review/curator/eredet és tényleges Auth/HTTP public/unlisted Confirm/reader/linkcsere/withdraw/export. A rendes feature-ek false; pozitív Official böngészős UI és P10–P13/ops kapuk megmaradnak. A korábbi fixture/CI bizonyíték továbbra külön technikai kör.
