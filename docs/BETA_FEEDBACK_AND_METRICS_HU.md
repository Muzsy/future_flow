# alterward — angol béta visszajelzés és mérés

2026-10-04 · [Sorrend](NEXT_STEPS.md) · [Státusz](STATUS_HU.md) · [Indulás](ENGLISH_RELEASE_PLAN_HU.md).

## Visszajelzés

Bejelentkezés után `/feedback`, valamint fejezetenként a „Give feedback on this chapter” felület. Kategória: élmény, angol fogalmazás, ismétlés, következetesség, döntés, technikai hiba. Opcionális yes/maybe/no folytatási válasz és legfeljebb 1200 karakteres megjegyzés; ezek egyikét meg kell adni. A teljes történet/profil nem kerül a visszajelzési kérésbe. Valós neveket, elérhetőséget és érzékeny adatot ne írjon be a használó.

`POST /api/v2/feedback`: hitelesített, saját angol ág és annak történetében szereplő fejezet. Általános visszajelzés élet nélkül is adható. Azonos feedbackId/azonos tartalom egyszer mentődik; eltérő tartalom 409. Öt új visszajelzés gördülő 24 óránként, ismételt sikeres kérés nem fogyaszt új limitet. Nincs publikus lista, emailküldés vagy AI-hívás. Az `aw_feedback` RLS-védett, közvetlen anon/authenticated hozzáférés tiltott. Exportálható, fióktörléskor a többi saját adattal együtt törlődik.

`pnpm feedback:report` csak kategória/folytatási szándék szerinti összesítést ad, megjegyzést/profilt nem ír a terminálba. A jogosult üzemeltető az adatbázisban vizsgálhatja a privát megjegyzéseket; külön adminfelület még nincs. Heti kézi áttekintés az indulási munkaterv része, automatizálás nem készült. A próba szintetikus visszajelzése nem használói értékelés.

## Definíciók és korlátok

Az `aw_activity_sessions` szerveridővel dolgozik. Felhasználó + böngészőlap kliensazonosító; 30 perc rögzített aktivitás nélküli szünet után új szerveroldali munkamenet. Másik fiók ugyanazzal a kliensazonosítóval is külön munkamenetet kap. A kliensidő nem írja felül a szerveridőt. Látható oldal megnyitása/visszahozása új life_opened jelet ad; fejezetvég-láthatóság periodId-hoz kötött.

- **continuationClickRate:** a kész első időszakkal rendelkező életek közül hányban történt Continue kattintás; megőrzött technikai proxy.
- **continuationRate:** azokból a gyökéréletekből, amelyek első fejezetének végéhez láthatósági jel érkezett, hány folytatódott később sikeresen ugyanazon gyökérágon. A kérés a munkamenethez kötött, a siker a mentett jobállapotból jön.
- **continuedLifeSessions:** külön élet/munkamenet párok sikeresen befejezett, munkamenethez kötött folytatással. Több folytatás ugyanabban a munkamenetben ugyanahhoz az élethez egy pár.
- **laterContinuedLifeSessions:** ebből az első rögzített életmegnyitási munkamenet után indult munkamenetek.
- **returned_lives:** ugyanazon élet későbbi munkamenetben megnyitva.
- **failed_session_continuations:** munkamenethez kötött, jelenleg failed állapotú folytatási job; a sikeres retry átkerül a sikeres számlálásba.

`pnpm metrics:private` ezek összesítését adja. Múltbeli, munkamenethez nem kötött kérések nem kapnak kitalált munkamenetet; a legacy count mezők megmaradnak. A fejezet végének megjelenése olvasási jel, nem bizonyított elolvasás. Háttérlapra nem küldünk olvasási jelet; nincs szöveges profil/történet/prompt az analitikában. A 30 perc kezdeti mérési definíció, később mérés alapján változtatható. D1/D7/D30 kohorsz, populációs megtartás és ok-okozati hatás nincs ezzel igazolva.

## Tárolás és ellenőrzés

Additív `007_beta_feedback_and_sessions.sql`; az alkalmazott 001–006 és a korábbi canon nem változik. Új v2 feedback és continuation request JSON-sémák a contracts könyvtárban. Hat fizetés nélküli regresszió fedi a hitelesítést, ownership/fejezethatárt, idempotenciát/limitet, export/törlést, szerveroldali session-határt és click/failure/success/return különbséget. A valódi szintetikus HTTP- és helyi böngészős feedback/session/export/törlés próba sikeres; [bizonyíték](BETA_IMPLEMENTATION_REPORT_HU.md). Ez technikai próba, éles felhasználói kohorsz még nincs.
