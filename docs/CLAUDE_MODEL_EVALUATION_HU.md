# alterward — Claude modellek, tokenmérés és külső audit

Aktív kiadási döntés: [kizárólag angol béta és kiadás utáni visszajelzés](ENGLISH_RELEASE_PLAN_HU.md). A jelen riport korábbi EN/HU mérései változatlan történeti bizonyítékok; a magyar új kiadás és kézi EN/HU előminősítés halasztva/felülírva.

2026-10-03 · [Státusz és két külön keret](STATUS_HU.md) · [Külső történetaudit](examples/CLAUDE_EXTERNAL_AUDIT_HU.md) · [OpenAI v2 mérés](AI_V2_ROUTING_REPORT_HU.md).

## Eredmény és modellválasztás

A jelenlegi kis EN/HU mintán **Sonnet 5.5 a rendszeres külső audit legjobb jelöltje**, pontosított prompttal és az auditor válaszának helyi ellenőrzésével. Opus 5.5 a vitás esetekhez és mintavételes második véleményhez indokolt. Haiku 4.5 olcsóbb, de narrátorként nyelvi/kánonhibákat, eseménygenerátorként érvénytelen UUID-kat adott; ebben a mérésben nem alkalmas ezek alapmodelljének. Fable 5.1 a két fő történeten nem adott olyan többletet, amely a rendszeres, többszörös díjat indokolná.

Ez kutatási eredmény, nem automatikus éles routingcsere. A worker továbbra is OpenAI-t használ, Sol az alap minden szerepben. Az olcsó Luna eseménygenerátor korábbi háromidőszakos próbája továbbra ígéretes; emberi EN/HU kapu előtt nincs átállítás. Claude szerveroldali értékelő és CLI készült, külön helyi keretőrrel; nem a meglévő OpenAI DB-költségszámlán költ.

| Feladat | Következő jelölt | Indok és fennmaradó kapu |
|---|---|---|
| Eseménytervezés | Luna, szükség esetén Sol; Claude-oldalon Sonnet | Luna korábban 6 v2 időszakon átment; Sonnet most 2/2 önálló jelöltet validált, Haiku 0/2. Teljeslánc és emberi próba szükséges |
| EN/HU narrátor | Sol; összehasonlítandó Sonnet | Sonnet magyar fejezete átment; angolhoz egy célzott javítás kellett. Haiku mindkét története problémás |
| Rendszeres külső audit | Sonnet 5.5, low effort | EN/HU fő minták és ismert hibák felismerése; promptkalibráció és idézet/verdikt-validálás kötelező |
| Vitás vagy mintavételes második audit | Opus 5.5 | Részletesebb szerkesztési észrevételek, körülbelül kétszeres egységár |
| Fable | Eseti, külön indokolt referencia | A két könnyű alapmintán nem igazolt többlet; nehéz feladatokról ebből nincs ítélet |
| PII/redakció és public moderáció | Még nincs kiválasztva | A történeti audit nem privacy-, PII- vagy moderációs teszt |

## Hivatalos árak és modellazonosítók

A hozzáférést a valódi Models API-val is ellenőriztük. Standard globális Claude API, USD/millió token; a modellek elérhetősége és ára dátumhoz kötött.

| Modell | API ID | Input | Output | 5 perces cache-írás | Cache-olvasás |
|---|---|---:|---:|---:|---:|
| Haiku 4.5 | `claude-haiku-4-5-20251001` | 1 | 5 | 1,25 | 0,10 |
| Sonnet 5.5 | `claude-sonnet-5-5` | 2 | 10 | 2,50 | 0,20 |
| Opus 5.5 | `claude-opus-5-5` | 4 | 20 | 5 | 0,20 |
| Fable 5.1 | `claude-fable-5-1` | 10 | 50 | 12,50 | 0,25 |

Forrás: [hivatalos árlista](https://platform.claude.com/docs/en/about-claude/pricing), [modelláttekintés](https://platform.claude.com/docs/en/models/overview), [Models API](https://platform.claude.com/docs/en/api/models/list). Nem használtunk fast mode-ot, egyórás cache-t, szerveres keresőeszközt vagy Batch-et. A legacy Haiku nem fogadja az `inference_geo` kérésmezőt; a kliens csak a többi modellnél küldi a `global` értéket.

## Módszer és korlátok

Négy korábban generált, teljesen szintetikus lánc: EN/HU × Sol/Luna eseménymodell, lánconként három időszak. A narrátoruk Sol volt. Az auditor nem kapta meg a szerző modelljének nevét. A canont, állapotokat, döntéseket és fejezeteket összevetettük; az eredeti mintaszövegek változatlanok maradtak. Egyetlen alaphelyzet több változata, nem reprezentatív felhasználói kohorsz vagy húsz generatív profil.

A szereppróbákban Haiku/Sonnet külön első eseményjavaslatot és külön fejezetet készített EN/HU nyelven. A narrátorok ugyanabból a már elfogadott Sol-canonból írtak, nem a saját új eseményjavaslatukból. Ezek nem háromidőszakos Claude-worker láncok. A próba JSON-ba csomagolt eseményjavaslatát az eredeti Zod/domain validálta; nem állítjuk, hogy az összetett eseményséma teljes Claude grammar-kényszerítése élesben igazolt.

Egy ismert hibás bekezdés együttesen lezárta a nyitott döntést, felmondást/új eurófizetést és garantált nyereményt állított. Ez egy kombinált kontroll ×két nyelv ×három modell, nem hat független hibakategória. Haiku felismerte a hibát, de mindkét válasza megbukott az idézet/verdikt ellenőrzésen. Sonnet és Opus 2/2 használható hibajelzést adott. A finom hibák teljes visszahívását ez nem bizonyítja.

A kezdeti auditorprompt a gyengébb láncoknál téves riasztásokat eredményezett. Külön tisztáztuk, hogy az időszak `endState` értéke a választás elfogadása **előtti** állapot; az elfogadás a fejezet után és a következő kezdőállapot előtt történik. A „helyes, nem hiba” megjegyzéseket nem szabad hibaként listázni. Négy új Haiku/Sonnet Luna-audit ezután kánonhűnek minősítette a láncokat. Ez promptjavítás, nem a történetek vagy a canon átírása.

Az auditor idézeteinek tényleges jelenlétét és a hibakategóriák/verdikt egyezését helyben ellenőrizzük. A kisebb tényszerű kánonhiba is indokolhat `canonFaithful=false` értéket; a kezdeti helyi szabály két szerepauditnál túl szigorúan major hibát követelt. Ezt javítottuk, a régi eredményfájlok eredeti státusza megmaradt. A nyers [audit JSON](examples/CLAUDE_EXTERNAL_AUDIT_RESULTS.json) ezért hibás gépi megállapításokat és történeti validátor-státuszokat is tartalmaz; ezek nem jóváhagyott tények.

## Tokenoptimalizálás

Az ingyenes, modellenkénti Count Tokens API-t a tényleges kéréshez használtuk. Ismételt eseményenkénti before/after állapotok elhagyása és stabil, egyértelmű UUID-aliasok rövidítették az auditot. Az időszakok kezdő/végállapota, változásai, céljai, korlátai, választásai és teljes fejezetei megmaradtak. Ez auditnézet; az adatbázis canont és UUID-kat változatlanul tárolja.

| Modell / Sol-lánc nyelve | Teljes bemenet token | Tömör bemenet token | Csökkenés |
|---|---:|---:|---:|
| Haiku / HU | 23 594 | 13 168 | 44,2% |
| Haiku / EN | 21 221 | 9 648 | 54,5% |
| Sonnet/Opus / HU | 30 043 | 17 078 | 43,2% |
| Sonnet/Opus / EN | 28 660 | 13 652 | 52,4% |

Ugyanaz a szöveg más tokenizerrel más tokenszámot ad; a Sonnet/Opus itt több inputtokent használt a Haikunál. Egységár helyett konkrét feladatot kell mérni. A teljes/tömör HU fizetett Sonnet-audit is azonos kánoneredményt adott; minden nyelv és hibafajta minőségazonosságát nem teszteltük párosan. [Ingyenes tokenmérés](https://platform.claude.com/docs/en/build-with-claude/token-counting).

### Mért cache

Azonos HU Sol-lánc, kalibrált Sonnet-prompt, explicit 5 perces cache. A teljes bemenet 30 280, a tömör 17 315 token. A változatlan prefix tényleges újrafelhasználása a `cache_read_input_tokens` mezőben megjelent.

| Audit | Cache-írás / -olvasás token | Összes output token | Becsült USD |
|---|---:|---:|---:|
| Teljes, első kérés | 30 276 / 0 | 224 | 0,077938 |
| Teljes, következő kérés | 0 / 30 276 | 202 | 0,0080832 |
| Tömör, első kérés | 17 311 / 0 | 198 | 0,0452655 |
| Tömör, következő kérés | 0 / 17 311 | 212 | 0,0055902 |

A tömör újrafelhasznált kérés itt 87,7%-kal olcsóbb az első tömör kérésnél. Ez azonos prefix, TTL-en belüli mérés; új élet/változó canon és későbbi visszatérés nem biztosít találatot. Az első cache-írás drágább a normál inputnál. Cache nem életmemória. Csak visszatérő, biztonságosan azonos prefixet érdemes jelölni; jelen teszt a teljes szintetikus auditbemenetet jelölte. A Claude input három külön mező összege; a cache-t nem számoljuk kétszer. [Cache-mechanika és usage](https://platform.claude.com/docs/en/build-with-claude/prompt-caching).

### Effort és kimeneti plafon

Sonnet low/medium ugyanazon HU tiszta és hibás bemeneten ugyanazt a kánonverdiktet adta. Medium a két kérésre 0,080062 USD, low 1500-as outputplafonnal 0,078462 USD; a kis különbség és egy ismétlés nem általános minőségi/költségígéret. 1500-as plafonnal mindkét válasz teljes lett (214/688 outputtoken), nem csonkult. Rutin auditor következő jelöltje low +1500, nehéz esetnél külön foglalással nagyobb plafon/effort.

A `max_tokens` a gondolkodással együtt korlátozza a kimenetet, és plafon, nem előre számlázott tokenszám. Csökkentése főként a foglalást és a túl hosszú válasz kockázatát mérsékli. A tényleges output díját és az esetleges javítást továbbra mérni kell. Az Opus javításellenőrzésénél 145 gondolkodási token jelent meg az összes 581 outputon belül; nem adtuk hozzá újra. Hiányzó részletes thinking-usage nem jelent bizonyított nulla fogyasztást. [Thinking és költség](https://platform.claude.com/docs/en/build-with-claude/thinking-steering-and-cost).

Batch offline értékeléshez 50% kedvezményt kínál; ezt csak dokumentált lehetőségként rögzítjük, a mostani próbában nem használtuk. [Batch](https://platform.claude.com/docs/en/build-with-claude/batch-processing).

## Szerepenként ténylegesen mért költség

| Feladat / modell | Kérés | Ismert tokenköltség USD | Technikai eredmény |
|---|---:|---:|---|
| Esemény / Haiku | 2 | 0,046273 | 0/2: érvénytelen UUID-k |
| Esemény / Sonnet | 2 | 0,083604 | 2/2 séma és domain siker, átlag 0,041802 |
| Narrátor / Haiku | 2 | 0,016791 | Helyi hossz/hivatkozás siker, de HU nyelvi és EN/HU kánonhibák |
| Narrátor / Sonnet, első próba | 2 | 0,047470 | HU elfogadható, EN kisebb rögzítetlen órabeosztás |
| Sonnet EN célzott narratívajavítás | 1 | 0,023736 | Canon megmaradt, Opus kánonellenőrzése sikeres |
| Sonnet ismert hibakontroll | 2 | 0,076220 | 2/2 használható hibajelzés |
| Opus ismert hibakontroll | 2 | 0,154980 | 2/2 használható hibajelzés |
| Fable két fő minta | 2 | 0,348290 | Kánonhűnek találta mindkettőt, új lényegi hiba nélkül |

Sonnet két végleges narratívájának generálása a javítással együtt 0,071206 USD; első auditok és Opus javításellenőrzés együtt további 0,059000 USD. Összesen 0,130206, átlag 0,065103 USD/technikai narratívakaput teljesítő fejezet. Eseménygenerálás nincs ebben az összegben. Emberi elfogadás nincs; az Opus a javított angolban helyi realizmust érintő stiláris részletet is jelzett, külön ellenőrzendő. A legolcsóbb nyers fejezet önmagában nem a legolcsóbb használható eredmény.

## Külön Claude-keret

| Mutató | USD / darab |
|---|---:|
| Felhasználó által adott Claude összkeret | 5,00 USD |
| HTTP-generálási kísérlet | 48 |
| Ismert tokenfogyasztású kísérlet | 46 |
| Ismert tokenek becsült költsége | 1,7316409 USD |
| Konzervatívan elszámolt teljes összeg | 2,292215 USD |
| Guard szerint megmaradt keret | 2,707785 USD |

Két kezdeti Haiku HTTP 400 kérés usage nélkül maradt (`inference_geo` inkompatibilitás); összes 0,14173875 USD plafonfoglalásuk megmaradt. A guard ezen felül minden ismert inputot a cache-írási plafonnal számol, a cache-olvasás kedvezményét nem költi el újra. Ismert usage melletti schema-/domain-/audit-elutasítás is fizetett kísérlet. Ez tokenalapú becslés, nem szolgáltatói egyenleg vagy számla. A korábbi OpenAI 5 USD ettől külön marad; ebben a sorozatban nem volt új OpenAI-hívás.

## Kód, titokkezelés és reprodukció

`packages/ai/src/claude.ts`: szerveroldali REST, Structured Outputs, ingyenes counter, lokális Zod és idézet/verdikt-validálás, minden fizetett transport előzetes foglalása; nincs automatikus provider retry/fallback. Kimeneti csonkulás és hibás válasz előtt is elszámolja az ismert usage-et; ismeretlennél a foglalás megmarad. Eredeti Zod-bounds helyben kötelezők akkor is, ha Claude grammar nem támogatja őket. [Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs).

`scripts/evaluate-claude.ts`: a verziózott `tests/fixtures/claude-v2` szintetikus fixture-öket olvassa, nem Supabase-profilt/exportot. Egyedi esetfájl és input/prompt/séma/effort/outputlimit fingerprint; változott esetet nem ír felül. A korábbi eredményt új fizetés nélkül visszaadja. `.local/claude-audit/usage.json` és saját `paid-run.lock`; összesített limit legfeljebb 5 USD, egyszerre egy Claude paid folyamat. A naplót vagy hibás esetet törölni új keretért tilos.

A kulcs a Gitből kizárt, védett gyökér `.env` `ANTHROPIC_API_KEY` mezőjében van; az eredeti fájl a védett `%LOCALAPPDATA%\FutureFlow\secrets\Claude_API_KEY.txt` helyre került. `env/`, `.env`, `.local/` kizárt. Kulcs/header/raw provider-hiba nem kerül riportba; HTTP-diagnosztika csak engedélyezett hibatípus és ismert mezőnevek listája.

```powershell
pnpm build:packages
pnpm evaluate:claude count      # ingyenes modellenkénti számlálás
pnpm evaluate:claude audit      # kezdeti auditprotokoll, összehasonlításra
pnpm evaluate:claude calibrate  # pontosított időzítés és hibajelzés
pnpm evaluate:claude controls
pnpm evaluate:claude roles
pnpm evaluate:claude cache
pnpm evaluate:claude repair
pnpm evaluate:claude reference
pnpm evaluate:claude effort
pnpm evaluate:claude limits
```

Új paid eset ténylegesen költ; a fenti parancsok nem egyetlen automatikusan futtatandó telepítési lépés. `repair` a `roles` mentett eredményét igényli. A helyi napló megőrzendő; új checkout nem nullázza az engedélyezett összeget. Az értékelő transport/budget/validátor automatizált tesztjei fizetett hívás nélkül futnak. Éles Claude-routinghoz külön DB-szolgáltatói számla, hibapolitika, többprofilos teljeslánc és emberi minőség szükséges.
