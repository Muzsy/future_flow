# Valódi AI-generálási ellenőrzés — 2026-10-02

Három kitalált magyar profilból három alaptörténet és három döntési életág készült valódi OpenAI Responses API-hívásokkal, a `gpt-6.1-sol` modellel. Mind a hat generálás átment a sémavizsgálaton, az esemény- és fejezethivatkozások ellenőrzésén és a külön AI történetellenőrzésen.

| Profil | Alapesemény | Új ágesemény | Örökölt esemény | Fejezet összesen | AI-hívás | Becsült költség |
|---|---:|---:|---:|---:|---:|---:|
| Családos műszaki alkalmazott, érdekesebb munkát keres | 9 | 8 | 3 | 6 | 6 | 0,2041 USD |
| Grafikai tervezést tanuló, közeli kapcsolatok nélkül, portfóliócéllal | 9 | 8 | 3 | 6 | 6 | 0,2059 USD |
| 55–64 éves adminisztratív alkalmazott, helyben maradással és nagy biztonságigénnyel | 9 | 9 | 3 | 6 | 6 | 0,2199 USD |
| **Összesen** | **27** | **25** | **9** | **18** | **18** | **0,6300 USD** |

A költség a szolgáltatói válaszok tényleges tokenhasználatából és az ellenőrzés napján érvényes standard árakból számolt becslés. A cache-olvasás és cache-írás külön szerepel, a gondolkodási token a kimenet része. Nincs ismeretlen fogyasztású kérés, hibás válasz vagy automatikus generálási újrapróbálás ebben a sorozatban. A belső próbalimit 1 USD volt a felhasználó által biztosított 5 USD-ből; a sorozat után abból számítva körülbelül 4,37 USD marad.

## Ellenőrzött viselkedés

- Mindhárom új ág pontosan a szülő közös eseményeit örökli a döntési pontig; az új események későbbi időpontban kezdődnek.
- A második és harmadik próbában a szülő teljes visszaolvasott nézetének hash-e is változatlan az új ág elkészülte után. A canonical események SQL-módosításvédelme és az ágelágazási tesztek is sikeresek.
- A fejezetek a mentett canonra hivatkoznak. Mind a hat külön történetellenőrző válasz `valid=true`, üres issue-listával.
- A közeli kapcsolatok nélküli profil története nem feltételez korábban megadott partnert vagy barátot. Rövid szakmai beszélgetések megjelennek, új tartós szereplő nélkül.
- A helyben maradó profil választott új ága megtartja a költözés kizárását, az álláskeresés halasztását és a fizetős képzési kötelezettség kerülését a szövegekben.
- A fejezetek 249–316 szó közöttiek. A 250–600 szavas cél alsó határához közel vannak; egy fejezet egy szóval rövidebb, ami nem sérti az adatszerződést.
- A szövegek magyarul, második személyben készültek. Következő szerkesztési feladat az ismétlődő magyarázó fordulatok mérséklése és a jelenetek változatosságának növelése.

## Olvasható minták

- [Családos műszaki profil — alaptörténet és új életág](examples/ai-family.md)
- [Tanulási és portfóliócél — alaptörténet és új életág](examples/ai-creative.md)
- [Helyben maradó munkakeresési cél — alaptörténet és új életág](examples/ai-career-change.md)

A minták a tényleges AI-válaszokból exportált fejezetek; a törzsük nem kézzel írt helyettesítő tartalom. Minden profil, cél és kapcsolat mesterséges tesztadat.

## Az ellenőrzés határai

A tartós feladatfolyamat és a PostgreSQL-tranzakciók helyi, izolált PGlite adatbázisban futottak. A valódi Supabase-kapcsolat és migráció külön ellenőrizve, de ezek a próbák nem érintettek valódi Auth-fiókot vagy Supabase-ban tárolt személyes profilt. Az email-belépés és a teljes Auth/DB/OpenAI böngészős folyamat még külön tesztelendő; a fióktörlés szerveroldali Supabase-kulcsa még hiányzik.

Három profil és az AI történetellenőrzője nem teljesíti a dokumentáció 20 profilos, emberi értékelést igénylő alfakapuját. A helyi próba költségőre sem a teljes alkalmazás szolgáltatói keretkezelése.

A kód ellenőrzése: 59 automatizált teszt sikeres; formázás, típusellenőrzés és a teljes build sikeres. A szerveres segédszkriptek típusellenőrzése is bekerült a kötelező ellenőrzések közé. Az eredeti 21 dokumentum tartalma a manifest hash-eivel egyezik.
