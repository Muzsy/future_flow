---
status: canonical
owner: operations
last_reviewed: 2026-10-24
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
