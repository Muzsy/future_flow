---
status: canonical
owner: operations
last_reviewed: 2026-10-12
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
