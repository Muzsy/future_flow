# alterward — szerkeszthető privát Privacy/Content Preview

2026-10-05 · [Státusz](STATUS_HU.md) · [Sorrend](NEXT_STEPS.md) · [Előnézeti alap](PUBLIC_DRAFT_FOUNDATION_HU.md) · [AI-pre-screen](PUBLIC_AI_REVIEW_REPORT_HU.md).

## Elkészült

A saját, legalább egy és legfeljebb tizenkét elkészült időszakos angol AI-életből a **Prepare a story copy** hivatkozás nyitja a `/preview/:branchId` oldalt. A Privacy Preview külön másolatban engedi szerkeszteni a címet, összefoglalót, kategóriát, célszöveget és minden fejezet/esemény/döntési kérdés/opció szövegét. A profilból csak korcsoport, ország és foglalkoztatási státusz látható; a dátumok és a korábban rögzített választások szerveroldaliak. A magánélet kánonja, választása és állapota változatlan.

A szerkesztő kiinduló szövege még nem anonimizált: a saját történet prózája jelenik meg, kizárólag a hitelesített tulajdonosnak. Privát állapot, memória, prompt, teljes profil, másik ág és belső szereplőazonosító nincs a szerkesztő DTO-jában. Shared-előzmény esetén a külön `PUBLIC_SHARED_REVIEW_REQUIRED` kapu már a munkafelület betöltését és az ingyenes ellenőrzést is tiltja. A magyar élet és felület továbbra elrejtett.

Mentés előtt kötelező a szöveg átnézésének jelölése. A szerver ingyenes, mezőnkénti ellenőrzése email/link/telefon/azonosító/belső referencia és ismert privát címke esetén a javítandó mezőre mutat. Nem idézi vissza az érzékeny értéket, nem hoz létre draftot, nem hív AI-t. A `deterministic-preview-v2` minden szövegmezőt vizsgál; JSON-mezőnevekből nem keletkezik névegyezési találat. Ez részleges ellenőrzés, nem teljes anonimizálási garancia.

Sikeres mentés immutable, hash/revision/scanverzióhoz kötött, harminc percig érvényes privát snapshotot és külön szcenáriópiszkozatot készít. Azonos Idempotency-Key és bemenet ugyanazt a példányt adja vissza, párhuzamosan is; eltérő bemenet 409. Az idempotencianapló csak hash-t és draftazonosítót őriz. A korábbi, kulcs nélküli operatori hívás kompatibilis marad.

A Content Preview a tényleges mentett példány összes fejezetét, idővonalát, döntési lehetőségét és rögzített választását mutatja, eredetjelöléssel. Nincs döntést végrehajtó gomb. Módosítás után a régi előnézet és annak AI-eredménye nem jelenik meg az új szöveggel; új mentés szükséges. Oldalfrissítés/visszatérés a legutóbbi érvényes, ugyanazon forrásrevisionhöz tartozó mentett copyt állítja vissza. Az el nem mentett szöveg csak a komponens memóriájában él. Lejárat, forrásváltozás, törlés és megszakított kérés kezelése explicit.

## AI-eredmény és API

A megbízható operator által indított AI-review saját eredménye a felületen olvasható. A kliens zárt szerződéssel ellenőrzi a snapshot hash-ét, source revisiont és a teljes mezőkulcs–útvonal megfeleltetést. Findingra kattintva a megfelelő szerkesztőmező kap fókuszt. A frissítés csak olvasás; az `no_findings` eredmény sem jelent publikálási engedélyt. Hibás/megszakadt review után új, explicit előnézet készíthető, automatikus fizetett retry nélkül.

| Tulajdonosi végpont | Művelet és költség |
|---|---|
| `GET /api/v2/branches/:id/public-preview` | Privát forrásszöveg és legutóbbi érvényes mentés; nincs AI |
| `POST /api/v2/branches/:id/public-preview/check` | `{revision,copy}` → mezőútvonal/problémakód; nincs AI vagy mentés |
| `POST /api/v2/branches/:id/public-preview` | `{revision,copy}`, opcionális Idempotency-Key; immutable mentés, nincs AI |
| `GET /api/v2/public-previews/:id` | Érvényes mentett példány; nincs AI |
| `GET /api/v2/public-previews/:id/review` | Saját, kötött AI-eredmény; nincs új AI-hívás |

Mind hitelesített, ownership-ellenőrzött és `Cache-Control:no-store`; anon 401, másik fiók 404. A felületi útvonal `noindex/nofollow`, címében nincs történetszöveg. Négy új exportált séma: [workspace](contracts/public/previewWorkspace.schema.json), [record](contracts/public/previewRecord.schema.json), [preflight](contracts/public/previewPreflight.schema.json), [review view](contracts/public/reviewView.schema.json). Összesen 48 séma, a korábbi 44 változatlan; 001–014 immutable, nincs új migráció.

## Ellenőrzés

Helyi ellenőrzések sikeresek: formázás, típusellenőrzés, **314 teszt/27 fájl**, API/worker/Next production build. A böngészőben talált megszakított betöltés téves hibaüzenete és a csak metaadatot módosító copy eredetjelölése javítva; mind a négy metaadatmező önálló módosítása userEdited jelölést kap. A második teljes futás Next buildje az aktív elkülönített dev-cache miatt megállt; a tesztalkalmazás lezárása után a Next build sikeres. A regressziók lefedik a saját/idegen/anon/hidden-HU munkafelületet, ingyenes preflightot, duplamentést, külön immutable új másolatot, source revisiont, export/törlést, Shared-kaput és a hamisított AI-eredmény kliensoldali elutasítását.

A konténeres CI-próba új valós PostgreSQL ellenőrzése az előnézet nélküli ingyenes preflight, két egyidejű azonos kulcsú mentés egyszerisége, legutóbbi mentés visszatöltése, új másolat külön review-státusza és törlés. A korábbi review-race/revision/deleting/RLS és Shared-próbák megmaradnak. A tényleges main CI-futás mindezt sikeresen igazolta; a teszt fixture nem felhasználói AI nélküli mód.

## Következő P09-szelet

Tranzakciós, projekt/user költségőrhöz kötött fizetett scan-job és worker/UI indítás; külön megbízható curator-jóváhagyás, teljes ScenarioVersion, futtatható sanitized fork-checkpoint, Publication/Confirm és visszavonás/moderáció. A jelenlegi `awaiting_review` copy nem aktív kiadás, `publicationApproved:false`, `readyForFork:false`. A Content Preview ezért még nem tartalmaz végrehajtható fork-checkpointot vagy publikálási engedélyeket.

Ezután Official kis seed és P10 Discovery/Save/Share/Report, P11 Community Publishing, P12 public fork/personalize, P13 közösségi mérés. A kombinált Shared S3 retention és S4–S7 terv, valamint P06/Contabo ops kapuk megmaradnak. Az alterward.com DNS/TLS és az élő Contabo ezen szeletben nem változott.


## Valódi Auth/AI és böngészős bizonyíték

Egy megerősített, szintetikus Supabase Auth-fiókkal valódi hitelesített HTTP-kérés indította az angol AI-időszakot. A forrás és mindkét mentett copy azonos szintetikus, írországi tanulási helyzetből származott. Böngészőben sikeres: belépés, saját élet → szerkesztő, szándékosan beillesztett email miatti ingyenes mezőszintű tiltás, mentés, Content Preview, AI-jelzés → mezőfókusz, módosítás utáni régi eredmény elrejtése, új mentés, oldalfrissítésből visszatöltés és eredeti privát fejezet változatlansága. Kijelentkezés után az előnézeti útvonal csak belépést kér, szöveget nem mutat. A képi ellenőrzés külön Privacy és Content képernyőképet őriz az ignorált helyi próbafájlok között.

A teszt operatora külön futtatta a két valódi Sol-reviewt; ez nem felhasználói scan-queue. A negatív kontroll kizárólag a copy összefoglalójába helyezett kitalált pontos fizetést, munkáltatót és helyet: négy finding, review_required. Az ezek nélkül újramentett másolat no_findings/0 finding eredményt kapott. Mindkét eredmény publicationApproved false. Két immutable copy, két review és külön scenario draft szerepelt az account exportban; a forrás fejezetcíme változatlan. Auth és teljes saját gráf törölve, ff_users maradvány 0; ideiglenes belépési fájl és a saját tesztszolgáltatások eltávolítva/leállítva.

Öt fizetett Sol-kérés: egy esemény, egy narrátor, egy fidelity és két public_review; új összköltség **0.063175000 USD**, konzervatív guard **0.063182500 USD**. A próba előzetes összfoglalási plafonja 0.65 USD, az eredeti közös 5 USD naplóval. Sem keretnullázás, sem új Claude-hívás nem történt. A ledger összesen **132 kérés**, tokenbecslés **2.342928105 USD**, guard **2.428628375 USD**, megmaradt **2.571371625 USD**; ismeretlen fogyasztás 0. Ez tokenbecslés, nem lekérdezett szolgáltatói kreditegyenleg.


## Main és CI — lezárt ellenőrzés

A runtime commit **4745a3**, [GitHub verify/container CI](https://github.com/Muzsy/future_flow/actions/runs/37347782878) mindkét jobja sikeres. Frozen install, formázás, típusellenőrzés, **314 teszt/27 fájl**, API/worker/Next production build és mind a **48 séma drift nélkül**. Izolált PostgreSQL/TLS: ingyenes editor-preflight nem ment, azonos kulcsú párhuzamos mentés egyszer hoz létre copyt, visszatöltés és új copy külön review működik; változatlan történetszöveg false, csak címben módosított copy true userEdited értéket kap. A review-start/reuse/revision/deleting marker/RLS és a korábbi S0–S3 próbák is sikeresek.

Mind a 14 migráció és ismételt futás ellenőrzött, web/API/Caddy HTTPS és DB TLS sikeres, anon API 401, üres queue poll és worker-leállás SIGKILL nélkül. A container nulla AI-hívással, valódi credential nélkül és külső hálózati kijárat nélkül futott. A végső dokumentációs audit 116 Markdown, 21 aktív/21 archív témadokumentum, 48 séma; a két stratégiai forrás 80 fejezete, 14 public MVP-eleme, a Shared 15 témája és 17 checksumja, ZIP/hash és korábbi immutable állományai változatlanok. Dokumentumhivatkozás és anchorhiba nincs. A main változása fejlesztési eredmény; Contabo éles telepítés nem történt.
