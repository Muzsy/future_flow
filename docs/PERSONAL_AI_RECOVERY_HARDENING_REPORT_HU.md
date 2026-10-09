# alterward — személyes AI-feladatok újraindítása és költségvédelme

2026-10-09 · [Cloud-audit](CLAUDE_CLOUD_PRELAUNCH_AUDIT_REPORT_HU.md) · [Kiadási sorrend](CLOSED_SITE_RELEASE_PLAN_HU.md) · [Következő lépések](NEXT_STEPS.md).

**A CON-01/02 és az új REC-01/02 határesetek helyben reprodukálva és javítva; a teljes helyi ellenőrzés sikeres.** A Contabón egyelőre a korábban auditált `35f9889` alkalmazási image fut. E változat végső pontos Cloud-delta auditja lezárult; CI-je, izolált célpróbája és tényleges worker-újraindítási próbája még szükséges a telepítés előtt. A tesztelői fizetett béta inaktív.

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

A régi forráson a célzott helyreállítási esetek és a hiányzó robots fejléc regressziója hibát adott. A javítás után az új [22 helyreállítási próba](../tests/life-job-recovery.test.ts), a [katalógus-lease kerítése](../tests/closed-beta-catalog-worker-fence.test.ts) és a bővített [zárt béta HTTP-próba](../tests/closed-beta.test.ts) sikeres.

Az esetek fedik a hat keret nélküli elutasítást, hét finanszírozás nélküli lease-átvételt, az öt finanszírozott próbálkozást, lejárt lease melletti késői hibajelölést és commit/foglalás visszagörgetését, a lease-t elvesztő automatikus transport retryt, megszakított esemény- és történetjavítást, mentett fidelity újrahasználatát, valamint az ötödik próbálkozásból való fizetés nélküli befejezést.

**Teljes helyi `pnpm check`: 691 sikeres teszt, két meglévő Windows symlink-kihagyás, 64 tesztfájl; formázás, csomag-/script-/workspace típusellenőrzés, API/worker/Next production build sikeres.** A próbák izolált PGlite adatbázist és helyettesített provider-transportot használnak. Nem kapcsolódtak a Supabase-hez, nem küldtek levelet és nem indítottak fizetett AI-hívást. Új provider-költség: **0 USD**.

Ez determinisztikus helyi megszakítási bizonyíték, nem élő, többfolyamatos PostgreSQL- vagy Contabo-restart bizonyíték. A célkörnyezeti próba valós worker-folyamatot szakítson meg izolált adatokkal, fizetett provider-hívás nélkül; ellenőrizze a lease-átvételt, a checkpointot, az egyszeri commitot és a takarítást. A tényleges telepítéshez külön őrzött upgrade/rollback szükséges; az initial-only indítót már futó telepítésre nem használjuk vakon.

## Célzott Cloud-delta és önálló értékelés

Claude a pontos `876e5fd40c922dabc5c54831febc4c7d5fc40a57` forrást visszaolvasta, öt read-only parancs után elfogadta az atomi finanszírozott számlálót, a zárolási sorrendet, a lejárat utáni új foglalás tiltását, a tartós repair/fidelity folytatást és a végső commit-kaput. A [köztes main CI](https://github.com/Muzsy/future_flow/actions/runs/37959832959) verify/container sikeres, beleértve a valódi izolált PostgreSQL/HTTPS/DB-TLS próbákat. Ezek nem a későbbi forrás vagy Contabo-folyamat megszakításának bizonyítékai.

Két alacsony, hypothesis minősítésű új jelzés érkezett. REC-01 szerint a foglalás előtt folyton összeomló legöregebb job újra és újra felvehető; REC-02 a kézzel vagy jövőbeli kóddal módosított checkpoint elavult fidelity eredményét vizsgálja. Utóbbinál Claude nem talált olyan jelenlegi alkalmazási útvonalat, amely rossz chapter/verdict párt mentene. Ezért nem állítunk új, felhasználóból elérhető adatmanipulációt vagy valós queue-starvation incidenst. A hat új determinisztikus határeset a köztes forráson hibát adott, a javítás után sikeres.

- A külön `leaseRecoveryCount` ötven egymást követő automatikus, lejárt running lease átvételnél megállítja a még nem befejezhető jobot; más új feladat a következő lekéréskor haladhat. Ez nem finanszírozott attempt. A saját, kifejezett és idempotens kézi retry ezt a technikai számlálót nullázza, a fizetett attempt/ledger megmarad. Már elfogadott commit-only checkpoint továbbra befejezhető; sérült számláló a hibakapu irányába kezelendő.
- A mentett eseményjavaslat séma- és pontos inputhash-ellenőrzést kap. A fidelity eredménye csak sémahelyes alakban és az aktuális canon/fejezet pontos hash-éhez újrahasználható; a már passed marker is hash-kötött. Eltéréskor a régi verdict/marker törlődik és új ellenőrzés szükséges. Öt finanszírozott próbálkozás után ez új fizetés helyett megáll, nem ír periódust. A korábbi, result nélküli, de pontos hash-kötött passed checkpoint kompatibilis marad.

E kiegészítések végső pontos Cloud-auditja az efdf76d exact HEAD-en lezárult, REC-01/02 forrásból rendezett. Egy új alacsony/hypothesis REC-03 jelzés a már commit-ready jobot újra és újra hard-crashsel megszakító, nem talált kódutat feltételezi; Claude opcionális külön nagyobb korlátot vagy megfigyelést javasolt, új kiadási blokkolót nem jelzett. Codex nem tesz be bizonyíték nélkül újabb, az elfogadott eredmény befejezését akadályozó plafont. A hard-crash/container-restart észlelés a tesztelők előtti meglévő monitorfeladat része; a valódi restart-próba ettől még szükséges. A köztes Cloud-session kijelzett összköltsége 22,65 USD, 88% cache hit, promóciós kijelzés 80 USD maradék; az előző 19,68 USD-hez képest 2,97 USD sessionköltség-változás. Ez külön Cloud-promóció, nem az alkalmazás 10 USD provider/béta kerete vagy szolgáltatói számla. Védett eredeti JSON, usage szöveg/kép és prompt megmaradt. A valódi többfolyamatos PG/kill-restart, vegyes workerverzió és őrzött upgrade továbbra kapu.

## Friss üzemeltetői döntések

A felhasználó a titkosított napi alkalmazásmentésekhez **hét nap** megőrzést választott. Ez jóváhagyott politika, még nem aktivált időzítő/archívumtörlés; nem a hosztolt Supabase Auth vagy szolgáltatói mentések automatikus megőrzési beállítása. [Mentési és privacy-replay kapuk](CONTABO_BACKUP_RESTORE_RUNBOOK_HU.md).

A saját meghívó Gmail-fejlécéről a felhasználó **SPF PASS / DKIM PASS / DMARC PASS** eredményt jelentett, `alterward.com` DKIM és From domainnel. Ez ember által visszaolvasott fejlécbizonyíték, nem Codex által elért Gmail-eredeti. A meghívó a spam mappába érkezett; a PASS nem inbox-garancia vagy a spam okának bizonyítéka. Recovery, tiltott signup és tényleges bejövő válaszút továbbra külön próba. [Levelezési checkpoint](SMTP2GO_DELIVERY_CHECKPOINT_HU.md).

## Végső audit és saját recovery-kérés

A második célzott Cloud-audit után a session kijelzett összköltsége **23,28 USD**, 89% cache hit, promóciós kijelzés **79 USD maradék**. A két új follow-up együtt 3,60 USD sessionköltség-változás a korábbi 19,68 USD-hez képest; az alkalmazás provider-költése továbbra 0 USD. Összesen hat alap audit, három korábbi ops follow-up és két személyes recovery follow-up: az eredeti 27 mellé három új alacsony/hypothesis megfigyelés; e szám nem harminc igazolt hiba.

A felhasználó külön jóváhagyta a saját jelszóhelyreállító levél küldését. Az éles angol Account access oldalon egy kérés ment; a felület az „If recovery is available for this account, you will receive an email.” választ adta. Ez elfogadott kérés, nem SMTP-kézbesítés vagy befejezett recovery-bizonyíték. A levél tárgya Reset your Alterward password; megnyitás és új jelszó megadása felhasználói átadás. A nyers link/token és jelszó nincs kiolvasva vagy mentve; a felhasználó inbox/spam és belépési megerősítése még hiányzik.

A későbbi felhasználói recovery-befejezés és új belépés megerősítve, levél ismét spam. Az éles belépett Your lives/Sign out és a saját Supabase Updated at/Last signed in **18:55** helyi idő külön visszaolvasva. Nem olvastunk jelszót vagy link/token értéket; a teljes email-flow flag a negatív link/signup és válaszút hiányában továbbra false. [Részletes levelezési bizonyíték](SMTP2GO_DELIVERY_CHECKPOINT_HU.md).

## Pontos CI és elkülönített Contabo-célpróba

A efdf76d39093dc4fa866a72ee3372966832583db alkalmazási forrás [verify/container CI-je](https://github.com/Muzsy/future_flow/actions/runs/37961627026) sikeres. A privát, 2 GiB/1 CPU builderből készült image: sha256:13356fef2808c474b126ebd34e5b25fc85ab84d4f1be808d9119a6024b606793; builder eltávolítva. PostgreSQL 17, 36 migráció és ismétlés, CA/hostname-ellenőrzött DB TLS, privát HTTPS, 11 origin-tiltás, nyolc közvetlen peer-tiltás, két rights oldal, három statikus asset, két saját-auth tiltás és hibás cert-name elutasítás sikeres. Három runtime egress-próba tiltott; üres worker SIGTERM exit 0. Nincs nyilvános fixture-port, élő adatbázis-kapcsolat vagy provider-hívás. Az összes már futó konténer azonos állapotban maradt; az eldobható fixture-ek és hálózat eltávolítva.

Ez a konkrét új image runtime-bizonyítéka, de nem az aktív tulajdonosi oldal frissítése vagy feldolgozás közbeni hard-kill/restart. A régi 35f9889 aktív release hat korábbi privát build/runtime/preflight/env/stage/launch proofja külön archivált. Következő kapu a valódi többfolyamatos job megszakítás és őrzött upgrade/rollback; fizetett béta továbbra inaktív.

## Valódi PostgreSQL és erővel megszakított worker-folyamat

2026-10-09: az efdf76d image új elkülönített Contabo-próbája négy külön Node-folyamatot SIGKILL-lel megszakított, majd új folyamatból folytatta ugyanazt a feladatot. A [próbaindító](../scripts/ops/life-recovery-runtime.mjs) az image tényleges lefordított life-processor/repository/költségőr kódját, PostgreSQL 17-et és ellenőrzött DB TLS-t használja. Kizárólag szintetikus AI-adapter és eldobható adatbázis; az öt másodperces fixture lease valódi óra szerinti lejárását kivárja, nem írja át SQL-lel. Új token igazolt, lejárat előtti takeover tiltott.

| Megszakítás      | Újraindítás eredménye                                                                            | Fixture-foglalások / finanszírozott lease-ek |
| ---------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| EVENT_VALIDATION | A mentett javaslat megmarad; nem készül új eseményjavaslat                                       | 3 / 2                                        |
| CHAPTER_REJECTED | Az eredeti javítási instrukció megmarad; egy javítás után befejezés                              | 4 / 2                                        |
| FIDELITY_CHECK   | A mentett auditból új foglalás nélkül befejezés                                                  | 3 / 1                                        |
| COMMIT_INSERT    | A tényleges nyitott tranzakció SIGKILL után visszagördül; újraindítás új foglalás nélkül befejez | 3 / 1                                        |

Mindegyik eredménye pontosan egy periódus, egy history-bejegyzés, egy revision-növekedés és kizárólag lezárt szintetikus foglalások; befejezett job újra nem claimelhető. A három korábbi saját és hat legacy konténer változatlan; teljes fixture/hálózat eltávolítva, fizetett provider-költség **0 USD**. A checker hash-e és a konkrét image külön privát proofban rögzített. A próba a [Contabo runtime-indítóba](../scripts/contabo-target-rehearsal.mjs) és a [CI container-smoke-ba](../scripts/smoke-deployment.mjs) is bekerült; az új ops HEAD CI-je külön követendő.

Ez valódi többfolyamatos process hard-kill/recovery, de nem a termelési worker PID1/main konténerének vagy teljes hostnak a restartja, nem valós providerhívás és nem vegyes workerverzió-próba. A már meglévő üres worker SIGTERM0 külön bizonyíték. A próba előkészítésekor az API kulcs nélküli konfigurációja és a túl rövid, már sémaszinten elutasított synthetic chapter miatt két indítókorrekció kellett; ezek nem új alkalmazási findingok. Az éles image továbbra 35f9889; őrzött upgrade/rollback, monitoring és a többi tester-kapu megmarad.

## Következő pontos kiadási forrás

A 9a4106c ops HEAD [verify/container CI-je](https://github.com/Muzsy/future_flow/actions/runs/37965704802) sikeres, a négy valódi process-kill próbával együtt. A későbbi [Auth callback-javítás](AUTH_CALLBACK_HARDENING_REPORT_HU.md) 702 helyi teszt / 65 fájl és production build mellett helyi böngészőben is ellenőrzött; az új együttes forrás pontos Cloud-auditja, CI-je, célimage-próbája és őrzött upgrade-je külön következő kapu. Az info@ válaszút emberi visszaigazolása és a 422 / signup_disabled negatív próba sikeres; a használt saját link, inbox és a többi ops kapu még nyitott. Az éles image továbbra 35f9889, új provider-költség 0 USD.
