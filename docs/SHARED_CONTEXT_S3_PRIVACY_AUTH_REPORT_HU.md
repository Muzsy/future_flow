# alterward — S3 adatvédelmi megjelenítés és valódi fiókos AI-próba

2026-10-05 · [Aktuális terv](NEXT_STEPS.md) · [Shared integráció](SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md) · [Összesített keret](STATUS_HU.md). A P01–P13 és S0–S7 terv együtt marad érvényes. A friend kiadás még nincs bekapcsolva.

## Elfogadott megjelenítés és megvalósítás

A felhasználó a törölt tagokat érintő közös történeteknél **az érintett szövegek elrejtését, az ellenőrzött dátum és közös eredmény megtartását** választotta. Már a `deleting` marker elrejti a közös esemény címét, leírását, döntési kérdését és opciószövegeit. A csoport címe és szabad szöveges állapota semleges projekciót kap. A korábbi tag minimális megjelenítése „Former member”. A saját válasz, eredeti dátum, lezárási státusz és eredeti opt-in létszám megmarad; az érdeklődés továbbra nem részvételi tény.

A szerver olvasási projekciót készít: a mentett közös canon, resolution, impact payload és azok eredeti hash-e változatlan. A módosított export-impact külön projectionHash mezőt kap; a source payload_hash továbbra az eredeti forrást azonosítja. `privacyRedacted` jelzi az esemény/context/impact vetületét, a strict személyes memóriaszerződésbe nem kerül új mező. A 42 exportált JSON-séma és a Life 2.0.0 / Shared 1.0.0 verzió megmarad.

Saját pending impact, már megismert emlék, export és történeti fork emléke ugyanazt a megtisztított közös szöveget kapja. A későbbi személyes AI-bemenet az érintett közös emlék mellett a közeli személyes narratív előzményeket is semlegesíti, és kihagyja a választások szabad szöveges másolatait. Az aktuális személyes állapot, célok és elfogadott döntésazonosítók megmaradnak. A korábban elkészült személyes fejezeteket ez a szelet nem írja át.

## Generálás és additív tárolás

`013_shared_privacy_projection_invalidation.sql` két belső job-metaadatot és a deleting/physical-delete triggert adja hozzá. A trigger leállítja és megtisztítja az érintett régi Shared/személyes bemeneteket és checkpointokat. A worker a személyes fizetett lépések előtt és a commitnál is újraellenőrzi a jogosultságot és a privacy-forrásokat. Régi lease nem küldhet új AI-kérést és nem commitolhat.

Privacy okból megszakított személyes generálás **explicit újrapróbálása új jobot és friss bemenetet** hoz létre. Azonos idempotenciakulcs ugyanazt az új jobot adja; általános retry továbbra a korábbi mentett bemenetét használja. Nincs automatikus fizetett újraindítás. A deleting marker után létrehozott, már megtisztított maradó-tag jobot a későbbi fizikai törlés nem állítja le. A canonban nem érintett, korábban kilépett tag törlése a 011 szerinti újabb, független generálást is megőrzi.

001–013 alkalmazva és checksumos ismétléssel ellenőrizve a fejlesztői Supabase-on; 001–012 változatlan. Továbbra 19 ff_ és 33 aw_ tábla, mind a 33 aw_ táblán RLS; 16 Shared RLS-tábla. A kapcsolat saját CA-val ellenőrzött TLS-t használ. Ez helyi/fejlesztői adatbázis, nem Contabo-élesítés.

## Valódi Auth → Shared AI → saját AI

Két valódi, megerősített szintetikus Supabase Auth-fiókkal, hosted PostgreSQL és izolált HTTP API mellett végigfutott a teljes lánc: kezdeti saját AI-időszakok, célzott meghívás/preview/consent/accept, egyszeri közös AI-esemény, privát saját válaszok, személyes folytatás közös várakozás közben, később lezárt közös emlék, következő saját AI-fejezet, újraindítás, tagság nélküli saját fork, friss-auth export és tényleges Auth/DB-törlés.

Az eredeti közös effectiveAt és későbbi saját knownAt külön maradt; az emlék egyszer materializálódott. Korábbi saját fejezet és másik tag privát ága nem változott. Kontrollált megszakítás történt a valódi Auth-törlés után, még a DB-megerősítés előtt; a tényleges recovery CLI befejezte a takarítást. Ez nem valós adatbázis-kiesés vagy backup-visszaállítás.

A sikeres fizetett próba a privacy-migráció előtt, a 001–012 runtime-on futott; az új megjelenítést utána **külön nulla fizetett hívásos, valódi Auth/PostgreSQL HTTP-preflight** ellenőrizte. Ezek külön bizonyítékok. Mindkét próba két tesztfiókjának és kizárólag saját szintetikus contextének takarítása sikeres; tesztjelszó/token nem kerül Gitbe vagy dokumentációba.

[Az új angol AI-minta](examples/AI_SHARED_AUTHENTICATED_ENGLISH_SAMPLE.md) változatlan Sol-kimenet: egy közös lehetőség és három saját fejezet. Nem Official seed és nem használói minőség- vagy megtartási mérés. A korábbi [Sonnet-audittal ellenőrzött Shared→saját minta](examples/AI_SHARED_PERSONAL_CLAUDE_AUDIT_HU.md) megmarad; az új mintára külön Claude-audit ebben a szeletben nem futott.

## Költség és újrafuttatási korlát

| Új sorozat | Valódi hívás | Tokenbecslés USD | Guard USD |
|---|---:|---:|---:|
| Első megszakadt Auth-előkészítés | 6 | 0.0824209 | 0.0884275 |
| Sikeres teljes Auth/Shared/saját lánc | 13 | 0.1698351 | 0.1938450 |
| Migráció utáni technikai preflight | 0 | 0 | 0 |

Az első próba saját teszteszközünk rossz formátumú ephemeral invite-secretje miatt állt meg; javítását teljes nulla fizetett hívásos preflight előzte meg. A hat már elküldött AI-hívás költsége és a sikertelen attempt is megmaradt a naplóban. A sikeres 13 hívás 40 178 bemeneti és 9 340 kimeneti tokent használt. A teljes OpenAI napló **126 hívás, 2.270747105 USD tokenbecslés, 2.356438375 USD guard; 2.643561625 USD maradt** az eredeti 5 USD-ból, ismeretlen usage nélkül. Ez nem lekérdezett szolgáltatói kreditegyenleg. Claude változatlan: 2.338015 USD guard, 2.661985 USD maradt; két történeti ismeretlen usage teljes foglalása megmarad.

`pnpm smoke:shared:auth --preflight` valódi saját szintetikus Auth/DB mellett explicit tesztfixture-outputot használ, **nulla provider-hívással**. Nem termékmód és nem fallback. `--run` / `--refined` külön egyszeri fizetett eset, 0.75 USD sorozatplafonnal és a megmaradt közös 5 USD guarddal; a meglévő attempt/minta blokkolja az ismétlést. `--cleanup`, `--cleanup-refined`, `--cleanup-preflight` kizárólag saját, provenance-ellenőrzött manifest alapján takarít. Napló/attempt törlésével nem szabad új hívást indítani. Beállításhoz új fizetett próba nem szükséges.

## P09 következő adatvédelmi szelet

A nyilvános előnézeti alap most külön ellenőrzést kér minden olyan saját ágnál, amely már Shared-emléket tanult — a tagság nélküli történeti forkot is beleértve. Új előnézet és korábbi előnézet visszaolvasása is fail-closed, amíg a P09/P11 külön más-tag általánosítása/PII/consent felülvizsgálata el nem készül. A privát személyes folytatás ettől elérhető marad. Ez előnézeti adatvédelmi kapu; Publication/Confirm/Discovery/public fork még nincs implementálva.

## Ellenőrzés és nyitott határ

303 teszt/27 fájl és teljes check/build sikeres a privacy-szeletnél. A következő P09-kapu további regressziója és a meglévő public-draft tesztek együtt 14/14 sikeresek; az összesített készlet így 304. A schema-export nem módosította a 42 sémát. A végső runtime CI bizonyíték külön kiegészítésben szerepel a publikálás után.

Nyitott: nyers retained canon és backup-megőrzési/törlési szabály; az esetleg korábbi személyes prózába vagy tényállapotba átkerült más-tag adat kezelése; restore utáni törlésvédelem; email-kézbesítés; éles entitlement/billing/grace és deadline; P09–P13 public MVP, majd S4–S7. A projekció nem fizikai prózatörlés, és nem bizonyít teljes PII-mentességet minden személyes állapotban vagy szolgáltatói másolatban. Négy normál Shared flag false, éles AI-allowance nulla, Contabo-deploy nincs.
