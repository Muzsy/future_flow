---
status: active-supporting
owner: operations
last_reviewed: 2026-10-19
related:
  - BETA_HU.md
  - BACKUP_HU.md
  - RECOVERY_HU.md
  - ../PERSONAL_BETA_READER_OPERATOR_HU.md
  - ../PERSONAL_BETA_OPERATOR_HU.md
---

# Linux személyes béta operátor és egyszeri állapotátadás

## Végrehajtott állapot és fennmaradó határ

PR #21 (`0b57f7f`) beolvadt; az eredeti v2 state átvétele, hostpin/backup/GitHub hitelesítés ellenőrzése és a normál reader/funded/daily Linux-végrehajtás megtörtént. A tényleges reader-aktiválás, candidate-hoz kötött backup/restore, funded apply/inspect és későbbi signed-in paid E2E igazolt; a normál műveletekhez nem kell Windows-agent. A pontos résztvevői mapping és teljes proof privát marad. Ez a dokumentációfrissítés nem futtatott új operátori ellenőrzést.

A már funded futó alkalmazás új narratív forrásra frissítésének kódja és izolált fixture-jei elkészültek (Issue #34 / N09, [lent](#funded-runtime-upgrade-n09-issue-34)); élesben még nem futott, és a kiadási kapui nyitottak. Az eljárás nem jogosít fel a régi owner-upgrade megkerülésére, új window nyitására vagy ledger-resetre. Owner-image deployment és a régi Windows scheduler nem része O01-nek.

## Scope és kiadási kapu

A reader, funded-personal, daily és writer-fence operátori CLI Windows és Linux hoston futtatható. Más platform elutasított. A régi Windows-default megmarad; Linuxhoz explicit abszolút `ALTERWARD_SSH_SECRETS_DIR` szükséges. Ez nem owner-image deployment port és nem scheduler-migráció: a régi owner/preflight/upgrade/backup-rehearsal eszközök és Windows időzített feladat nem kerülnek át. A személyes béta normál reader/funded és napi backup/sync/restore/monitor lépéseihez nincs Windows-futtatás a sikeres migráció és kiadás után.

Fejlesztési branchből éles konfiguráció nem futtatható. Az eredeti kanonikus kapuk megmaradnak: pontos committed main, forrás/helper-hash, sourceCommitra értékelt audit, pontos Verify/Container CI, tényleges Linux/root fixture, original-zero/reviewed image, friss Access-readback, candidate-hoz kötött backup/izolált restore, 900 s, lock/journal/writer/post-check. Az új Linux entry pointot is release előtt izoláltan és a pontos kiadási commiton ellenőrizni kell. A migrációs fájl nem audit-, fixture-, backup- vagy apply-proof.

## Linux privát workspace

A dedikált operátori checkout rootja 0700 és a futtató user tulajdona. `.local` és secret könyvtárak 0700, inputfájlok 0600, egy hardlinkkel, saját tulajdonossal. Alias, symlink, idegen tulajdonos, csoport/egyéb által írható ancestor elutasított; a root-owned sticky temp gyökér csak teszteléshez elfogadható. Ne lazítsd ezeket azért, hogy egy megosztott workspace működjön. Valódi host UID-k szükségesek: root UID-t átíró sandboxban ez a kapu szándékosan megtagadhatja a futást.

A szükséges eredeti titokfájlok: `contabo_alterward_ed25519`, `contabo_known_hosts`, `alterward_backup_identity.txt`. Nem generálunk helyettesítő backup identityt, nem fogadunk új hostpint, nem kapcsoljuk ki SSH/TLS-ellenőrzést. Linux SSH-n a saját config, globális known-hosts, forwarding és további identityk kizártak. A funded operátor a secrets-directory útvonalát megőrzi az OS-only child environmentben, provider/DB/Auth kulcsot továbbra sem örökít gyerekfolyamatokra.

## Egyszeri titkosított átadás

A `alterward-operator-transfer-2` szerződésű `scripts/operator-state-transfer.mjs` Node 24-gyel, külső dependency nélkül fut. Nem indít szerveres műveletet vagy hálózati kapcsolatot.

1. Linuxon `node scripts/operator-state-transfer.mjs --create-recipient /private/transfer-key` létrehozza az egyszeri 3072 bites RSA fogadókulcsot. A private PEM Linuxon marad, soha nem kerül SMB/Git/reportba. Csak a public PEM és SHA-256 fingerprint megy Windowsra.
2. Windows agent ellenőrzi a public fingerprintet és a script hashét; az operátori műveletek ne fussanak párhuzamosan. A meglévő, védett `.local` state és eredeti secret könyvtár olvasható legyen a saját Windows identitásával. `node operator-state-transfer.mjs --export recipient-public.pem <eredeti-secrets-dir> OPERATOR_STATE_TRANSFER.enc.json` a repo gyökeréből fut.
3. Az export kötelezően viszi a funded seed-exclusionhoz szükséges eredeti `.local/closed-beta-catalog/state.json` fájlt is (window/topic owner adatokat nem találgatunk). JSON-receipteket visz a megnevezett operátori state-mappákból és pontosan a három eredeti secretfájlt. Nem visz providerkulcsot, env könyvtárat, node_modules-t, lockot vagy backup archívumot. A célrepó meglévő HTTPS Git-credentialjét, ha elérhető, kizárólag a ciphertextben `operator-secrets/github_ci_credential.json` néven átveszi: így Linuxon is valódi friss GitHub API GET ellenőrzi a CI-t. A token eredeti jogosultságait ez nem szűkíti; a CLI csak CI-readbackre használja és nem adja Git-pushnak, SSH-nak vagy riportnak. `githubCredentialCaptured=false` esetén a többi eredeti adat átvehető, de CI-auth pótlásig nincs aktiválás. Aktív helyi napi job-lock mellett megáll. A ciphertext AES-256-GCM authentikált; az egyszeri kulcs RSA-OAEP SHA-256-tal csomagolt. A manifest fájlonként hash-t tartalmaz; az eredeti fájlok bájtjai változatlanok maradnak, export előtt/után ellenőrzöttek. Az eredeti Windows állapotot nem töröljük.
4. Linux operátor visszaolvassa a ciphertext hashét és a saját private kulccsal importál: `node scripts/operator-state-transfer.mjs --import OPERATOR_STATE_TRANSFER.enc.json /private/transfer-key/recipient-private.pem /private/linux-checkout`. A cél `.local` még nem létezhet; nincs overwrite/merge. Korlátos, engedélyezett path-lista; path traversal, prefixütközés, duplicate, alias és hashhiba elutasított. Staging után egy rename publikálja az új `.local` state-et; minden fájl 0600, könyvtár 0700. A privát importmanifest rögzíti a fájlhash-eket és a régi sourceCommitot.
5. Az importált receipt byte-ja és a benne lévő eredeti időpont/sourceCommit változatlan. Lejárt prepare nem válik frissé. A Linux `ALTERWARD_SSH_SECRETS_DIR` az importált `.local/operator-secrets` abszolút útvonala. A régi Windows backup-archívumok megmaradnak ott; a Linux napi sync az eredeti szerverről az aktuális ciphertextet tölti le új helyi példányba, majd új izolált restore szükséges. A régi restore proofot nem használjuk új candidate-re.
6. Privát inspect és hostpin/backup-recipient-egyezés után a szokásos reviewed-main release és daily update/archive/readers ciklus következik. Minden éles változtatás után readback. Nincs automatikus paid AI: funded aktiválás csak tényleges első belépés és Auth/application UUID-binding után.

Titkot vagy teljes proof-bodyt ne írj konzolba/riportba. A fogadó private kulcs, plaintext staging, importált secret és ciphertext külön operátori adat; Gitbe nem kerül. A migrációs kulcs a sikeres, ellenőrzött átvétel végén az operátori policy szerint eltávolítható; a három eredeti recovery/SSH fájl megmarad privátan. A régi Windows scheduler változatlan marad; ez a változtatás nem kapcsolja ki és nem duplikálja.

## Az első, hiányos v1 átadás kezelése

A v1 csomag nem tartalmazta a funded operátor által olvasott eredeti katalógusállapotot. Ezért nem teljes béta-operátori migráció és a v2 nem fogadja el. Ha v1 már privátan importált, nincs éles aktiválás és nincs overwrite: az eredeti v1 ciphertext/manifest/state megmarad. Új v2 export új ciphertext-fájlnévvel készül, az eredeti `closed-beta-catalog/state.json` byte-jával. A v2 először külön, üres 0700 Linux staging workspace-be importálandó; az eredeti receipt és SSH/recovery fájlok hash-ei összevetendők a v1 manifesttel, GitHub-credential esetleges változása külön ellenőrzendő. A régi privát import őrzött, repositoryn kívüli archívumba helyezése és az új state név szerinti cseréje csak rendezett, operátorfutás nélküli helyi állapotban történhet. A CLI nem olvaszt össze és nem ír felül létező `.local`-t. A forrás-receiptek tartalmi időpontját/sourceCommitját nem módosítjuk; a lejárt reader-előkészítés a szerveren továbbra explicit archiverrel rendezendő.

## Méretkorlátok

A konkrét eredeti `closed-beta-catalog/state.json` 8 MiB-ig vihető át és olvasható a funded CLI-ben; a valódi 3 272 672 bájtos állomány belefér. A többi receipt/secret egyenként továbbra legfeljebb 2 MiB, a plaintext csomag összesen 32 MiB. A katalógus nem darabolandó/csonkítandó és nem kell újragenerálni. A méretellenőrzés az export első és utolsó hash-beolvasásában, a decrypt/validate/import szerződésben és a funded inputon is érvényes.

## Funded-runtime upgrade (N09, Issue #34)

Állapot 2026-10-19: kód, root fájl/állapot fixture, valódi PostgreSQL fixture és CI-lépések kész, draft PR-ben. **Éles prepare/apply, migráció, deploy és fizetett hívás nem történt.** A lenti kiadási kapuk lezárásáig az apply nem futtatható.

Belépési pont: `node scripts/contabo-funded-upgrade.mjs --<mód>` (csak Linux, clean committed main). Módok: `inspect`, `prepare-funded-upgrade`, `apply-funded-upgrade`, `recover-funded-upgrade`, `readback-funded-upgrade`. A root végrehajtó `scripts/ops/contabo-funded-upgrade.py`, a tiszta szabályréteg és állapotgép `scripts/ops/contabo-funded-upgrade-policy.py`, a read-only DB-állapotfelvétel és image-képességpróba `scripts/lib/funded-upgrade-observation.mjs`. A privilegizált csomag (hash-elve, a loader `BUNDLE` listája): backup, target, owner, activation, upgrade, writer-fence, readers, personal-observation, funded-policy, funded-upgrade modul, plusz a megfigyelő JS forrás. Az auditnak pontosan ezt a forráskészletet kell lefednie.

**Kiindulópont.** Csak az alkalmazott, `exposure-committed` személyes béta aktiváció (vagy annak egy korábbi journalozott funded upgrade-je) lehet authority. Owner-zero, image-only owner-upgrade vagy kézzel szerkesztett receipt nem; a live bájtoknak egy journalozott műveletből kell származniuk. Az aktiváció fájljai olvasottak, soha nem íródnak újra.

**Mi változhat.** Csak a `server.env` `ALTERWARD_TAG` sora, a pinned image és a négy PR #53-kulcs, kizárólag defaulton (`legacy`, üres cohort, 180000 ms, 100000 bájt), valamint a séma a target image saját migrációival (most 038). Window kezdete/vége, project/user keret, résztvevők, Access-e-mailek, napi/concurrent limitek, providerkulcs és minden más env-bájt változatlan; a candidate render ettől eltérve elutasított. Cohort bekapcsolása, hosszabb deadline vagy nagyobb envelope külön, későbbi konfigurációs lépés.

**Prepare** (nem mutál, 900 s): pontos target és recovery build proof (a target ez a reviewed source vagy registry-image), a futó api-n át read-only állapotfelvétel, mindkét image képességpróbája `--network none --read-only` konténerben, a candidate fájlok, az előző live fájlok archív másolata, és a candidate a következőkhöz kötve: source/helper/megfigyelő hash, CI run-ok, audit, aktív manifest és fájlhash-ek, aktivációs journal, funded projekció, védett env, ledger, policy-leltár, proxy, Access, CA, idegen konténerek.

**Apply sorrend** (`transition`): durable intent → a projekt három szolgáltatásának scoped stopja → held fence: friss állapotfelvétel a leállított writerek mellett, drain, friss képességpróba mindkét image-re a friss leltárral, idegen konténerek → 038 a reviewed `pnpm db:migrate` futóval a target image-ben → séma = target image migrációi és ledger/fiókok/policyk/artifactok bájtra azonosak → fájlpromóció → web+api → origin probe → worker (az egyetlen fizetős folyamat) utoljára → teljes post-check → `applied` journal. Az apply előtt friss (≤ 3600 s), a prepare után készült, valódi offsite restore szükséges, amelynek archívuma tartalmazza ezt az előkészítést (`FUNDED_UPGRADE_ARCHIVE_POLICY_VERSION = 1` a telepített daily-ben).

**Drain.** A queue-flag nem drain. Blokkol: queued/running/validating job bármely queue-táblában, élő lease, `generating` branch, nyitott (`reserved`) budget-foglalás, nem terminális befagyasztott narratív job. Az `unknown` és `completed` foglalások megmaradnak, nem nullázzuk őket. A kézi canon/checkpoint/admission átírás tiltott; ilyenkor az apply a 038 előtt áll meg és az előző funded runtime tér vissza.

**Recovery szabály.** Hibánál a **DB** dönti el, megtörtént-e a 038 (bizonytalan eredmény = megtörtént). 038 előtt: az előző funded fájlok és image vissza, ellenőrzés, `restored-previous`. 038 után: pre-038 image soha nem szolgálhat; csak a prepare-ben igazolt, a target sémáját és minden tárolt policyt értő reviewed recovery image indulhat (web+api, ellenőrzés, majd worker), különben minden leállítva marad, `closed-recovery-required`. Megszakadás után nincs vak újrafuttatás: `recover-funded-upgrade` ugyanezt a döntést hozza, előre nem lép; a megszakadt vagy zárt (nem terminális) kísérlet új prepare-t blokkol. A CI run azonosítókat, az audit hash-t és a helper hash-eket a loader ellenőrzi és továbbadja; a root végrehajtó az élő állapotot, az előkészítés kötéseit és az image-bizonyítékokat ellenőrzi újra. Csak a 038 lehet függő migráció. Bizonyíték nem törölhető; a daily archívum minden kísérletet visz.

**Vészleállítás változása.** Ha bármely funded-upgrade journal létezik (kivéve `restored-previous`), a meglévő reader/personal `disable` leállít, de az eredeti pre-038 owner-zero image-et már nem indítja vissza; a writerek leállítva maradnak.

**Ellenőrizve a PR-ben:** 25 tiszta policy/állapotgép teszt, 16 root fájl/állapot fixture (siker, hibás post-check kompatibilis recoveryvel és anélkül, 038 előtti hiba, reservation/lease, újonnan befagyasztott olvashatatlan policy, migráció alatti ledgerváltozás, megszakítás 038 előtt és után, lejárt/módosított prepare, idegen/Access/forrás drift, pre-038 és policy-vak recovery, owner-zero authority, journal nélküli live bájtok, lockverseny), 3 archívumteszt, valódi PostgreSQL fixture (001–037, valódi `migrate.ts` 038, ledger/fiók/policy/artifact megőrzés, flag-off ≠ drain, pre-038 és csak-v1 recovery elutasítás, pg_dump/pg_restore artifact-megőrzés, törlés-replay), és CI-ban képességpróba a ténylegesen buildelt image-ben.

**Nyitott kiadási kapuk** (egyik sem helyettesíthető szöveggel): független, commithoz kötött source audit erre a csomagra; Verify/Container CI a kiadási main commiton; target és recovery build proof immutable digesttel; post-038 replay/recovery image felvétele a `deploy/reviewed-recovery-images.json`-ba és a 9eb-hez kötött replay-ellenőrzés (`assertReplayInputsUnchanged`) új, reviewed replay-kiadása; a telepített daily frissítése az új archívum-policyval; tényleges Linux/root target fixture a valódi szerver Docker-környezetében (`funded-upgrade-fixture-proof.json`); candidate-hoz kötött titkosított backup/offsite/izolált restore/privacy replay; kifejezett tulajdonosi éles apply engedély. A béta budget (10 USD / 3 tesztelő) új 30 napos ablaka nem ennek az útvonalnak a része: ez a meglévő ablakot változatlanul viszi tovább.
