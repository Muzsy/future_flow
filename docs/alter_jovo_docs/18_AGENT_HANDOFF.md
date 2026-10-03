# alterward — fejlesztői átadás

2026-10-03 · [Dokumentációs központ](../README.md), [állapot](../STATUS_HU.md), [backlog](../NEXT_STEPS.md). A következő fejlesztési feladat **P01 tárolási szelet**.

## Kiindulás és feladat

V1 prototípus valódi OpenAI-generálással, 29 kérdéssel, tízéves baseline-nal és saját gyermekágakkal; teljes angol/magyar támogatás. V2 2.0.0 lifeInput/lifeState/period/constraint és tiszta validator már kész, adatbázis/API/worker még v1. Ne indulj újra foundation/mock-demo építésével.

P01: additív 003+ migráció és perzisztencia a v2 élethez/időszakhoz/head/revisionhöz/accepted choice-hoz/continuation jobhoz; saját ownership/FK/RLS, v1 visszaolvasás/hash megőrzés, explicit új v2-élet. Ezután P02 rövid valódi AI, P03 ugyanazon ág folytatása. A pontos szerződés és határ a [v2 dokumentumban](../V2_SIMULATION_CONTRACT_HU.md).

## Kötelező keretek

1. Terméknév alterward, repó `Muzsy/future_flow`, **main** ág; belső legacy azonosítókat ne cserélj indok nélkül.
2. Valódi OpenAI, nincs AI nélküli termékmód. Helyettesítő kizárólag elkülönített tesztben.
3. Canon/state validált és determinisztikus; próza nem tartós tényforrás. Függő döntés után nincs előre commitolt következmény.
4. Ág/múlt/profil immutable, choice egyszer alkalmazva, revision/idempotencia/lease védelem.
5. Angol alap és teljes magyar minden új funkcióban; életnyelv immutable, nyelvváltás nem generál.
6. Saját élet privát, export/törlés ingyenes. Publichoz külön sanitized snapshot/checkpoint és explicit preview/Confirm.
7. Kulcs/log/prompt/titok nem kerül Gitbe, chatbe, kliensbe. Korábbi admin-kulcs függőséget ne kérd újra az érték chatbe másolásával.
8. Az 5 USD összes korábbi/future fejlesztői próbára együtt érvényes; aktuális fogyasztás a státuszban és helyi naplóban. Paid próba előtt közös foglalás, egy folyamat, unknown foglalás megmarad.
9. Modellek jelenleg Sol; Luna candidate csak saját teljeslánc- és nyelvi minősítés után. Ne kapcsolj automatikus drágább fallbacket számlázási hibára.
10. A public rendszer a teljes MVP része, személyes core után. Ne helyettesítsd általános social feed/komment/DM építésével.

## Ellenőrzés és átadás

Repository/AGENTS és érintett kód olvasása; migrált v1 adatok/hash-ek, ownership, period/head concurrency, atomic choice/job/canon és locale célzott ellenőrzése. `pnpm format:check`, typecheck/test/build, schema drift a változásnak megfelelően. Paid OpenAI-próba csak indokolt új AI-változásnál és előzetes keretből. Automatizált domain/privacy siker nem emberi termékvalidáció.

P06 valós email/Auth-törlés admin kulccsal még nyitott; P07 EN/HU minőség, P08 emberi folytatás, P09–P13 public. Main commit/CI nem nyilvános deployment. Átadásban kész és tervezett rész, teszt és korlát világosan szerepeljen. Nagy új termékdöntést ne találj ki; visszafordítható részletet dokumentálva oldj meg, tényleges hiányzó információt tisztázz.
