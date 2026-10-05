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

## Shared S0 strukturális törlési bővítés és S3 kapuk

S0 kódja már kezeli a Shared gráfot a deleting marker/job-cancel és DB/recovery cleanup útvonalon; 008/009 a fejlesztői Supabase-on alkalmazva; a valódi háromfiókos meghívó/export/Auth- és DB-törlés-próba és takarítás sikeres. [S0 megvalósítás és korlátok](SHARED_CONTEXT_S0_REPORT_HU.md). Törlődő account új shared műveletet/commitot nem indíthat. Meghívói visszavonandók, social profile törlendő, membership user/life/branch személyes referenciái leválasztandók és olvasáskor „Former member” projekciót kapnak; pending személyes impactok detached állapotúak. Más tagok közös canonja nem az account-cascade része.

A struktúra nullázása nem távolítja el a nevet a korábban generált prózából: PII-szűrés/redakció, minimális history-retention és backupból helyreállítás utáni törlésvédelem külön kapu. Saját export csak jogosult saját/shared részvételprojekciót vihet ki, más tag teljes profilját/intentjét nem. Kötelező új próba: A/B/C contextből B törlése, A/C minimális anonim története megmarad, B azonosító/prompt/privát adat eltűnik az elérhető DTO-kból, megszakításból recovery és párhuzamos job sem hozza vissza. A strukturális A/B/C deletion/recovery, a többi tag által kezdeményezett job cancel, a soha nem csatlakozott címzett meghívójának visszavonása és admin-handover regresszió sikeres. A teljes valódi Shared AI/próza/Auth/backup kapu S3, ezt a korábbi valódi személyes account-próba nem bizonyítja.

## S1 függő döntés megszakítása

[S1 megvalósítás és korlátok](SHARED_CONTEXT_S1_REPORT_HU.md). A normál deleting marker és leave/end ugyanazon tranzakcióban cancelled immutable resolutiont készít, pending eventet elengedi, új impactot nem képez. Érintett context-lockok rendezettek; ismétlés nem dupláz. Az account-export saját részvételi canont, saját választást és saját pending/detached impactot is adhat, másik ág/intent/proposal nélkül. Ez nem szabad próza PII-redakció vagy teljes Shared Auth/AI/backup igazolás; S3 kapuk megmaradnak.

## S2 AI-job snapshotok

Completed Shared job inputja commitkor törlődik; deleting marker a failed/cancelled input és raw-output checkpointot is tisztítja, korábbi left tagot is beleértve. Nincs receiptben teljes prompt/profil; hash/token/model meta megmarad. A már elküldött provider-hívás költsége a guardban elszámolandó, a késői canon commit lease/member/user ellenőrzéssel tiltott. A retained canon próza teljes redakciója és valódi Shared Auth/AI recovery S3 gate. [S2 riport](SHARED_CONTEXT_S2_REPORT_HU.md).


## 2026-10-05: közös szövegprojekció és frissebb job védelme

A felhasználó az érintett közös próza elrejtését, dátum és eredmény megtartását választotta. 013 már deleting markerre vetületet ad és scrub/cancel védi a régi Shared/személyes inputot. Privacy miatti explicit retry friss jobot kap; a már megtisztított jobot a fizikai törlés megőrzi. Export/pending/emlék/fork ugyanígy projected. Nyers canon/hash és régi személyes fejezet nem íródik át; nyers/backup-retention és régi személyes próza további kapu. Teljes valódi kétfiókos Auth/Shared/saját AI és kontrollált recovery sikeres; migráció utáni valódi Auth/DB technikai proof nulla provider-hívással. [Bizonyíték](SHARED_CONTEXT_S3_PRIVACY_AUTH_REPORT_HU.md).
