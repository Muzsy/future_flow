---
status: active-supporting
owner: operations
last_reviewed: 2026-10-13
related:
  - BETA_HU.md
  - BACKUP_HU.md
  - RECOVERY_HU.md
  - ../PERSONAL_BETA_READER_OPERATOR_HU.md
  - ../PERSONAL_BETA_OPERATOR_HU.md
---

# Linux személyes béta operátor és egyszeri állapotátadás

## Scope és kiadási kapu

A reader, funded-personal, daily és writer-fence operátori CLI Windows és Linux hoston futtatható. Más platform elutasított. A régi Windows-default megmarad; Linuxhoz explicit abszolút `ALTERWARD_SSH_SECRETS_DIR` szükséges. Ez nem owner-image deployment port és nem scheduler-migráció: a régi owner/preflight/upgrade/backup-rehearsal eszközök és Windows időzített feladat nem kerülnek át. A személyes béta normál reader/funded és napi backup/sync/restore/monitor lépéseihez nincs Windows-futtatás a sikeres migráció és kiadás után.

Fejlesztési branchből éles konfiguráció nem futtatható. Az eredeti kanonikus kapuk megmaradnak: pontos committed main, forrás/helper-hash, sourceCommitra értékelt audit, pontos Verify/Container CI, tényleges Linux/root fixture, original-zero/reviewed image, friss Access-readback, candidate-hoz kötött backup/izolált restore, 900 s, lock/journal/writer/post-check. Az új Linux entry pointot is release előtt izoláltan és a pontos kiadási commiton ellenőrizni kell. A migrációs fájl nem audit-, fixture-, backup- vagy apply-proof.

## Linux privát workspace

A dedikált operátori checkout rootja 0700 és a futtató user tulajdona. `.local` és secret könyvtárak 0700, inputfájlok 0600, egy hardlinkkel, saját tulajdonossal. Alias, symlink, idegen tulajdonos, csoport/egyéb által írható ancestor elutasított; a root-owned sticky temp gyökér csak teszteléshez elfogadható. Ne lazítsd ezeket azért, hogy egy megosztott workspace működjön. Valódi host UID-k szükségesek: root UID-t átíró sandboxban ez a kapu szándékosan megtagadhatja a futást.

A szükséges eredeti titokfájlok: `contabo_alterward_ed25519`, `contabo_known_hosts`, `alterward_backup_identity.txt`. Nem generálunk helyettesítő backup identityt, nem fogadunk új hostpint, nem kapcsoljuk ki SSH/TLS-ellenőrzést. Linux SSH-n a saját config, globális known-hosts, forwarding és további identityk kizártak. A funded operátor a secrets-directory útvonalát megőrzi az OS-only child environmentben, provider/DB/Auth kulcsot továbbra sem örökít gyerekfolyamatokra.

## Egyszeri titkosított átadás

Az `scripts/operator-state-transfer.mjs` Node 24-gyel, külső dependency nélkül fut. Nem indít szerveres műveletet vagy hálózati kapcsolatot.

1. Linuxon `node scripts/operator-state-transfer.mjs --create-recipient /private/transfer-key` létrehozza az egyszeri 3072 bites RSA fogadókulcsot. A private PEM Linuxon marad, soha nem kerül SMB/Git/reportba. Csak a public PEM és SHA-256 fingerprint megy Windowsra.
2. Windows agent ellenőrzi a public fingerprintet és a script hashét; az operátori műveletek ne fussanak párhuzamosan. A meglévő, védett `.local` state és eredeti secret könyvtár olvasható legyen a saját Windows identitásával. `node operator-state-transfer.mjs --export recipient-public.pem <eredeti-secrets-dir> OPERATOR_STATE_TRANSFER.enc.json` a repo gyökeréből fut.
3. Az export JSON-receipteket visz a megnevezett operátori state-mappákból és pontosan a három eredeti secretfájlt. Nem visz providerkulcsot, env könyvtárat, node_modules-t, lockot vagy backup archívumot. A célrepó meglévő HTTPS Git-credentialjét, ha elérhető, kizárólag a ciphertextben `operator-secrets/github_ci_credential.json` néven átveszi: így Linuxon is valódi friss GitHub API GET ellenőrzi a CI-t. A token eredeti jogosultságait ez nem szűkíti; a CLI csak CI-readbackre használja és nem adja Git-pushnak, SSH-nak vagy riportnak. `githubCredentialCaptured=false` esetén a többi eredeti adat átvehető, de CI-auth pótlásig nincs aktiválás. Aktív helyi napi job-lock mellett megáll. A ciphertext AES-256-GCM authentikált; az egyszeri kulcs RSA-OAEP SHA-256-tal csomagolt. A manifest fájlonként hash-t tartalmaz; az eredeti fájlok bájtjai változatlanok maradnak, export előtt/után ellenőrzöttek. Az eredeti Windows állapotot nem töröljük.
4. Linux operátor visszaolvassa a ciphertext hashét és a saját private kulccsal importál: `node scripts/operator-state-transfer.mjs --import OPERATOR_STATE_TRANSFER.enc.json /private/transfer-key/recipient-private.pem /private/linux-checkout`. A cél `.local` még nem létezhet; nincs overwrite/merge. Korlátos, engedélyezett path-lista; path traversal, prefixütközés, duplicate, alias és hashhiba elutasított. Staging után egy rename publikálja az új `.local` state-et; minden fájl 0600, könyvtár 0700. A privát importmanifest rögzíti a fájlhash-eket és a régi sourceCommitot.
5. Az importált receipt byte-ja és a benne lévő eredeti időpont/sourceCommit változatlan. Lejárt prepare nem válik frissé. A Linux `ALTERWARD_SSH_SECRETS_DIR` az importált `.local/operator-secrets` abszolút útvonala. A régi Windows backup-archívumok megmaradnak ott; a Linux napi sync az eredeti szerverről az aktuális ciphertextet tölti le új helyi példányba, majd új izolált restore szükséges. A régi restore proofot nem használjuk új candidate-re.
6. Privát inspect és hostpin/backup-recipient-egyezés után a szokásos reviewed-main release és daily update/archive/readers ciklus következik. Minden éles változtatás után readback. Nincs automatikus paid AI: funded aktiválás csak tényleges első belépés és Auth/application UUID-binding után.

Titkot vagy teljes proof-bodyt ne írj konzolba/riportba. A fogadó private kulcs, plaintext staging, importált secret és ciphertext külön operátori adat; Gitbe nem kerül. A migrációs kulcs a sikeres, ellenőrzött átvétel végén az operátori policy szerint eltávolítható; a három eredeti recovery/SSH fájl megmarad privátan. A régi Windows scheduler változatlan marad; ez a változtatás nem kapcsolja ki és nem duplikálja.
