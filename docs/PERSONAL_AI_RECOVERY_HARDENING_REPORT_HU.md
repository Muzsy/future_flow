# alterward — személyes AI-feladatok újraindítása és költségvédelme

2026-10-09 · [Cloud-audit](CLAUDE_CLOUD_PRELAUNCH_AUDIT_REPORT_HU.md) · [Kiadási sorrend](CLOSED_SITE_RELEASE_PLAN_HU.md) · [Következő lépések](NEXT_STEPS.md).

**A CON-01/02 jelzések helyben reprodukálva és javítva; a teljes helyi ellenőrzés sikeres.** A Contabón egyelőre a korábban auditált `35f9889` alkalmazási image fut. E változat külön Cloud-delta auditja, CI-je, izolált célpróbája és tényleges worker-újraindítási próbája még szükséges a telepítés előtt. A tesztelői fizetett béta inaktív.

## Mi változott?

A régi kód minden feladatfelvételnél növelte az öt próbálkozásból álló számlálót. Így költségkeret miatti, provider-hívás nélküli elutasítás vagy ismételt lease-átvétel is végleg elhasználhatta egy élet folytatási lehetőségét. A megszakadt eseményjavítás elveszíthette a javítás szövegét; egy történetjavítás újrafuttatása pedig még egy javítást engedhetett.

- A személyes v2 worker egy próbálkozást az adott lease első sikeres költségfoglalásakor számol. Az ugyanazon feldolgozás esemény-, történet- és ellenőrző hívásai külön költségfoglalást kapnak, de közösen egy finanszírozott próbálkozást használnak. A keretablak/keret miatti elutasítás és a foglalás előtti újraindulás nem használ el próbálkozást; öt finanszírozott próbálkozás plafonja megmarad.
- A költségfoglalás a saját, futó és le nem járt job lease-hez kötött. Az ellenőrzés a költségszámlák zárolása után is megismétlődik, tényleges faliórával. Lejárt vagy átvett lease új provider-foglalást és transport-retry foglalást sem enged.
- A már elküldött kérés utólagos elszámolása lease-átvétel után is megmarad. A bizonytalan szolgáltatói eredmény teljes foglalása továbbra konzervatívan elszámolt; nincs általános timeout-visszatérítés. Az adatbázis-kapu nem tud egy már elindult külső kérést visszavonni.
- A tényleges eseményválasz, a javítás eredeti oka, a javított válasz elutasítása és a fidelity eredménye tartós checkpoint. Újraindulás ugyanazt a javítást folytatja, és felhasználja a már mentett válaszokat. A közös, egyetlen tartalmi javítási lehetőség nem nyílik újra egy megszakítás miatt.
- Az ötödik finanszírozott próbálkozás már elfogadott, mentett fejezete új provider-hívás nélkül befejezhető. Ez nem hatodik finanszírozott próbálkozás vagy általános retry-engedély. Az operátori katalógus-lease továbbra külön tiltott.
- A checkpoint, heartbeat, hibajelölés és végső commit a tényleges falióra szerint ellenőrzi a lease-t. Ha a lease a commit tranzakciója alatt lejár, a végső job-frissítés hibája a periódus/ág/történet írásait is visszagörgeti.
- Az API alapértelmezett válaszai egységes `X-Robots-Tag: noindex, nofollow` jelölést kapnak, a korai hiba- és saját-fiókos válaszok is. A meglévő külön külső kitettségi engedélyek saját ellenőrzött viselkedése megmarad.

A lease-hez kötött új költségőr a személyes v2 workerben aktív. A négyargumentumos operátori/korábbi/Shared budget-hívásokat ez nem teszi automatikusan lease-kötötté; Shared továbbra kikapcsolva, saját konkurencia-ellenőrzése külön feladat. Nincs új séma/migráció, provider-modell vagy promptváltás. A meglévő próbálkozás- és költségnaplókat nem nullázzuk.

## Bizonyíték és korlát

A régi forráson a célzott helyreállítási esetek és a hiányzó robots fejléc regressziója hibát adott. A javítás után az új [16 helyreállítási próba](../tests/life-job-recovery.test.ts), a [katalógus-lease kerítése](../tests/closed-beta-catalog-worker-fence.test.ts) és a bővített [zárt béta HTTP-próba](../tests/closed-beta.test.ts) sikeres.

Az esetek fedik a hat keret nélküli elutasítást, hét finanszírozás nélküli lease-átvételt, az öt finanszírozott próbálkozást, lejárt lease melletti késői hibajelölést és commit/foglalás visszagörgetését, a lease-t elvesztő automatikus transport retryt, megszakított esemény- és történetjavítást, mentett fidelity újrahasználatát, valamint az ötödik próbálkozásból való fizetés nélküli befejezést.

**Teljes helyi `pnpm check`: 685 sikeres teszt, két meglévő Windows symlink-kihagyás, 64 tesztfájl; formázás, csomag-/script-/workspace típusellenőrzés, API/worker/Next production build sikeres.** A próbák izolált PGlite adatbázist és helyettesített provider-transportot használnak. Nem kapcsolódtak a Supabase-hez, nem küldtek levelet és nem indítottak fizetett AI-hívást. Új provider-költség: **0 USD**.

Ez determinisztikus helyi megszakítási bizonyíték, nem élő, többfolyamatos PostgreSQL- vagy Contabo-restart bizonyíték. A célkörnyezeti próba valós worker-folyamatot szakítson meg izolált adatokkal, fizetett provider-hívás nélkül; ellenőrizze a lease-átvételt, a checkpointot, az egyszeri commitot és a takarítást. A tényleges telepítéshez külön őrzött upgrade/rollback szükséges; az initial-only indítót már futó telepítésre nem használjuk vakon.

## Friss üzemeltetői döntések

A felhasználó a titkosított napi alkalmazásmentésekhez **hét nap** megőrzést választott. Ez jóváhagyott politika, még nem aktivált időzítő/archívumtörlés; nem a hosztolt Supabase Auth vagy szolgáltatói mentések automatikus megőrzési beállítása. [Mentési és privacy-replay kapuk](CONTABO_BACKUP_RESTORE_RUNBOOK_HU.md).

A saját meghívó Gmail-fejlécéről a felhasználó **SPF PASS / DKIM PASS / DMARC PASS** eredményt jelentett, `alterward.com` DKIM és From domainnel. Ez ember által visszaolvasott fejlécbizonyíték, nem Codex által elért Gmail-eredeti. A meghívó a spam mappába érkezett; a PASS nem inbox-garancia vagy a spam okának bizonyítéka. Recovery, tiltott signup és tényleges bejövő válaszút továbbra külön próba. [Levelezési checkpoint](SMTP2GO_DELIVERY_CHECKPOINT_HU.md).
