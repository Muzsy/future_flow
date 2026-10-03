# alterward — időszakos élet megvalósítása

2026-10-03 · [Dokumentációs központ](README.md) · [Státusz és keret](STATUS_HU.md) · [Következő lépések](NEXT_STEPS.md).

P01–P05 fő technikai szelete elkészült. Új élet a 12 lépéses angol/magyar onboardingból indul, hat hónapos valódi AI-fejezettel. A választás az aktuális ágat módosítja, külön gomb indítja annak következő időszakát; korábbi döntés másik opciója külön saját ágat nyit. A v1 archívum és tízéves generálás visszaolvasható, az alkalmazott 001/002 migráció változatlan.

## Tárolás és API

003: immutable életbemenet, időszak/canon/fejezet és választás; állapotrevision, ág-history, tartós job/checkpoint, piszkozat és technikai metrika. 004: projekt/felhasználó AI-költségszámla és előzetes foglalás. 005: minimális interakció és tartós fióktörlési helyreállítás. Mindhárom alkalmazva a valódi Supabase-adatbázison, ellenőrzött TLS-sel. Tulajdonosi összetett FK-k, RLS és anon/authenticated közvetlen hozzáférés tiltása.

Hitelesített /api/v2 végpontok:

| Művelet | Végpont |
|---|---|
| Életek | GET /lives, POST /lives |
| Piszkozat | GET /draft, PATCH /draft |
| Ág és történet | GET /branches/:id |
| Aktuális választás | POST /branches/:id/choice |
| Ugyanazon ág folytatása | POST /branches/:id/continue |
| Saját történeti elágazás | POST /branches/:id/periods/:periodId/fork |
| Hibás job folytatása | POST /jobs/:id/retry |
| Minimális mérési jel | POST /interactions |

A pontos DTO-k a controllerben és a kódból exportált [v2 sémákban](contracts/v2/lifeSetup.schema.json) vannak. UUID-ket, scope-ot és elfogadott döntési előzményt a szerver ad. Choice/continue/fork/retry revision- és idempotenciavédett; elavult kérés 409. Áganként egy aktív job, v1/v2 közös felhasználói limit. A régi /api/v1 resolve jelentése változatlan.

## Generálás és költség

Eseménymodell → sémavizsgálat/domain-szimuláció → canonból írt 250–600 szavas fejezet → külön történethűség/nyelv-ellenőr → atomikus commit. 2–5 esemény, döntés az utolsó eseménynél; minden opció végrehajthatósága ellenőrzött, de választás előtt egyik sem alkalmazódik. Következő időszak aktuális állapotból, két közeli időszak eseményeiből és legfeljebb tíz mentett választásból indul. Teljes régi próza nem kerül vissza a promptba.

Legfeljebb egy automatikus célzott domain- vagy prózajavítás jobonként. Validált eseménycheckpoint megmarad, narratívahiba nem generálja újra a teljes canont. Manuális retry legfeljebb öt claimig engedett. Lease/heartbeat és utolsó tulajdonosi/revision/hash ellenőrzés tiltja az elveszett lease vagy törölt fiók commitját.

Minden valódi SDK-kérés, a transport-retry is, előzetes tranzakciós foglalást kér. Projekt és felhasználó kerete együtt szükséges; ismeretlen fogyasztás megtartja a teljes foglalást. Árak csak az ellenőrzött két modell rövid kontextusára; más modell vagy túl nagy kérés előbb konfigurációt igényel. A helyi worker az opcionális AI_EXPERIMENT_LEDGER_PATH mellett a smoke-próbák közös 5 USD naplóját és kizáró paid-run.lock fájlját is használja. Az alkalmazás példa-keretei alapból nullák: tudatos beállításig nincs fizetett generálás.

## Felület, visszatérés és mérés

/start: saját/alternatív identitás, 18+ korcsoport, hely, munka, pénzügy, készségek, kapcsolatok, erőforrás, cél/áldozatok/korlát. Opcionális adatok ismeretlenek maradhatnak, nulla kapcsolat érvényes. Revisionös felhőpiszkozat és felhasználóhoz kötött munkameneti cache; újratöltés és mentési konfliktus kezelése. /lives mentett életek, /life/:branchId fejezet/idővonal/ágválasztó, aktuális döntés, folytatás, történeti fork és retry.

Angol alap, teljes magyar katalógus. UI-nyelvváltás nem írja át a mentett életnyelvet és nem indít AI-t. Böngészőben az angol főoldal, loginra vezető indítás, megmaradó nyelv, metadata és keskeny nézet ellenőrizve. Hitelesített teljes onboardingot még nem próbáltunk valódi Supabase-fiókkal.

Mérési események zárt allowlisten, szabad szöveg/prompt nélkül. Kattintás és sikeres első/további időszak külön esemény. pnpm metrics:private continuationClickRate és continued_lives technikai proxykat ad. Későbbi munkamenetes Continued Life Sessions és a végleges olvasási kohorsz még nincs mérve; az előbbi null. Az összesítés mellett hibák és minimális onboarding/olvasási jelek láthatók. A fejezet végének megjelenése nem bizonyítja, hogy elolvasták. Emberi pilot még nem történt.

## Ellenőrzés és nyitott kapuk

147 aktuális automatizált teszt (139 privát mag +8 Claude értékelő/budget/idézet/verdikt teszt): 20 változatos determinisztikus teszteset ×3 időszak, eltérő választások; eredeti múlt/tulajdon változatlan, eladás nem kerül vissza; idempotencia/revision/ownership, történeti fork, elveszett lease, narrátorhiba/checkpoint, célzott javítás, párhuzamos keretfoglalás, export/törlés és helyreállítás. A teszthelyettesítő kizárólag tesztben fut.

Négy valódi EN/HU OpenAI-lánc ×3 időszak, két eseménymodell összevetésével: [routing-riport](AI_V2_ROUTING_REPORT_HU.md). Ez négy, nem húsz generatív eset. Emberi EN/HU minőségi értékelés nyitott, a Sol alapmodell marad.

P06: valódi email-fiók és admin secret kulcs hiányában a teljes böngészős Auth/export/törlés még nyitott. Kód és [helyreállítási runbook](ACCOUNT_DELETION_RUNBOOK_HU.md) kész, backup/restore és valós adminpróba nincs igazolva. P08: 20–50 résztvevős pilot és előre rögzített sikerhatár szükséges. P09: külön [privát snapshot/szcenárió előnézeti alap](PUBLIC_DRAFT_FOUNDATION_HU.md) kész. Publikálás/Discovery/moderáció/public fork további munka; privát állapot nem válik nyilvánossá.

## További külső AI-bizonyíték

Külön Claude-értékelő és 5 USD kutatási keret, négy modell, EN/HU történetaudit, hibakontrollok és token/cache/effort/limit próba. [Teljes riport](CLAUDE_MODEL_EVALUATION_HU.md). Ez nem éles Claude-worker, új Supabase-fiók vagy emberi minőség/retenció igazolása.
