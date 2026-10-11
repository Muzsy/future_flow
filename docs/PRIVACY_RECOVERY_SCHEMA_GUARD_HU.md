# alterward — felülvizsgált séma a helyreállítás előtt

2026-10-11 · [Törlésvédelem](CONTABO_PRIVACY_RESTORE_PLAN_HU.md) · [Kiadási sorrend](NEXT_STEPS.md).

A [sémaellenőrző](../scripts/lib/privacy-recovery-schema.ts) a commitban rögzített 001–036 migrációk 96 alkalmazástábláját, 854 oszlopát és 219 idegen kulcsát várja. Nem az éles adatbázisból állít elő automatikusan elfogadott új alapot. A külön, opcionális ff_migrations ledger kizárólag három ismert metadata-oszlopot tartalmazhat.

Az [authority capture és a karanténos replay](../scripts/lib/privacy-restore.ts) ugyanabban a tranzakcióban ellenőrzi az alapot, még adatmódosítás előtt. Új tábla bármilyen néven, új oszlop vagy megváltozott tulajdonlási/törlési kapcsolat megállítja a műveletet; friss migráció után felülvizsgált, explicit alapfrissítés szükséges. Eltéréskor a másolat továbbra zárt.

A valódi Supabase csak olvasó, TLS-ellenőrzött megfigyelése 2026-10-11T01:08:47.194Z-kor pontosan egyezett: 96 alkalmazástábla és külön ledger, 854 oszlop, 219 idegen kulcs. Adatbázis-/Auth-írás, AI-hívás és service activation nem történt. Négy [helyi regresszió](../tests/privacy-recovery-schema.test.ts) sikeres: baseline, prefixen kívüli új személyes tábla, ismert tábla új oszlopa/megváltozott törlési kapcsolata, ledgerbe rejtett új adat. A meglévő hat replay-próba is sikeres.

Ez sémaeltérés-védelem. Nem teljes szemantikus táblalefedettségi registry, nem függvény/trigger/RLS/grant-helyreállítás és nem privacy-utóellenőrzés. Ezeket nem helyettesíti a digest; a friss authorityhoz kötött független karanténos ellenőrzés következik. Az alkalmazás nem importálja ezt az operátori modult.
