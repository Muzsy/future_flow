# alterward — v2 AI-modellek és költségmérés

2026-10-03 · [Dokumentációs központ](README.md) · [Státusz és keret](STATUS_HU.md) · [Következő lépések](NEXT_STEPS.md).

Valódi OpenAI Responses, szintetikus bemenet, izolált PGlite, ugyanazon ágon három hat hónapos időszak. Eseménygenerátor Sol vagy Luna; narrátor és checker mindig Sol. Nem keletkezett valódi Supabase-tesztfiók vagy nyilvános Official seed. A rendszer minden esetben valódi AI-t használt.

| Tartalomnyelv és eseménymodell | Kérés | Tokenbecslés USD | Konzervatív guard USD | Eredmény |
|---|---:|---:|---:|---|
| Angol, Sol | 9 | 0,1838044 | 0,1946275 | 3 elfogadott időszak |
| Magyar, Sol | 9 | 0,2154144 | 0,2262375 | 3 elfogadott időszak |
| Angol, Luna | 11 | 0,09846019 | 0,098990375 | 3 elfogadott időszak, egy fejezetjavítás |
| Magyar, Luna | 9 | 0,080065815 | 0,080593 | 3 elfogadott időszak |

Mind a 12 időszak sémája/domainje/hivatkozásai és gépi fidelity/nyelvi ellenőrzése sikeres, választások ugyanazon ág revisionjét növelték. Az angol Luna-lánc egy narratív fidelity-hiba után célzott javítással sikeres. A kezdeti futás részletes hibaindoka nem maradt meg; utána a javítás kategóriájának tárolását hozzáadtuk. Emberi minősítés még nincs.

Ebben a kis mintában a teljes angol lánc számított költsége 46,4%-kal, a magyaré 62,8%-kal alacsonyabb Luna eseménymodell mellett. Ez két modell ×két nyelv ×egy lánc; nem általános megtakarítási ígéret. Stochasztikus eltérő canon, cache és javítás befolyásolja. Az alapbeállítás minden szerepnél Sol marad; Luna bevezetéséhez emberi EN/HU értékelés és további hibakategóriás teljeslánc-próba szükséges.

Összes többlet: 38 kérés, 0,577744805 USD becslés. A korábbi 44 kérés is megmaradt a közös naplóban. Aktuális teljes keret a [státuszban](STATUS_HU.md); ez nem szolgáltatói egyenleglekérdezés.

2026-10-03-án ellenőrzött Standard rövid kontextusú árak USD/millió token: Sol input 2, cache-read 0,10, cache-write ceiling 2,50, output 10; Luna 0,10 / 0,01 / 0,125 / 0,50. A guard minden inputra cache-write plafont használ; a becslés ismert cache-mixszel számol. Kimenet tartalmazza a reasoning fogyasztást. [Hivatalos OpenAI árlista](https://developers.openai.com/api/docs/pricing?tab=suite).

Újramérés: pnpm smoke:life en 3 gpt-6.1-sol, illetve hu és gpt-6-luna. Csak a védett környezetben, előzetes közös keretfoglalással, egyszerre egy paid folyamat. Minden futás valóban költ, nem a dokumentáció megnyitása.

[Teljes angol három időszak](examples/AI_V2_ENGLISH_STORY.md) · [Teljes magyar három időszak](examples/AI_V2_HUNGARIAN_STORY.md). A fejezetek változatlan AI-szövegek. Emberi értékelés: személyesség, koherencia, választási tét, kíváncsiság, hihetőség, ismétlés; minden időszak után külön jelezendő, folytatná-e az olvasó. Az AI-checker nem helyettesíti ezt.
