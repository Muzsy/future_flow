# alterward — fióktörlés helyreállítása

2026-10-04 · [Dokumentációs központ](README.md) · [Státusz és keret](STATUS_HU.md) · [Következő lépések](NEXT_STEPS.md).

A felhasználó exportja/törlése friss tényleges Supabase-hitelesítést kér. Törléshez a védett .env SUPABASE_SERVICE_ROLE_KEY mezőjébe service_role JWT vagy sb_secret_... admin kulcs szükséges. Értékét ne írjuk chatbe/logba/Gitbe vagy NEXT_PUBLIC mezőbe. Kulcs hiányában a kód még a deleting státusz előtt megáll AUTH_ADMIN_NOT_CONFIGURED hibával.

## Állapotok

1. Aktív fiók → deleting; durable awaiting_auth marker. V1/v2 jobok megszakadnak, lease-token visszavonva. A worker nem commitolhat.
2. Szerveroldali Supabase Auth törlés. Ha hiba után admin getUserById bizonyítja, hogy a fiók megvan, active visszaáll és a v2 generálás manuálisan retryolható. Bizonytalan Auth-állapotban deleting marad, nem találgatunk.
3. Bizonyított Auth-törlés → auth_deleted marker → belső adatgráf cascade törlése. DB-hibánál marker megmarad, nem kell új belépés a helyreállításhoz.

## Üzemeltetői parancs

pnpm privacy:recover csak összesített pending/confirmed számot mutat, nem módosít. Konkrét, már felhasználó által kért törlés helyreállítása: pnpm privacy:recover <user-uuid>. Aktív, törlést nem kért fiókot nem töröl. Awaiting_auth esetén admin kulccsal ellenőrzi az Auth-állapotot és szükség esetén befejezi a kért Auth-törlést; confirmed marker esetén DB-takarítás folytatódik. Parancs kimenete csak biztonságos hibakód.

Ellenőrzendő: marker és ff_users sor eltűnik; saját v1/v2 élet/ág/draft/canon/job/choice/consent/interakció és személyes költségfoglalás cascade törlődik. Projektszintű összesített költség marad személyes tartalom nélkül. Aktív worker nem ír vissza. A 006 előnézeti/szcenáriópiszkozat gráf is cascade törlődik; éles publication/cache gráf még nincs.

Automatizált próba fedi az Auth-siker utáni DB-hibát, biztos Auth-hiba visszaállítását és bizonytalan Auth-hiba blokkolását. 2026-10-04: a szerveroldali kulcs ellenőrizve; a szintetikus HTTP-próbában valódi Auth-törlés és a teljes DB-gráf (feedback/session is) takarítása sikeres. [Béta-riport](BETA_IMPLEMENTATION_REPORT_HU.md). A kontrollált megszakításból valódi admin recovery sikeres (lásd alább); tényleges DB-kiesésből recovery és backup/restore még nincs végrehajtva; a hibaágak automatizált tesztje nem ezek üzemeltetési bizonyítéka.

Backup/restore próba, konkrét megőrzési idők, Supabase-backup hozzáférés és törölt adat visszaállítását kizáró üzemeltetési eljárás nyitott release-feladat. Ez a runbook a végrehajtott adatbázisgráf-törlést kezeli, szolgáltatói backup-törlést nem igazol.

## 2026-10-04: kontrollált megszakításból valódi recovery

Új szintetikus Auth-fiók törlése után, még a DB-confirm/cleanup előtt megállított folyamat `awaiting_auth` markert és `deleting` fiókot hagyott. A tényleges recovery CLI felismerte a már hiányzó Auth-fiókot, majd eltávolította a fiókot és a tesztfeedbacket. [Bizonyíték](BETA_IMPLEMENTATION_REPORT_HU.md). Ez valós integrációkkal kontrollált megszakítás, nem valódi adatbázis-kiesés vagy backup-restore.

## Tervezett Shared Context törlési bővítés

Shared táblák még nem léteznek, ezért a jelenlegi kipróbált cleanup/recovery ezt a gráfot nem kezeli. S0/S3-ban az új [törlési modellt](SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) idempotensen be kell építeni a deleting marker, job-cancel, Auth-törlés és DB/recovery útvonalba. Törlődő account új shared műveletet/commitot nem indíthat. Meghívói visszavonandók, social profile törlendő, membership user/life/branch személyes referenciái leválasztandók és olvasáskor „Former member” projekciót kapnak; pending személyes impactok detached állapotúak. Más tagok közös canonja nem az account-cascade része.

A struktúra nullázása nem távolítja el a nevet a korábban generált prózából: PII-szűrés/redakció, minimális history-retention és backupból helyreállítás utáni törlésvédelem külön kapu. Saját export csak jogosult saját/shared részvételprojekciót vihet ki, más tag teljes profilját/intentjét nem. Kötelező új próba: A/B/C contextből B törlése, A/C minimális anonim története megmarad, B azonosító/prompt/privát adat eltűnik az elérhető DTO-kból, megszakításból recovery és párhuzamos job sem hozza vissza. Ez tervezett ellenőrzés, nem korábbi valódi account-próba eredménye.
