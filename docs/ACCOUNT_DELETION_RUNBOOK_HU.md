# alterward — fióktörlés helyreállítása

2026-10-03 · [Dokumentációs központ](README.md) · [Státusz és keret](STATUS_HU.md) · [Következő lépések](NEXT_STEPS.md).

A felhasználó exportja/törlése friss tényleges Supabase-hitelesítést kér. Törléshez a védett .env SUPABASE_SERVICE_ROLE_KEY mezőjébe service_role JWT vagy sb_secret_... admin kulcs szükséges. Értékét ne írjuk chatbe/logba/Gitbe vagy NEXT_PUBLIC mezőbe. Kulcs hiányában a kód még a deleting státusz előtt megáll AUTH_ADMIN_NOT_CONFIGURED hibával.

## Állapotok

1. Aktív fiók → deleting; durable awaiting_auth marker. V1/v2 jobok megszakadnak, lease-token visszavonva. A worker nem commitolhat.
2. Szerveroldali Supabase Auth törlés. Ha hiba után admin getUserById bizonyítja, hogy a fiók megvan, active visszaáll és a v2 generálás manuálisan retryolható. Bizonytalan Auth-állapotban deleting marad, nem találgatunk.
3. Bizonyított Auth-törlés → auth_deleted marker → belső adatgráf cascade törlése. DB-hibánál marker megmarad, nem kell új belépés a helyreállításhoz.

## Üzemeltetői parancs

pnpm privacy:recover csak összesített pending/confirmed számot mutat, nem módosít. Konkrét, már felhasználó által kért törlés helyreállítása: pnpm privacy:recover <user-uuid>. Aktív, törlést nem kért fiókot nem töröl. Awaiting_auth esetén admin kulccsal ellenőrzi az Auth-állapotot és szükség esetén befejezi a kért Auth-törlést; confirmed marker esetén DB-takarítás folytatódik. Parancs kimenete csak biztonságos hibakód.

Ellenőrzendő: marker és ff_users sor eltűnik; saját v1/v2 élet/ág/draft/canon/job/choice/consent/interakció és személyes költségfoglalás cascade törlődik. Projektszintű összesített költség marad személyes tartalom nélkül. Aktív worker nem ír vissza. A 006 előnézeti/szcenáriópiszkozat gráf is cascade törlődik; éles publication/cache gráf még nincs.

Automatizált próba fedi az Auth-siker utáni DB-hibát, biztos Auth-hiba visszaállítását és bizonytalan Auth-hiba blokkolását. A valódi Supabase admin kulcs hiányzik, ezért valós Auth-törlés és admin recovery még nincs kipróbálva.

Backup/restore próba, konkrét megőrzési idők, Supabase-backup hozzáférés és törölt adat visszaállítását kizáró üzemeltetési eljárás nyitott release-feladat. Ez a runbook a végrehajtott adatbázisgráf-törlést kezeli, szolgáltatói backup-törlést nem igazol.
