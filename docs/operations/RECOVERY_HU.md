---
status: canonical
owner: operations
last_reviewed: 2026-11-01
related:
  - BACKUP_HU.md
  - ../CONTABO_BACKUP_RESTORE_RUNBOOK_HU.md
  - ../PERSONAL_BETA_RECOVERY_LIMIT_HU.md
---

# Recovery operations

## 1. Alapelv

Recovery alatt a rendszer fail-closed. Az első cél nem a gyors kiszolgálás-visszakapcsolás, hanem annak bizonyítása, hogy a visszaállított adat, Auth/authority és privacy állapot konzisztens.

## 2. Izolált restore

Normál rehearsal:

- nem az éles DB-be tölt;
- hálózatilag izolált célkörnyezetet használ;
- pontos PostgreSQL major verziót használ;
- transaction/fail-on-error;
- sor- és hash-egyezést ellenőriz;
- configot külön sandboxban validál;
- sérült ciphertextet elutasít;
- plaintext/credential/temp state-et eltávolít.

Részletes eljárás: `../CONTABO_BACKUP_RESTORE_RUNBOOK_HU.md`.

## 3. Éles recovery gate

Éles szolgáltatás csak akkor kapcsolható vissza, ha:

1. restore source és manifest egyértelmű;
2. DB/config integrity rendben;
3. Auth/user mapping ellenőrzött;
4. privacy deletion/revocation replay alkalmazva, ha szükséges;
5. writer fence/idegen writer/queue state biztonságos;
6. RLS/grant/role és sajátadat-jogok ellenőrzöttek;
7. Shared/personal projection privacy vetület ellenőrzött;
8. worker/paid AI csak külön gate után indul;
9. post-recovery health/monitor zöld.

## 3/a. Olvasói előkészítés archiválása

Lejárt (több mint 900 s) és soha nem alkalmazott olvasói előkészítés csak explicit `--archive-expired-readers` móddal kerül a védett archívumba; az nem indít, nem állít le és nem állít vissza szolgáltatást, nem ír élő DB-t. Archivált állapot mellett nincs aktív előkészítés, ezért a `disable` a szolgáltatások érintése előtt elutasít, az eredeti nulla owner-állapot marad a serving. Az archívum nem recovery- vagy apply-authority. Megszakadás után az evidence-alapú egyeztetés és az új, 15 percen belüli ciklus sorrendje: `../PERSONAL_BETA_READER_OPERATOR_HU.md`.

## 4. Supabase scope-határ

Az application backup nem automatikusan teljes hosted Supabase recovery.

Auth, Storage, globális role/grant, provider/dashboard config külön scope lehet. A recovery tervnek explicit módon meg kell mondania, mi áll helyre automatikusan és mi igényel kézi újraépítést.

## 5. Elfogadott teljes-loss korlát

Teljes hosted Supabase elvesztése esetén a jelenleg elfogadott modell **zárva maradó kézi újraépítés**, nem garantált automatikus full-service restore.

A rendszer ilyen helyzetben nem nyithat ki hiányos authority/permission bizonyítékkal.

## 6. Writer fence és authority

Recovery alatt:

- új alkalmazási írás blokkolandó;
- AI/worker exposure nem indulhat korán;
- source/target DB és Auth identitás ellenőrzendő;
- fence feloldása csak post-check után;
- eltérés esetén szolgáltatás zárva marad.

## 7. Delete/revoke replay

Restore után a backup készítése óta történt törlés, revocation vagy privacy-változás nem veszhet el pusztán azért, mert régebbi snapshot került vissza.

A recovery eljárásnak ezért szükség szerint replay/karantén logikát kell alkalmaznia kiszolgálás előtt.

## 8. Recovery Definition of Done

Nem az számít sikeres recoverynek, hogy a DB elindul, hanem hogy:

- integrity egyezik;
- authority és privacy gate teljesül;
- ideiglenes state kitakarítva;
- monitorok egészségesek;
- paid/shared/public feature-ek csak saját release gate-jük szerint aktívak;
- bizonyíték/receipt megmarad secret nélkül.

## Linux operátori host

A személyes béta reader/funded és napi backup/sync/restore/monitor Linux-host támogatása, az eredeti receipt/SSH/recovery identity egyszeri titkosított migrációja és a változatlan release kapuk: [Linux operator runbook](LINUX_OPERATOR_HU.md). Az átadás nem éles aktiválás és nem helyettesíti a konkrét candidate utáni restore proofot.

## Aktív funded runtime új verziója

A dedikált Linux upgrade/recovery implementáció és finite archive-határ: [funded runtime runbook](FUNDED_RUNTIME_UPGRADE_HU.md). Ez az eredeti ablakot és ledger-t megőrzi; nem owner-zero aktiválás és nem production engedély. A schema-038 kompatibilis recovery az aktuális DB-t használja; a quarantine restore szabályai változatlanok.

A lejárt, teljes, soha nem alkalmazott funded preparation külön `--archive-expired` paranccsal, bizonyítékmegőrzően archiválható. Ez nem recovery: nem indít/leállít szolgáltatást és nem ír DB-t, a változatlan eredeti funded baseline-t ellenőrzi. Megszakadás után ugyanazzal a hash-hez kötött privát proof-fal ismételhető; a megmaradt archíválási szándék apply/recover-re nem használható. Megkezdett journal/watchdog/readback állapotot nem archivál; ahhoz az eredeti transition recovery útja kell. Az archívum nem ad visszaállítási vagy költségkeret-megújítási jogosultságot. Részletes előfeltételek és megszakításkezelés a funded runtime runbookban.

A DB-probe one-off konténere előzetes, source/config/image/hash-hez kötött intentet kap. Timeout és kezelhető megszakítás után célzott cleanup fut; SIGKILL után explicit `--cleanup-probe`, illetve a normál apply/recover előtti egyeztetés szükséges. Csak a teljesen egyező konténer immutable ID-je távolítható el; az alkalmazás három szolgáltatása és ismeretlen konténer érintetlen. Ez nem adatbázis-helyreállítás vagy sikeres migrációs proof: a következő DB/catalog/drain és restore-kapuk kötelezők. Receipt nélküli régi konténer kézi vizsgálatot igényel. Részletek a funded runtime runbookban.


## Hosszabb funded hold utáni friss restore-proof

A meglévő Daily offsite rehearsal held alkalmazás mellett is végezhető, a két operátori lockkal és változatlan konténerállapot mellett. A friss proof tényleges új izolált restore eredménye ugyanabból a pontos, candidate-ot tartalmazó archívumból; a régi timestamp nem írható át, az élő DB nem cserélhető régi snapshotra. A legacy capture/replay eszköz v9-re jelenleg elutasít: új registry-bejegyzés és régi owner-only receipt átírása nem oldja meg a schema-038/funded proof eltérést. A célzott ellenőrzések határai, az operátori sorrend és a szükséges kompatibilis út: [funded release preflight](FUNDED_RUNTIME_UPGRADE_HU.md#kiadási-előellenőrzés-hosszabb-hold-és-legacy-replay--2026-10-24).


## V9 funded capture/replay

A legacy replay-guard megmarad. A külön aktív funded proof a befejezett eredeti upgrade journal/readback/konfigurációját és tényleges image-ét köti; az új funded fence módok ezt rooton újraellenőrzik. A karantén az igazolt v9 image-ből migrál tiszta 038 katalógust, csak adatot tölt vissza, strict policy/artifact/karakterállapot ellenőrzést és a meglévő független delete/revoke/accounting/privacy verifiert futtat. Az eredeti-zero/reader/window receiptek változatlanok; szolgáltatásaktiválás és élő snapshot-visszatöltés továbbra tilos. A fejlesztési implementáció és a még szükséges exact-source audit/célgépes funded fence E2E: [funded replay runbook](FUNDED_RUNTIME_UPGRADE_HU.md#v9-funded-capturereplay-út--72-fejlesztési-implementáció-2026-10-24).


## #76 — konkrét image izolált próbája, 2026-10-25

A [standalone image-futtató](FUNDED_RUNTIME_UPGRADE_HU.md#önálló-kiadási-image-próba--76-2026-10-25) a lokálisan cache-elt immutable v9 image saját forrását ellenőrzi, majd saját TLS-es PostgreSQL/hálózatban mesterséges adatokkal futtatja a közös frissítési és privacy/recovery próbákat. Egy image-et igazol target/recovery szerepre; a kiadási validator és legacy védelmek változatlanok. Proof csak teljes cleanup és idegenkonténer-egyezés után készülhet. Ez nem a production mentés restore-próbája és nem tényleges célgépes PASS; az új source CI és a kiválasztott image célgépes futása külön bizonyíték.


A #81 teljes kiadási review-jának javítása a production image-capability one-offra is tartós, source/bundle/input/parancs/image/nonce kötött intentet vezet be. Timeout után finally-cleanup, SIGKILL után a meglévő `--cleanup-probe` egyeztet; a tényleges ID a törlés előtt rögzül, ismeretlen vagy lecserélt konténer megmarad, pending intent mellett nincs aktív proof. Daily v4 foglalja a capability-receiptet a titkosított backupba és a lezárt preparation-archívumba. A runtime nélküli image-only átállás aktív funded replay útja az explicit v9 módhoz hasonlóan az eredeti completed journal/readback/source/image/038/authority kötésekkel működik; az image tényleges v9/frozen-policy képességellenőrzése megmarad. [Részletes javítás és regressziós határ](FUNDED_RUNTIME_UPGRADE_HU.md#teljes-kiadási-review-javításai--8081-2026-10-25).

### Billing-vetület helyreállítás után (B01, 2026-10-31)

A karanténos replay a visszaállított `aw_billing_subscriptions` minden sorát `reconcile_required = true` állapotba teszi, a független verifier ezt ellenőrzi (`NOT reconcile_required` sor esetén a verifikáció elbukik). Zárt marad a jogosultság, amíg újabb szolgáltatói állapot-esemény vagy operátori reconcile meg nem érkezik (ADR-010 §3). A törölt fiók billing sorai a fiókgyökér cascade-jével nem térnek vissza; a fejezet-főkönyv és a feldolgozott események a megmaradt fióknál érintetlenek. A bizonyíték-fixture mindkét esetet fedi.

**Üzemeltetési figyelmeztetés (2026-10-31):** a normál recovery-séma, a successor-művelet és a funded-upgrade capability a 039-es alapot várja, az éles adatbázis viszont 038-as. Az éles upgrade-ig a Daily-újratelepítést, a rehearsalt, a successor- és a funded-parancsot **nem** szabad az új `main`-ből futtatni az éles ellen (zártan megállnak, nem rontanak). A sync-timer a rögzített fájlokat hash-eli, ezeket ez a csomag nem érinti, így `git pull` után a pinek érvényesek maradnak. Visszaállítás: 039 után a régi (038-as) image rollbackje zárt, a rollback adatbázis-visszaállítás; a 038-as mentés 039-es kóddal nincs tesztelve, ezért az upgrade előtt friss mentés → offsite → izolált restore PASS kell. A fióktörléskor az `aw_billing_events` azon sorai, amelyeknek nincs előfizetés-hivatkozásuk (`subscription_id` NULL), megmaradnak: csak eseményazonosítót és típust tartalmaznak, szándékosan. A helyreállítás után `reserved` állapotban maradt billing foglalásokat a SQL-tároló csomagjának takarító lépése (reaper) kezeli.

**Frissítés (2026-10-31, `schema-039` eszköz):** az éles 038→039 lépésre mostantól van journalozott, kerített eszköz (`beta-successor-4`, `schema-039` szelekció; részletek: [FUNDED_RUNTIME_UPGRADE_HU](FUNDED_RUNTIME_UPGRADE_HU.md#journalozott-kerített-038039-éles-upgrade-eszköz-schema-039-successor-generáció--2026-10-31)). A fenti tiltás addig érvényes, amíg ezt a tulajdonos külön engedéllyel nem futtatja: a sorrend Daily-telepítés az új commitról → release-inputok → prepare → friss backup/offsite/izolált restore → apply → új backup + restore. Félbeszakadt migráció után **ne** futtass `pnpm db:migrate`-ot vagy kézi SQL-t: az explicit `--recover` előbb megfigyeli az adatbázist (038: pótolja az egy lépést, 039: nem ismétel).

**Frissítés (2026-11-01, `billing-config` cél):** a Stripe-beállítások bevitele új successor-generáció (`billing-config`, 5–7. gyökér). A recovery itt **előre** fejezi be ugyanazt a jelöltet (a target és a recovery fájlok egyaránt az új konfigurációt hordozzák); az előző billing-konfigurációra nincs visszaállítás, `live`/`enforce` után nincs szentesített kikapcsolás, és az `enforce` egyirányú. A vészfékek Stripe-oldaliak (kulcs/webhook visszavonása) vagy kézi szolgáltatás-leállítások; a kézi `server.env`-szerkesztés a hash-kötött állapotot töri. A titkok csak a jelölt/recovery `server.env`-ben vannak. Részletek: [FUNDED_RUNTIME_UPGRADE_HU](FUNDED_RUNTIME_UPGRADE_HU.md#billing-config-successor-cél-a-stripe-beállítások-útja-az-éles-szerverre--2026-11-01).

### Személyes függő munkák új dispatch-kapuja — #140 fejlesztési jelölt, 2026-11-01

Az I06 új kiadása előtt, kerített/drain állapotban a személyes sor és a reservation-ledger owner/job/kanonikus kulcs/bucket/state/grant/reconcile összerendelését frissen kell ellenőrizni. Minden függő régi munkának dokumentált sorsa szükséges: érvényes foglalás; eredeti scope szerinti explicit régi béta-mentesség; vagy új provider-dispatch nélkül megőrzött/elutasított munka, amelyet a felhasználó később explicit retry-jal foglalhat. A hiányos vagy nem kanonikus kulcsú régi ledger-sor nem írható át, törölhető vagy váltható automatikusan új ízelítőre. Az eredeti payload, korábbi költés és mentett történet megmarad. Aktiválás előtt a bizonytalan tételeket operátori értelmezéssel rendezni kell; a forrásjavítás önmagában nem bizonyítja a konkrét céladatbázis tisztaságát.

Restore után a paid subscription `reconcile_required` jelzője a már foglalt személyes munka új fizikai AI-kérését is zárja. A kész kimenet mentése és a reserved/released fejezetfoglalás elszámolása ettől külön, továbbra végrehajtható. Az új image izolált próbájában és a forráshoz kötött release/readback során külön ellenőrizendő a nulla provider-call a hiányzó/released/consumed/idegen és nem egyeztetett állapotokban, illetve az érvényes út egyszeri tartós fogyasztása. A helyi SQL/SDK-wrapper teszt nem célgépes restore- vagy aktiválási proof. Régi image bizonyítéka nem címkézhető át; új élő művelet és költés külön felhatalmazást igényel.

## 10. Service registry040 — fejlesztési integrációs határ

A #137 külön039/040 schema/security/replay profilt és könyvtári039→040 bridge-et ad. A natív040 replay a policy `reconcile_required=true` értékével az egész szolgáltatási snapshotot zárja; ezzel a régebbi backup nem adhat vissza azóta visszavont admissiont. A registry tartalma/revíziói megmaradnak, a törölt fiók admissionje cascade-del törlődik. A normál policy-frissítés nem reconcile és nem nyit újra.

A bridge sorrendje: tényleges039 replay → független039 read-only ellenőrzés → mért intent →100 régi tábla és39 receipt megőrzésével atomikus040 SQL → független040 read-only ellenőrzés, az új2tábla üres. A privilegizált production-hívónak intentet a SQL előtt tartósan kell mentenie. Commit utáni elveszett válasz külön read-only verify-val egyeztethető; nincs SQL újrafuttatás. A tényleges schema40 nem fogadható el a régi039 guard lazításával.

Az apply és a külön verify saját megfigyelési idővel készít receiptet, ezért a teljes `postVerificationSha256` eltérhet. A receipt hashét nem írjuk át; a `postVerificationStateSha256` a teljes verifier-eredményt köti kizárólag a `verifiedAt` nélkül. A host minden további proof-mező és ezen teljes állapothash pontos egyezését követeli; hiányos hash vagy bármely állapot-/authority-/intent-eltérés megállítja a próbát. Elveszett apply-kimenetnél is teljes, új read-only verify szükséges.

A képhez/source-hoz kötött `alterward-service-registry-image-fixture-1` szintetikus PostgreSQL-próba külön bizonyíték; nem offsite/éles backup, fennálló production fence, operátori audit vagy promotion. A korábbi funded v1/038→039 szerződés megmarad. Production040 successor, Daily/monitor/restore és billing-config040 támogatás [#142](https://github.com/Muzsy/future_flow/issues/142) alatt készítendő; addig nincs040 rollout. Sem API/web hozzáférési bekötés, sem új admission/pause/reconcile operátor nem következik pusztán a tároló létezéséből.


### #142 host jelölt: külön történeti és natív040 proof

A #149 fejlesztői jelölt a fenti bridge-et a root successor/Daily/fence útba köti. A `migration-rehearsal` a valódi039 archive-ot101 publikus táblával tölti be, az eredeti authority alatt visszajátssza és függetlenül ellenőrzi, majd konkrét quarantine-instance-hez kötött tartós intent után migrál040-re és külön read-only verify-t végez. Az új observer/executor image az előkészített040 candidate-ből jön; a backup régi source/image és authority provenance-e megmarad. Az élő SQL kapuja ennek a konkrét backup/candidate/parent/source/image eredményét kéri.

Natív040-nél külön `alterward-funded-replay-2` / `registry040` proof és103 publikus táblás data-only replay kötelező,102 alkalmazástábla/226 FK ellenőrzésével. A régi v1 receipt nem írható felül vagy értelmezhető át. A monitor hiányzó/idegen natív bizonyítéknál jelez; timeraktiválás a legfrissebb mentés friss natív privacy-próbáját is ellenőrzi.

A schema040 intent és a config040 restore-evidence külön journal-hashhez kötött. Késői recovery az eredeti tartós bizonyítékot ellenőrzi, nem a mutable Daily-pointert és nem újraidőzített proofot. Az új SQL900másodperces korlátja megmarad; commitolt állapot csak olvasó egyeztetése nem indít SQL-ismétlést. Ez a fejlesztői szerződés nem éles rollout, operátori audit vagy meghívási/pause aktiválás. [Sorrend és engedélyhatár](FUNDED_RUNTIME_UPGRADE_HU.md#production040-jelölt--142-2026-11-02).
