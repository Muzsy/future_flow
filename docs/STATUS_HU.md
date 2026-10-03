# alterward — megvalósítási állapot és kísérleti keret

2026-10-03 · [Megvalósítási riport](V2_IMPLEMENTATION_REPORT_HU.md) · [Sorrend](NEXT_STEPS.md) · [Lokalizáció](LOCALIZATION_HU.md).

## Ténylegesen elkészült

| Terület | Bizonyíték és határ |
|---|---|
| V1 kompatibilitás | Tízéves AI-generálás/archívum és gyermekág megmarad, 001/002 változatlan |
| V2 privát élet | 12 lépéses EN/HU onboarding, immutable saját/alternatív bemenet, revisionös draft |
| Hat hónapos AI | 2–5 validált canon-esemény, egy 250–600 szavas fejezet, nyitott döntés a végén |
| Választás/folytatás | Egyszeri atomikus choice, ugyanazon ág következő időszaka, külön saját történeti fork |
| Tartós működés | Job/checkpoint/lease/heartbeat, revision/hash/idempotencia, egy ág egy aktív job |
| Memória/javítás | Aktuális állapot +közeli canon/választások, egy célzott automatikus javítás, bounded manuális retry |
| Költségőr | Tranzakciós projekt/user foglalás, ismert/ismeretlen elszámolás, v1/v2 közös limitek; helyben közös 5 USD fileguard |
| Supabase | 001–006 alkalmazva, ellenőrzött TLS, minden aw_ tábla RLS, anon/authenticated közvetlen hozzáférés tiltva |
| Export/törlés | Teljes privát v1/v2 gráf, worker-stop, durable Auth/DB recovery; valódi adminpróba még nyitott |
| Mérési alap | Minimális interakciók és külön click/success; continuationClickRate/continued_lives technikai proxy; későbbi session-mérés nyitott |

## Bizonyíték és hiányzó kapuk

147 automatizált teszt sikeres: 20 determinisztikus teszteset ×3 időszak és állapot/jogosultság/lease/retry/költség/export/törlés. Négy valódi AI-lánc ×3 időszak (EN/HU, Sol/Luna eseménymodell), schema/domain/fidelity sikerrel. [Modellmérés](AI_V2_ROUTING_REPORT_HU.md) és [angol](examples/AI_V2_ENGLISH_STORY.md)/[magyar](examples/AI_V2_HUNGARIAN_STORY.md) minták. Ez négy generatív eset, nem húsz; emberi minőség/retenció nincs bizonyítva.

Böngészős főoldal/login/nyelv/metadata és keskeny nézet ellenőrzött. Valódi Supabase-fiók és szerveroldali admin kulcs hiányában a teljes hitelesített böngészős onboarding/folytatás/export/Auth-törlés még nem futott. Backup/restore nincs igazolva. P06–P08 emberi/üzemeltetési kapu, P09–P13 nyilvános réteg további munka. A P09 [privát előnézeti alapja](PUBLIC_DRAFT_FOUNDATION_HU.md) kész, 006 migrációval; nincs kész Discovery/publishing/Official seed/public fork. Main commit/CI nem nyilvános deploy.

## Az OpenAI 5 USD fejlesztői keret

| Lezárt sorozat | Kérés | Tokenalapú becsült költség USD |
|---|---:|---:|
| V1 magyar alapok és ágak | 18 | 0,6299505 |
| Korábbi modellvizsgálat | 14 | 0,0542136 |
| V1 angol/magyar nyelvi próbák | 12 | 0,3352520 |
| V2 EN/HU Sol/Luna, három időszak | 38 | 0,577744805 |
| **Összesen** | **82** | **1,597160905 ≈ 1,60** |
| **Konzervatívan elszámolt összeg** | | **1,619913375** |
| **Guard szerint megmaradt keret** | | **3,380086625 ≈ 3,38** |

Ismeretlen fogyasztású kérés nincs. Ezek dátumozott tokenbecslések, nem lekérdezett szolgáltatói kreditegyenleg. A teljes korábbi napló megmarad .local/ai-smoke/usage.json alatt. Smoke és opcionális helyi alkalmazás-worker egy paid-run.lock fájlt használ; kérés előtt bemeneti/maxkimeneti foglalás, ismeretlen fogyasztásnál teljes plafon marad. Az 5 USD összesített, nem futtatásonkénti keret.

Sol az alap minden szerepben. Luna eseménymodell a kis v2 mintában körülbelül 46–63% kisebb teljeslánc-költséget mutatott, egy angol fejezetjavítással; emberi EN/HU minősítés előtt nem állítottuk át az alkalmazást. [Hivatalos árlista](https://developers.openai.com/api/docs/pricing?tab=suite), ellenőrizve 2026-10-03.

50–100 Official Life és 20–30 Scenario az indulás célja, nem automatikus paid megbízás. Előbb kurált kis v2 seed, megfelelő költségkeret és privacy/minőségi kapu kell. Olvasás/újratöltés/nyelvváltás/Save/Share nem indíthat AI-generálást.

## Külön Claude-kutatási keret és auditor

Új felhasználói döntés: további **5 USD kizárólag Claude-mérésekre**, saját .local/claude-audit/usage.json és paid-run.lock naplóval. 48 HTTP-generálási kísérlet, 46 ismert usage; ismert tokenköltség 1,7316409 USD, konzervatív összeg 2,292215 USD, guard szerint maradt **2,707785 USD**. Két kezdeti usage nélküli HTTP 400 teljes foglalása megmaradt. A fenti OpenAI 82 hívás és maradék változatlan; ez nem összevont vagy futtatásonként új 5 USD.

Négy Claude-modell, EN/HU külső audit, ismert hibák, szereppróbák, token/cache/effort/outputlimit mérés. A fő Sol-minták kánonhűnek bizonyultak a Sonnet/Opus/Fable auditban; személyesség/kíváncsiság tovább emberi kapu. Sonnet a rutin auditor jelöltje, Opus vitás mintavételhez; Haiku narrátor/esemény alapnak nem minősített. [Teljes Claude-riport](CLAUDE_MODEL_EVALUATION_HU.md), [történeti észrevételek](examples/CLAUDE_EXTERNAL_AUDIT_HU.md). A worker routingja továbbra Sol; Claude csak külön szerveroldali értékelő. A 147 teszt az eredeti 139 mellé 8 új, fizetés nélküli Claude transport/budget/audit tesztet tartalmaz.
