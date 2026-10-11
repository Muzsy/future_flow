# alterward — aktuális Auth-állapot ellenőrzése helyreállításhoz

2026-10-11 · [Kiadási sorrend](NEXT_STEPS.md) · [Privacy-visszaállítás](CONTABO_PRIVACY_RESTORE_PLAN_HU.md) · [Hosztolt mentési határ](SUPABASE_RECOVERY_COVERAGE_HU.md).

A [csak olvasó leltár](../scripts/supabase-recovery-inventory.ts) az Auth admin API teljes listáját egy ellenőrzött TLS-ű, read-only PostgreSQL-snapshothoz, majd egy második Auth API-listához hasonlítja. A [külön állapotvetület](../scripts/lib/recovery-auth-inventory.ts) az azonosító mellett a tiltási/törlési/megerősítési állapotot, szerepet és módosítási időt ellenőrzi. A pusztán egyező fiókazonosítók így nem fedhetnek el időközben megváltozott tiltást.

A vetület nem őriz emailt, jelszóhash-t, sessiont, tokent vagy szabad metadata-t. Az azonosítók csak memóriában vannak, a védett riport kizárólag összesítést kap. Egy későbbi helyreállítási authorityhoz csak megerősített emailű, authenticated szerepű, nem törölt és aktuálisan nem tiltott Auth-fiók lehet jelölt; az alkalmazási active állapot külön szükséges. A PostgreSQL JSON időbélyegeit mikrosekundumos pontossággal hasonlítjuk, a JavaScript Date nem kerekíti el a verziókülönbséget.

Lapozási ugrás, duplikáció, hibás időbélyeg, API-hiba, hiányzó/eltérő adatbázisállapot vagy a két API-megfigyelés közti állapotváltozás megállítja a leltárt. Az SDK hiányzó pagination headerből képzett nulla total értéke önmagában nem igazolja a teljességet: a teljes DB-állapot egyezése kötelező.

## Tényleges bizonyíték

2026-10-11T01:01:17.259Z: nyolc Auth-fiók, egy teljes oldal, aktuális tiltás 0; minden vizsgált Auth-állapot egyezik a DB-snapshottal és a második API-megfigyeléssel. Hét aktív alkalmazási fiók, hiányzó Auth-pár 0. A 97 alkalmazástábla RLS-védett, közvetlen böngészős táblajog 0; Storage bucket/objektum 0, függő fióktörlés 0, aktív személyes Shared-tagság/emlék 0. Adatbázis- és Auth-írás, levél és AI-hívás 0.

Hat új célzott regresszió és a két meglévő teljességi próba sikeres; a scripts TypeScript-ellenőrzése is sikeres. A próbák fedik a tiltást/törlést/megerősítés hiányát, mikrosekundumos eltérést, két megfigyelés közti változást, hiányos DB-listát és hibás lapozást/állapotot. [Tesztek](../tests/recovery-auth-inventory.test.ts).

```powershell
node --env-file=.env --import tsx scripts/supabase-recovery-inventory.ts --read-only
```

## Következő kapu

Ez **megfigyelés, nem writer-fence vagy replay-engedély**. A valós fence/capture végrehajtó, az explicit táblalefedettségi registry, a karanténos replay utóellenőrzése és a fennálló fence-hez kötött recovery authority következik. A Claude Cloud tervértékelése ezek elkészítését javasolta a személyes tesztelői hozzáférés előtt; az audit nem végzett éles műveletet és nem tekintette a riportált próbákat saját bizonyítékának.

A teljes hosted login/MFA/role/Vault/projektbeállítás helyreállítása ettől külön határ. A Supabase hivatalos logikai költöztetési eljárása a role/schema/data export mellett a managed sémák saját módosításainak és szükség esetén a titkosítási gyökérkulcsnak az egyeztetését is leírja. [Hivatalos backup/restore dokumentáció](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore). Ennek elvégzését ez a leltár nem állítja.
