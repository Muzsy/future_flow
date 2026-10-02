# Következő lépések, sorrendben

1. **Élő infrastruktúra:** Supabase-adatbázis elérhetősége, migráció, email-belépés, OpenAI-kulcs és projektben elérhető modell. Elfogadás: valódi profilból AI-események, fejezetek és új ág készülnek.
2. **Generálási javítások:** célzott domain/schema repair, fidelity-visszajelzés alapján egy történetjavítás, biztonságos manuális job retry, AI-hibaköltség és checkpoint megőrzési policy. Elfogadás: a már kész események felhasználásával folytatható sikertelen narratíva.
3. **Profilélmény:** automatikus mentés, gazdagabb kapcsolati skálák, célfontosság és több cél, rövid AI-profilösszegzés. A tájékoztató elfogadását már visszatölti a felület. Elfogadás: megszakítás és másik eszköz után nincs adatvesztés vagy csendes felülírás.
4. **Döntések:** szabad szöveges döntés előnézettel és jóváhagyással; hard constraint validátor; scenario override a valódi profil módosítása nélkül. Elfogadás: tiltott költözés nem jelenik meg a megfelelő új ágban.
5. **Compare és explain:** első divergencia, azonos szcenáriónaphoz tartozó state-ek és oksági hivatkozások validálása. Elfogadás: nem különböző időpontú pontszámokból készül összehasonlítás.
6. **Alfa:** legalább 20 szintetikus profil, magyar emberi értékelés, load/resilience, tényleges Auth/DB/OpenAI e2e. Export/törlés/authz minden teszten kötelezően hibamentes.
7. **Ops:** Auth-törlés utáni DB-hiba helyreállítása, provider budget guard, pénzbeli költségmérés, export/delete admin audit, backup restore, retention, release checklist.

Az eredeti backlog ticketjei a fenti szeletek alapján bontandók részletes elfogadási feltételekre. Community, payment és mobil a core loop validálása után következik.
