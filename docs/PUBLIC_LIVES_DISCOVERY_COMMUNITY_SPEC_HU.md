# Nyilvános életutak, Discovery és közösségi tartalom – termék- és rendszerterv

**Projekt:** munkanév: Branchward / „Alter Jövő”  
**Dokumentum típusa:** termékstratégia + funkcionális specifikáció  
**Verzió:** 1.0  
**Dátum:** 2026-10-02  
**Státusz:** stratégiai alapdokumentum

---

## Tartalom

1. [A dokumentum célja](#1-a-dokumentum-célja)
2. [Vezetői összefoglaló](#2-vezetői-összefoglaló)
3. [Alapelv: private by default, publish by choice](#3-alapelv-private-by-default-publish-by-choice)
4. [Miért kell nyilvános életút-rendszer](#4-miért-kell-nyilvános-életút-rendszer)
5. [A három tartalmi réteg](#5-a-három-tartalmi-réteg)
6. [Láthatósági szintek](#6-láthatósági-szintek)
7. [Publikálási folyamat](#7-publikálási-folyamat)
8. [Privacy Preview és anonimizálás](#8-privacy-preview-és-anonimizálás)
9. [Mi számít publikus életútnak](#9-mi-számít-publikus-életútnak)
10. [Publikus életút-oldal felépítése](#10-publikus-életút-oldal-felépítése)
11. [Discovery oldal](#11-discovery-oldal)
12. [Official Lives](#12-official-lives)
13. [Community Lives](#13-community-lives)
14. [Private Lives](#14-private-lives)
15. [Előre generált életutak szerepe](#15-előre-generált-életutak-szerepe)
16. [Official Scenario rendszer](#16-official-scenario-rendszer)
17. [Fork this life – központi mechanika](#17-fork-this-life--központi-mechanika)
18. [Start from this decision](#18-start-from-this-decision)
19. [Personalize this scenario](#19-personalize-this-scenario)
20. [Tartalomfogyasztásból szimuláció](#20-tartalomfogyasztásból-szimuláció)
21. [Közösségi objektummodell](#21-közösségi-objektummodell)
22. [Adatmodell és entitások](#22-adatmodell-és-entitások)
23. [Publikált snapshot és élő privát állapot szétválasztása](#23-publikált-snapshot-és-élő-privát-állapot-szétválasztása)
24. [Jogosultsági modell](#24-jogosultsági-modell)
25. [Keresés, kategóriák és címkézés](#25-keresés-kategóriák-és-címkézés)
26. [Rangsorolás és ajánlórendszer](#26-rangsorolás-és-ajánlórendszer)
27. [Reakciók, mentések, követés és kommentek](#27-reakciók-mentések-követés-és-kommentek)
28. [Moderáció](#28-moderáció)
29. [Személyes adatok és érzékeny információk](#29-személyes-adatok-és-érzékeny-információk)
30. [Publikálás visszavonása és törlés](#30-publikálás-visszavonása-és-törlés)
31. [Monetizációs szerep](#31-monetizációs-szerep)
32. [Free és fizetős funkcióhatárok](#32-free-és-fizetős-funkcióhatárok)
33. [Growth loop](#33-growth-loop)
34. [SEO és külső megosztás](#34-seo-és-külső-megosztás)
35. [Közösségi bizalom és hitelesség](#35-közösségi-bizalom-és-hitelesség)
36. [MVP funkciók](#36-mvp-funkciók)
37. [MVP-ből kihagyandó elemek](#37-mvp-ből-kihagyandó-elemek)
38. [Bevezetési fázisok](#38-bevezetési-fázisok)
39. [KPI-k és mérőszámok](#39-kpi-k-és-mérőszámok)
40. [Kockázatok](#40-kockázatok)
41. [Technikai és architekturális következmények](#41-technikai-és-architekturális-következmények)
42. [Végleges stratégiai állásfoglalás](#42-végleges-stratégiai-állásfoglalás)

---

# 1. A dokumentum célja

A dokumentum célja annak rögzítése, hogy a projektben hogyan működjön:

- a privát és publikus életutak kezelése;
- az önkéntes publikálás;
- a linkkel megosztható, de nem listázott életutak;
- a publikus Discovery felület;
- az előre generált hivatalos életutak;
- a közösségi életutak;
- a fork és branch mechanika;
- a privacy és anonimizálás;
- a moderáció;
- a tartalomfogyasztásból fizetős szimulációba vezető üzleti modell.

Ez nem kiegészítő funkcióspecifikáció.

A publikus életutak rendszere hosszú távon a termék egyik központi növekedési és megtartási motorja lehet.

---

# 2. Vezetői összefoglaló

A rendszer alapelve:

> **Private by default, publish by choice.**

Minden személyes életút alapértelmezésben privát.

A felhasználó külön dönthet arról, hogy egy életút:

- privát marad;
- linkkel megosztható legyen;
- teljesen nyilvánosan megjelenjen a közösségi Discovery felületen.

A rendszerben három fő tartalmi réteg lesz:

```text
PRIVATE LIVES
csak a tulajdonos számára

COMMUNITY LIVES
felhasználók által önként publikált életutak

OFFICIAL LIVES
a platform által előre generált és kurált életutak
```

A nyilvános tartalomnak kettős szerepe van:

1. tartalomként önállóan fogyasztható;
2. belépési pontként személyes szimuláció indítható belőle.

A legfontosabb közösségi mechanika:

> **Fork this life**

A felhasználó egy érdekes publikus életút bármely engedélyezett döntési pontjából saját változatot indíthat.

A platform növekedési hurka:

```text
VIEW
 ↓
INTEREST
 ↓
FORK / PERSONALIZE
 ↓
SIMULATE
 ↓
CREATE
 ↓
PUBLISH
 ↓
NEW CONTENT
 ↓
NEW VIEWERS
```

Ez a rendszer teszi lehetővé, hogy a projekt ne csupán privát AI-szimulátor legyen, hanem idővel tartalomplatformmá fejlődjön.

---

# 3. Alapelv: private by default, publish by choice

Az életutak kiinduló állapota mindig:

> **PRIVATE**

Soha nem szabad abból kiindulni, hogy a személyes szimuláció automatikusan publikus.

Ennek okai:

- személyes adatok jelenhetnek meg;
- valós kapcsolatok szerepelhetnek;
- érzékeny élethelyzetek kerülhetnek bele;
- a publikus alapértelmezés visszatartó erejű;
- a felhasználói bizalom sérülhet.

A publikálás külön, egyértelmű, visszavonható döntés legyen.

A terméknyelvben:

> „Your life is private unless you choose to share it.”

---

# 4. Miért kell nyilvános életút-rendszer

A publikus életutak több problémát egyszerre oldanak meg.

## 4.1. Tartalomhiány

Egy kizárólag privát AI-alkalmazásban minden használat AI-generálást igényel.

A publikus életutak esetén rengeteg felhasználó:

- olvas;
- böngész;
- összehasonlít;
- kommentel;
- ment;
- megoszt;

anélkül, hogy új AI-költséget generálna.

---

## 4.2. Belépési súrlódás

A felhasználónak nem kell rögtön profilt kitöltenie.

Először láthatja:

> „ilyen élményt kapsz.”

Ezután indíthat saját életet.

---

## 4.3. Social proof

A publikus történetek bizonyítják, hogy a platform érdekes kimeneteket képes létrehozni.

---

## 4.4. Retention

A felhasználó nem csak a saját életéhez tér vissza.

Visszatérhet:

- érdekes új történetekért;
- trendekért;
- közösségi forkokért;
- kommentekért;
- saját publikált életútja reakcióiért.

---

## 4.5. Organikus növekedés

A publikus életutak kívülről is megoszthatók.

Egy-egy erős történet:

- Facebook;
- Reddit;
- X;
- TikTok;
- Discord;
- fórumok;
- blogok

felől is forgalmat hozhat.

---

# 5. A három tartalmi réteg

## 5.1. Private Lives

Személyes, nem nyilvános.

Csak a tulajdonos látja.

---

## 5.2. Community Lives

Felhasználó által publikált.

Megjelenhet:

- Discoveryben;
- kategóriákban;
- keresésben;
- profiloldalon;
- külső megosztásban.

---

## 5.3. Official Lives

A platform által készített, szerkesztett, ellenőrzött életutak.

Feladatuk:

- bemutatni a terméket;
- feltölteni a platformot induláskor;
- minőségi benchmarkot adni;
- SEO-t szolgálni;
- belépési pontot biztosítani.

---

# 6. Láthatósági szintek

Minimum három szint szükséges.

## Private

```text
visibility = private
```

- csak tulajdonos;
- nem kereshető;
- nincs publikus URL;
- nem jelenik meg a Discoveryben.

---

## Unlisted

```text
visibility = unlisted
```

- publikus link létezik;
- bárki megnyithatja, aki ismeri a linket;
- nem jelenik meg Discoveryben;
- nem indexelendő keresőmotorokkal;
- nem kerül ajánlórendszerbe.

Ideális:

- barátoknak;
- családnak;
- tesztcsoportnak;
- privát megosztásra.

---

## Public

```text
visibility = public
```

- Discoveryben megjelenhet;
- kereshető;
- kategorizálható;
- külső megosztásra alkalmas;
- opcionálisan keresőmotor által indexelhető.

---

# 7. Publikálási folyamat

A publikálás több lépcsős legyen.

```text
PRIVATE LIFE
 ↓
Share / Publish
 ↓
Choose visibility
 ↓
Privacy Preview
 ↓
Content Preview
 ↓
Confirm publication
 ↓
PUBLIC SNAPSHOT
```

Nem célszerű egyetlen kapcsolóval azonnal nyilvánossá tenni.

---

# 8. Privacy Preview és anonimizálás

A publikálás egyik legfontosabb eleme.

A rendszer automatikusan keresse:

- valódi neveket;
- pontos lakcímet;
- emailt;
- telefonszámot;
- pontos munkahelyet;
- pontos iskolát;
- más személyek neveit;
- pénzügyi azonosítókat;
- egyéb érzékeny adatokat.

A felhasználó publikálás előtt lássa:

```text
Potential personal information detected:

Ákos Kovács
Pécs
ABC Kft.
Anna

Recommended public version:

Your name
A city in southern Hungary
A manufacturing company
Your partner
```

A rendszer felajánlhat automatikus anonimizálást.

---

# 9. Mi számít publikus életútnak

A publikált életút ne azonos legyen a teljes belső szimulációs állapottal.

A publikus objektum:

> **egy reprezentáció vagy snapshot.**

Tartalmazhat:

- címet;
- borítóképet;
- rövid összefoglalót;
- kiindulási helyzetet;
- célokat;
- timeline-t;
- főbb eseményeket;
- döntési pontokat;
- következményeket;
- aktuális végállapotot;
- branch-eket;
- megosztási beállításokat.

Nem tartalmazhat automatikusan:

- belső promptokat;
- teljes memóriaállapotot;
- érzékeny strukturált adatokat;
- rendszerüzeneteket;
- privát jegyzeteket.

---

# 10. Publikus életút-oldal felépítése

Egy publikus életút önálló tartalmi oldal legyen.

Példa:

```text
THE LIFE I BUILT AFTER QUITTING MY JOB AT 42

By @username
Community Life

Starting point:
42 years old, stable job, €15,000 savings

Goal:
Build an independent business within five years

Timeline
────────────────────────────────

2027
Quit stable job

2028
First profitable year

2029
Major client lost
[Decision Point]

2030
Expanded into another country

2032
...
```

Fő UI-elemek:

- title;
- summary;
- author;
- Official / Community badge;
- timeline;
- milestones;
- decision points;
- branch visualization;
- reactions;
- save;
- share;
- fork;
- report.

---

# 11. Discovery oldal

A Discovery ne klasszikus végtelen social feed legyen.

Ajánlott modell:

> Netflix + YouTube + Reddit elemek.

Például:

## Featured Lives

Szerkesztett kiemelt tartalom.

## Trending

Aktuálisan növekvő érdeklődés.

## Most Forked

Legtöbbet újraindított történetek.

## Biggest Turning Points

Erős döntési pontok.

## Business

Vállalkozási életutak.

## Career

Karrierváltás.

## Relationships

Kapcsolati történetek.

## Money

Pénzügyi döntések.

## Starting Over

Újrakezdés.

## Official Scenarios

Platform által készített tartalom.

## Community Picks

Közösségi életutak.

---

# 12. Official Lives

Az Official Life:

- a platform tulajdona;
- ellenőrzött;
- minőségbiztosított;
- nincs személyes adat;
- mindig publikálható;
- fork-alapként használható.

Megjelenítés:

> **Official Life**

badge.

Az official tartalom ne imitálja a felhasználó által létrehozott tartalmat.

Legyen egyértelmű a különbség.

---

# 13. Community Lives

A Community Life:

- valós user által publikált;
- opcionálisan álnéven;
- visszavonható;
- moderálható;
- fork engedéllyel rendelkezhet.

A szerző választhat:

```text
Allow comments: yes/no
Allow forks: yes/no
Show username: yes/no
Show profile link: yes/no
Allow external indexing: yes/no
```

---

# 14. Private Lives

A privát életút teljes értékű termék legyen.

Ne keltsük azt az érzést, hogy a publikálás szükséges.

A felhasználó akkor is megkapja:

- teljes timeline;
- branch-ek;
- continuation;
- statisztikák;
- deep simulation;

ha soha semmit nem publikál.

---

# 15. Előre generált életutak szerepe

Launchkor mindenképpen kell előre elkészített tartalom.

Javasolt induló mennyiség:

> **50–100 minőségi Official Life**

A minőség fontosabb a mennyiségnél.

A cél:

- azonnal megtölteni Discoveryt;
- bemutatni, mire képes a rendszer;
- kategóriákat létrehozni;
- fork-alapot adni;
- SEO landing oldalakként működni.

---

# 16. Official Scenario rendszer

Az Official Life és az Official Scenario nem pontosan ugyanaz.

## Scenario

Kiinduló sablon.

Például:

> Quit your job at 35 and start a company with €10,000.

## Life

A scenario egy konkrét végigszimulált példánya.

Egy scenario több official life-ot is tartalmazhat.

Például:

```text
Scenario:
START A BUSINESS WITH €10,000

Possible official runs:

A – Slow sustainable growth
B – Rapid growth and failure
C – Side-business path
```

Ez demonstrálja, hogy ugyanabból a kiindulásból több különböző élet alakulhat.

---

# 17. Fork this life – központi mechanika

Ez a közösségi rendszer legerősebb funkciójelöltje.

A felhasználó:

1. megnyit egy publikus timeline-t;
2. kiválaszt egy döntési pontot;
3. megnyomja:

> **Fork this life**

4. létrejön saját privát branch;
5. innen saját döntést hozhat.

Példa:

```text
ORIGINAL LIFE

2029
───────────────
Accept investment?
   │
   ├── YES → original path
   │
   └── YOUR FORK → start here
```

---

# 18. Start from this decision

A Fork this life egyik finomabb változata.

Nem kell az egész előzményt lemásolni.

A felhasználó elindulhat egy adott helyzetből.

Például:

> „A vállalkozásod két éve működik. Egy befektető 30%-ot kér €200,000-ért.”

CTA:

> **What would you do?**

Ez virális tartalmi formátumként is működhet.

---

# 19. Personalize this scenario

Az official scenario egyik legerősebb konverziós pontja.

Példa:

A user böngészi:

> Starting a business at 40

Majd:

> **Try this with your own life**

Ezután:

```text
scenario
+
user profile
+
user constraints
+
user goals
=
personalized simulation
```

Ez természetes onboarding.

---

# 20. Tartalomfogyasztásból szimuláció

Az üzleti funnel:

```text
PUBLIC LIFE
 ↓
READ
 ↓
CURIOSITY
 ↓
TRY THIS YOURSELF
 ↓
PROFILE
 ↓
PERSONAL SIMULATION
 ↓
FREE LIMIT
 ↓
PREMIUM
```

Ez jobb, mint:

```text
LANDING
 ↓
SIGN UP
 ↓
PAY
```

---

# 21. Közösségi objektummodell

A rendszer elsődleges közösségi objektuma ne a poszt legyen.

Hanem:

```text
LIFE
BRANCH
DECISION
SCENARIO
EVENT
```

A felhasználók ezekhez kapcsolódnak.

Például:

```text
User follows User
User saves Life
User forks Branch
User comments on Decision
User reacts to Event
```

---

# 22. Adatmodell és entitások

Javasolt fő entitások:

```text
User
Profile
Life
LifeVersion
WorldState
Timeline
Event
Decision
Branch
Scenario
Publication
PublicSnapshot
Reaction
Comment
Save
Follow
Report
ModerationCase
Tag
Category
```

---

## Life

```yaml
life:
  id:
  owner_user_id:
  title:
  status:
  visibility:
  current_branch_id:
  created_at:
  updated_at:
```

---

## Publication

```yaml
publication:
  id:
  life_id:
  public_snapshot_id:
  visibility:
  show_author:
  allow_comments:
  allow_forks:
  search_indexing:
  published_at:
  unpublished_at:
```

---

## PublicSnapshot

```yaml
public_snapshot:
  title:
  summary:
  public_profile:
  sanitized_start_state:
  timeline:
  milestones:
  public_decisions:
  public_branches:
  tags:
  cover:
```

---

# 23. Publikált snapshot és élő privát állapot szétválasztása

Kritikus technikai döntés.

Ne ugyanazt az objektumot szolgáljuk ki a publikus oldalnak, amit a privát AI-szimuláció használ.

Helyette:

```text
PRIVATE LIFE STATE
      │
      ▼
SANITIZATION
      │
      ▼
PUBLIC SNAPSHOT
      │
      ▼
DISCOVERY
```

Előnyei:

- privacy;
- cache-elhetőség;
- olcsó kiszolgálás;
- stabil publikus tartalom;
- publikus verzió nem változik váratlanul;
- visszavonható publikáció.

---

# 24. Jogosultsági modell

Minden élethez legyen explicit jogosultság.

Példa:

```yaml
permissions:
  owner: true
  public_read: false
  unlisted_read: false
  allow_fork: false
  allow_comments: false
  allow_share: true
  allow_indexing: false
```

A backend mindig a jogosultsági rétegen keresztül szolgáljon ki adatot.

---

# 25. Keresés, kategóriák és címkézés

Kezdetben elég lehet egy fix taxonómia.

## Fő kategóriák

- Career
- Business
- Money
- Relationships
- Family
- Education
- Lifestyle
- Moving Abroad
- Starting Over
- Personal Growth
- Adventure
- Historical
- Fictional

## Címkék

Például:

- entrepreneur
- 40+
- career change
- remote work
- Europe
- financial independence

Az AI javasolhat címkéket.

A szerző jóváhagyhatja.

---

# 26. Rangsorolás és ajánlórendszer

Kezdetben ne építsünk bonyolult ML recommendert.

Egyszerű score:

```text
score =
views
+ saves
+ forks * high_weight
+ comments
+ completion_rate
+ recency
- reports
```

A **fork** legyen erősebb jel, mint a like.

Mert a fork valódi termékhasználatot jelent.

---

# 27. Reakciók, mentések, követés és kommentek

Javasolt prioritás:

## Első kör

- Save
- Share
- Fork

## Második kör

- Reaction
- Follow

## Harmadik kör

- Comments

A kommentek moderációs terhe nagyobb.

Ezért nem szükségesek az első MVP-ben.

---

# 28. Moderáció

A publikus tartalom már platformfelelősséget jelent.

Minimum:

- automatikus pre-publication scan;
- Report gomb;
- moderation queue;
- soft hide;
- hard remove;
- user warning;
- repeat offender kezelés.

Moderációs kategóriák:

- személyes adat;
- zaklatás;
- gyűlölet;
- explicit szexuális tartalom;
- erőszak;
- illegális tartalom;
- csalás;
- impersonation;
- spam.

---

# 29. Személyes adatok és érzékeny információk

Különösen fontos, mert a termék természeténél fogva személyes.

Publikálás előtt:

- PII detection;
- explicit confirmation;
- anonimizálási ajánlás.

Harmadik személyek adatai különösen érzékenyek.

Például:

> „A feleségem, Anna, aki az X cégnél dolgozik…”

Publikus formában:

> „A párod…”

A felhasználó saját magáról dönthet.

Más személy adatait viszont nem feltétlenül jogosult publikálni.

---

# 30. Publikálás visszavonása és törlés

A user bármikor:

> **Unpublish**

hatására:

- eltűnik Discoveryből;
- keresésből;
- profilról;
- publikus oldalról.

Unlisted link is megszüntethető.

Külön:

> **Delete life**

Ez törölje a privát életet is a retention policy szerint.

A forkok kezelése külön kérdés.

Javaslat:

Ha valaki egy publikus életből forkot készített, majd az eredeti életet törlik:

- a fork saját példányként megmaradhat;
- de az eredeti szerzőre mutató kapcsolat megszűnik;
- érzékeny eredeti tartalom ne legyen visszafejthető.

---

# 31. Monetizációs szerep

A publikus tartalom egyik legnagyobb üzleti előnye:

> **olcsó engagement.**

Egy publikus timeline megtekintése nagyságrendekkel olcsóbb, mint új AI-szimuláció generálása.

Ezért:

## Free

- böngészés;
- olvasás;
- mentés;
- megosztás;
- official life-ok;
- community life-ok.

## Fizetős érték

- saját szimuláció folytatása;
- mély branch-ek;
- több aktív élet;
- deep simulation;
- nagyobb generálási keret.

---

# 32. Free és fizetős funkcióhatárok

Javasolt:

| Funkció | Free | Premium |
|---|---:|---:|
| Discovery | korlátlan | korlátlan |
| Official Lives | korlátlan | korlátlan |
| Community Lives | korlátlan | korlátlan |
| Save | igen | igen |
| Share | igen | igen |
| Saját publikus élet | igen | igen |
| Fork | limitált | magas limit |
| Personalize Scenario | limitált | igen |
| Saját generálás | limitált | igen |
| Deep Simulation | nem | igen |
| Több aktív élet | nem / limitált | igen |

---

# 33. Growth loop

A legfontosabb növekedési hurok:

```text
USER CREATES LIFE
        ↓
USER PUBLISHES
        ↓
OTHERS DISCOVER
        ↓
OTHERS READ
        ↓
SOME FORK
        ↓
NEW LIFE
        ↓
SOME PUBLISH
        ↓
MORE CONTENT
```

Ez az úgynevezett:

> **content-product loop**

A termékhasználat maga hozza létre a következő felhasználó számára fogyasztható tartalmat.

---

# 34. SEO és külső megosztás

Az Official Lives SEO szempontból különösen értékes lehet.

Például URL:

```text
/lives/start-a-business-at-40
```

vagy:

```text
/scenarios/move-abroad-at-30
```

A publikus Community Lives SEO-indexelése opcionális legyen.

A user dönthessen:

> Allow search engines to index this life.

Open Graph preview:

- cím;
- cover;
- rövid timeline;
- fő döntés;
- CTA.

---

# 35. Közösségi bizalom és hitelesség

Fontos vizuálisan elkülöníteni:

- Official;
- Community;
- AI-generated;
- user-edited.

Például badge-ek:

> Official Scenario  
> Community Life  
> AI-simulated  
> Edited by author

Ne keltsük azt a látszatot, hogy a publikus életút valós történet, ha szimuláció.

---

# 36. MVP funkciók

A közösségi MVP-hez minimum:

1. private / unlisted / public visibility;
2. publish flow;
3. privacy preview;
4. public snapshot;
5. public life page;
6. Discovery;
7. Official Lives;
8. Community Lives;
9. Save;
10. Share;
11. Fork this life;
12. Report;
13. Unpublish;
14. basic category/tag system.

---

# 37. MVP-ből kihagyandó elemek

Nem szükséges kezdetben:

- full comment system;
- realtime chat;
- private messaging;
- creator monetization;
- marketplace;
- follow graph;
- advanced recommendation AI;
- complex reputation system;
- moderation appeals workflow;
- social groups.

---

# 38. Bevezetési fázisok

## Phase 0 – Seed Content

Még publikus launch előtt:

- 50–100 Official Life;
- 20–30 scenario;
- kategóriák;
- quality benchmark.

---

## Phase 1 – Read-only Discovery

Felhasználó:

- böngész;
- olvas;
- ment;
- megoszt.

Community publish még opcionálisan zárt béta.

---

## Phase 2 – Community Publishing

Bekapcsol:

- Public;
- Unlisted;
- Privacy Preview;
- Report.

---

## Phase 3 – Forking

Bekapcsol:

- Fork this life;
- Start from this decision;
- Personalize scenario.

Ez kulcsfázis.

---

## Phase 4 – Social Layer

- reactions;
- follow;
- comments;
- author profile.

---

## Phase 5 – Creator Platform

- custom scenario;
- public templates;
- creator analytics;
- monetization;
- marketplace.

---

# 39. KPI-k és mérőszámok

## Discovery

- Discovery MAU;
- life views;
- average read depth;
- completion rate;
- save rate.

## Conversion

- public life → sign-up;
- public life → fork;
- fork → first simulation;
- fork → paid.

## Publishing

- private → public ratio;
- unlisted ratio;
- publication rate;
- unpublish rate.

## Community quality

- report rate;
- moderation removal rate;
- fork rate;
- save rate.

## Virality

- share rate;
- external referral;
- viral coefficient;
- published life → new user.

---

# 40. Kockázatok

## 40.1. Privacy incident

A legnagyobb reputációs veszély.

Megoldás:

- private default;
- preview;
- sanitization;
- unpublish;
- explicit consent.

---

## 40.2. Üres Discovery

Induláskor.

Megoldás:

> Official Lives seed content.

---

## 40.3. AI-generated spam

Felhasználók nagy mennyiségű értéktelen életet publikálnak.

Megoldás:

- publication limits;
- quality signals;
- ranking;
- duplicate detection;
- moderation.

---

## 40.4. Minden publikus tartalom ugyanolyan

Ha az AI stílusa ismétlődő.

Megoldás:

- több narratív mód;
- szerzői szerkesztés;
- scenario diversity;
- prompt és model variation.

---

## 40.5. Social feed elviszi a fókuszt

A termék ne váljon generikus közösségi hálózattá.

A közösség tárgya mindig:

> **life / decision / branch / scenario.**

---

# 41. Technikai és architekturális következmények

A publikus rendszer miatt már az alaparchitektúrában külön kell választani:

```text
SIMULATION DOMAIN
COMMUNITY DOMAIN
PUBLIC CONTENT DOMAIN
MODERATION DOMAIN
```

Ajánlott:

```text
Private simulation DB
        │
        ▼
Publication pipeline
        │
        ▼
Sanitized Public Snapshot
        │
        ├── Discovery index
        ├── Search
        ├── CDN/cache
        └── SEO page
```

A publikus tartalom lehet erősen cache-elt.

Ez csökkenti:

- DB terhelést;
- compute költséget;
- response time-ot.

---

# 42. Végleges stratégiai állásfoglalás

A projekt közösségi iránya:

> **A személyes életutak alapértelmezésben privátak. A felhasználó döntheti el, hogy egy életutat privátan tart, linkkel megoszt vagy teljesen nyilvánossá tesz.**

A platform indulásától legyenek:

> **előre generált, kurált Official Lives.**

Ezek:

- megtöltik Discoveryt;
- bemutatják a terméket;
- SEO-t biztosítanak;
- fork-alapot adnak;
- csökkentik az onboarding súrlódását.

A hosszú távú közösségi modell:

```text
OFFICIAL CONTENT
+
COMMUNITY CONTENT
+
PRIVATE PERSONAL SIMULATION
```

A stratégiai központ:

> **Fork this life**

Mert ez köti össze:

- tartalomfogyasztást;
- közösséget;
- személyre szabást;
- AI-generálást;
- monetizációt.

A publikus életutak nem egyszerű social feature-k.

A megfelelő megvalósítás esetén:

> **ezek alakítják át a terméket privát AI-szimulátorból önmagát tápláló tartalomplatformmá.**

A fejlesztési sorrendben azonban a prioritás továbbra is:

1. jó személyes szimuláció;
2. stabil persistent state;
3. publikálható snapshot;
4. Discovery;
5. Fork;
6. social layer.

Ez biztosítja, hogy a közösség valódi termékértékre épüljön, ne üres social mechanikákra.
