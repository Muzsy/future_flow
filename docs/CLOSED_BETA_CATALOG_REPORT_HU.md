# alterward — a 15 élet / 5 Scenario kínálat őrzött előállítása

2026-10-08 · 45 fejezet előállítva, teljes kiadás folyamatban, zárt béta és Contabo még nem indult

A felhasználó 10 USD teljes induló keretet, legfeljebb tíz tesztelőt, 15 angol életet és öt Scenario-t választott. Az operator-folyamat kizárólag a védett, aktuális döntési rekorddal működik: 6 USD OpenAI + 1 USD Claude az előállításra; 2 + 1 USD változatlanul a béta használatára marad. A régi 10 + 5 USD döntést vagy más összeget nem fogadja el. [Keret](AI_PRODUCTION_BUDGET_HU.md) · [Meghívási védelem](CLOSED_BETA_ADMISSION_REPORT_HU.md).

## Kínálati terv

| Scenario | Téma | Három külön élet |
| --- | --- | --- |
| A new skill, without a clean break | Új készség és pályaváltási próba stabil munka mellett | A/B/C önálló generálási lánc |
| The first small service | Kis javítási szolgáltatás korlátozott időből | A/B/C önálló generálási lánc |
| Room to breathe again | Pénzügyi tartalék újraépítése | A/B/C önálló generálási lánc |
| A different city, the same people | Költözés és egy fontos kapcsolat megőrzése | A/B/C önálló generálási lánc |
| Making room for the unfinished work | Visszatérés az alkotáshoz | A/B/C önálló generálási lánc |

A sablonok teljes, kurált fiktív kezdőállapotok, angol célokkal és típusos korláttal. Lehetőségük nyitott és céljuk aktív, nem kész eredmény. Minden élet saját friss referenciákkal, valódi AI-eseményekkel és három hat hónapos fejezettel készül. A két választási terv A: 0/0, B: 0/1, C: 1/1; a harmadik fejezet függő döntéssel zárul. A kész történeteket nem másoljuk át másik életnek. Öt fiktív forrásfiók technikai tulajdonos, nem béta-tesztelő vagy meghívott; a tízfős tesztelői keretet nem foglalják el.

## Biztonságos operator-folyamat

Belépési pont: `pnpm seed:closed-beta <phase> [topic] [variant] [expected-period]`. A jelenlegi előállítás ténylegesen használt parancsa: `pnpm exec tsx --tsconfig tsconfig.scripts.json --env-file-if-exists=.env scripts/seed-closed-beta-catalog.ts ...`. Minden fázis explicit, fizetett alapértelmezett művelet nincs.

| Fázis | Eredmény / kapu | AI-hívás |
| --- | --- | --- |
| `init` | Egyszeri állapot, öt fiktív fiók és öt saját ScenarioVersion; levélküldés nélkül | nincs |
| `review <topic>` | Teljes sablon egyszeri, valódi AI-vizsgálata | OpenAI |
| `source <topic>` | Külön, kézzel rögzített teljes sablon/AI-report szerkesztői és jogi eredetellenőrzés; pontos hash és valódi igenek | nincs |
| `first <topic> <variant>` | Előzetesen engedélyezett Official-generálás első időszaka | OpenAI esemény/narrátor/kánonellenőr |
| `next <topic> <variant> 1 vagy 2` | Konkrét függő opció elfogadása, új időszak, korábbi canon változatlan | OpenAI esemény/narrátor/kánonellenőr |
| `audit <topic> <variant>` | Teljes háromfejezetes lánc külön külső auditorral | Claude |
| `prepare <topic> <variant>` | Teljes immutable történetmásolat, mindhárom checkpoint, új full-scope kiadási AI-vizsgálat | OpenAI |
| `prepare-revised <topic> <variant> <previous-content-hash>` | Külön, explicit javítás egy rögzített kifogásra; a korábbi bundle és report megmarad, új teljes scan szükséges; legfeljebb három változat | OpenAI |
| `prepare-renewed <topic> <variant> <previous-content-hash>` | Csak lejárt, ki nem adott, változatlan és tiszta scanű másolat; új preview és scan, régi bizonyíték megmarad, legfeljebb két megújítás | OpenAI |
| `publication-preview <topic> <variant> <content-hash>` | Exact LIFE-grant és külön teljes szerkesztői rekord után anonim Official kiadási előnézet | nincs |
| `publication-confirm <topic> <variant> <preview-hash>` | Külön védett, exact preview/snapshot/editori approval rekord; indexelés/fork kikapcsolva, normál serving flag nem változik | nincs |
| `audit-copy <topic> <variant>` | A javított teljes próza ellenőrzése az eredeti canonnal; külön audit, pontos kiadási hash | Claude |
| `curate <topic> <variant>` | Külön teljes szöveg/pontlista/audit átnézés; exact curation és Official LIFE eredetengedély | nincs |
| `status` | Saját operator-állapot és konzervatív költség kimutatása | nincs |

A kínálat első tényleges Official snapshotja külön preview/Confirm után elkészült; a további 14 Official másolat, öt public Scenario, külön personalization/fork permission és katalógusnavigáció még feladat. A CLI külön kiadási fázisokat kínál, de AI-ítéletből nem ad automatikus szerkesztői vagy kiadási engedélyt. A staging DB-ben kiadott másolat nem aktiválja a webhely normál serving flagjeit vagy a Contabo-telepítést.

A `.local/closed-beta-catalog` védett állapotában az eredeti, hét napos seed-költségidőszak külön execution-rekordhoz kötött. Folytatás nem módosíthatja vagy újíthatja meg. OpenAI/Anthropic külön projektplafon, közös operator-személyes számla, tranzakciós előfoglalás és ismeretlen usage teljes foglalása. A béta 30 napja továbbra csak a tényleges bétainduláskor kezdődik.

Egyetlen operator-processz dolgozhat. Minden kiválasztott fázis tartós attempt-jelölést kap; ugyanazt a fázist nem lehet újra fizetetten lefuttatni. Új kiadási változat csak az előző exact hashhez és fennmaradó review-/auditjelzéshez kötött explicit kérésből készül; a copy-audit is az új hashre egyszeri. Ismeretlen/félbehagyott költségfoglalás a következő fizetett fázist is megállítja. A normál motor korábban engedélyezett egyszeri célzott esemény- vagy narratívajavítása továbbra a keretőr alatt történik; ez nem ismeretlen HTTP-válasz automatikus újraküldése.

A generálási job létrehozásának tranzakcióján belül az operator rögtön saját lease-t foglal. A worker lease-attempt plafonját előre kifuttatja (`attempt=5`, `catalogOperatorLease=true`): ez visszaesési védelem, **nem öt valódi AI-próba állítása**. Ha az operator megszakad és a lease lejár, a normál worker a meglévő szabálya szerint fizetett hívás nélkül failed állapotba teszi; saját user-retry sem nyit új költést. A valódi providerhívások száma a receipt/költségrekordokban szerepel. A full-scope review lejárt lease-e szintén nem indul újra automatikusan.

## Tokenhasználat és minőség

Az író és saját kánonellenőr továbbra Sol; a független auditor Sonnet 5.5. A Claude a teljes időszakos kezdő-/záróállapotot, minden canon-eseményt/változást/döntést, az elfogadott választásokat és az egész prózát megkapja. Az események determinisztikusan ismétlődő köztes állapotmásolatait nem küldjük újra; a UUID-k következetes rövid referenciára cserélődnek. A teljes eredeti adatok megmaradnak a védett bizonyítékban. Tény vagy fejezet kihagyásával nem csökkentjük a költséget.

Az első három karrierlánc természetes angol és következetes canon, de az auditor személyességre és kíváncsiságra jellemzően 3/5-öt adott; a hang ismétlődő és óvatos. A három szolgáltatásindítási lánc személyessége 4/5, nyelve 4–5/5. Ezek gépi szerkesztői benyomások, nem tesztelői retenciómérések. A béta célja valódi visszajelzés gyűjtése; ismert kánonhibás vagy előre elfogadott döntést állító tartalom nem kerül ki. Kánon-/nyelvi/major auditjelzés megállítja a következő batch-előállítást; a végső teljes szerkesztői döntés külön marad.

### Javítás és az auditor téves jelzései

A hetedik, tartaléképítési életnél az auditor jelzése megállította az előállítást. A kiadási másolatban eltávolítottunk egy elkerülhető oksági fordulatot, pontosítottuk az első bevételre utaló megfogalmazást, és a harmadik fejezetet egyértelmű dátumsorrendbe, egységes igeidőbe rendeztük. Az eredeti AI-fejezetek, pénzügyi események, döntések és korábbi auditok változatlanul megmaradtak. Egy teljes kiadási scan a harmadik checkpoint régi, „még nem igazolt bevétel” célmegjegyzését is jelezte; a kiadási megjegyzés most kifejezetten az eredeti, 2027. októberi döntés idejére vonatkozik. A típusos tények és hatások nem változtak, a repository teljes kánon-összevetése továbbra kötelező.

A javított bundle teljes OpenAI-scanje `no_findings`. A végső Claude-copy-audit negatív maradt, ezért nem írjuk le sikeres auditként. Jelzései között számszerűen igaz állítások is „canon” hibaként szerepeltek. A teljes eredeti canon és kiadási másolat külön szerkesztői átnézése három téves riasztást és egy elfogadható, kisebb prózai átmenetet állapított meg. Példa: 1 460 + 240 − 190 = 1 510, így az extra bevétel ténylegesen elég növekményt adott a kiadás után az eredeti egyenleg fölött maradáshoz; 190/240 körülbelül 79%, helyes a „most of the recent gain” megfogalmazás. Az auditor maga is elismerte, hogy az összegek helyesek.

Ilyen lezárás csak külön, védett szerkesztői rekorddal engedélyezett: exact audit-/bundle-/teljes eredeti időszak-hash, **minden** kifogás külön hash és legalább 80 karakteres bizonyíték, teljes olvasást és fennmaradó tény-/nyelvi hiba hiányát rögzítő valódi igenek. Hiányzó, idegen, elavult, duplikált vagy csak részben lefedett döntés elutasított. Ez nem az AI saját ítéletéből automatikus jóváhagyás; az eredeti negatív jelentés megmarad. A user a szerkesztői döntéseket delegálta; a zárt béta felhasználói visszajelzése lesz a személyesség és folytatási igény tényleges mérése.

## Ellenőrzési bizonyíték

Az elfogadott összeg, fenntartott tesztkeret, teljes angol források, 15 önálló út, eredeti költségidőszak és külön, valódi igeneket igénylő szerkesztői kötés célzott próbákkal ellenőrzött. Külön valódi SQL-motoros próba igazolja, hogy a lejárt operator-lease nem indít normál workerhívást és user-retry-t, miközben egy másik normál feladat továbbra sorra kerül. A javított szöveg és checkpoint-megjegyzés pontos kötése, valamint az auditor minden jelzését lefedő külön döntés is ellenőrzött: kilenc célzott teszt/2 fájl, script types és formázás sikeres. A megelőző teljes helyi check 632/59 és production build sikeres; a 6f22473b pontos [CI-je](https://github.com/Muzsy/future_flow/actions/runs/37692894504) 633/59/162 és verify/container sikeres. Az ezt követő renewal és külön publication-approval két új kapupróbája után 635/59 teljes helyi check/build sikeres; új saját CI még lezárandó. Új SQL-migráció/JSON-séma nincs; 001–036 és 162 séma változatlan.

A megelőző tízfős admission `c53aa58e` pontos [CI-je](https://github.com/Muzsy/future_flow/actions/runs/37684863424) verify/container sikeres: 624/57/162, 001–036/repeat, az összes korábbi PostgreSQL-proof és verified HTTPS/DB TLS, fizetett CI-AI nulla. A jelenlegi seed-hívások külön, jóváhagyott operator-költségablakból valósak; a korábbi 5–5 USD kutatási napló változatlan. A szolgáltatói tényleges egyenleget nem kérdeztük le.

Az első háromfejezetes élet Claude-auditja és teljes kiadási AI-scanje hibajelzés nélküli; mindhárom checkpoint elérhető és a szöveg/opciók/elfogadott választások programozott összevetése egyezik az eredeti canonnal. Ez staging-bizonyíték, nem a teljes 15/5 kész katalógus vagy nyilvános indulás állítása. A legfrissebb számlálók a védett usage/state rekordban vannak. Normál kiadási flag-ek false, béta-használati keret inaktív, levelezési meghívó és Contabo-deploy nincs. A kapcsolat-e-mail, tényleges tesztelők, teljes webhely-zárás, P13 és retention/backup/restore/ops továbbra indulási feladat.


## Dátumozott előállítási pillanatkép

2026-10-07T21:53:49.008Z: 5 reviewed/curated/granted ScenarioVersion, 8 elkezdett életből 7 teljes háromfejezetes lánc, 7 eredeti Claude-audit, 2 külön LIFE-grant. Az előállítás és a fennmaradó teljes kiadási ellenőrzések folytatódnak; ez még nem public 15/5 katalógus. 89 tényleges seed-providerhívás, ismeretlen usage 0. Konzervatív elszámolás 1.641817 USD OpenAI + 0.390871 USD Claude = 2.032688 USD; tesztelési 3 USD érintetlen. A szolgáltatói egyenleg és végső számla nem lett lekérdezve.


## 2026-10-08: a 45 fejezet előállítása kész

2026-10-08, 2026-10-08T04:14:25.918Z: mind a 15 önálló angol AI-élet elkészült, összesen 45 hat hónapos fejezettel és 15 eredeti Claude-audittal; az öt reviewed/curated/granted Official SCENARIO forrás is kész. Négy külön LIFE-grantból az új kínálat első tényleges Official snapshotja explicit preview/Confirm után DB-readerrel ellenőrzött; a másik 14 élet teljes kiadási folyamatának lezárása és öt public Scenario még feladat. Az utolsó kreatív audit egy saját indoklásában is helyesnek elismert, hat hónapos dátumkülönbséget jelzett; teljes külön editori lezárása még szükséges, az eredeti negatív report megmarad. A teljes 15/5 public katalógus és Contabo-indulás nincs kész. A lejárt, még ki nem adott preview külön exact hashhez kötött megújítása új immutable previewt és teljes scan-t készít, korábbi report/approval/grant megőrzött, az eredeti seed-költségablak változatlan. Külön preview- és Confirm-fázis valódi editori rekordot igényel, AI-jelentés nem automatikus kiadási engedély. A 6f22473b pontos verify/container CI sikeres (633/59/162, 001–036/repeat és PostgreSQL/HTTPS/DB TLS proofok, 0 CI-AI); az új renewal/Confirm 635/59 teljes helyi check és production build sikeres, új saját CI még kapu. Jóváhagyott összesen 10 USD: 8 OpenAI + 2 Claude, seed plafon 6 + 1, tesztelőknek fenntartott 2 + 1 érintetlen. 169 valódi seed-providerhívás; konzervatív összeg 3.733013 USD (3.024785 OpenAI + 0.708228 Claude), ismeretlen 0; ez nem szolgáltatói számla/egyenleg. A legfeljebb 10 fős, tényleges kezdéstől 30 napos béta kerete inaktív, normál kiadási flag-ek false, régi 5–5 USD kutatási naplók változatlanok. Teljes kiadás/permission/katalógus, személyes Scenario AI-minőség/pozitív UI, P13/retention/backup/restore/email/ops, kapcsolat-email, tényleges meghívottak és teljes webhely-zárás további kapu. Teljes 50–100 élet/20–30 Scenario béta utáni bővítés, nyilvános indulás külön lépés.

A hat új költözési/alkotói lánc személyessége 4/5, nyelve 4–5/5, kíváncsisága 3–4/5 a gépi audit szerint. Az utolsó kreatív report egy helyes állítást saját maga is téves riasztásként indokol, de canonFaithful=false maradt; ezt nem nevezzük hibamentes auditnak. A következő szerkesztői lezárás teljes szöveg/eredeti canon és egyedi finding-hash alapján történik.

A kilencedik élet javított teljes copy-auditja hibajelzés nélküli. Lejárt előnézetének első megújítási kísérlete egy belső archív fájlnév-validáción állt meg, fizetett hívás/DB-módosítás előtt; a failed attempt megmaradt. A javított lépés új previewt és tényleges új full scan-t készített. A tartalom hashje változatlan; a korábbi deadline/report/approval megmarad, a copy-audit exact hashhez kötve tovább érvényes, újat nem fizettünk érte. Új teljes editori kötés, külön LIFE-grant, külön kiadási előnézet, exact független publication-approval és Confirm után a DB-reader snapshot-hashje egyezik. Indexelés és fork kikapcsolva, normál serving flag-ek false.
