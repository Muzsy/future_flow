---
status: canonical
owner: product
last_reviewed: 2026-10-15
supersedes:
  - ../SHARED_SPONSORED_GUEST_PAYMENT_MODEL_HU.md
related:
  - PRODUCT_HU.md
  - ../features/shared/SHARED_CONTEXT_HU.md
---

# Alterward — monetizációs és entitlement modell

## 1. Hatókör

Ez a dokumentum a termékcsomagok logikai entitlement modelljét rögzíti. A végleges árak, payment provider, checkout, webhook és számlázási megvalósítás még nincs lezárva.

**Entitlement modell ≠ kész billing rendszer.**

**Személyes előfizetés (B01, 2026-10-30, [ADR-010](../decisions/ADR-010-payment-data-and-responsibility-boundaries.md), javasolt):** a tulajdonos döntése a Stripe Managed Payments (a Stripe a merchant of record) és egy induló csomag: 14,99 USD/hó, ciklusonként 8 fejezet; a kijelölt tesztelői fiókokra az első 3 ciklusban 9,99 USD és 5 fejezet; 1 külön ingyenes ízelítő fejezet. Az alapító kedvezmény mértéke nyitott. A számok konfiguráció (`launch_v1`, `standard_v1`), mérések után finomíthatók. Az 5→8 átállást a saját, fiókonkénti fizetettszámla-számláló adja, nem a szolgáltatói kupon. Csak új, tartósan mentett fejezet fogyaszt keretet; a keret nem görgetődik át; a vita és az aktuális ciklus teljes visszatérítése azonnal visszavonja a jogosultságot (nullázza a fel nem használt keretet, lemondja az előfizetést); régebbi ciklus teljes visszatérítése csak az akkori keretet zárja le; részleges visszatérítésnek nincs automatikus hatása (napló és riasztás); a kedvezmény fiókonként egyszer jár. Állapot: a tiszta domainlogika és a szolgáltatásréteg (webhook-feldolgozás, Checkout-összeállítás, fejezetkapu, Stripe adapter, konfiguráció) a `packages/core`-ban kész, memóriás tárolóval tesztelve; tartós tároló (migráció 039), route-ok és a generálási kapu bekötése még nincs, a kapcsolók alapból kikapcsoltak.

## 2. Alapelv

A fizetős érték elsősorban:

- új Shared Context létrehozása/hostolása;
- több egyidejű subscriber context;
- mélyebb relationship/group típusok;
- invite/admin jogosultság;
- fizetett Shared AI-generálás kezdeményezése;
- későbbi prémium személyes/AI kapacitások.

A meghívott Friend részvételt nem kell minden esetben külön előfizetéssel blokkolni. A sponsored Guest modell acquisition/growth felületként működik.

## 3. Jelenlegi Shared tier modell

| Tier | Saját subscriber Shared slot | Engedélyezett típusok |
|---|---:|---|
| Free | 0 | nincs |
| Explorer | 1 | friend_group |
| Connected | 3 | friend_group, romantic_relationship, work_project, hobby_group |
| World | 5 | mind az öt, sports_team is |

A tier-nevek a jelenlegi domain contract részei. A marketingnevek később változhatnak, de code migration nélkül ne nevezzük át a domain enumokat.

## 4. Sponsored Friend Guest

Free user:

- legfeljebb 1 live targeted `friend_group` Guest seat;
- csak explicit címzett invite-ból;
- a seat nem subscriber slot;
- nem ad host/create jogot;
- nem ad invite/admin jogot;
- nem ad fizetett Shared AI-initiation jogot.

Az entitled host fizeti/viseli a közös AI futás budgetjét; a Guest jelenléte nem jelent automatikusan külön közös generation charge-ot.

## 5. Miért külön host és participant entitlement?

A Shared common event egy közös generálási pipeline. Ha minden meghívottnak azonnal teljes előfizetést követelnénk:

- magasabb lenne az invite funnel súrlódása;
- a host nem tudná kipróbáltatni a közös élményt nem előfizető baráttal;
- az access/paywall nem igazodna a tényleges AI-költség keletkezéséhez.

A termék ezért a magas értékű létrehozási és generálási jogot monetizálja, miközben korlátozott Friend participation támogatott.

## 6. Member limitek

Az abszolút context taglimitek függetlenek a tier subscriber context-slot limitjétől:

- friend_group: 10;
- romantic_relationship: 2;
- work_project: 10;
- hobby_group: 10;
- sports_team: 20.

Ezek technikai/domain limitek, nem mindegyik jelenlegi release-scope.

## 7. Upgrade

Upgrade esetén:

- az új subscriber entitlement az új tier limitjeit használja;
- meglévő sponsored Guest membership megtartható;
- sponsored membership nem fogyaszt subscriber context slotot;
- új own context csak a subscriber szabályok szerint hozható létre.

## 8. Downgrade

Alapelv:

- subscriber membership nem konvertálódik automatikusan sponsored Guestté;
- új create/invite/paid AI initiation az új alacsonyabb entitlement alapján tiltandó;
- adatkontroll és biztonsági műveletek nem válhatnak fizetési túszokká.

A jelenlegi Shared implementációban az owner end/archive/revoke downgrade után blokkolódhat. Ezt billing release előtt rendezni kell.

## 9. Billing lifecycle követelményei

Későbbi payment implementation minimum:

1. checkout és price mapping;
2. subscription state;
3. idempotens webhook processing;
4. entitlement projection/szinkron;
5. upgrade/downgrade;
6. cancel és grace period;
7. failed payment/retry;
8. refund/chargeback határ;
9. auditálható billing eventek;
10. adatkontroll műveletek fizetési státusztól való elkülönítése.

Payment provider közvetlenül ne módosítson Shared vagy life state-et; csak entitlement/billing állapotot.

## 10. Árazás

**Végleges havi ár jelenleg nincs kanonikusan elfogadva.**

A korábban felmerült konkrét dollárárak ötletek, nem implementációs contractok.

Árazási döntés előtt mérendő:

- personal AI cost/user;
- Shared AI cost/context és event;
- invite → registration → first Shared decision funnel;
- Guest → saját life indítás;
- Guest → paid conversion;
- 7/30 napos retention;
- aktív context szám/tier;
- support/abuse/moderation költség.

## 11. AI költségattribúció

Shared esetben a fizetett AI job a jogosult kezdeményező `requested_by_user_id` felhasználóhoz és a projekt budgethez tartozik.

A történeti S2 két valós Sol Shared pipeline mérése átlagosan kb. 0,01188 USD/run guard-fogyasztást mutatott. Ez csak minta, nem pricing assumption vagy garantált margin.

Safety factor szükséges hosszabb context, több participant, repair és modellár-változás miatt.

## 12. Sports/team monetizáció

A domain 20 fős sports_teamet támogat, de nem indokolt abból kiindulni, hogy mind a 20 usernek külön teljes csomagot kell fizetnie.

Későbbi döntési opció:

- host/organization-sponsored seats;
- seat pack;
- team subscription.

Ez **nincs jelenleg implementálva vagy elfogadva**.

## 13. Release sorrend

1. personal beta — Shared OFF;
2. friend Shared beta — entitled host + targeted Free Guest;
3. billing foundation;
4. valós usage alapján tier/price finomítás;
5. később romantic/work/hobby/sports monetizáció.

## 14. Nem kanonikus állítások

Bizonyíték nélkül ne kezeljük tényként:

- konkrét paywall drop százalék;
- „0 USD CAC”;
- garantált Shared run költség;
- garantált conversion rate;
- végleges havi ár.

Ezeket valós termékhasználatból kell mérni.


## 15. Személyes történetgazdaságosság – döntésre előkészített javaslat

A [részletes személyes fejezetmodell](../plans/PERSONAL_STORY_ECONOMICS_PROPOSAL_HU.md) elkészült a 2026-10-15-i valós mérések alapján. Státusza **nem elfogadott üzleti szabály**: havi 8 fejezet, 4-es kiegészítő, egyszeri 3-as próba és rollover vizsgálandó hipotézis. A 0,70 USD teljes fejezetköltség / 18 USD megtartott havi bevétel óvatos tervezési forgatókönyv; egyik sem végleges ár vagy garantált költség. A 12/24 fejezetes változat tartósan igazolt kisebb egységköltség és olvasói érdeklődés mellett vizsgálandó.

Egy jóváhagyandó személyes termékegység egy új, mentett fejezet lenne. A belső javítás/elutasítás költsége az üzemeltetőnél maradna; újraolvasás, ágöröklés és adatkontroll nem lenne új fejezet. A termékegyenleg és az USD AI-budget külön főkönyv; ilyen személyes számlázási egyenleg ma nincs implementálva. A javaslat nem változtatja meg a meglévő Shared tier/slot/Guest contractokat vagy a béta keretét.

A legutóbbi két első fejezet automatikus kapun átment költségátlaga 0,13373125 USD, de két első időszak nem teljes minőség- vagy üzemi egységárbizonyíték. A korábbi elutasítások, külön fix-kánon hibák és kutatási költségek megmaradnak; mérési authority: [NARRATIVE_EVALUATION_HU.md](../operations/NARRATIVE_EVALUATION_HU.md). Árazás előtt többfejezetes/humán minőség, teljes kihasználás melletti költség, próbából konverzió, retention, adó/fizetési levonások és nem-AI működési költség szükséges.

## V6: csomagtól független történetminőség

A nyolc új személyes fejezet továbbra csak termék-/gazdaságossági és megtartási vizsgálati ablak. Nem jelent nyolc lépéses dramaturgiát vagy csomagonként kötelező fordulatot. Minden személyes olvasó ugyanazt a legjobb igazolt történetmotort kapja; érdemi, kiérdemelt életfejlődés nem prémium képesség. Billingadat nem kerül a generálási bemenetbe. A Free / Explorer / Connected / World továbbra Shared-nevek, nem személyes történetcsomagok. Nincs új billingimplementáció vagy elfogadott személyes ár. [V6 terv](../plans/045_fiction_v6_earned_life_evolution.md).
