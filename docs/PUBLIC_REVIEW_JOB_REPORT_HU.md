# P09 — Felületről indítható, költségvédett AI-ellenőrzés

2026-10-05 · [Közös terv](NEXT_STEPS.md) · [Privát szerkesztő](PUBLIC_PREVIEW_EDITOR_REPORT_HU.md) · [Aktuális állapot és keret](STATUS_HU.md).

## Elkészült működés

A saját mentett angol másolathoz a felhasználó külön hozzájárulással kérhet AI privacy/content pre-screent. Az API csak sorba állítja a kérést, a worker végzi az egyetlen fizetett próbát. A mezőszintű eredmény az immutable snapshot hash-éhez, forrásrevisionhöz és `public-review-1` policyhez kötődik; a korábbi operatori parancs és olvasási API kompatibilis marad. `publicationApproved` minden válaszban false.

A queued/running/completed/failed/cancelled állapot újraolvasható. Dupla indítás, másik idempotenciakulcs ugyanarra a copyra, oldalfrissítés és eredmény-újraolvasás nem ismétli meg a fizetett hívást. Sikertelen vagy elveszett lease-ű ellenőrzés után új immutable preview szükséges; nincs automatikus fizetett provider- vagy worker-retry. A normál történetgenerálás korábbi retry-szabályai megmaradnak.

## Költség és életciklus

- API és worker: `PUBLIC_REVIEW_JOBS_ENABLED=false` alapérték. A sorba állításhoz mindkét oldalon pozitív `AI_PROJECT_BUDGET_USD` és `AI_USER_BUDGET_USD` kell. Az éles allowance továbbra 0.
- Közös projekt/user tranzakciós AI-foglalás a történetgenerálással; külön ingyenes review-keret nincs. Nulla konfigurált allowance meglévő pozitív DB-limit mellett is tiltja a foglalást. Ismeretlen szolgáltatói fogyasztás teljes foglalása megmarad.
- Visszafordítható technikai alapérték: egy pending review/user és `PUBLIC_REVIEW_DAILY_LIMIT=5` új job gördülő 24 óránként. Újraolvasás és ugyanazon job újrakérése nem fogyaszt új kvótát. Ez nem billing/csomagár.
- A meglévő checker-modell, legfeljebb 2200 kimeneti token, teljes zárt copy-input és 70 000 UTF-8 byte korlát marad; nincs csonkolás. A helyi fizetett próba a közös 5 USD OpenAI-fileguardot is használja.
- Worker előtt és commitkor saját aktív fiók, érvényes lease, snapshot/hash/revision, English és Shared-privacy kapu újraellenőrzött. Ha a forrás a provider-hívás alatt változik, a már felhasznált token nem visszatéríthető, de az elavult eredmény nem menthető és újabb hívás nem indul automatikusan.
- Fióktörlési marker azonnal cancel állapotot és lease-vesztést okoz. Auth-visszaállítás nem indítja újra. Saját export tartalmazza a jobot; fizikai fióktörlés cascade-takarítja. Más felhasználó és anon nem olvashatja vagy indíthatja.

## Szerződés és tárolás

Új `GET/POST /api/v2/public-previews/:id/review-job`, strict request `{snapshotHash,sourceRevision,policyVersion,acknowledged:true}`, kötelező `Idempotency-Key`. Új job-view séma azonos kötésekkel, elérhetőséggel, minimális job ID/státusszal. Nem ad ki promptot, nyers provider-hibát vagy más tulajdonos adatát.

Az additív 015 migráció `aw_public_review_jobs` RLS-táblát, owner/draft/review összetett FK-t, változatlan bindingot és restartot tiltó triggert ad. A 014 review-tábla eredményváltoztathatatlansága megmarad. A queue nem tárol újabb prózamásolatot. Új request/view JSON-séma: összesen 50; a korábbi 48 és 001–014 változatlan. 001–015 alkalmazva a fejlesztői Supabase-on és ismételve; verified DB TLS, 19 ff_ és 35 aw_/35 RLS.

## Ellenőrzés

A helyi teljes `pnpm check` sikeres: 323 teszt/28 fájl, formázás, típusellenőrzés, API/worker/Next production build. A célzott regressziók a tulajdonosi/anon/strict-consent/revision/idempotencia határt, egy pending jobot, napi kvótát, nulla költségkeretet, egyszeri claimet, stale-source elutasítást, lejárt lease fizetett retry nélküli lezárását, késői eredmény elutasítását és export/törlést ellenőrzik. A provider transient 500 public-review esetben pontosan egy hívás; a történetgenerálás retry-tesztje megmarad.

Az izolált valódi PostgreSQL CI-próba bővült párhuzamos három enqueue → egy job, két claim → egy nyertes, eredmény-újrahasználat, lejárt lease, törlési marker/visszaállítás, export/cascade és közvetlen anon/authenticated RLS-tiltás ellenőrzéssel. A CI eredményét a main futás után rögzítjük; a fixture nem használ provider-hívást vagy valódi kulcsot.

A külön valódi Supabase Auth/böngészős próba eredményét és költségét a befejezés után rögzítjük. Az előző valós AI-időszakot technikai fixture-ként használjuk újra, új történetgenerálási díj nélkül; a teszt nem AI nélküli termékmód.

## Következő tervrész

P09 következő része a curator-folyamat, teljes ScenarioVersion és valóban futtatható sanitized fork-checkpoint, Publication/Confirm és kis kurált Official seed. Ezt P10 Discovery/Save/Share/Report, P11 Community Publishing/visszavonás, P12 public fork/personalize és P13 mérés követi. S3 nyers/backup-retention, régi személyes próza, S4–S7 és a Contabo/Cloudflare élesítési kapuk megmaradnak. A fizetett review nem publikus jóváhagyás, anonimitási garancia vagy élesítés.
