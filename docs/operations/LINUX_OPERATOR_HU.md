---
status: active-supporting
owner: operations
last_reviewed: 2026-10-15
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

A már funded futó alkalmazás új narratív forrásra frissítése külön hiányzó képesség, Issue #34 / N09. Az alábbi migrációs és kiadási eljárás nem jogosítja fel a régi owner-upgrade megkerülésére, új window nyitására vagy ledger-resetre. Owner-image deployment és a régi Windows scheduler nem része O01-nek.

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

## Aktív funded runtime új verziója

A dedikált Linux upgrade/recovery implementáció és finite archive-határ: [funded runtime runbook](FUNDED_RUNTIME_UPGRADE_HU.md). Ez az eredeti ablakot és ledger-t megőrzi; nem owner-zero aktiválás és nem production engedély. A schema-038 kompatibilis recovery az aktuális DB-t használja; a quarantine restore szabályai változatlanok.


## Személyes éles hullámvezérlő kliens — #179, 2026-11-06

A `scripts/contabo-service-operator.mjs` a meglévő root `contabo-service-operator.py` és `contabo-service-profile.py` commitolt bájtjait futtatja privát ideiglenes könyvtárból, a meglévő pinned SSH úton. Csak tiszta, commitolt `main` checkoutból használható Linuxon és Windowson; Linuxon az `ALTERWARD_SSH_SECRETS_DIR` explicit védett könyvtár. Nem telepít Daily-t, nem cserél image-et, nem módosít budgetet, Authot vagy billing-szintet. Az SPR, az eredeti intent/CAS/journal és a restore-karantén továbbra a root operátor hatásköre.

Parancsok (az író példák először SSH nélkül kiírják a szükséges `--confirm` mondatot):

```bash
node scripts/contabo-service-operator.mjs status
node scripts/contabo-service-operator.mjs bootstrap
node scripts/contabo-service-operator.mjs wave --capacity 1 --open --approve-added 1
node scripts/contabo-service-operator.mjs resume
node scripts/contabo-service-operator.mjs pause
node scripts/contabo-service-operator.mjs wave --close
node scripts/contabo-service-operator.mjs pause --emergency
node scripts/contabo-service-operator.mjs wave --close --emergency
```

Minden író futtatáshoz Ákos konkrét műveletre szóló jóváhagyása kell. A kliens által kiírt `service-operation <digest>` mondat a teljes kliens-commitot, a feltöltött Python-fájlok digestjét és a pontos parancsot/paramétereket köti; ezt kell `--confirm "<mondat>"` értékként hozzáadni. A mondat nem új kapacitás- vagy költési engedély, és nem helyettesíti a root friss állapotellenőrzését. A `status` alkalmazási/DB szempontból megfigyelés, de létrehozhatja az operátori állapotkönyvtárat/zárat, és átmeneti probe-konténert használ. `ok:true` státuszválasznál a lekérdezés sikerét jelenti, nem automatikusan egészséges szolgáltatást: a teljes privát eredményt ellenőrizni kell.

A kapacitás **abszolút**: A8-hoz `capacity 1`, majd annak sikeres, egy helyet elfoglaló admissionje után `capacity 10 --approve-added 9` nyit kilenc szabad helyet. Más aktuális kapacitásnál a hozzáadott helyek száma más; a root operátor ezt friss adatbázis-státuszból ellenőrzi. `wave --open` nem engedélyezi a generálást vagy a Checkoutot. A bootstrap mindkettőt szüneteltetve indítja; A8 előtt külön, jóváhagyott `resume`, majd `status` visszaellenőrzés szükséges. Vészhelyzetben csak a `pause --emergency` és a `wave --close --emergency` csökkentheti a kitettséget igazolt SPR nélkül.

Az egyedi UUID-val megőrzött, felül nem írt intent/result/failure bizonylatok a `.local/contabo-service-operator/` privát könyvtárban vannak; Linuxon 0700/0600. Teljes státusz/fiókazonosítók nem kerülnek konzolra vagy repóba. Az intent SSH előtt tartósul. Transporthiba, időtúllépés vagy hibás commit-válasz után az eredmény bizonytalan: **nincs automatikus újrapróba**. Meg kell vizsgálni a root `/var/lib/alterward/service-operations/journal.jsonl` naplóját, és az eredeti helper/probe megszűnésének igazolása után a meglévő root `reconcile` eljárással rendezni az eredeti operation-id-t; ezt a kliens szándékosan nem automatizálja. A helyi UUID nem a root operation-id.

Forrásellenőrzés: `node --test tests/ops/service-operator-client.test.mjs`; a valódi Python-loader privát fájlokat, takarítást, hash- és argv-védelmet tesztel, a tényleges helyi CLI eldobható commitolt main checkoutban, helyettesített SSH-val fut. Ez nem célgépes/root/éles próba. A PR/független review/saját és main CI, majd a konkrét éles művelet engedélye külön kapu; a #179 implementáció nem indít hullámot.
