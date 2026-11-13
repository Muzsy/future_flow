# alterward — adatvédelmi helyreállítás: végrehajtható kód és jogosultságok

2026-10-11 · [Kiadási sorrend](NEXT_STEPS.md) · [Karanténos ellenőrzés](PRIVACY_RESTORE_VERIFIER_HU.md) · [Fizikai írásstop-próba](WRITER_FENCE_TRANSPORT_HU.md).

A [külön operátori katalógusellenőrző](../scripts/lib/privacy-security-catalog.ts) normál fejlesztési profilja a001–040 migrációk public alkalmazási sémája:102 tábla/906 oszlop/226 FK,748 constraint/267 index/906 default-identity-generated sor;27 függvény és66 saját trigger változatlan. A történeti039 és a korábbi funded alap külön explicit belépési pontokon ellenőrizhető. Policy, sequence, rewrite rule és saját domain/enum/range nem megengedett az ismert alapban. A reviewed count/digest tiszta, izolált migrációs mérésből kerül a forrásba, nem az éles DB automatikus megtanulásával. Ez a040 fejlesztési alap, nem állítás a hosted sémáról; a lenti dátumozott hosted/checkpoint bizonyítékok történetiek.

Az ownership, RLS, táblaszintű/oszlopos/függvény- és default grant, sémajog, szerepképesség és tagság leltára a friss authority kötelező digestje. Két capture között a jogosultságváltozás is megváltoztatja az összevetett állapotot. Az anon/authenticated szerep nem lehet login, superuser, szerep-/adatbázis-létrehozó, replikációs, RLS-t megkerülő vagy más szerep tagja; táblás/oszlopos és PostgreSQL 17 MAINTAIN jog tiltott. A hosted forrás ismert statement_timeout korlátja megengedett és a digestben szerepel; más szerepbeállítás elutasított. A platform ismert default jogait rögzítjük, de azok nem engedélyezik a másolat kiszolgálását.

Replay előtt a tényleges véletlen `aw_restore_…` név, ismert kód/séma és postgres ownership kötelező. Kizárólag SERIALIZABLE karanténtranzakcióban vonható vissza a PUBLIC/anon/authenticated és opcionális service_role táblás/függvény-/sémahozzáférés; a PUBLIC alapértelmezett függvényvégrehajtás is megszűnik. A szigorú karanténellenőrzés ezután csak tulajdonosi objektumjogot, korlátozott szerepeket és a séma ártalmatlan PUBLIC USAGE jogát engedi. Nem importál új grantot, hosted Authot vagy providerkulcsot. A külön read-only utóellenőrzés ugyanazt a katalógus- és joghatárt újra vizsgálja a commit után, javítás nélkül.

Korábbi, c288681 bizonyíték: harminc sikeres helyi célpróba; tényleges Contabo PostgreSQL 17 régi snapshot/replay/rollback/időzóna/utóellenőrzés és az ezt követő teljes, leállítás nélküli fence-plan sikeres. Az értékelt Claude-forrásaudit nem talált kritikus, magas vagy közepes hibát. A [c288681 CI](https://github.com/Muzsy/future_flow/actions/runs/38116503281) verify feladata sikeres, container feladata PostgreSQL 16-on elutasított. A CI most a Contabón már kipróbált PostgreSQL 17 pontos registry digestjét használja; ez nem éles adatbázisfrissítés. Az új jogosultsági javítások és bővített regressziók pontos auditja/CI-je/célpróbája külön következik.

Az event triggerek és globális/aktuális adatbázis szerepbeállításainak digestje a forrás állapotkötésének része; a beállításértékek nem kerülnek authorityba vagy riportba. A karanténban mindkét kategória tiltott, már a REVOKE előtt: régi event trigger nem futhat a jogosultság-visszavonás DDL-jére. A postgres globális függvény-default ACL explicit korlátozása is kötelező. A hiányzó sor PostgreSQL-ben implicit PUBLIC EXECUTE jogot jelent, ezért nem tekinthető üres jogosultságnak; az új regresszió igazolta és a javított ellenőrzés elutasítja ezt a kiskaput.

Trigger-disable, meglévő függvény SECURITY DEFINER/search_path/body módosítása, ALWAYS/REPLICA trigger, default/index/check/policy/rewrite drift, oszlopos/MAINTAIN jog, veszélyes szereptagság, ownership és default/sémagrant eltérés ellenőrzött. Az opcionális háromoszlopos migrációs ledger saját default/constraint/index alapja rögzített. A replay végrehajtható kódeltérésnél még a régi account sor módosítása előtt megáll; az envelope jogosultság-driftet is elutasít. A tényleges hosted public katalógus a bővített leltárral 06:13 UTC-kor read-only megfigyeléssel egyezett; éles adat-/Auth-írás és paid AI nulla.

A következő held-recovery transport csak tiszta, ismert migrációkkal felépített és betöltés előtt ellenőrzött sémába tölthet mentési adatokat. Schema+data betöltés utáni vizsgálat nem elegendő: régi kód már a betöltés során végrehajtódhatna. Ez a Claude SC02 kisebb megállapításának megtartott végrehajtási kapuja.

Határok: ez a public alkalmazási katalógus ellenőrzése, nem a PostgreSQL binárisának vagy minden platform extension/séma teljes auditja. A kliensnek megadott hash önmagában továbbra nem bizonyít fennálló fizikai fence-t. A [b2ef853 drill](WRITER_FENCE_TRANSPORT_HU.md) sikeres volt, majd visszaindult; az új katalógus fennálló recovery-fence-hez kötött replay/utóellenőrzése külön kapu. A másolat nem indíthat web/API/worker szolgáltatást, nincs promotion vagy automatikus újranyitás. A teljes hosted Auth-vesztés elfogadott kézi, zárva maradó újraépítése, a Shared személyes próza későbbi kapuja és a teljes korábbi fejlesztési terv megmarad.

06:15 UTC bővített helyi bizonyíték: 16 katalógus-, 12 replay-, 6 envelope- és 4 Auth-authority próba, összesen 38/38 sikeres; scripts TypeScript ellenőrzése sikeres.

06:27 UTC: a 20a6aa8 pontos [verify/container CI](https://github.com/Muzsy/future_flow/actions/runs/38117517173), értékelt Claude-audit, valódi PG17 fixture és külön teljes no-stop plan sikeres. Claude TD-01 kisebb tesztészrevételére a következő rehearsal-változat recording adapterrel már azt is vizsgálja, hogy kódeltérésnél UPDATE/DELETE/INSERT/DDL vagy FOR UPDATE sem indul; a rollback utáni soregyezés önmagában nem bizonyítaná ezt. [Következő held-recovery próba](HELD_RECOVERY_REHEARSAL_HU.md).

2026-10-14 N03: a 038 nullable period melléklet csak a defaults/identity/generated lista új, default nélküli JSONB sorát változtatja a közvetlenül megelőző 037 alaphoz képest. Az izolált migrációs mérés után kizárólag ennek count/digest értéke frissült; minden más katalóguskategória változatlan. A jelenlegi fejlesztési alap hosted visszaolvasása még nem történt meg. Az éles migráció és a schema-kompatibilis replay image külön kiadási kapu; a történeti hosted/audit bekezdések nem bizonyítják az új alap éles alkalmazását.

2026-10-31 B01 / 039: a négy billing tábla csak a constraints (712→739, `4cd52594…`), indexes (251→265, `c083c905…`) és defaults (856→892, `32e16aec…`) listát bővíti; függvény, trigger, policy, sequence, rule és típus nem változik (az `immutable` digestek azonosak). A 038-as katalógus a `assertFundedPre039SecurityCatalog` belépési ponton marad ellenőrizhető. Az ownership/RLS/grant leltár a friss authority digestje, nem rögzített állandó.

2026-11-01 #137 fejlesztési040 alap: constraints748 (`2d419bfa…`), indexes267 (`29092549…`), defaults906 (`ac421cf6…`); a többi immutable katalóguskategória változatlan. RLS aktív, PUBLIC/anon/authenticated tiltott mindkét registry-táblán. A `assertHistorical039PrivacySecurityCatalog` és `hardenHistorical039PrivacyQuarantine` pontos039-et kezel; a normál belépési pont040. A statikus reviewed digestekből képzett immutable elvárás nem élő katalógustanulás. A039 authority nem címkézhető át natív040-re. A külön bridge eredeti039 authorityhoz és intenthez kötve csak100-régi-táblás/receipt-megőrzés és üres2új-tábla mellett enged040 ellenőrzést. Ez fejlesztési forrásalap, éles040 orchestration és audit még #142.

A pinned Supabase CLI2.122.0 `db advisors --type all --fail-on error` ellenőrzése külön, csak szintetikus helyi PG17-en039 és040 állapotban egyaránt sikeres kilépésű: ugyanaz a27 `function_search_path_mutable` WARN, új registry-jelzés nélkül. Ez nem hibamentes általános security-audit: a27 korábbi public triggerfüggvény search_path keményítése külön reviewed katalógus-/recovery-változás, nem kerül hallgatólagosan a040 tárolószeletbe. A hosted Supabase nem lett vizsgálva vagy módosítva ebben a körben.


## A 049-es történetirányok adatai

A privát történet kezdeti válaszai az `aw_lives.input.story` mezőben vannak.
A még el nem indított történet válaszait az `aw_drafts.payload.story` és a
piszkozat szereplőinek opcionális megszólításmezője tárolja. Ezek a fiókexport
`aw_lives` és `aw_drafts` részeiben jelennek meg. Az egyező revíziójú és
tartalmú, felhasznált piszkozat az indításkor kiürül. A fióktörlés az aktív
alkalmazás-adatbázisból az életet, piszkozatot, feladatokat és fejezeteket
együtt távolítja el.

Az izolált API és worker próba szintetikus kezdőhelyzettel ellenőrizte az
exportot, a törlést és a nyers szöveg hiányát a vizsgált metrikákban,
interakciókban, idempotencia-rekordokban és konzolkimenetben. A kivételes
elkülönítő archívum külön üzemeltetési állomány, a megőrzéséről a 049-es
visszaállítási terv rendelkezik.
