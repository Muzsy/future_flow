---
status: canonical
owner: shared
last_reviewed: 2026-10-12
supersedes:
  - ../../SHARED_CONTEXT_IMPLEMENTATION_PLAN_HU.md
  - ../../SHARED_SPONSORED_GUEST_PAYMENT_MODEL_HU.md
related:
  - ../../product/MONETIZATION_HU.md
  - ../../STATUS_HU.md
  - ../../../packages/core/src/shared-context.ts
---

# Shared Context — kanonikus specifikáció

## 1. Cél

A Shared Context több valós Alterward-felhasználó korlátozott közös szimulációs tere. Nem chat és nem a személyes életállapotok teljes összeolvasztása.

A cél egyetlen közös esemény/canon létrehozása úgy, hogy minden résztvevő személyes életének privacy-határa megmaradjon.

## 2. Fő invariánsok

- a personal branch továbbra is a felhasználó saját authoritative életállapota;
- a Shared Context saját common canonnal és state-tel rendelkezik;
- csak explicit, minimalizált interaction profile kerül közös használatba;
- a személyes hatás külön projection/impact útvonalon kerülhet vissza a personal life-ba;
- minden mutation revision/idempotency és entitlement/privacy ellenőrzés alatt áll;
- AI output nem kerülhet validation nélkül authoritative state-be;
- Shared release flag/gate külön kezelendő a personal terméktől.

## 3. Domain típusok és abszolút taglimit

| Típus | Taglimit | Jelenlegi product-create státusz |
|---|---:|---|
| `friend_group` | 10 | implementált létrehozási út |
| `romantic_relationship` | 2 | domainben modellezett, product-create jelenleg zárt |
| `work_project` | 10 | domainben modellezett, product-create jelenleg zárt |
| `hobby_group` | 10 | domainben modellezett, product-create jelenleg zárt |
| `sports_team` | 20 | domainben modellezett, product-create jelenleg zárt |

A típus létezése contractban/sémában nem jelent automatikus release-t.

## 4. Subscription entitlement

| Tier | Subscriber context slot | Típusok |
|---|---:|---|
| Free | 0 | nincs saját Shared típus |
| Explorer | 1 | friend_group |
| Connected | 3 | friend, romantic, work, hobby |
| World | 5 | mind az öt |

A subscriber slotok és a sponsored Guest seat külön számlálódnak.

## 5. Sponsored Guest

A first-release sponsored modell kizárólag `friend_group` típusra érvényes.

Free user:

- egyszerre legfeljebb 1 live sponsored Guest membership;
- csak konkrét `target_user_id`-ra címzett meghívásból kaphat ingyenes Guest seatet;
- generic/bearer invite nem ad sponsored entitlementet;
- membership `entitlement_mode='sponsored_guest'` móddal tárolódik;
- részt vehet engedélyezett közös döntésekben és olvashatja a jogosult common canont;
- kaphat saját, engedélyezett personal impactot;
- nem hozhat létre Shared Contextet;
- nem hívhat meg új résztvevőt;
- nem indíthat fizetett Shared AI-generálást.

A DB is kikényszeríti, hogy sponsored Guest csak friend contextben legyen, és userenként legfeljebb egy live sponsored membership létezzen.

## 6. Subscriber és Guest állapot

A membership entitlement mód tartós:

- `subscriber`
- `sponsored_guest`

Egy subscriber downgrade nem konvertálódik automatikusan Guestté. Egy sponsored Guest később előfizethet, de a meglévő sponsored membership és az új subscriber slotkeret külön marad.

## 7. Context létrehozás

Jelenlegi product-create út:

- csak `friend_group`;
- creator aktív és megfelelő consent/privacy állapotú;
- creator subscriber entitlementtel rendelkezik;
- owner membership `subscriber` módban jön létre;
- context revisionált és lifecycle state-et kap.

Más típusok release-e külön termék/security döntés.

## 8. Invite lifecycle

Invite:

- csak jogosult owner/host indíthatja;
- expiration és egyszer használható állapot tartozik hozzá;
- bearer tokenből csak hash kerül tartós tárolásra;
- targeted invite userhez kötött;
- accept előtt újraellenőrzendő a context, inviter, participant, entitlement, block és capacity;
- generic invite Free usernek nem nyit sponsored seattet;
- targeted friend invite Free usernél nyithat sponsored seattet, ha a limit szabad.

## 9. Privacy és social profile

Shared nem olvassa be automatikusan a teljes personal profilt.

A közös interaction profile minimalizált mezőket használ. A privacy/consent, account státusz és user block ellenőrzések fail-closed módon futnak.

Másik tag privát life state-je nem válik implicit módon hozzáférhetővé.

## 10. Shared time

A friend adapter a résztvevők szimulációs idejét kompatibilitási szabállyal köti össze.

- érvényes ISO dátum szükséges;
- common anchor nem mehet vissza időben;
- a résztvevőknek ugyanazon naptári hónapban kell maradniuk a jelenlegi adapterben;
- eltérés `SHARED_TIME_MISMATCH` hibával fail-closed.

## 11. Shared AI

A közös AI-futás egyetlen common event/canon pipeline-t hoz létre.

Költség és jogosultság:

- csak subscriber-entitled initiator indíthatja;
- a job `requested_by_user_id` kezdeményezőhöz kötött;
- project/user budget és rate-limit alkalmazandó;
- sponsored Guest jelenléte nem terheli automatikusan külön AI-generálással a rendszert;
- személyes próza/hatás később, saját life pipeline-ban materializálódhat.

A korábbi S2 valós minta költségadat, nem garantált egységár.

## 12. Decision és canon

A közös esemény:

- strukturált state-et és döntési állapotot használ;
- pending decision alatt új inkompatibilis mutation/generálás blokkolható;
- context revision védi a stale kliensműveleteket;
- cancel/end/participant-unavailable helyzetek kezelik a függő decisiont.

A common canon nem írhatja felül közvetlenül egy user teljes personal WorldState-jét.

## 13. Personal impact

A Shared következmény personal oldala külön tárolási/projection réteg.

Követelmény:

- csak az érintett user számára engedélyezett impact;
- branch target explicit;
- detached/left lifecycle kezelhető;
- nyers közös/private prose retention és materializálás release előtt privacy review tárgya.

## 14. Lifecycle

Fő context állapotok az implementációban: inviting, active, paused, ended, archived; member oldalon active/paused-entitlement/left jellegű állapotok.

- member elhagyhat contextet;
- owner lezárhatja vagy archiválhatja a megfelelő lifecycle ponton;
- pending invite-ok és jobok lezáráskor visszavonás/cancel állapotba kerülnek;
- context/member változás revisiont emel.

### Nyitott downgrade döntés

A jelenlegi implementáció owner `end`, `archive` és invite `revoke` művelethez is újra megköveteli a host subscription entitlementet. Emiatt egy Free-re downgrade-elt korábbi owner elveszítheti ezeket a kontrollműveleteket.

Shared release előtt ezt explicit rendezni kell. Ajánlott irány: create/invite/generate maradjon paywalled, de end/archive/revoke mint biztonsági/adatkontroll művelet downgrade után is legyen elérhető az ownernek.

## 15. Release scope

Első personal beta: Shared **OFF**.

Első Shared beta cél:

- öt baráti pár;
- legfeljebb 10 személy;
- `friend_group`;
- entitled host + targeted Free sponsored Guest modell mérhető;
- privacy, cost és invite funnel monitorozva.

Romantic/work/hobby/sports release csak későbbi külön döntés.

## 16. Nem része a jelenlegi Shared terméknek

- realtime DM/chat;
- nyílt csoportkereső/marketplace;
- korlátlan sponsored seats;
- minden relationship type ingyenes Guest modellje;
- kész payment provider/billing;
- automatikus personal state összefésülés;
- privacy consent nélküli cross-user AI input.

## 17. Elsődleges kódforrások

- `packages/core/src/shared-context.ts`
- `packages/database/src/shared-contexts.ts`
- `packages/database/src/shared-events.ts`
- `packages/database/src/shared-jobs.ts`
- `database/migrations/037_shared_sponsored_guest_seats.sql`
- Shared contractok `packages/contracts` alatt

Ha ez a specifikáció és a tényleges kód eltér, az `AGENTS.md` konfliktusszabálya alkalmazandó.
