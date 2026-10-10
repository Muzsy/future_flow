# alterward — törlésvédelem a mentés visszaállításakor

2026-10-10 · [Következő lépések](NEXT_STEPS.md) · [Mentési eljárás](CONTABO_BACKUP_RESTORE_RUNBOOK_HU.md) · [Fióktörlés](ACCOUNT_DELETION_RUNBOOK_HU.md).

## Állapot és feltárt hiány

Ez a következő megvalósítási és ellenőrzési feladat részletes terve. A napi titkosított mentés és az izolált visszaállítás működik; a törlések és visszavonások visszajátszása még nincs elkészítve. A forrás áttekintése nem ilyen visszaállítási próba, és nem engedély a kiszolgálás visszakapcsolására.

Az [aw_account_deletions tábla](../database/migrations/005_private_metrics_and_deletion.sql) a ff_users sorra ON DELETE CASCADE kapcsolattal hivatkozik. A [fiókadatok végső törlése](../packages/database/src/repository.ts) ezért a recovery markert is eltávolítja. A marker az elakadt törlési folyamat folytatását segíti, nem önálló, törlést túlélő helyreállítási napló. Az [élettörlés](../packages/database/src/life-deletion.ts) idempotens nyugtája a saját felhasználóhoz kötött; fióktörléskor ez sem marad meg. Egy régi mentés e rekordjai önmagukban nem mondják meg, mi történt a mentés után.

Az alkalmazási dump nem tartalmaz hosztolt Supabase Auth-állapotot. Egy régi ff_users sor tehát nem bizonyítja, hogy az Auth-fiók még létezik vagy használható. A régi publication/grant/token, Shared membership és job lease sem aktuális jogosultsági bizonyíték.

## Kötelező biztonsági szabály

Friss, a visszaállítandó mentéstől függetlenül ellenőrzött adatvédelmi és jogosultsági állapot nélkül a másolat karanténban marad. Nem indul róla web/API/worker, nem kap nyilvános route-ot, és nem aktiválódik AI-keret. Egy hash a sértetlenséget bizonyítja; a frissességet, teljességet vagy engedélyezett hozzáférést önmagában nem.

Ha az aktuális alkalmazási adatbázis még olvasható, ebből konzisztens, read-only ellenőrzési alap készíthető. Az Auth-állapot külön szolgáltatói ellenőrzést igényel. Ha az aktuális állapot elveszett, az eljárásnak egy megfelelően védett, teljes, frissebb törlési/visszavonási nyilvántartásra kell támaszkodnia. Ennek meglétét és mentés utáni eseménylefedettségét nem feltételezzük. Hiányában nincs automatikus újranyitás.

## Megvalósítási sorrend

1. **Friss ellenőrzési alap és kötés.** Rögzíteni kell a forrás eredetét, ellenőrzött idejét, a lefedett események határát, a célmentés és a replay-terv hash-ét. Az alap csak a szükséges azonosítókat és korlátozásokat tartalmazhatja; nem teljes profil/prompt vagy levéllink. A hiányos, régi, másik projekthez tartozó vagy a dumpból származó „friss” alap elutasítandó.
2. **Karantén.** A dump külön PostgreSQL-példányba kerül, hálózat és publikált port nélkül. A produkciós kapcsolat, SMTP és AI-kulcs nem használható benne. A mentési eszköz mostani pontos hash-/sérülés-/takarítási ellenőrzése megmarad.
3. **Fiók- és élettörlés visszajátszása.** A mentés óta törölt fiókok és életek teljes alkalmazási gráfját el kell távolítani. Az elakadt deleting/awaiting_auth eseteket külön egyeztetni kell. A Shared leválasztás, meghívó-visszavonás és job-input tisztítás meglévő útvonalait kell használni; a fixture nem törölhet éles Auth-fiókot.
4. **Jogosultságok visszavonása.** Régi publikáció, unlisted token, Official source grant, fork/personalization/exposure jog, social discoverability, blokk és Shared tagság nem válhat újra használhatóvá egy rollback miatt. A nem igazolt jog alapértelmezetten tiltott; újbóli közzétételhez a rendes explicit consent/preview/Confirm út szükséges. A pontos aktuális korlátozások és moderációk ellenőrzése külön része a replaynek.
5. **Shared és korábbi személyes próza.** A felhasználó döntése szerint az érintett közös szöveg rejtett, az ellenőrzött dátum és eredmény megmarad. A már kész személyes fejezeteket nem írjuk át. Az érintett régi személyes próza biztonságos olvasási/export/AI-input határát még meg kell valósítani; a strukturális NULL és a közös DTO-projekció önmagában nem tisztítja a nyers fejezeteket. A bizonytalan érintett tartalom nem nyitható meg automatikusan.
6. **Régi munkák és költségek.** A visszaállított lease/job nem folytatódhat automatikusan. Függő munkák megszakítása, input/checkpoint tisztítása és költségfoglalások egyeztetése kell; a tényleges szolgáltatói költés nem csökkenthető régi budget-sor visszaállításával. Fizetett újrapróba és bétaaktiválás külön explicit lépés marad.
7. **Retention és kiszolgálási ellenőrzés.** A hét napos managed daily expiry mellett a korábbi történeti DB/config/rehearsal archívumok határát is rendezni kell. A hosztolt Auth/Storage/grant és SMTP helyreállítása külön eljárás. Az új példány RLS/grant/ownership, public reader, export és Shared projekció ellenőrzése előtt nincs kiszolgálás.

## Szükséges valódi próba

A/B/C szintetikus résztvevőkkel mentés készül; utána B fiókja, A egyik élete és néhány korábban aktív publikáció/eredet-/forkjog törlődik vagy visszavonódik. Az újabb ellenőrzési alapból a régi mentésen izolált replay fut. B saját adatgráfja és A törölt élete nem jelenhet meg; A/C engedett minimális közös dátuma és eredménye megmarad, az érintett szöveg rejtett. A régi bearer linkek, meghívók, lease-ek és visszavont jogok nem működhetnek. Az export, publikáció, folytatás/fork és AI-input ugyanazt a privacy-határt használja.

Negatív próba kell hiányzó/elavult/hiányos alapra, mismatched hash-re, félbeszakadt és ismételt replayre. Eredmény: zárt állapot, nincs részlegesen nyitott szolgáltatás. A tranzakciós teszteket tényleges PostgreSQL és hálózat nélküli célfixture követi, majd pontos Claude Cloud-delta és önálló értékelés. A nyers szintetikus adat és a replay-azonosítók privát proofban maradnak, a dokumentáció csak összesítést kap.

## Megmaradó függőségek

Külön második tárhely/gép jelenleg nincs. A független kulcsmentés és külső hibaértesítés nem megoldott. A teljes P01–P13 / Shared S0–S7 terv megmarad; a jóváhagyott 10 USD / legfeljebb tízfős béta és a harmincnapos keret továbbra inaktív. A terv nem helyettesít tényleges replay-bizonyítékot.
