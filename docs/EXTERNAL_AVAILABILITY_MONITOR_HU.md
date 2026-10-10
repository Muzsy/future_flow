# alterward — külső elérhetőség-ellenőrzés

2026-10-10 · **Az óránkénti ellenőrzés konfigurációja aktív, a kézi GitHub-próba sikeres. Ütemezett futás és az új hibaemail kézbesítése még nem igazolt.** [Hosztolt helyreállítás](SUPABASE_RECOVERY_COVERAGE_HU.md) · [Kiadási sorrend](NEXT_STEPS.md).

A [GitHub workflow](../.github/workflows/external-availability.yml) minden óra 17. percében, UTC szerint indulhat; a job legfeljebb kétperces. Az ALTERWARD_EXTERNAL_MONITOR_ENABLED repository variable 2026-10-10T11:44:08Z óta true, visszaolvasással ellenőrizve. A workflow active és a default branch main. A 14:20 UTC leltárban még nincs schedule-event: ez konfigurációs aktiválás, nem már bizonyított automatikus futás. A schedule késhet vagy kimaradhat; ezt nem helyettesítjük egy új fizetős szolgáltatással.

A [végrehajtó](../scripts/external-availability.mjs) és [ellenőrzések](../scripts/lib/external-monitor.mjs) nem használnak SSH-, Supabase-, Access-, SMTP- vagy AI-kulcsot. Három credential nélküli GET: /account-access és /privacy-notice 200, pontos angol h1 címmel; /api/v1/me/export 401, kizárólag AUTH_REQUIRED hibaobjektummal. Pontos media type és no-store, cache HIT/STALE hiánya kötelező. Redirect, általános hamis 200, footerben elrejtett jó szöveg, váratlan payload vagy média nem siker. Cookie nem kerül küldésre, nyers választ/hibát nem naplózunk. Egy kérés legfeljebb tíz másodperc és 512 KiB; a body olvasására is érvényes az időkorlát.

Hét [Node-próba](../tests/ops/external-monitor.test.mjs) sikeres; a CI verify is futtatja őket. A helyi három valódi HTTPS-próba sikeres. A [kézi GitHub-runnerteszt](https://github.com/Muzsy/future_flow/actions/runs/38048789271) 40f6f2d forrással sikeres, 12 másodperces jobbal. Access, origin, éles image és AI-allowance nem változott.

## Keret és értesítés

A privát repository GitHub Actions-keretet fogyaszt. A felhasználó 1056/2000 felhasznált percet, tehát akkor 944 fennmaradó percet, valamint **0 USD Actions-budgetet és bekapcsolt Stop usage when budget limit is reached beállítást** erősített meg. A billing-beállítást nem változtattuk; a billing API nem adott független bizonyítékot. Ez időponti, felhasználói megerősítés, nem folyamatosan mért aktuális egyenleg.

Harminc nap alatt 720 óránkénti indítás várható. Az egyetlen 12 másodperces próba alapján a becslés körülbelül 720 elszámolt perc, nem garantált fogyasztás; a többi CI ugyanazt a keretet használja. A kétperces timeout, retry és havi reset is befolyásolja a fogyasztást. A 0 USD-s stop a keret elfogyásakor a monitort is leállíthatja. A 10 USD AI-keret nem Actions-keret. [Hivatalos elszámolás](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

A felhasználó megerősítette, hogy kap sikertelen Actions-futásokról emailt. **E monitor új hibájának tényleges levele még nincs igazolva.** A [külön, kizárólag kézi értesítési próba](../.github/workflows/alert-delivery-test.yml) szándékosan failed jobot készít, szolgáltatáskiesés és hozzáférési adat nélkül. Nem olvassa a repository forrását, nem használ tokent vagy secretet, és nem indít hálózati ellenőrzést. Egy ilyen levél kézbesítése a repository natív Actions-értesítési útját igazolhatja; ettől az óránkénti schedule még külön ellenőrzendő.

## Mit nem figyel

Ez a publikus web/API és külső HTTPS-út kiesését érzékelheti. Worker/queue, adatbázis, mentés frissessége és SMTP-kézbesítés nincs a mérésben. Az API 401 kéréskezelést igazol, nem sikeres Auth/DB-műveletet. A szerver negyedórás helyi monitorja külön bizonyíték; saját hostkiesésekor nem tud jelezni. GitHub-kiesés, kimaradt schedule, elfogyott keret vagy email-spam esetén nincs megbízható riasztás. Teljes worker/DB/backup külső jelzés további kapu.
