# alterward — Shared Context S0 megvalósítás

2026-10-04 · [Aktív terv](SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) · [Következő lépések](NEXT_STEPS.md) · [Státusz](STATUS_HU.md).

Az S0 helyi implementációja elkészült: külön szerződés, privát tárolás, social profile, szerveroldali entitlement és meghívási API. A személyes v1/v2 modell és a korábbi public MVP terve megmarad. A Shared funkció mind a négy flagje alapból kikapcsolt; még nincs Connections-felület, shared generálás vagy felhasználói friend kiadás. A következő fejlesztési szelet S1, majd S2 valódi AI és S3 személyes integráció/biztonság.

## Megvalósított rész

- Külön Shared 1.0.0 Zod-szerződés: öt típus, státuszok, tier/policy, minimális InteractionProfile, típusos állapot és zárt candidate/impact változások, szigorú kérési DTO-k és angol hibakatalógus. Tizenegy új [JSON-séma](contracts/shared/createRequest.schema.json); a tizennyolc régi séma és a Life v2 2.0.0 változatlan. A `memory.sharedEvents` saját sémája előkészített; a személyes AI-bemenetbe még nincs bekötve. Intent/resolution domain-szerződés és végrehajtás S1.
- Additív [008](../database/migrations/008_shared_context_foundation.sql) és [009](../database/migrations/009_shared_entitlements_and_social_profile.sql): tíz Shared tábla, social profile, entitlement és block-alap. Mind a tizenhárom RLS-védett, anon/authenticated direkt jog nélkül. Meglévő 001–007 változatlan. Canon update-védelem, kontextuson belüli FK-k, saját ágkötelezettség, egy aktív job és egy élő tagság/user/context DB-védelme.
- A romantikus egyediség a live contextet és a tagságot együtt kezeli: paused helyet foglal, ended/archived felszabadít, történeti tagrekord marad. A `context_live` mezőt triggerek szinkronizálják, kliens nem szabhatja meg. A típusok üzleti formation/consent folyamata S4–S6; az API egyelőre kizárólag friend létrehozást enged.
- A hiányzó/lejárt entitlement Free. Explorer 1 friend, Connected 3 megfelelő típus, World legfeljebb 5; minden résztvevő saját jogosultsága számít. Server fixture/admin rekord előkészített, kliens nem írhat paid/tier mezőt. Billing, checkout, ár és automatikus downgrade/grace kezelés még nincs. Olvasás és kilépés csomagváltás után is engedett, új create/invite/accept nem kerülheti meg a korlátot.
- Explicit adult/AI acknowledgement és külön `sharingAcknowledged:true`, `shared-profile-v1`. Alapból csak a választott social displayName kerül az InteractionProfile-ba; korcsoport, ország, foglalkozás és szerep null. Ezeket csak külön, allowlist szerint megadott profilból osztjuk meg. Privát cél, pénzügy, munkahely, email, más context és teljes memóriagráf nem kerül át.
- Context/revision/idempotencia és rendezett user UUID → context → invite/member → saját branch zárak. Az elfogadás újra ellenőrzi a létszámot, saját slotot, a résztvevők entitlementjét, blokkot, ágállapotot és dátumot. A másik tag személyes ág- és életazonosítója nem szerepel a DTO-ban.
- Kilépés, owner end, ended context archiválása, meghívó visszavonása. Az owner kilépése/törlése után a legrégebben csatlakozott megmaradt aktív tag kapja az admin szerepet, stabil ID tie-breakkel; aktív tag hiányában paused tag lehet utód. Ez nem történetbeli szerep és nem személyes döntés. A context két élő tag alatt paused, nulla tagnál ended; egyedül nem generálhat majd shared eseményt.

## API és meghívó

Az Auth-védett `/api/v2` controller csak explicit `SHARED_CONTEXTS_ENABLED=true` és `SHARED_FRIEND_ENABLED=true` mellett működik; a normál konfigurációban 404. OpenAPI szigorú JSON request-sémákat és bearer-authot ad, minden API-válasz `no-store`.

| Útvonal | Megvalósított művelet |
|---|---|
| `GET/PUT /social-profile` | Saját alias/discoverability, csak olvasható entitlement |
| `GET/POST /shared-contexts`, `GET /shared-contexts/:id` | Saját lista, explicit saját ágkötés, tagsági részlet |
| `POST /shared-contexts/:id/invites` | Owner meghívás, opcionális címzett |
| `GET /shared-invites`, `POST /shared-invites/preview` | Címzettlista, minimális hitelesített tokenelőnézet |
| `POST /shared-invites/:id/accept`, `/decline` | Egyszeri elfogadás, célzott címzett visszautasítása |
| `POST /shared-contexts/:id/leave`, `/end`, `/archive` | Biztonságos tagsági/context életciklus |
| `POST /shared-contexts/:id/invites/:inviteId/revoke` | Owner visszavonás |

A mutációk `Idempotency-Key` fejlécet, az állapotfüggő műveletek aktuális context/branch revisiont kérnek. Ugyanaz a kulcs/bemenet nem hoz létre második tagságot vagy meghívót. Nyitott linket tetszőleges linkolvasó nem utasíthat vissza mások helyett; decline csak név szerint címzett meghívónál engedett. Régi/kiküldött, de nem elfogadott meghívó nem foglal user slotot.

A 256 bites token HMAC-SHA256 PRF-fel keletkezik egy véletlen invite UUID-ból és külön szerveroldali 256 bites kulcsból; a DB és az idempotencia-cache csak hash-t/metaadatot tárol. Így ismételt createInvite ugyanazt a tokenválaszt adja raw bearer-token tárolása nélkül. A token 43 base64url karakter; előnézet POST bodyban érkezik, nem URL-ben. Technikai alaplimit: 7 nap érvényesség, ownerenként/contextenként 20 új meghívó/24h, az API általános 120 kérés/perc/IP limitjén belül. Token nem kerül logba/Gitbe/klienskonfigurációba. Külön megosztási UI és dedikált felhasználói preview-rate-limit S3.

`SHARED_INVITE_SIGNING_KEY` csak szerveroldali `.env`, pontosan 64 lowercase hex karakter; a mintában üres, normál induláshoz kikapcsolt feature mellett nem kell. Kulcsrotáció előtt a még függő meghívókat vissza kell vonni és új kulccsal új meghívókat kell kiadni: a régi tokenhash önmagában nem változik meg kulcscserétől, viszont a cached metadata alapján történő rekonstrukció már az új kulcsot használná. Több kulcsverziós rolling rotáció későbbi ops-bővítés.

## Időkezelés és törlés

S0 konzervatív, visszafordítható korlátja az **azonos naptári nap**: a belépő és a meglévő tagok személyes ágai pontosan a context dátumán álljanak, ready/decision állapotban. Azonos hónap másik napja is `SHARED_TIME_MISMATCH`; nem engedünk hallgatólagos visszadátumozást vagy időugrást. A forrás compatible-month/latest-anchor szabályának teljes megvalósítása S1/S3 idő-/impact-szabályával együtt következik.

Az account-export saját social profile/tier, saját membership/profil/referenciák, jogosult minimális context-state és saját invitation metaadat projekciót kap; másik user ID/branch/profil, bearer/hash vagy mások intentje nem szerepel. A későbbi canon/impact export S1/S3 feladat, amikor valóban keletkezik ilyen tartalom.

Deleting állapotban a felhasználót érintő shared job is elveszíti a lease-t. A meglévő Auth/DB deletion és recovery cleanup DB-triggerrel visszavonja a bejövő/címzett meghívókat akkor is, ha a címzett soha nem csatlakozott, valamint a saját kimenő meghívókat. Leválasztja a pending impactot, anonimizálja a member profilját és személyes referenciáit, törli a social/entitlement/block saját adatát, és rendezi a megmaradt admin szerepet. Más tagok közös canonja/contextje megmarad. A korábban megszakított shared job payload/checkpoint a tényleges cleanupban kiürül.

Ez strukturális privacy-alap. Már generált szabad próza PII-redakciója, résztvevői canon-export, report/block kezelőfelület, retention/backup és teljes valódi Shared Auth/AI/recovery próba S3 kiadási kapu; a nullable referenciák nem igazolnak teljes anonimizálást.

## Ellenőrzés és alkalmazási állapot

35 új domain/adatbázis/HTTP regresszió, a korábbi 159 mellé: a jelenlegi tesztkészlet 194. Az első teljes `pnpm check` 193 teszttel, formázással, típusokkal és API/worker/Next builddel sikeres; az utolsó törlési javítás után mind a 17 persistence teszt ismét sikeres. A tizenegy új séma kódból exportált, a régi tizennyolc byte szerinti tartalma változatlan. A későbbi teljes CI az aktuális 194-es készletet ellenőrzi.

A Linux container CI külön PostgreSQL 16/TLS fixture-ben futtatja a [valódi párhuzamos próbát](../scripts/smoke-shared-foundation.mjs): Explorer utolsó slot, World ötödik slot, csoport tizedik tagja, két fiók átfedő/ötcontextes törlése. A migrációs runner két alkalommal fut, kilenc migrációval. Nincs kimenő hálózat, valódi credential, személyes adat vagy AI-job; fizetett hívás nulla. E próbák eredményét a main CI lezárása után rögzítjük; a PGlite önmagában nem deadlock-bizonyíték.

**Fejlesztői Supabase:** a 008/009 alkalmazása jelenleg függő. A mostani helyi hálózat csak IPv4-en használható, a védett konfiguráció direct DB címe IPv6-only: A rekord nincs, AAAA rekord van, közvetlen IPv6 TCP `ENETUNREACH`, a normál kapcsolat `ENOTFOUND`. Auth health 200. A migráció a kapcsolat felvétele előtt megállt, DB-módosítás nem történt. A projekt Connect → Session pooler címét bekértem; verified TLS megtartása mellett ezzel folytatjuk az additív alkalmazást. A pooler host/index és username a dashboardból másolandó, nem a régióból kitalálandó. [Hivatalos kapcsolódási útmutató](https://supabase.com/docs/guides/database/connecting-to-postgres).

Contabo nem változott, deployment nem történt. OpenAI/Claude-hívás nulla; a két megőrzött 5 USD kísérleti napló és a nulla éles allowance változatlan.
