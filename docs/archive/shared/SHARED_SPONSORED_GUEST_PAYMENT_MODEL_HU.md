# alterward — Shared fizetési modell: szponzorált Guest seat

2026-10-12 · Kapcsolódó: [Shared megvalósítási terv](SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) · [S2 költségriport](SHARED_CONTEXT_S2_REPORT_HU.md) · GitHub Issue #1.

## Döntés

A Shared monetizációban különválik a **host/jogosultság** és a **meghívott részvétel**.

A fizető vagy más módon jogosult host hozza létre a Shared Contextet, hív résztvevőket és kezdeményezi a fizetett Shared AI-generálást. A meghívott felhasználónak nem kell automatikusan ugyanarra a fizetési szintre előfizetnie ahhoz, hogy részt vehessen egy `friend_group` közös történetben.

Az első megvalósított sponsored-seat szabály:

- egy `free` felhasználó egyszerre **1 élő `friend_group` Guest seatet** fogadhat el;
- Guest seat csak **konkrét `targetUserId`-ra címzett meghívásból** keletkezhet; általános/továbbküldhető invite-link nem ad ingyenes helyet;
- a tagság tartósan `sponsored_guest` móddal kerül tárolásra;
- a Guest olvashatja a számára jogosult közös canont, részt vehet a közös döntésekben és megkaphatja a saját engedélyezett személyes hatásait;
- Guest **nem hozhat létre** Shared Contextet;
- Guest **nem hívhat meg** új résztvevőt;
- Guest **nem kezdeményezhet fizetett Shared AI-generálást**;
- az AI-költség továbbra is a generálást kezdeményező jogosult `requested_by_user_id` és a projekt keretét terheli;
- a sponsored guest slot a fizetős/subscriber Shared context-slotoktól külön limit.

Ez a döntés a korábbi Shared terv azon szabályát írja felül a `friend_group` esetében, hogy minden résztvevő saját csomagjának feltétlenül jogosítania kell a context típusára. A `romantic_relationship`, `work_project`, `hobby_group` és `sports_team` esetében ez a feloldás **még nem érvényes**; ezek sponsored-seat szabálya csak a későbbi S4–S7 termék- és biztonsági döntéssel nyitható meg.

## Csomagmodell

| Szint | Saját/subscriber Shared slot | Létrehozható típus | Szponzorált részvétel |
|---|---:|---|---|
| **Free** | 0 | nincs | 1 célzott `friend_group` Guest seat; olvasás + saját döntés, host/AI-indítás nélkül |
| **Explorer** | 1 | `friend_group` | fizető hostként Free vendéget hívhat Friend contextbe |
| **Connected** | 3 | `friend_group`, `romantic_relationship`, `work_project`, `hobby_group` | Friend Guest seat támogatott; a többi típus továbbra subscriber-only |
| **World** | 5 | mind az 5 típus | Friend Guest seat támogatott; nagy csoportos sponsored modell későbbi döntés |

Az abszolút meglévő subscriber cap és a típuslimitek nem változnak. A `friend_group` legfeljebb 10, a romantic 2, a work/hobby 10, a sports 20 tagos marad.

## Miért ez a monetizációs határ

A Shared S2 két valódi Sol pipeline-próbája összesen **0,023755 USD** guard-fogyasztást mért, vagyis a két minta átlaga kb. **0,01188 USD / közös AI-futás**. Ez mérési adat, nem garantált jövőbeli egységár: hosszabb előzmény, több résztvevő, repair vagy modellár-változás emelheti.

Az architektúra azért alkalmas a szponzorált meghívotti modellre, mert egy közös eseményből egyetlen strukturált canon keletkezik. Nem készül automatikusan azonnal külön fizetett fejezet minden résztvevőnek. A későbbi személyes próza a saját élet folytatásakor materializálódik.

A monetizáció ezért a magas értékű műveletekhez kötődik:

- Shared létrehozás és hostolás;
- meghívási/admin jogok;
- fizetett közös AI-generálás;
- mélyebb kapcsolat- és csoporttípusok;
- több aktív subscriber context.

A meghívott Friend-részvétel ezzel szemben acquisition/growth felület: a fizető host egy új felhasználót súrlódásmentesen be tud hozni a saját közös történetébe.

## Upgrade és downgrade

A `subscriber` és `sponsored_guest` membership külön, tartós állapot.

- Egy fizetős subscriber későbbi downgrade-je **nem konvertálódik automatikusan Guest seatté**. A meglévő downgrade/grace szabályok érvényesek rá.
- Egy Free Guest későbbi upgrade-je megtarthatja a meglévő sponsored membershipet; az új, saját subscriber kontextusai külön slotkeretből számítanak.
- Új sponsored Guest admission jelenleg csak Free tiernél és célzott Friend-meghívásnál történik.

Ez megakadályozza, hogy előfizetés lemondásával automatikusan ingyenes hostjog maradjon fenn.

## Nem része ennek a változásnak

- payment provider, checkout, webhook vagy számlázási implementáció;
- végleges havi árak;
- Shared production aktiválás;
- romantic/work/hobby/sports ingyenes vagy szponzorált Guest seatek;
- automatikus keretemelés vagy korlátlan ingyenes AI-generálás.

A konkrét kereskedelmi árakat a béta használati és konverziós mérése után kell lezárni. A jelenlegi `Explorer / Connected / World` entitlement-nevek maradnak a kód szerinti kanonikus szintek.

## Béta mérési javaslat

A tízfős személyes béta után tervezett öt baráti páros Shared-kör alkalmas az új modell első mérésére:

- 5 jogosult host;
- 5 célzott Free Guest;
- Guest invite → regisztráció → első belépés → első közös döntés funnel;
- Shared AI-költség hostonként és eseményenként;
- Guestből saját életet indító / később előfizető arány;
- invite elfogadási és 7/30 napos visszatérési arány.

A konverziót és lemorzsolódást mérni kell; előre feltételezett 90–95%-os paywall-drop vagy „0 USD CAC” nem tekinthető bizonyított adatnak.
