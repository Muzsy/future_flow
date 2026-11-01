---
status: canonical
owner: product
last_reviewed: 2026-11-01
supersedes:
  - ../SHARED_SPONSORED_GUEST_PAYMENT_MODEL_HU.md
related:
  - PRODUCT_HU.md
  - ../features/shared/SHARED_CONTEXT_HU.md
---

# Alterward — monetizációs és entitlement modell

## 1. Hatókör

Ez a dokumentum a személyes induló ajánlat és a későbbi Shared entitlement modell kanonikus forrása. A tulajdonos 2026-11-01-i döntése szerint a teljes személyes éles szolgáltatás készül el, eleinte meghívással, 10 új emberrel, majd további tízfős csoportokkal. A nyílt önregisztráció egyelőre szerveroldalon zárt. A terv végrehajtása: [I01–I07](../DEVELOPMENT_PLAN_HU.md#23-meghívásos-éles-indulás-munkacsomagjai--2026-11-01).

### Elfogadott személyes ajánlat

| Tétel | Szabály |
| --- | --- |
| Ingyenes ízelítő | Fiókonként egyszer 1 fejezet, külön a fizetett kerettől; a végleges termékben is megmarad. |
| Normál csomag | 14,99 USD bruttó/hó, 8 fejezet számlázási ciklusonként. |
| Induló kedvezmény | Az első tíz kijelölt új meghívott fiók első három fizetett ciklusában 9,99 USD bruttó/hó, 5 fejezet; utána normál csomag. Ők ugyanaz a tíz ember, akik a meghívásos indulás első új csoportját alkotják. |
| Megújulás | Az előfizetés fordulónapján; nincs fejezet-rollover. |
| Kupon/admission | A meghívási és a kuponjog külön nyilvántartás. Az alkalmazás fiókhoz köti a kedvezményt; a Stripe legfeljebb tíz beváltása önmagában nem személyazonosítás. További csoportnak nincs automatikus kedvezmény. |
| Csoportbővítés | Ugyanaz a termék és ledger, nincs új bétaablak, ízelítő-, ciklus-, kupon- vagy USD-költésreset. |

Az első tíz új ember körébe a már meglévő három béta-résztvevő nem számít bele automatikusan. Az ő korábbi történeteik, költésük és jogosultságaik megőrzésével külön átvezetési terv szükséges. Egy esetleges további alapító kedvezmény nincs automatikusan hozzáadva az elfogadott kuponhoz.

**Egy fejezet:** egy új, sikeresen és tartósan mentett időszak a felhasználó ágán, a hozzá tartozó döntési ponttal. Új élet első fejezete, folytatás és alternatív ág első új fejezete fogyaszt; a kért teljesen új változat fogyasztását előre jelezni kell. Ágöröklés, olvasás, visszatérés, már mentett eredmény ismételt visszaadása, hálózati újrapróba, export és törlés nem új fogyasztás. A sikertelen generálás/belső javítás/minőségkapu-elutasítás költségét az üzemeltető viseli. Generáláskor foglalás, csak tartós mentéskor fogyasztás; azonos kérés nem terhelhet kétszer. A panaszkezelés és az esetleges kézi jóváírás végleges folyamata még lezárandó; nincs elfogadott korlátlan ingyenes újraírás.

**Fejezetegyenleg és költségvédelem:** az előfizetési fejezetledger és a szolgáltatói USD-budget külön főkönyv. A safety limitek és a fizetett jogosultság együtt működnek, az új csoport egyik könyvelést sem nullázza. A meglévő béta 10 USD-je nem a végleges szolgáltatás automatikusan elfogadott budgetje, és nem helyettesíti az 1/5/8-as termékegyenleget; konkrét új költési limit külön tulajdonosi döntés.

**Fejezetelszámolási útvonalhatár — #138/#139 a főágon:** enforcement mellett az API a fejezetledgeren áthaladó személyes generálást engedi a már meglévő Auth/béta/entitlement védelmekhez. V1 futures/decision, Shared AI és public-review AI indítás `GENERATION_ROUTE_UNAVAILABLE`/404; ebből nincs fizetési felszólítás. A worker csak a személyes sort claimeli, a többi függő munka megmarad. Olvasás, adatkontroll, már mentett választás és webhook saját védelme változatlan. Ez nem automatikus jóváírás, ledger-reset vagy a régi béta-mentesség kiterjesztése. Enforcement OFF viselkedése változatlan.

**Személyes worker-fejezetkapu — #140 fejlesztési jelölt:** új szolgáltatói kérés csak a futó munkához és fiókhoz tartozó, még foglalt fejezettel indulhat. A kapu nem oszt új ízelítőt vagy fizetett keretet; foglalás nélküli régi munkánál explicit felhasználói retry szükséges. A már korábban érvényesen lefoglalt fizetett munka a természetes cikluslejárat vagy lemondás után is feldolgozható a meglévő foglalási szabály szerint: ez nem a fel nem használt kvóta továbbvitele. Explicit grant-visszavonás, refund/dispute vagy restore utáni rendezetlen projection új kérést tilt. A TTL által feloldott foglalás új kérést nem enged, de a már kész eredmény tartós mentése továbbra elszámolható. A korábbi béta explicit mentessége és eredeti USD-ablaka külön kapu; új meghívott/kuponos ügyfél nem válik mentessé. A szolgáltatói USD-foglalás utáni tiltás nulla használattal visszaadja az ismerten fel nem használt összeget; a fejezetet továbbra csak a tartós mentés fogyasztja.

### Megvalósítás és szolgáltatói határ

Cél: Stripe Managed Payments, az élő fiókjogosultság megerősítésével; Paddle a tartalék. A fizetési adat- és felelősségi határok tervezési forrása [ADR-010](../decisions/ADR-010-payment-data-and-responsibility-boundaries.md); az ottani döntési státuszt ez a terv nem címkézi át automatikusan. Az 5→8 átállást a saját fizetettszámla-számláló adja, nem a kupon eltűnése. A vita és az aktuális ciklus teljes visszatérítése visszavonja a jogosultságot és lemondja az előfizetést; a régi ciklus teljes visszatérítése az akkori grantot zárja, részleges visszatérítés naplózást és riasztást ad. A kupon fiókonként egyszer jár.

A billing-mag, SQL tároló (039), route-ok, generálási kapu és `/billing` oldal implementált, a kapcsolók alapból kikapcsoltak. A #129 bekapcsolási út és a #130 versenyteszt-javítás is mainen van (`a7b5296`, saját main CI SUCCESS). Ez nem azonos az éles fizetés aktiválásával. A főágon lévő UI-szelet (#135/#136): a személyes történet tényleges kerethiányából elérhető `/billing`, a fiókhoz kötött egyenlegnézet és a történetekhez visszatérés. Ez nem indít automatikus Checkoutot, és billing-/hálózati kiesésből nem mutat fizetési felszólítást. Nyitott: a teljes navigáció/felhasználói út és lemondás, minden elérhető generálás kapuzása, meghívásos admission, tartós konfigurációkezelés/kikapcsolás, élő Stripe/feltételek és mért end-to-end kiadás.

A Shared-specifikus szakaszok a későbbi közös modellt részletezik; annak enumjai, slotjai és Guest-szabályai nem változnak a személyes induló ajánlattól.

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

**A későbbi Shared-csomagok havi ára még nincs elfogadva.** A személyes induló ajánlat elfogadott bruttó árait és fejezetkereteit az 1. szakasz rögzíti.

A korábban felmerült Shared-csomagárak ötletek, nem implementációs contractok.

Shared-árazási döntés előtt mérendő:

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

1. Végleges személyes éles működés befejezése: meghívás, ízelítő, billing, adatkontroll, költség- és üzemeltetési védelem.
2. Igazolt rollout és teljes mért fizetési/történeti alapút után az első tíz új meghívott.
3. Mérések alapján további tízfős csoportok ugyanabban a szolgáltatásban, új ablak vagy egyenlegreset nélkül.
4. Nyílt önregisztráció később külön biztonsági és kapacitási elfogadással; a személyes ajánlat változatlan maradhat.
5. Shared friend beta, majd később romantic/work/hobby/sports külön release-döntésekkel. Shared nem előfeltétele a személyes fizetős indulásnak.

## 14. Nem kanonikus állítások

Bizonyíték nélkül ne kezeljük tényként:

- konkrét paywall drop százalék;
- „0 USD CAC”;
- garantált Shared run költség;
- garantált conversion rate;
- garantált fedezet vagy konverzió az elfogadott személyes ár mellett.

Ezeket valós termékhasználatból kell mérni.


## 15. Személyes történetgazdaságosság — történeti javaslat

A [2026-10-15-i gazdaságossági javaslat](../plans/PERSONAL_STORY_ECONOMICS_PROPOSAL_HU.md) mérési és tervezési előzmény. A három ingyenes fejezet, a négyes kiegészítő és a rollover ottani vizsgálata nem az aktuális ajánlat. A jelenlegi elfogadott 1/5/8-as szabályokat és bruttó árakat az 1. szakasz rögzíti; a tartós személyes fejezetledger már implementált. A régi költségminták és fedezetfeltevések nem garantált üzemi egységárak. Mérési authority: [NARRATIVE_EVALUATION_HU](../operations/NARRATIVE_EVALUATION_HU.md).

## V6: csomagtól független történetminőség

A történeti V6-terv nyolc új személyes fejezete termék-/gazdaságossági és megtartási vizsgálati ablak volt. Az aktuális normál csomag nyolc fejezete havi termékkeret; ez nem jelent nyolc lépéses dramaturgiát vagy csomagonként kötelező fordulatot. Minden személyes olvasó ugyanazt a legjobb igazolt történetmotort kapja; érdemi, kiérdemelt életfejlődés nem prémium képesség. Billingadat nem kerül a generálási bemenetbe. A Free / Explorer / Connected / World továbbra Shared-nevek, nem személyes történetcsomagok. Ez a történeti V6-minőségelv nem írja felül az 1. szakasz elfogadott személyes ajánlatát. [V6 terv](../plans/045_fiction_v6_earned_life_evolution.md).
