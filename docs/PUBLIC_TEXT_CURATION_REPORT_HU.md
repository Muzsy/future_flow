# P09 — Tulajdonosi beküldés és kurátori szövegellenőrzés

2026-10-05 · [Közös terv](NEXT_STEPS.md) · [Állapot és keret](STATUS_HU.md) · [AI-review](PUBLIC_REVIEW_JOB_REPORT_HU.md).

## Elkészült működés és pontos határ

A felhasználó a mentett angol másolatot külön hozzájárulással beküldheti egy megbízható kurátor privacy/content szövegellenőrzésére. Előfeltétel az ugyanahhoz az immutable snapshot hash-hez és forrásrevisionhöz kötött, befejezett `no_findings` AI-review. A beküldés, állapotolvasás és kurátori döntés nem hív AI-t.

A beküldés idempotens: ugyanarra a példányra ugyanazon vagy új kéréskulccsal egyetlen rekord készül. A státusz `pending`, `text_reviewed`, `changes_requested` vagy `rejected`. Az utóbbi kettő kategóriakódot ad vissza; nyers kezelői megjegyzés nem jelenik meg a felhasználói felületen. A döntés rögzített; az azonos döntés ismétlése ingyenes, a lezárt döntés megváltoztatása tiltott. Módosított szöveghez új mentett másolat, annak AI-vizsgálata és új beküldés kell.

Ez kizárólag **text_only** ellenőrzés. `publicationApproved=false`; a privát draft `awaiting_review` marad. Teljes ScenarioVersion, futtatható anonimizált fork-checkpoint és annak külön ellenőrzése, tulajdonosi kiadási Confirm, Publication, Official eredetengedély és seed továbbra fejlesztendő. Az AI angol nyelvi minősítéséről hozott felhasználói döntés megmarad; az Official emberi/megbízható kurátori eredetellenőrzését ez a technikai nyilvántartás önmagában nem teljesíti.

## Hozzáférés és adatkezelés

Új saját `GET/POST /api/v2/public-previews/:id/curation`. A strict beküldés `{snapshotHash,sourceRevision,curationVersion:'text-curation-1',acknowledged:true}`, kötelező `Idempotency-Key`. A kliens nem küldhet döntést, jelvényt vagy publikálási jogot, és nincs HTTP-approve endpoint.

A kurátor szerveroldali eszköze csak kifejezetten beküldött, érvényes másolatot és a kapcsolódó AI-eredményt listázza. A snapshot általánosított profilja része a másolatnak; teljes privát profil, world state, memória, prompt és provider-receipt nem része a kezelői riportnak. A lejárt, forrásrevisiontől eltérő és inaktív tulajdonoshoz tartozó rekord nem foglalja a húszas listahelyet. A lekérdezés közben érvénytelenné vált példány minimális hibakóddal szerepelhet.

Owner → source branch → curation lock-sorrend; döntés előtt aktuális aktív fiók, English/Shared-privacy, lejárat, hash és revision ellenőrzése. Törlési marker után nincs érvényes új döntés; a megőrzött korábbi audit nem publikus engedély. Saját export tartalmazza a curation rekordot, fizikai fióktörlés cascade-takarítja. Új prózamásolat a curation táblában nem készül. A nyers/backup-retention és korábbi személyes próza S3-kapuja változatlan.

Az additív 016 migráció `aw_public_text_curations` RLS-táblát, owner/draft/review összetett FK-kat, státuszmező-konzisztenciát és binding/eredmény-immutability triggert ad. Közvetlen anon/authenticated hozzáférés tiltott. Két új JSON-séma: 52 összesen; a korábbi 50 és 001–015 változatlan. Fejlesztői Supabase: 001–016 alkalmazva és ismételve, verified TLS, 19 ff_ és 36 aw_/36 RLS.

## Kezelői használat

Normál és deploy konfiguráció: `PUBLIC_CURATION_ENABLED=false`. A beküldési flag csak új tulajdonosi kérést enged; állapotolvasás és meglévő kérelem ingyenes újrahasználata kikapcsolás után is elérhető. Az operator flag külön, csak az ellenőrzött szerveri parancs futtatására:

```powershell
$env:PUBLIC_CURATION_OPERATOR_ENABLED='true'
pnpm curation:public --list
```

A másolatok a Gitből és containerből kizárt `.local/public-curation/pending-copies.json` fájlba kerülnek. Windows: csak az aktuális felhasználó és SYSTEM ACL, Linux: könyvtár 0700/fájl 0600. Külső symlink/junction útvonal, linkelt riportfájl és a védett könyvtáron kívüli döntésfájl tiltott. A stdout csak darabszámot/állapotot ad, prózát és titkot nem.

Az ellenőrzött döntést a védett könyvtárban `decision.json` fájlba kell írni:

```json
{
  "curationId": "<a beküldés UUID-ja>",
  "snapshotHash": "<a másolat SHA-256 hash-e>",
  "sourceRevision": 1,
  "status": "text_reviewed",
  "reasonCode": null,
  "actorLabel": "<a tényleges ellenőrző azonosítása>",
  "privacyChecked": true,
  "contentChecked": true
}
```

A `changes_requested` és `rejected` döntések kötelező indokai: `privacy`, `content`, `quality`, `story_consistency`, `other`. A pozitív döntés indoka null. Az ellenőrzésnek ténylegesen meg kell történnie; a parancs nem végzi el vagy állítja automatikusan az emberi értékelést.

```powershell
pnpm curation:public --request-file .local/public-curation/decision.json --apply
Remove-Item Env:\PUBLIC_CURATION_OPERATOR_ENABLED
```

## Ellenőrzés és költség

A célzott tizenkét regresszió ellenőrzi a hozzájárulást, strict/ownership/anon/API-határt, AI finding/failed tiltást, idempotenciát, indok/ellenőrzési ack-kötést, lezárt eredmény DB-immutabilityjét, kizárólag beküldött copy listázását, revision/törlés/lejárat kaput, saját export/cascade-t és RLS/FK-kat. Izolált valódi PostgreSQL-próba párhuzamos submit és egymással versengő kurátori döntés, azonos döntés újrafuttatása, forrás-/törléskapu és publication=false ellenőrzéssel bővült. A technikai fixture-döntések nem valódi emberi Official-jóváhagyások.

Ebben a szeletben új OpenAI/Claude-hívás nincs. Megőrzött kumulatív OpenAI guard 2.433873375 USD, maradék 2.566126625 USD; Claude guard 2.338015 USD, maradék 2.661985 USD. Az 5–5 USD keret és a korábbi ismeretlen Claude-foglalások megmaradnak.

A teljes helyi `pnpm check` sikeres: 336 teszt/29 fájl, formázás, típusellenőrzés és API/worker/Next production build. 52 exportált séma, a korábbi 50 változatlan. Valódi Supabase Auth/DB/böngésző és védett operatori parancs: consent nélküli tiltott gomb, egyszeri beküldés, reload után pending, technikai döntés és azonos apply újrafuttatása, csak olvasó státuszfrissítés, dirty copy elrejti a kötött eredményt, source reload visszaállítja. Az előző valódi AI-időszak és no_findings report hash-ellenőrzött technikai replay; új provider-hívás nincs, a tesztdöntés nem valódi emberi Official-jóváhagyás. Szintetikus Auth/DB-fiók és curation törölve, credential fájl hiányzik, 3200/4200 tesztport leállt. Normál környezet curation flagje false maradt.

Védett operatori opt-in nélkül a parancs elutasítva, védett könyvtáron kívüli döntésfájl elutasítva. A Windows ACL két engedélyezett bejegyzése és öröklésvédelme ellenőrzött. A teszt végén a pending lista újraolvasva üres, a technikai döntésfájl eltávolítva.

## Következő

A teljes, külön privacy/content ellenőrzést igénylő ScenarioVersion és sanitized fork-checkpoint következik, majd Publication/Confirm/Official seed. P10–P13, S3 retention/S4–S7, backup/restore/email és Contabo/Cloudflare élesítési kapuk a kombinált tervben maradnak. Nincs új éles telepítés, DNS/TLS-aktiválás vagy production allowance.
