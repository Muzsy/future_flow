# Egyetlen saját élet teljes törlése

2026-10-07 · P11 részeredmény · English-only · új paid AI 0

P11 külön egész-élet törlés elkészült: saját life + aktuális branch/revision, gépelt DELETE LIFE, friss verified Auth, pontos idempotens retry. Minden saját ág/fejezet/választás/job/preview/review/kiadás/refresh/token/save/external jog cascade; másik élet és account aktív marad. Az adott élet Shared-tagsága leválik; érintett próza rejtett, dátum/eredmény/canon változatlan, unsafe personal/shared input és lease érvénytelen. A törlés nem nulláz napi kvótát: 032 csak kind/admitted_at, legfeljebb 24h + worker 15m; RLS/immutable/minimal export/account-cascade. Teljes check 544/47/build, 135 séma; régi 133/001–031 változatlan. Dev DB 001–032 repeat, 69 aw_/69 RLS. 26 valódi kétfiókos Auth/HTTP/TLS ellenőrzés és actual cleanup, genuine seed/ledgers változatlan, paid AI 0. A 031 pontos c36abdd CI verify/container és hét PG-proof sikeres; az új 032 runtime CI még ellenőrizendő. Következő P12 public fork/scenario personalization; P11 teljes privacy/retention/pozitív UI, P13 és Shared/backup/email/Contabo/Cloudflare/éles allowance megmarad.

## Tulajdonosi életciklus

A saját angol Life oldalon külön Delete this life panel található. A felhasználó látja a teljes ágak számát, a public/unlisted linkek és generálási feladatok megszűnését, a Shared-tagság kezelését, és gépeli a DELETE LIFE szöveget. A fiók és másik élet megmarad. Friss Auth kell, az aktuális megtekintett branch revision eltérése 409 és újratöltést kér. Ez egész élet, nem egy kiválasztott ág részleges törlése.

Auth DELETE /api/v2/lives/:id, life-deletion-1 strict request és receipt, Idempotency-Key. A szerver ellenőrzött Authja után a friss jelszavas/OTP/magiclink/OAuth belépés kora legfeljebb öt perc. Tulajdonosi life/branch egyezés és revízió kötelező. Idegen life 404, anon 401, hibás megerősítés 422; a régi/idegen UUID nem ad jogot. Ugyanaz a key/input ingyenes tartós receipt; más input 409, másik keyvel a már törölt life 404.

User UPDATE az első lock, majd saját life/branch, Shared context UUID-rendben. Privát élet/összes ág/period/choice/history/job és public draft/checkpoint/full bundle/review/curator/Community-Official copy/refresh/token/permission/save pointer cascade. Új public/OG/image/sitemap olvasás megtagadott, saját canon nem írható vissza az elveszett job/lease alapján. Korábban elindított provider-kérés befejeződhet és pénzbe kerülhet; válasz nem állíthat vissza törölt adatot, a budget foglalásokat nem refundoljuk vagy oldjuk fel igazolatlanul.

Saját create/fork replay, amely közvetlenül a törölt life/branchre utal, törlődik az idempotenciatárból. A delete receipt minimális life UUID/ágdarabszám, szöveg nélkül. Korábbi már letöltött külső példányokat nem lehet garantáltan visszahívni.

## Shared privacy és határ

Csak az adott élethez kötött tagságok válnak deleted/Former member rekordokká, user/life/branch/profile referencia nélkül. Az érintett pending közös döntés cancelled eredménnyel lezárul. Pending impact leválik, az adott tagság által indított invite visszavonódik. A maradó létszám szerint context paused/ended vagy tovább aktív; owner handover meglévő szabálya érvényes.

Érintett shared input/checkpoint törlődik és aktív lease megszűnik; kapcsolódó unsafe personal input is scrub/cancel, új safe explicit retry szükséges. A már ellenőrzött shared dátum/eredmény/immutable canon megmarad. A tag hiánya aktiválja a korábbi privacy projekciót: affected common prose nem látható. A másik felhasználó fiókját és privát életét nem töröljük. Régi, másik személyes fejezetbe már beírt próza és nyers/backup-retention továbbra S3/P11 kiadási kapu. Shared-eredetű public copy továbbra fail-closed, nem kerüli meg a teljes privacy review-t.

## Kvóta és minimális retention

032 aw_deleted_life_admissions csak user FK, kind és admitted_at; nincs törölt life/branch/story/prompt/IP vagy provider token. Az utolsó 24 órás saját generation/public-review indítások időpontja törléskor másolódik, ezért content-delete nem csökkenti a jelenlegi UTC-napi generation vagy gördülő 24 órás review countot. Párhuzamos exact delete egyszer másol. A pending/concurrent kvótát a megszűnt job nem foglalja tovább. Globális/user pénzügyi költségőr függetlenül megmarad.

Feature-flag független worker cleanup legfeljebb 10 000-es indexed SKIP LOCKED batchben töröl admitted_at >24h korú rekordot; normál futás 15 perc, telített batch 2 másodperc, hibánál 1 perc retry. Ez működő worker mellett legfeljebb 24h +15m retention, outage esetén első sikeres cleanup; nem általános backup-törlési garancia. Own exportban kizárólag kind/admitted_at, account-delete cascade. RLS/anon-authenticated REVOKE/immutable UPDATE. Korábbi 001–031 és 133 séma változatlan.

## Bizonyíték

Teljes check sikeres: 544 teszt/47 fájl, format/types/scripts-types/API-worker-Next production build; 135 generált séma. Kilenc új regresszió: explicit own/revision; minden ág és refreshed copies/token/bookmark/OG source cascade; replay; valódi claimed job checkpoint tiltás; generation/review kvóta megőrzés; TTL/RLS/immutable/export/account-delete; Shared pending decision/date/canon/prose; in-flight shared input scrub; fresh Auth HTTP. Dev 001–032 apply/repeat, 69 aw_/69 RLS, tényleges TLS CA.

Valódi két disposable Supabase Auth-account és HTTP: 26 sikeres ellenőrzés. Kétágú élet és két reviewzott snapshot/refresh, live external grant + másik reader Save; három párhuzamos fresh DELETE egy receipt. Foreign/anon/typed/stale, minden source/public graph eltűnik, old job lease nem ment, másik saját élet byte-egyező és account aktív. Minimális négy admission timestamp saját exportban, valódi végső Auth HTTP account-delete és DB cascade, genuine seed teljes export és mindkét ledger változatlan, új paid AI 0. Technikai fixture nem genuine seed.

Az új izolált PostgreSQL CI hét proofot ellenőriz: concurrent exact delete; refresh és delete verseny/no resurrection; public/external/source cascade; in-flight Shared scrub és maradó élet; delete nem resetel kvótát; minimal export/TTL/immutable/RLS; account admission cascade. A pontos új 032 main CI még ellenőrizendő. Minden korábbi Shared/P09/P10/P11 proof, HTTPS/TLS/migráció-repeat/worker ellenőrzés megmarad.

A 031 runtime c36abdd92c0fd9d1ad39bec673b41a46c1d488c3 [CI](https://github.com/Muzsy/future_flow/actions/runs/37571756710) verify/container sikeres, hét refresh proof, 535/46/133. Pozitív interaktív új delete/refresh UI-járat még nem igazolt. Éles Contabo-deploy nem történt.

## Következő kapuk

P12 külön tulajdonosi public fork consent/cross-owner private start/choice egyszer/scenario personalization/attribution; P13 usage/referral/cohort/genuine kínálat/minőség/launch. P11 privacy/retention/pozitív UI, S3 régi personal prose/raw backup/billing/grace/deadline, S4–S7 és P06 backup/restore/email/outage/Contabo/Cloudflare teljes scope megmarad. Üzemeltetői név/nyilvános kontakt és induló kínálat/engedélyezett éles keret tisztázása folyamatban; addig önálló technikai haladás. [Végrehajtási terv](NEXT_STEPS.md).
