# Snapshotfrissítés és a korábbi kiadás visszavonása

2026-10-07 · P11 részeredmény · English-only · új AI-költség 0

P11 explicit snapshot refresh elkészült: új teljes AI/curator által ellenőrzött copy + régi aktív példány withdraw egy tranzakcióban, eltérő új slug/token; nincs snapshot-átírás, redirect vagy külső grant-öröklés. Same-owner/same-private-branch és exact old revision/hash/new preview binding, consent, default PUBLICATION_REFRESH_ENABLED=false. Official új exact origin grantet kér. Immutable 031/RLS/own export/cascade, angol külön replacement választás és Confirm. Teljes check 535/46/build, 133 séma, régi 130/001–030 változatlan; dev DB 001–031 repeat, 68 aw_/68 RLS. 25 sikeres valódi kétfiókos Supabase Auth/HTTP/TLS ellenőrzés és actual cleanup, seed export/ledgers változatlan, új paid AI 0. A 030 pontos 63d49f4 CI verify/container sikeres; az új 031 runtime CI még ellenőrizendő. Következő P11 egyetlen élet törlése/owner privacy, P12 public fork/scenario personalization, P13 release; pozitív interaktív UI és retention/backup/email/Contabo/Cloudflare/éles allowance teljes scope megmarad.

## Tulajdonosi művelet

A frissítés külön, explicit választás a kiadási előnézetben. Az új csomag teljes review/curator kapuján végig kell menni; az előző csomag jóváhagyása nem öröklődik. A választható régi példány saját, ugyanabból a privát ágból származó, aktív és más csomaghoz kötött copy. Maximum 24 aktuális cél jelenik meg. A külön angol checkbox megnevezi a régi példány visszavonását. A sima önálló új publikálás továbbra használható.

Az új copy és régi withdraw egy adatbázis-tranzakció. Ha az új preview/source/curator/grant, a régi revision/hash vagy a jogosultság hibás, a régi kiadás elérhető marad és az új publikáció nem keletkezik. Régi public URL és unlisted token az új copy sikeres létrejöttekor megszűnik. Új slug/token, külön indexelés/OG-consent és külön kurált pointer kell; nincs automatikus átirányítás. Már letöltött külső példányokat nem lehet garantáltan visszahívni. A privát élet/canon/ág nem változik.

Official külön eredetengedélyt kér a teljes új csomagra. Visszavont új grant frissítés előtt rollbacket okoz; későbbi revoke az új példányt elrejti. Technikai receipts kizárólag izolált regressziós/CI bizonyítékok, nem valódi Official seed.

## Szerződés és tárolás

Új publication-refresh-1, három generált JSON-séma: request, targets, receipt. Auth GET /api/v2/publication-refresh/:origin/bundles/:bundleId/targets, strict no-query; Auth POST /api/v2/publication-refresh/:origin, Idempotency-Key és acknowledged=true. Origin community/official. Anon vagy idegen fiók nem listázhat/frissíthet; nincs public vagy curator refresh API.

031 aw_publication_refreshes immutable UPDATE-triggerrel, RLS és anon/authenticated REVOKE. Összetett owner FK-k a két megfelelő old/new publikációra; kétféle eredet kizárja egymást. Saját exportban minimális saját binding/történet, másik account adata nélkül. Fiók/forrás törlése a historyt cascade törli. User UPDATE az első lock, ezért a confirm/withdraw/deletion azonos owner-lock-sorrendben fut.

Same input/key és másik key exact replay ugyanazt a példányt adja vissza. Más previewt ugyanarra a korábbi példányra vagy új inputot a régi keyre 409 tilt. Visszavont új kiadást a retry nem aktiválja újra. Flag-off mellett új refresh nincs; tartós exact replay elérhető, új kiadás nélkül.

## Ellenőrzés

535 teszt/46 fájl, format/types/scripts-types és API/worker/Next production build sikeres. Tíz regresszió own/default-off/strict; exact Community/Official source; new-copy/old-withdraw/private-canon/external; replay és inactive retry; stale/foreign/expired source/review rollback; unlisted token; restriction; export/RLS/immutable/cascade/Auth. 133 séma; korábbi 130 és 001–030 byte-egyező. Fejlesztői 031 alkalmazva/ismételve, 68 RLS-tábla.

Valódi Supabase Auth/HTTP/TLS: 25 ellenőrzés, két disposable account, Community technikai fixture. Három párhuzamos HTTP-request egy history és egy new-copy; own/foreign/anon/strict, old public/unlisted/external stop, new external default-none, teljes private branch byte-egyező; inactive replay/stale rollback/minimal export/actual Auth DELETE és DB cascade. Teljes genuine seed export és mindkét provider ledger változatlan. Új paid AI 0.

Az izolált valódi PostgreSQL konténerpróba hét új proofot ellenőriz: három exact párhuzamos refresh, versengő új változat egy nyertes; canon/history immutable; régi public/unlisted/external jog megszűnése; Official full grant és rollback; inactive replay/export; fizikai account-delete verseny/cascade. CI 031 proof csak sikeres pontos main futás után tekinthető lezártnak. HTTPS/migrations-repeat/worker/DB TLS és minden korábbi Shared/P09/P10 bizonyíték megmarad.

A 030 pontos runtime 63d49f4 [main CI](https://github.com/Muzsy/future_flow/actions/runs/37570248739) verify/container sikeres; a korábbi hibás tesztsorrend javítva. Az új 031 main CI még ellenőrizendő. Pozitív interaktív UI nem igazolt; a korábbi browser-eszközkorlátot nem kerülte meg a HTTP-próba.

## Következő kapuk

P11 külön élet törlése és teljes owner privacy workflow, retention/régi személyes Shared próza; P12 cross-owner public fork/scenario personalization és attribution; P13 genuine kínálat/minőség/usage/referral/cohort/release. A teljes P01–P13/S0–S7 és P06 backup/restore/email/outage, Contabo/Cloudflare cache/TLS, éles AI allowance megmarad. Éles alterward még nincs telepítve. [Végrehajtási terv](NEXT_STEPS.md).
