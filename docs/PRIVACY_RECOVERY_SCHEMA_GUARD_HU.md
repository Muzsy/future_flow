# alterward — felülvizsgált séma a helyreállítás előtt

2026-10-11 · [Törlésvédelem](CONTABO_PRIVACY_RESTORE_PLAN_HU.md) · [Kiadási sorrend](NEXT_STEPS.md).

A [sémaellenőrző](../scripts/lib/privacy-recovery-schema.ts) a commitban rögzített 001–038 migrációk 96 alkalmazástábláját, 856 oszlopát és 219 idegen kulcsát várja. Nem az éles adatbázisból állít elő automatikusan elfogadott új alapot. A külön, opcionális ff_migrations ledger kizárólag három ismert metadata-oszlopot tartalmazhat.

Az [authority capture és a karanténos replay](../scripts/lib/privacy-restore.ts) ugyanabban a tranzakcióban ellenőrzi az alapot, még adatmódosítás előtt. Új tábla bármilyen néven, új oszlop vagy megváltozott tulajdonlási/törlési kapcsolat megállítja a műveletet; friss migráció után felülvizsgált, explicit alapfrissítés szükséges. Eltéréskor a másolat továbbra zárt.

A valódi Supabase csak olvasó, TLS-ellenőrzött megfigyelése 2026-10-11T01:08:47.194Z-kor pontosan egyezett: 96 alkalmazástábla és külön ledger, 854 oszlop, 219 idegen kulcs. Adatbázis-/Auth-írás, AI-hívás és service activation nem történt. Négy [helyi regresszió](../tests/privacy-recovery-schema.test.ts) sikeres: baseline, prefixen kívüli új személyes tábla, ismert tábla új oszlopa/megváltozott törlési kapcsolata, ledgerbe rejtett új adat. A meglévő hat replay-próba is sikeres.

Ez sémaeltérés-védelem. Nem függvény/trigger/RLS/grant-helyreállítás. Az új [lefedettségi registry és független karanténos ellenőrző](PRIVACY_RESTORE_VERIFIER_HU.md) külön modulként épül rá; a digest nem helyettesíti őket. A sémaőrt pg_catalog elsőbbség, materializált és más public nézetek elutasítása, valamint teljes pg_attribute oszloplista ellenőrzése is kiegészíti. Öt sémapróba sikeres. Az alkalmazás nem importálja ezt az operátori modult.

2026-10-14 N03 fejlesztési alap: a nullable aw_periods.narrative_artifact oszlopot a 038 migráció adja. A tiszta migrációs adatbázis 856 oszlopos digestje explicit review után rögzített; 96 tábla és 219 FK változatlan. Az új alap nem állítás az éles séma állapotáról. A fent dátumozott hosted megfigyelések történeti bizonyítékok; új rollout előtt külön migration/recovery kiadás szükséges. A [narratív tárolás tesztje](../tests/narrative-storage.test.ts) és a bővített restore fixture a melléklet törlését is vizsgálja.
