# alterward — elfogadott személyes béta-helyreállítási korlát

2026-10-11 · [Kiadási sorrend](NEXT_STEPS.md) · [Hosztolt helyreállítás](SUPABASE_RECOVERY_COVERAGE_HU.md) · [Törlésvédelem](CONTABO_PRIVACY_RESTORE_PLAN_HU.md).

A felhasználó elfogadta, hogy a legfeljebb tízfős, Shared nélküli személyes béta alatt a teljes Supabase-projekt elvesztésekor az oldal zárva marad, és kézzel építjük újra. A teljes hosztolt belépés/MFA/role/Vault/projektbeállítás helyreállításának valódi próbája a későbbi kiadási kör feladata. Ez szűkített béta-határ, nem sikeres teljes helyreállítás állítása.

A meglévő titkosított alkalmazási és managed mentések, izolált restore, hét napos megőrzés, külön kulcspéldány és külső hibajelzés továbbra szükségesek. Régi Auth-fiókot, sessiont vagy visszavont jogosultságot aktuális, független egyeztetés nélkül nem aktiválunk. Ha az aktuális állapot és a független törlési/visszavonási alap is elveszett, az előző snapshot nem jogosultsági bizonyíték.

Nem halasztható el a még olvasható aktuális forrásból készülő authority, a ténylegesen megállított írókhoz kötött fence, az ismeretlen adattábla/oszlop/gráf elutasítása és a karanténos replay utóellenőrzése. A sikeres replay önmagában nem indít szolgáltatást és nem enged AI-költést. A Shared korábbi személyes prózájának védelme a későbbi öt páros teszt előtt külön kapu marad.

A Claude Cloud a korlátot biztonságosan dokumentálhatónak ítélte; az elfogadás a felhasználó döntése. Béta-kompatibilis monitor, célzott hibapróbák, végső pontos forrásaudit és tényleges meghívottak ellenőrzése továbbra a nyitás sorrendjében marad. A tízfős személyes béta, a teljes későbbi kínálat és a P01–P13 / S0–S7 fejlesztési terv megmarad. Tesztelői jogosultság, keret és a harminc nap indulása még inaktív.
