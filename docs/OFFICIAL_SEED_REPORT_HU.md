# alterward — valódi angol Official seed és Auth/kiadási bizonyíték

2026-10-06 · [Olvasható angol történet](examples/AI_OFFICIAL_SEED_ENGLISH_STORY.md) · [Független Claude-audit](examples/AI_OFFICIAL_SEED_CLAUDE_AUDIT_HU.md) · [Teljes fejlesztési sorrend](NEXT_STEPS.md).

## Elkészült

Egy frissen indított, valóban AI-generált angol élet három hat hónapos időszakkal és három kiválasztott, ellenőrzött döntési kezdőponttal. A korábbi sablont új fiktív mintafiókhoz másoltuk; a korábban törölt fiók review/grant bizonyítékát nem használtuk fel. Az új ScenarioVersion teljes Sol-review után külön szerkesztői és forrásellenőrzést kapott. Az Official start az első AI-job előtt rögzítette az eredetet. Mind a három időszak normál worker/canon/chapter/fidelity/receipt és tranzakciós budget lánccal készült; repair vagy újragenerálás nélkül. A létrehozás és a saját job lefoglalása egy tranzakcióban történt, így más worker nem vehette fel a mintát.

A választások: előbb az esti képzés elfogadása és előrefizetése, később a projekt beadása. A harmadik fejezet a kijavított projekt után tényleges canon-eseményként megszerzett bizonyítványból induló új döntésnél áll meg; ezt nem fogadtuk el. A cél eredeti 12 hónapos horizontja szándék, a tényleges befejezés későbbi. Munkahelyváltás vagy garantált bevételnövekedés nincs.

A három eredeti fejezet titokmentes cím+törzs SHA-256 bizonyítéka: `50685b03b4bae7c762cc857e8791836c05d4d4f4f086ad5340cc98e970e48eb1`. A mintafájlba mindhárom cím/törzs változtatás nélkül került. Régi példák, sémák, migrációk és stratégiai/Shared-források változatlanok.

## A valódi ellenőrzés által talált javítás

Az első teljes csomag Sol-review-ja `review_required` lett: három `language/manual_review` finding, pontosan a `checkpoints.0/1/2.constraints.0.description` mezőkön. A javasolt leírás „A soft condition: liquid funds at least.” volt. Ez nem teljes, természetes angol mondat. A régi csomag és audit immutable maradt; nem kapott kurátori vagy Official LIFE engedélyt.

A core candidate most mind a négy típusos feltételhez teljes angol mondatot ad, megkülönbözteti a hard/soft feltételt, kezeli az ismeretlen employment státuszt, és nem használ eredeti privát neveket. Ebben a mintában: „Prefer to keep at least USD 600 in liquid funds.” A végrehajtható predicate, dátum/scope, opciók és hatások változatlanok. Új checkpointok és új csomag készült, új egyszeri review-val; eredmény `no_findings`. A nyilvános olvasói próbához készült külön azonos tartalmú csomag saját új teljes review-ja is `no_findings`; hashük egyezik.

A teljes másolatokat a tényleges angol történet/canon/opció/állapot és a külön Sonnet-audit átnézése után ellenőriztem kurátorként, a felhasználó korábbi angol szerkesztői felhatalmazásával. Exact full-review/curation és lezárt valódi provider-költségek után külön Official LIFE eredetengedélyük lett. Egy jó AI-verdict önmagában nem adott kiadási jogosultságot.

## Valódi Supabase Auth/HTTP próba

Külön, kizárólag loopbacken futó alkalmazás, védett helyi linkaláíró titokkal és explicit próba-konfigurációval. A rendes `OFFICIAL_PUBLICATIONS_ENABLED` és Shared flag-ek továbbra false; az éles környezetet nem módosítottuk.

- Valódi jelszavas Supabase-belépés, friss Auth-export és külön próbafiók HTTP-törlése; nem küldtünk emailt.
- Anon owner API 401; másik tulajdonos privát életolvasása 404, a kiadási státusza üres source/publication projekció.
- Teljes végleges preview, pontos történet- és bindingegyezés, ingyenes idempotens újraolvasás; módosított preview-hash nem publikálhat.
- Párhuzamos valódi HTTP Confirm egy kiadást hoz létre. Külön Official/en besorolás, noindex, anonim szerző; public fork még tiltva.
- Unlisted tartalom slugon nem olvasható; titok nélkül nem elérhető; linkcsere után a régi titok azonnal 404.
- Visszavonás után az új titok is 404, a régi Confirm ismétlése withdrawn marad.
- A külön public másolat anonim olvasója a pontos háromrészes ellenőrzött másolatot adja; nincs privát owner/life/branch/bundle/grant/evidence vagy publication ID a projekcióban.
- Minden érintett HTTP-válasz no-store. Default-off példányban a staging public másolat is 404.
- Export tartalmazza az eredet/kiadás rekordjait; nincs böngészőből elérhető trusted grant útvonal. A próba olvasás/preview/Confirm/export/linkcsere/visszavonás része 0 új AI-hívás.

A segédprogram első ingyenes próbái hibás státusz- és snapshotmező-elvárást, illetve hiányzó próba-linktitkot jeleztek. A teszthelpert javítottuk, a hibaadatokat megőriztük, az érintett próbafiókokat ténylegesen töröltük. A végső unlisted és public HTTP-sorozat teljesen sikeres. Nem kapcsoltunk ki szerveroldali biztonsági kaput.

A fiktív seed-fiók, a három valódi AI-időszak, a blokkolt régi és két külön ellenőrzött csomag, két eredetengedély, a withdrawn unlisted és aktív staging public példány megmarad a fejlesztői Supabase-ban P10-hez. Titkai csak védett, ignorált `.local/official-seed` alatt vannak. Más felhasználó adata nem került a mintába. Minden ideiglenes próbafiók Auth/DB-takarítása igazolt, credential-fájljuk eltávolítva.

## Költség és tokenhasználat

| Új lépés | Fizetett hívás | Becsült USD | Konzervatív guard USD |
|---|---:|---:|---:|
| Új sablon-review, 3 period/chapter/fidelity lánc, blokkolt +javított +külön public teljes review | 13 | 0.2231354 | 0.2661725 |
| Sonnet külső auditor, a teljes háromrészes canon/choice lánccal | 1 | 0.02748 | 0.033215 |

OpenAI összesen **149 hívás**, becslés 2.617242505 USD, guard 2.745985875 USD; marad **2.254014125 USD**, ismeretlen 0. Claude összesen **51 kísérlet**, 49 ismert usage; becslés 1.7965969 USD, guard 2.37123 USD; marad **2.62877 USD**, korábbi ismeretlen 2. Ez tokenbecslés és őrzött napló, nem szolgáltatói kreditegyenleg.

A régi naplók megmaradtak. Előzetes request-plafon, a közös 5 USD fileguard és tranzakciós projekt/user guard minden OpenAI-híváson; ebben a kézzel léptetett mintában az összes kezdeményezett foglalás összege legfeljebb 1,90 USD, a külön Sonneté legfeljebb 0,20 USD. A leíráshiba javítása tudatos új immutable release-copy/review, nem automatikus paid retry. Cache-előny nem szükséges a plafon betartásához; ismeretlen usage teljes foglalását megtartjuk. Sol routing maradt, Sonnet csak független auditor; tömeges seed-generálást nem indítottunk.

## Ellenőrzés és megmaradó kapuk

Helyi `pnpm check` sikeres: format, types, **464 teszt/39 fájl**, API/worker/Next production build. A 105 séma és 001–025 immutable marad; az új runtime main CI még ellenőrizendő. Korábbi exact [verify/container CI](https://github.com/Muzsy/future_flow/actions/runs/37507371476), runtime `9850a6ae`: 105 séma drift nélkül, izolált valódi PostgreSQL/CA TLS és 001–025 ismétlés, párhuzamos Official Confirm/linkcsere/source-revoke/deletion-reader/recovery/export/cascade/RLS; mind a 71 korábbi proof, HTTPS/tiszta worker-stop, provider-AI 0.

Ez a mostani bizonyíték valódi Auth/HTTP és valódi OpenAI/Claude; nem teljes pozitív böngészős Official UI-próba. A böngészőeszköz localhost hozzáférési korlátja megmarad; nem kerültük meg. Az Official fióktörlés verseny/recovery/source-revoke/cascade határa az izolált PostgreSQL CI-ben bizonyított, a mostani valós Auth-törlés az ideiglenes próbafiókokra vonatkozik. A megtartott seed-fiókot nem töröltük.

**Következő:** P10 Discovery és nyilvános bejelentés/moderáció a kis ellenőrzött pilot köré; P11 Community publikálás/bejelentés/profilfolyamat teljesítése, P12 public decision-point fork, P13 metrikák/permission/privacy/SEO/minőség és használói visszajelzés. A 50–100 élet/20–30 Scenario bővítési célhoz később mért költség és elegendő jóváhagyott keret kell. S3 raw/backup-retention és régi személyes próza, billing/grace/deadline; S4–S7; P06 valós DB-kiesés/recovery/backup/restore/email; Contabo tűzfal/karbantartás/proxy/DNS/TLS és külön éles AI-allowance továbbra kapu. A teljes korábbi terv megmarad. Main/staging/CI nem éles alterward.com deploy.
