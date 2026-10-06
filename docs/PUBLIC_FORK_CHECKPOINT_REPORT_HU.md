# P09 — Külön, futtatható sanitized döntési checkpoint

2026-10-05 · [Közös sorrend](NEXT_STEPS.md) · [ScenarioVersion](SCENARIO_VERSION_REPORT_HU.md) · [Állapot](STATUS_HU.md).

## Elkészült működés és határ

A `fork-checkpoint-1` külön zárt gépi szerződés. A konkrét döntés előtti, már mentett canon-állapotot, általánosított identitást/környezetet, célokat és célállapotokat, szereplőket/tulajdonokat/lehetőségeket, időben érvényes korlátokat, az előnézetben megjelenített döntést, típusos előfeltételeket és opcióhatásokat együtt ellenőrzi. Helyettesítő kulcskatalógus adható az opcióban később belépő objektumoknak is; eredeti UUID vagy privát szülőhivatkozás nem szerepel a DTO-ban.

A döntés pillanata az utolsó canon-esemény `stateAfter` állapota: az esemény tényváltozásai már megtörténtek, a választható opciók még nem. A tárolási adapter a saját immutable historyból és a pontos mentett snapshotból veszi az állapotot, korábbi elfogadott döntéseket és megjelenített opciókat. Örökölt saját időszaknál az eredeti időszak ága/korlátscope-ja marad a kiinduló ellenőrzésben. Aktuális, későbbi élő ágállapot vagy választás utáni jövő nem helyettesítheti a checkpointot.

Ellenőrzött az egyedi helyettesítőkulcs, a cél/asset/actor/opportunity referencia, naptári dátum és kemény korlát. **Minden** megjelenített opciót végrehajthatónak kell találni a checkpointból. Forráskötéskor a gépi összevetés megőrzi az összes típusos tényt, számszerű eredményt, országot, készséget, munkaterületet, tradeoffot, scope-ot, időt és hatást. Az opciókulcs, sorrend és megjelenített szöveg a mentett copyhoz kötött. Prose-mezők privacy-szerkesztése megengedett; ezek narratív jelentésének ellenőrzése külön teljes review-feladat, nem determinisztikusan bizonyított szemantikai azonosság.

Kontakt/link/UUID és ismert eredeti személy-, munkáltató-, hely-, tulajdon- és lehetőségcím preflight van a teljes strukturált példányon. Automatikus saját candidate csak a gépi szabályok és e preflight után kerül vissza; máskülönben a pont `checkpoint=null`, általános `privacy`, `reference` vagy `consistency` okkal elérhetetlen. Nincs érzékeny szöveget visszaadó hibanapló. A candidate általánosítja az identitás/munkáltató/hely címkéit, szereplő- és objektumneveket; cél/környezet/készség/tradeoff megőrzése miatt azonosító kontextusnál inkább letiltja a pontot. Ez nem teljes PII-, tartalmi vagy visszaazonosíthatósági garancia.

A domain példányosítása friss élet/ág/cél/asset/actor/opportunity/korlát/döntés/opció ID-ket készít, a kiválasztott opciót a checkpoint dátumán alkalmazza, és új **privát** kezdőállapotot ad. A már korábban véget ért korlát nem kerül át; az aktuális választással lezáruló korlát alkalmazás után megszűnik. Ismeretlen jövőbeli döntéshez kötött korlát fail-closed. Privát memória, eredeti elfogadott döntés-ID és élő Shared-tagság nem kerül át.

Ez egyelőre szerveroldali, memóriában végrehajtható motor és saját előkészítő tárolás. Nincs public indítási API; P12-ben a kiadási engedély, atomikus egyszeri választás/új élet/job, idempotencia, kvóta és provenance tárolása együtt szükséges. A helper önmagában nem adatbázisos exact-once garancia. Termékbeli folytatás továbbra valódi AI; technikai fixture nem publikálható Official AI-történetként.

## Saját API és tárolás

| Útvonal | Művelet |
|---|---|
| `GET /api/v2/public-previews/:id/fork-checkpoint-candidates` | Saját érvényes copy pontjainak általánosított jelöltje vagy unavailable reason; ingyenes |
| `GET /api/v2/public-previews/:id/fork-checkpoints` | Saját mentett immutable példányok, mindkét tartalomhashsel; ingyenes |
| `POST /api/v2/public-previews/:id/fork-checkpoints` | Strict `{snapshotHash,sourceRevision,checkpoint}`, kötelező `Idempotency-Key`; ingyenes mentés |

Owner → source branch lock; aktív fiók, privacy consent, English/Shared-privacy, pontos copy hash/revision és lejárat kötelező. `PUBLIC_FORK_CHECKPOINTS_ENABLED=false` alap és deploy-minta; csak új mentést engedő opt-in. Saját olvasás és már mentett azonos példány ingyenes reuse kikapcsolás után is használható. Dupla kulcs, illetve azonos tartalom új kulccsal egyetlen checkpointrekordhoz vezet. Eltérő tartalom azonos kéréskulccsal 409. Egy draft legfeljebb száz külön példányt tárolhat.

A 018 additív migráció `aw_public_fork_checkpoints` RLS-táblát, owner/draft összetett FK-t, hash/decision-key korlátokat, tartalom-deduplikációt és immutable triggert ad. Anon/authenticated közvetlen jog tiltott; tulajdonosi export és fióktörlés/cascade integrált. Forrásrevision-változás, lejárat vagy deleting marker után újraolvasás/reuse is elutasított.

Az előző text-only AI/curator eredmény változatlanul csak szövegre érvényes. Minden új rekord `status=awaiting_review`, `publicationApproved=false`, `requiresFullReview=true`, `readyForPublicFork=false`. A régi snapshot és 006 scenario draft `startingPoint.readyForFork=false` mezője és hash-e változatlan. Új strukturált tartalom új teljes tartalomhash/review/Confirm kaput igényel.

Öt új JSON-séma, összesen 62; a korábbi 57 és 001–017 byte szerint változatlan. Fejlesztői Supabase 001–018 alkalmazva és ismételve, verified TLS; 19 ff_ és 40 aw_/40 RLS.

## Ellenőrzés és költség

Teljes helyi `pnpm check` sikeres: **372 teszt/32 fájl**, formázás/típusok/API/worker/Next production build. Tíz új domain- és nyolc persistence/HTTP-regresszió: pontos forrás/előfeltétel/hatás/opciók, új ID-k, döntéshelyzet és ending constraint, dupla alkalmazás elutasítása, privacy-fail-closed, zárt DTO, owner/anon/default-off/expiry/revision/deletion, immutable/dedupe/hash, saját export/cascade/RLS. A korábbi ScenarioVersion és minden P09/S0–S3 ellenőrzés megmarad.

Új két valódi szintetikus Supabase Auth-fiókos, verified TLS HTTP-próba sikeres: ScenarioVersionből privát start, első technikai canonból candidate, három párhuzamos mentés → egy checkpoint; exact copy/checkpoint hash és másik fiók 404; forrásfolytatás után checkpoint-olvasás 409; három technikai időszak és változatlan sablon, saját export és mindkét Auth/DB-fiók tényleges törlése. A próba izolált AI-helyettesítőt használ; új generatív minőségmérés/Official jóváhagyás nem történt.

Izolált PostgreSQL/CI smoke bővült concurrent checkpoint-save, immutable/hash/reuse/source/deleting/RLS/export/cascade és no-publication ellenőrzéssel. A végleges CI eredményt a bizonyíték elkészültekor rögzítjük; a korábbi ScenarioVersion formázási hibája javítva, annak `5743d93` verify jobja sikeres, container jobja még függőben volt a helyi ellenőrzés lezárásakor.

Új fizetett OpenAI/Claude-hívás: **0**. OpenAI guard 2.433873375 USD, maradék 2.566126625 USD; Claude guard 2.338015 USD, maradék 2.661985 USD. A külön 5–5 USD naplók nem nullázódtak.

## Következő

A teljes strukturált Privacy/Content Preview felületi szerkesztése és tényleges checkpointválasztása, új teljes-scope AI/curator ellenőrzés és közös tartalomhash következik. Ezután Publication/Confirm/Official eredetengedély és kis valódi AI seed, majd P10–P13. S3 retention/S4–S7, 50–100 élet/20–30 scenario cél, backup/restore/email és Contabo/Cloudflare élesítési kapuk megmaradnak; nincs éles telepítés vagy új production allowance.

## Felületi folytatás — 2026-10-06

Az [angol döntési állapot előnézete és leírásszerkesztője](PUBLIC_FORK_PREVIEW_REPORT_HU.md) is kész; 375/32/62 és valós Auth-böngésző/DB cleanup sikeres. A fenti runtime 5d29fcf CI-run mindkét jobja később indítás előtt cancelled lett, lépések/log nélkül; 017/018 Linux/container proof még szükséges. Következő immutable teljes csomag és új scope-os ellenőrzés.
