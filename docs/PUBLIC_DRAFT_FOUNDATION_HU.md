# alterward — a nyilvános rendszer privát előnézeti alapja

2026-10-05 · [Státusz](STATUS_HU.md) · [Nyilvános terv](PUBLIC_CONTENT_IMPLEMENTATION_PLAN_HU.md) · [Backlog](NEXT_STEPS.md).

P09 előkészítő szelet. Az integrált privát életből külön, engedett mezős snapshot- és szcenáriópiszkozat készíthető. Ez tulajdonosi előnézet: `awaiting_review`, nincs aktív Publication, nyilvános olvasás, Official badge vagy publikáló Confirm. A [privát AI-pre-screen](PUBLIC_AI_REVIEW_REPORT_HU.md) operatori szelete elkészült; a [szerkeszthető privát Privacy/Content Preview](PUBLIC_PREVIEW_EDITOR_REPORT_HU.md) is elkészült, a fizetett felhasználói scan-queue és megbízható kiadási jóváhagyás még hiányzik. Az angol nyelvi előminősítés AI-feladat, a használói élmény kiadás után mérendő; ez nem váltja ki a későbbi publikálási adatvédelmi kaput.

## Elkészült

- Saját, zárt [snapshotDraft](contracts/public/snapshotDraft.schema.json) és [previewCopy](contracts/public/previewCopy.schema.json) szerződés; locale, fix taxonómia, fejezet/idővonal/döntés és szerveroldali eredetjelölés.
- Eredeti élet/ág/esemény/szereplő/cél/asset UUID helyett új snapshotKey és helyi period/event/decision/option kulcsok. Nincs privát profil, teljes állapot, memória, prompt, audit vagy eredeti referencia.
- Általánosított korcsoport/ország/foglalkoztatási státusz; pontos pénzügy, munkáltató, régió/lakhatás, szereplők és korlátok strukturált mezőként kimaradnak.
- Tulajdonos által átnézett szövegprojekció; AI-generated igazolás a szerveroldali forrásból, szövegeltérésnél userEdited. Kliens nem küldhet Official/permission flaget.
- Determinisztikus elővizsgálat email/link/telefon/azonosító és ismert privát címkék ellen. Új canon-szereplő, munkáltató és hely címkéit is vizsgálja. Ez részleges preflight, nem teljes PII/tartalmi scan: szabad próza érzékeny pénzügyi/egyéb részleteihez még AI/emberi ellenőrzés kell.
- Immutable snapshot/hash/source revision/scan version, 30 perces lejárat; forrásváltozás vagy lejárat új előnézetet kér. Külön verziózott, általánosított szcenáriópiszkozat.
- `006_public_draft_foundation.sql` alkalmazva a Supabase-on. Tulajdonosi összetett FK, RLS, anon/authenticated tiltás, export és account cascade törlés.

Hitelesített tulajdonosi API: `POST /api/v2/branches/:id/public-preview` `{revision, copy}` bemenettel, valamint `GET /api/v2/public-previews/:id`. OpenAPI a request teljes sémáját tartalmazza. Másik fiók 404, token nélkül 401; `Cache-Control: no-store`. A saját életből elérhető privát szerkesztő ezeket használja; publikáló Confirm még nincs. A munkafelület GET és a `/public-preview/check` POST külön, ingyenes tulajdonosi művelet. Az előnézet létrehozása/olvasása nem hív AI-t és nem költ API-kreditet.

## Még hiányzó P09/P10–P13 kapuk

A `startingPoint` csak általánosított koncepció, `readyForFork:false`; nem futtatható döntési checkpoint vagy teljes ScenarioVersion. Public forkhoz külön állapot/korlát/opció projekció, új belső ID-k és domain-ellenőrzés szükséges. Itt nem másolunk a privát állapotból végrehajtható checkpointot.

Következő: felhasználói scan-queue külön projekt/user költségőrrel; kurátor-jóváhagyás, teljes Scenario/ScenarioVersion/Publication, preview hash-Confirm/idempotencia, public/unlisted token/permission, moderáció/visszavonás/cache/OG; ezután Discovery/Save/Share/Report, Community Publishing, public fork/personalize. Official seed a meglévő valódi mintákból csak új privacy/minőségi vizsgálat után lehet. Teszthelyettesítő nem kerül nyilvános AI-tartalomba.

Ellenőrzés: EN/HU projekció, privát mezők/UUID-k tiltása, eredetjelölés, kliensbadge elutasítása, ownership/FK/RLS, forrásváltozás, lejárat, immutable tárolás, export/törlés; külön HTTP-próba igazolja, hogy nincs anon olvasás vagy publish művelet. A teljes projekt 314 automatizált tesztje sikeres; az eredeti előnézeti szelet elkészültekor 139 volt. Valódi Auth/DB-törlés a draft-gráfot is takarította; public publikáció továbbra nincs. [Aktuális AI-review és ellenőrzési bizonyíték](PUBLIC_AI_REVIEW_REPORT_HU.md).

## Új Shared Context követelmény — nem teljesített kapu

A jelenlegi draft-projekció nem Shared-aware. A [Shared terv](SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) szerinti másik valódi tag nevét/profilját/azonosítóját a későbbi public preview külön általánosítja, a közös esemény prózáját is ellenőrzi. Másik tag privát ága és live membership soha nem public checkpoint. Azonosítható többfél-snapshot csak S7 consenttel. Ez P09/P11 új elfogadása; a mai UUID-helyettesítés és tulajdonosi draft-védelem nem bizonyítja, hogy Shared-történet publikálható.

2026-10-04, S0 utáni aktuális kiegészítés: 36 új Shared regresszióval 195 teszt a készlet, foundation kikapcsolt flag mögött. [S0 megvalósítás és korlátok](SHARED_CONTEXT_S0_REPORT_HU.md). A fenti 159-es béta/public mérési sorozat történeti bizonyíték; valódi Shared AI/UI/privacy és public release még nyitott.


## 2026-10-05: Shared-előzmény külön kapuja

A már megismert Shared-emléket tartalmazó saját ág — tagság nélküli fork is — új és korábbi public preview előtt PUBLIC_SHARED_REVIEW_REQUIRED választ kap. Ez fail-closed addig, amíg a más-tag általánosítás/PII/consent/curator elkészül. Privát saját folytatás elérhető; snapshot/hash nem változik és új AI-hívás nem indul. Nem kész Publication/Confirm vagy public fork. [Pontos határ](SHARED_CONTEXT_S3_PRIVACY_AUTH_REPORT_HU.md).


## 2026-10-05: angol AI-pre-screen elkészült

Az eddig hiányzó AI-elővizsgálat operatori szelete elkészült: a külön angol copy mezőnként ellenőrizhető, a 014 RLS-táblában hash/revision/policy/receipt kötésű privát eredmény tárolódik, saját olvasási API és export/törlés integrált. Egy valódi Sol-próba öt privacy-problémát talált az eredeti angol mintában. Ez nem teljes PII-garancia, nem curator/Official/Publication/Confirm és nem fizetős felhasználói job. A szerkeszthető privát Privacy/Content Preview elkészült; a fizetett scan-job és a további public kapuk hátravannak. [Megvalósítás és elfogadás](PUBLIC_AI_REVIEW_REPORT_HU.md).


## 2026-10-05: szerkeszthető privát Privacy/Content Preview

A [privát angol szerkesztő](PUBLIC_PREVIEW_EDITOR_REPORT_HU.md) elkészült: saját forrásszöveg, mezőszintű ingyenes preflight, idempotens immutable mentés, legutóbbi érvényes copy visszatöltése és teljes mentett tartalomnézet. Az operatori AI-review csak a megfelelő hash/revision és mezőkészlet mellett látható; finding a javítandó mezőre mutat. Mentés/olvasás nem hív AI-t, Shared-előzmény és HU továbbra tiltott. Helyi teljes check: 314 teszt/27 fájl, 48 séma, a korábbi 44 és 001–014 változatlan. Következő a külön fizetett scan-job költségőrrel, curator/ScenarioVersion/sanitized fork-checkpoint/Publication/Confirm; majd P10–P13. Éles bekötés továbbra nincs.
