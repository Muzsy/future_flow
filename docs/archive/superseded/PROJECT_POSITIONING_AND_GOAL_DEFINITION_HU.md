# Termékpozicionálási és célmeghatározási dokumentáció

**Projekt:** munkanév: Branchward / „Alter Jövő”  
**Dokumentum típusa:** termékstratégia, pozicionálás, célmeghatározás  
**Verzió:** 1.0  
**Dátum:** 2026-10-02  
**Státusz:** kiinduló stratégiai alapdokumentum

---

## Tartalomjegyzék

1. [A dokumentum célja](#1-a-dokumentum-célja)
2. [Vezetői összefoglaló](#2-vezetői-összefoglaló)
3. [Az alapötlet pontos megfogalmazása](#3-az-alapötlet-pontos-megfogalmazása)
4. [Mi a termék – és mi nem az](#4-mi-a-termék--és-mi-nem-az)
5. [A termékkategória meghatározása](#5-a-termékkategória-meghatározása)
6. [Alapvető felhasználói probléma](#6-alapvető-felhasználói-probléma)
7. [A termék fő ígérete](#7-a-termék-fő-ígérete)
8. [Pozicionálási döntés](#8-pozicionálási-döntés)
9. [Versenytér és megkülönböztetés](#9-versenytér-és-megkülönböztetés)
10. [Célcsoportok](#10-célcsoportok)
11. [Jobs To Be Done](#11-jobs-to-be-done)
12. [A termék fő pillérei](#12-a-termék-fő-pillérei)
13. [A szimuláció koncepcionális modellje](#13-a-szimuláció-koncepcionális-modellje)
14. [A „cél” szerepe a rendszerben](#14-a-cél-szerepe-a-rendszerben)
15. [Profilalkotás és bemeneti modell](#15-profilalkotás-és-bemeneti-modell)
16. [Világállapot és idővonal](#16-világállapot-és-idővonal)
17. [Döntések és elágazások](#17-döntések-és-elágazások)
18. [Történetfolyam](#18-történetfolyam)
19. [Realizmus kontra szórakoztatás](#19-realizmus-kontra-szórakoztatás)
20. [Közösségi réteg](#20-közösségi-réteg)
21. [AI szerepe](#21-ai-szerepe)
22. [Mit nem szabad az AI-ra bízni](#22-mit-nem-szabad-az-ai-ra-bízni)
23. [MVP pozicionálás](#23-mvp-pozicionálás)
24. [MVP funkciók](#24-mvp-funkciók)
25. [MVP-ből tudatosan kihagyandó funkciók](#25-mvp-ből-tudatosan-kihagyandó-funkciók)
26. [Felhasználói élmény – ideális első munkamenet](#26-felhasználói-élmény--ideális-első-munkamenet)
27. [Visszatérési ciklus és megtartás](#27-visszatérési-ciklus-és-megtartás)
28. [Monetizációs irány](#28-monetizációs-irány)
29. [Bizalom, felelősség és kommunikáció](#29-bizalom-felelősség-és-kommunikáció)
30. [Márka- és névadási következmények](#30-márka--és-névadási-következmények)
31. [Sikerességi mérőszámok](#31-sikerességi-mérőszámok)
32. [Kockázatok](#32-kockázatok)
33. [Stratégiai döntések](#33-stratégiai-döntések)
34. [Nyitott kérdések és validálandó hipotézisek](#34-nyitott-kérdések-és-validálandó-hipotézisek)
35. [Javasolt fejlesztési sorrend](#35-javasolt-fejlesztési-sorrend)
36. [Végleges pozicionálási nyilatkozat](#36-végleges-pozicionálási-nyilatkozat)
37. [Rövid pitch-változatok](#37-rövid-pitch-változatok)
38. [Források és konkurencia-referenciák](#38-források-és-konkurencia-referenciák)

---

# 1. A dokumentum célja

Ennek a dokumentumnak az a célja, hogy egyértelműen meghatározza:

- milyen terméket építünk;
- milyen problémát oldunk meg;
- milyen élményt akarunk adni;
- kinek készül az alkalmazás;
- hogyan különbözik más AI-jövőszimulátoroktól, életvezetési alkalmazásoktól és life-sim játékoktól;
- mely funkciók tartoznak a termék magjához;
- mely funkciók terelnék rossz irányba a projektet;
- mit kell bizonyítania az első MVP-nek;
- milyen hosszú távú termékkategóriát akarunk felépíteni.

A dokumentum stratégiai referenciaként szolgáljon minden későbbi:

- UX-döntéshez;
- adatmodellhez;
- AI-architektúrához;
- funkciópriorizáláshoz;
- marketinghez;
- márkanévhez;
- árazáshoz;
- fejlesztési roadmaphez.

Ha egy későbbi funkcióról nem egyértelmű, hogy bekerüljön-e az alkalmazásba, ezt a dokumentumot kell használni döntési szűrőként.

---

# 2. Vezetői összefoglaló

A projektet **nem** egyszerű jövőjósló, döntéstámogató, coaching- vagy productivity-alkalmazásként kell pozicionálni.

A projekt központi terméke:

> **egy AI-alapú, tartós állapotú, elágazó alternatív élet-szimuláció, amelyben a felhasználó felépíti önmagát vagy egy alternatív önmagát, célokat határoz meg, döntéseket hoz, majd egy következetesen fejlődő idővonalon megtapasztalja döntéseinek lehetséges következményeit.**

A termék nem azt állítja:

> „Megmondjuk, mi fog történni.”

Hanem ezt kínálja:

> „Megmutatunk több hihető világot, amely kialakulhat abból, aki vagy, amit szeretnél, és ahogyan döntesz.”

A hosszú távú vízió ennél is erősebb:

> **A felhasználó ne egyszerűen generáljon egy választ az AI-tól, hanem építsen fel egy második, harmadik vagy tizedik életet, amelynek saját múltja, állapota, kapcsolatai, döntései és történelme van.**

A termék ezért három jelenlegi kategória metszetében helyezkedik el:

1. AI-alapú jövő- és döntésszimuláció;
2. persistent life simulation / narrative sandbox;
3. személyes történet- és világépítés.

A megkülönböztetés kulcsa:

> **persistent alternate life**

vagyis:

> **tartós alternatív élet**, nem egyszeri AI-válasz.

Ehhez később egy negyedik réteg társul:

4. közösségi felfedezés és megosztás.

---

# 3. Az alapötlet pontos megfogalmazása

A felhasználó létrehoz egy szimulációs profilt.

Ez a profil nem csupán néhány mondatos prompt, hanem strukturált adatok és szabad szöveges információk kombinációja.

Például:

- életkor;
- lakóhely;
- családi helyzet;
- végzettség;
- szakma;
- anyagi helyzet;
- érdeklődés;
- képességek;
- kockázatvállalás;
- személyiség;
- életmód;
- egészségi és fizikai paraméterek csak opcionálisan és megfelelő érzékenységgel;
- társadalmi helyzet;
- kapcsolatok;
- célok;
- prioritások;
- korlátozó tényezők;
- vágyott életforma;
- fontos életdöntések.

A felhasználó ezután meghatároz egy kiindulási irányt vagy célt.

Például:

- Mi lenne, ha saját vállalkozást indítanék?
- Mi lenne, ha másik országba költöznék?
- Mi lenne, ha 25 évesen más szakmát választottam volna?
- Hogyan alakulna az életem, ha most teljesen más prioritást választanék?
- Mi történne, ha a pénzügyi biztonság helyett a szabadságot maximalizálnám?
- Mi lenne, ha egy történelmileg vagy társadalmilag eltérő környezetben élnék?
- Milyen emberré válhatnék 5–10 év alatt egy bizonyos irány követésével?

A rendszer létrehoz egy **kezdeti világállapotot**, majd eseményeket generál.

A felhasználó időről időre döntési helyzetbe kerül.

A döntés módosítja:

- saját állapotát;
- pénzügyeit;
- kapcsolatait;
- karrierjét;
- lehetőségeit;
- környezetét;
- későbbi események valószínűségét.

A rendszer minden fontos döntés után új állapotot számít.

Ez hozza létre az idővonalat.

---

# 4. Mi a termék – és mi nem az

## 4.1. A termék

A termék:

- alternatív élet-szimulátor;
- személyes történetmotor;
- AI-alapú scenario engine;
- döntésekkel vezérelt idővonal;
- folyamatosan fejlődő digitális életmodell;
- visszatérően használható élmény;
- több lehetséges életutat kezelő rendszer.

## 4.2. Nem jövőjóslás

Nem állítjuk, hogy egy modell képes megjósolni egy ember konkrét jövőjét.

A rendszer **plauzibilis forgatókönyveket** épít.

A kommunikációban kerülendő:

- „így fog történni”;
- „78% esélyed van erre az életre”, ha a szám nem valódi statisztikai modellből származik;
- „az AI megmondja a jövődet”;
- „ezt kell választanod”.

Helyette:

- „egy lehetséges pálya”;
- „ebben a szimulációban”;
- „a jelenlegi feltételek alapján”;
- „lehetséges következmény”;
- „alternatív forgatókönyv”.

## 4.3. Nem life coach

A terméknek lehet önreflexiós értéke, de nem erre kell építeni a fő kategóriát.

A coaching irány problémái:

- zsúfolt piac;
- állandó tanácsadói elvárás;
- könnyen generikus AI-chat élménnyé válik;
- a felhasználó konkrét „helyes választ” várhat;
- magasabb bizalmi és felelősségi teher.

A mi termékünk:

> **nem megmondja, mit tegyél – megmutatja, milyen történetek következhetnek a döntéseidből.**

## 4.4. Nem hagyományos játék

Lesznek játékszerű elemek:

- progresszió;
- események;
- elágazások;
- eredmények;
- statisztikák;
- timeline;
- unlockok;
- közösségi interakció.

De nem akarunk klasszikus pontgyűjtő mobiljátékká válni.

Az elsődleges érték:

> személyesség + következmények + kíváncsiság.

## 4.5. Nem döntési kalkulátor

A rendszer nem egy döntési mátrix látványos AI-verziója.

A cél nem egyszeri „A vagy B” választás elemzése.

A cél:

> **a döntés utáni világ tovább él.**

---

# 5. A termékkategória meghatározása

Javasolt kategórianév angolul:

## **AI Alternate Life Simulator**

Pontosabb stratégiai leírásként:

## **Persistent AI Alternate-Life Simulation Platform**

Magyarul:

## **AI-alapú, tartós alternatív élet-szimulációs platform**

A „persistent” szó stratégiailag fontos.

A legtöbb versenytárs:

```text
INPUT
  ↓
AI GENERATION
  ↓
RESULT
  ↓
END
```

A mi rendszerünk:

```text
PROFILE
  ↓
INITIAL WORLD STATE
  ↓
EVENT
  ↓
DECISION
  ↓
CONSEQUENCE
  ↓
UPDATED WORLD STATE
  ↓
NEW EVENT
  ↓
DECISION
  ↓
...
```

A termék tehát nem egyszeri generátor.

A termék egy **állapotgép + szimuláció + narratív réteg**.

---

# 6. Alapvető felhasználói probléma

A termék mögötti alapvető emberi kérdés nem technológiai.

Hanem:

> **„Mi lenne, ha?”**

Ez az egyik legerősebb univerzális emberi kíváncsiság.

Változatai:

- Mi lett volna, ha másképp döntök?
- Milyen lennék egy másik életben?
- Mi történhet, ha megváltoztatom az életem?
- Milyen ember leszek ebből az irányból?
- Milyen életet élhetnék máshol?
- Mi történik öt év alatt?
- Melyik döntés milyen további döntéseket nyit meg?

A jelenlegi általános AI-chat erre tud történetet generálni.

A hiányzó elem:

> **folytonosság.**

Egy chatbot válasza után a világ lényegében megszűnik.

A projektünkben a világ **megmarad**.

---

# 7. A termék fő ígérete

## Felhasználói ígéret

> **Élj végig olyan életutakat, amelyeket a valóságban csak elképzelhetnél.**

Alternatíva:

> **Explore the lives your choices could create.**

Erősebb márkaígéretként:

> **One life is real. The others are yours to explore.**

A termék nem pusztán alternatív eredményt mutat.

A felhasználó:

- belép;
- dönt;
- látja a következményt;
- tovább él az új helyzetben;
- ismét dönt;
- éveket halad előre;
- visszanézheti az életét;
- új ágat hozhat létre.

Ez teremti meg az érzelmi kötődést.

---

# 8. Pozicionálási döntés

## 8.1. Elsődleges pozíció

**Entertainment-first simulation with meaningful self-reflection.**

Magyarul:

> **Elsősorban felfedező és szórakoztató életszimuláció, amely mellékhatásként komoly önreflexiót is adhat.**

Ez tudatos stratégiai döntés.

Nem:

> „AI coaching, amely szórakoztató is.”

Hanem:

> „AI life simulation, amely elgondolkodtat is.”

Ez több szabadságot ad:

- történetekben;
- alternatív világokban;
- hipotetikus forgatókönyvekben;
- közösségi tartalomban;
- kreatív funkciókban.

És csökkenti azt az elvárást, hogy a rendszer „helyes életvezetési tanácsot” adjon.

## 8.2. Másodlagos pozíció

**Decision exploration.**

A felhasználó megvizsgálhatja egy döntés lehetséges következményeit.

De a rendszer nem mondja meg, melyik döntés „jobb”.

## 8.3. Harmadlagos pozíció

**Personal storytelling.**

Egy idő után minden felhasználói timeline saját történetté válik.

Ez különösen fontos a közösségi funkciókhoz.

---

# 9. Versenytér és megkülönböztetés

A 2026-os versenytérben több közeli irány látható.

## 9.1. Unlived

Az Unlived fő ígérete:

- korábbi döntési pont;
- két alternatív élet;
- év-alapú trajectory;
- Fork Score;
- Regret Forecast;
- Bridge Plan.

A szolgáltatás saját megfogalmazása szerint két plauzibilis párhuzamos életet szimulál, majd megmutatja, hogyan lehet a kívánt irány felé mozdulni.

### Erőssége

Nagyon könnyen érthető kérdés:

> Mi lett volna, ha máshogy döntök?

### Korlátja a mi pozicionálásunkhoz képest

Elsősorban:

> döntés → elemzés → output.

Nem egy hosszan tovább élő személyes világ.

---

## 9.2. NextSelf AI

A NextSelf AI inkább:

- life architecture;
- célok;
- coaching;
- journaling;
- decision simulator;
- weekly check-in;
- future-self beszélgetés.

### Erőssége

Rendszeresen használható önfejlesztési termék.

### Eltérés tőlünk

A felhasználói cél:

> fejleszd a valódi életedet.

A mi termékünk fő célja:

> fedezz fel és élj meg alternatív életutakat.

---

## 9.3. Alter Pathways

Az Alter Pathways strukturált döntési riportot ad.

Fő elemei:

- három jövőbeli út;
- pontozás;
- Regret Probability Index;
- Path Resilience Analysis;
- Butterfly Impact Engine;
- Ghost Letter;
- PDF export;
- fizetett döntési riportok.

Ez fontos versenytárs abból a szempontból, hogy bizonyítja:

> az AI-alapú alternatív élet/döntés kategória monetizálható strukturált kimenettel.

### Eltérés tőlünk

Alter Pathways:

```text
decision
→ report
→ scores
→ recommendation-style analysis
```

A mi rendszerünk:

```text
identity
→ world
→ events
→ choices
→ consequences
→ evolving life
```

---

## 9.4. Altworld és AI life-sim játékok

Az Altworld iránya:

- open-ended döntések;
- persistent world;
- NPC memory;
- következmények;
- történelmi és fantáziavilágok.

Ez technikailag közelebb van a hosszú távú szimulációs elképzelésünkhöz.

### Eltérés

Altworld:

> „éld át egy karakter életét egy világban”.

A mi termékünk:

> „éld át a saját vagy egy általad felépített alternatív éned lehetséges életét”.

A személyes kötődés erősebb.

---

## 9.5. Klasszikus life-sim játékok

Például BitLife-szerű termékek.

Jellemző:

- előre definiált események;
- egyszerű statok;
- menüs döntések;
- játékos humor;
- gyors életciklus.

A mi különbségünk:

- mélyebb személyes profil;
- AI-generált, kontextusfüggő események;
- szabadabb döntések;
- következetesebb hosszú távú világ;
- narratív folytonosság.

---

## 9.6. Általános AI-chat

ChatGPT, Claude, Gemini stb. bármikor tud alternatív élettörténetet generálni.

Ezért önmagában az:

> „AI generál egy lehetséges jövőt”

**nem termékdifferenciáló tényező**.

A valódi termékérték:

- strukturált profil;
- állapotkezelés;
- idővonal;
- elágazások;
- következetes szimuláció;
- hosszú távú memória;
- vizualizáció;
- közösség;
- újrajátszhatóság.

---

# 10. Célcsoportok

A célcsoportot nem érdemes túl korán demográfiai alapon beszűkíteni.

A fontosabb szegmentálás motiváció alapján történjen.

## 10.1. Elsődleges célcsoport: kíváncsi felfedező

Tipikus kérdés:

> „Mi lenne, ha teljesen máshogy alakítanám az életemet?”

Motiváció:

- kíváncsiság;
- történet;
- önismeret;
- fantázia;
- alternatív forgatókönyvek.

Ez legyen az MVP elsődleges célcsoportja.

---

## 10.2. Életút-újratervező

Valós változáson gondolkodik:

- munkahely;
- költözés;
- vállalkozás;
- tanulás;
- életmód.

Nem konkrét tanácsot kér feltétlenül.

Inkább látni akarja:

> „hogyan nézne ki az életem, ha...”

---

## 10.3. Story / simulation felhasználó

Kevésbé önismereti célú.

Számára a termék:

> személyre szabott életszimulátor.

Ez a csoport hosszú távon különösen fontos lehet megtartás szempontjából.

---

## 10.4. Social explorer

Mások alternatív életútjai érdeklik.

Például:

- Mi történt más emberek hasonló döntéseivel?
- Milyen érdekes timeline-ok készültek?
- Melyik döntési pontból milyen utak alakultak ki?

Ez teremtheti meg a közösségi háló alapját.

---

# 11. Jobs To Be Done

## JTBD 1 – alternatív jövő felfedezése

> Amikor azon gondolkodom, milyen lehetne egy másik életem, szeretnék egy hihető, személyre szabott világot látni, hogy ne csak absztrakt módon képzeljem el.

## JTBD 2 – döntés következményeinek megélése

> Amikor fontos választás előtt állok, szeretném végigjátszani több lehetséges irány következményeit anélkül, hogy az alkalmazás megmondaná, melyiket válasszam.

## JTBD 3 – alternatív identitás

> Szeretném megtapasztalni, milyen emberré válhatnék más prioritások, környezet vagy döntések mellett.

## JTBD 4 – történet

> Szeretnék egy személyes történetet, amely folytatódik, emlékszik rám és reagál a döntéseimre.

## JTBD 5 – megosztás

> Ha érdekes életút alakul ki, szeretném megmutatni másoknak, összehasonlítani vagy közösen továbbgondolni.

---

# 12. A termék fő pillérei

A terméket hat alapvető pillérre kell építeni.

## 12.1. Identity

Ki ez az ember?

Nem csak név és életkor.

Hanem:

- háttér;
- személyiség;
- erőforrások;
- kapcsolatok;
- képességek;
- motivációk;
- gyengeségek;
- prioritások.

---

## 12.2. Goal

Mit próbál elérni?

A cél ad irányt, de nem előre meghatározott végkimenetelt.

---

## 12.3. World State

Mi igaz ebben a pillanatban?

A szimuláció minden körében léteznie kell strukturált állapotnak.

---

## 12.4. Events

Mi történik?

Az események részben:

- természetes következmények;
- részben külső történések;
- részben véletlenek.

---

## 12.5. Choice

Mit tesz a felhasználó?

Ez lehet:

- előre felkínált választás;
- szabad szöveges döntés;
- később vegyes modell.

---

## 12.6. Consequence

Mit változtatott meg a döntés?

Ez a rendszer hitelességének központja.

---

# 13. A szimuláció koncepcionális modellje

Javasolt absztrakció:

```text
PERSON
+
ENVIRONMENT
+
GOALS
+
HISTORY
+
CURRENT STATE
+
EXTERNAL CONDITIONS
+
USER DECISION
+
UNCERTAINTY
=
NEXT STATE
```

A narratív AI nem maga a szimuláció.

A narratív AI a szimuláció **megjelenítési rétege**.

Ez stratégiailag nagyon fontos.

Rossz architektúra:

```text
user prompt
→ LLM
→ story
```

Jobb architektúra:

```text
structured state
→ simulation engine
→ state transition
→ narrative engine
→ user-facing story
```

Így:

- konzisztens maradhat a világ;
- olcsóbb modellek is használhatók bizonyos rétegekhez;
- visszakereshető, miért történt valami;
- a történet újragenerálható;
- később szabályalapú vagy statisztikai modellek építhetők be.

---

# 14. A „cél” szerepe a rendszerben

A célbeállítás nem egyszerű onboarding-kérdés.

A cél a szimuláció egyik meghatározó változója.

## 14.1. Nem csak „mit szeretnél?”

Egy cél legalább az alábbi adatokat tartalmazhatja:

```yaml
goal:
  category:
  description:
  priority:
  horizon:
  motivation:
  acceptable_tradeoffs:
  unacceptable_tradeoffs:
  current_progress:
  constraints:
```

Például:

```yaml
goal:
  category: business
  description: "5 éven belül saját, stabil vállalkozás"
  priority: high
  horizon: 5 years
  motivation:
    - independence
    - income
  acceptable_tradeoffs:
    - less free time
    - temporary income volatility
  unacceptable_tradeoffs:
    - losing home
    - family breakdown
  current_progress: idea-stage
```

Ez sokkal jobb inputot ad a szimulációhoz, mint:

> „Szeretnék vállalkozó lenni.”

---

# 15. Profilalkotás és bemeneti modell

A korábbi projektötlet alapján helyes irány a **strukturált változók + beszélgetés kombinációja**.

Csak beszélgetés:

- változatos;
- természetes;
- nehezen összehasonlítható;
- nehéz megbízhatóan feldolgozni.

Csak checkbox:

- jól strukturálható;
- könnyen pontozható;
- unalmas;
- sok személyes részlet elveszik.

Ezért a javasolt modell:

## 15.1. Structured Core

Fix mezők:

- élethelyzet;
- pénzügyi állapot;
- munka;
- kapcsolatok;
- képzettség;
- idő;
- mobilitás;
- kockázat;
- prioritások;
- célok.

## 15.2. Guided Questions

Előre definiált kérdések:

- Mi az, amin legszívesebben változtatnál?
- Mit nem lennél hajlandó feláldozni?
- Melyik korábbi döntésedet próbálnád ki másképp?
- Mi számít számodra jó életnek?

## 15.3. Free Context

Szabad szöveg:

> „Van valami fontos az életeddel kapcsolatban, amit a szimulációnak tudnia kell?”

---

# 16. Világállapot és idővonal

A termék egyik legfontosabb technikai fogalma a **World State**.

Minden időpontban legyen meghatározható például:

```yaml
time:
person:
career:
finance:
relationships:
location:
housing:
health_context:
skills:
reputation:
goals:
stress:
satisfaction:
social_network:
open_opportunities:
active_risks:
major_events:
```

Nem szükséges minden értéket számmá alakítani.

Lehet:

- numerikus;
- kategorikus;
- szöveges;
- kapcsolat-gráf;
- eseménylista.

A timeline ezeknek az állapotváltozásoknak a története.

---

# 17. Döntések és elágazások

A döntés az a pont, ahol a termék interaktívvá válik.

Példa:

```text
2028 – A vállalkozásod már nyereséges, de kapsz egy
jól fizető állásajánlatot.

A) elfogadod
B) maradsz a vállalkozásnál
C) megpróbálod párhuzamosan
D) saját döntés...
```

A döntés után:

```text
STATE(t)
+
CHOICE
+
CONTEXT
+
UNCERTAINTY
=
STATE(t+1)
```

## Fontos

Az elágazásokat el kell menteni.

Később a felhasználó visszatérhet:

> „Mi lett volna, ha ott B-t választom?”

Ekkor valódi alternatív timeline jön létre.

Ez lehet a termék egyik legerősebb funkciója.

---

# 18. Történetfolyam

A történet nem dekoráció.

A puszta számok:

```text
pénz +12
stressz +8
kapcsolat -4
```

önmagukban gyengék.

A narratíva:

> „Az első három hónapban több ügyfelet szereztél, mint vártad, de az esti munka miatt egyre gyakrabban mondtál le közös programokat...”

érzelmi jelentést ad ugyanannak az állapotváltozásnak.

A narratív réteg feladata:

- összekötni az eseményeket;
- felidézni korábbi döntéseket;
- fenntartani a folytonosságot;
- karaktert adni az NPC-knek;
- érthetővé tenni a következményeket.

---

# 19. Realizmus kontra szórakoztatás

A rendszernek nem kell tudományosan megjósolnia egy életet.

De belsőleg **következetesnek** kell lennie.

A kulcsszó:

> **plausibility**, nem prediction.

Az ideális arány:

```text
real-world plausibility
        +
narrative interest
        +
uncertainty
```

Kerülendő két szélsőség.

### Túl realista

Unalmas:

> „Folytatod a munkát. Egy év eltelt.”

### Túl dramatikus

Hiteltelen:

> „Egy véletlen találkozás után milliárdos lettél.”

A jó szimuláció:

> meglepő, de utólag érthető.

---

# 20. Közösségi réteg

A közösséget nem klasszikus social feedként kell elsőként felépíteni.

Először a **tartalomnak** kell érdekesnek lennie.

A közösségi objektum:

> timeline / branch / event / decision.

Nem:

> „felhasználói státusz”.

## Lehetséges megosztható elemek

- életút;
- döntési pont;
- érdekes fordulat;
- két ág összehasonlítása;
- 10 éves timeline;
- „te mit választanál?” esemény;
- alternatív karakterprofil.

## Későbbi funkciók

- follow;
- reaction;
- komment;
- remix;
- „start from this fork”;
- közös scenario;
- public challenges.

A legerősebb közösségi mechanika lehet:

> **Fork this life.**

Vagyis egy másik felhasználó egy publikus timeline adott pontjáról saját ágat indíthat.

---

# 21. AI szerepe

Az AI több külön szerepet kapjon.

## 21.1. Profilértelmezés

A szabad szöveg strukturált attribútumokká alakítása.

## 21.2. Eseménygenerálás

A világállapot alapján releváns események generálása.

## 21.3. Narráció

Az állapotváltozás történetté formálása.

## 21.4. NPC-viselkedés

Kapcsolatok és szereplők következetes kezelése.

## 21.5. Összegzés

Évek, fejezetek, timeline-ok összefoglalása.

## 21.6. Kreatív változatosság

A rendszer ne ugyanazokat az eseményeket ismételje.

---

# 22. Mit nem szabad az AI-ra bízni

Nem célszerű minden logikát LLM promptokra bízni.

A következőket érdemes strukturáltan kezelni:

- életkor;
- idő;
- pénz;
- tulajdon;
- családi kapcsolatok;
- helyszín;
- munka;
- történelmi események;
- döntési ágak;
- timeline;
- korábbi események;
- achievementek;
- hozzáférési jogosultság;
- előfizetés.

Az AI generálhat javaslatot.

A rendszerállapot változását azonban validálni kell.

---

# 23. MVP pozicionálás

Az MVP-nek **nem a teljes élet-szimulációs univerzumot** kell megépítenie.

Egyetlen dolgot kell bizonyítania:

> **A felhasználó akarja-e folytatni az alternatív életét egy első generált eredmény után?**

Ez az alapvető termékhipotézis.

Ha a felhasználó csak egyszer kipróbálja:

> „Haha, érdekes.”

majd soha nem tér vissza, akkor nincs erős termék.

Ha azt mondja:

> „Mi történik ezután?”

akkor működik.

Ezért az MVP fő metrikája nem a regisztráció.

Hanem:

> **Continuation Rate.**

---

# 24. MVP funkciók

## Kötelező

### 1. Profil

Rövid, de strukturált onboarding.

### 2. Cél / scenario

Egy fő cél vagy alternatív életirány.

### 3. Első World State

A rendszer létrehozza a kiinduló állapotot.

### 4. Első időszak

Például:

- következő 6 hónap;
- vagy 1 év.

### 5. Események

2–5 releváns esemény.

### 6. Döntési pont

Legalább egy valódi döntés.

### 7. Következmény

A rendszer frissíti a világállapotot.

### 8. Timeline

A felhasználó látja:

```text
START
 ↓
YEAR 1
 ↓
DECISION
 ↓
YEAR 2
```

### 9. Save

Folytatható később.

### 10. Branch

Legalább egy korábbi döntési pontból lehessen új ágat indítani.

---

# 25. MVP-ből tudatosan kihagyandó funkciók

Nem kell az elején:

- teljes social network;
- privát üzenet;
- follower rendszer;
- marketplace;
- avatar világ;
- voice;
- realtime multiplayer;
- VR;
- teljes coaching platform;
- habit tracker;
- egészségintegráció;
- több száz stat;
- komplex achievement rendszer;
- native mobilapp.

Ezek elterelnék a validációt.

---

# 26. Felhasználói élmény – ideális első munkamenet

## 0:00–1:00

Landing page.

Azonnal érthető ígéret:

> Explore a life you could have lived.

CTA:

> Start a new life.

---

## 1:00–4:00

Profilbeállítás.

Maximum 10–15 fontos kérdés.

Progress bar.

---

## 4:00–5:00

Cél / alternatív irány.

Például:

> „Öt éven belül saját vállalkozást építek.”

---

## 5:00–6:00

AI elkészíti az induló világot.

Nem hosszú loading screen.

Közben lehet:

- cél összefoglalása;
- kulcsfontosságú trade-offok;
- kiinduló karakterlap.

---

## 6:00–10:00

Első fejezet.

Történet.

Esemény.

Döntés.

---

## 10:00+

Következmény.

Majd:

> Continue this life

vagy:

> Fork from here

Ez legyen az első session valódi payoffja.

---

# 27. Visszatérési ciklus és megtartás

A terméknek természetes folytatási hurkot kell létrehoznia.

```text
EVENT
 ↓
DECISION
 ↓
CONSEQUENCE
 ↓
NEW SITUATION
 ↓
CURIOSITY
 ↓
RETURN
```

Nem mesterséges streak legyen az elsődleges retention eszköz.

Hanem:

> **narrative curiosity.**

A felhasználó azért tér vissza, mert tudni akarja:

> „Mi lesz ebből?”

---

# 28. Monetizációs irány

A monetizáció ne az MVP elsődleges problémája legyen.

De a pozicionálás miatt fontos előre meghatározni.

## Javasolt hosszú távú modell

### Free

- 1–2 aktív élet;
- limitált időlépés;
- alap szimuláció;
- alap timeline;
- közösségi böngészés.

### Plus / Premium

- több aktív élet;
- mélyebb profil;
- hosszabb timeline;
- több branch;
- részletes statok;
- fejlettebb modellek;
- export;
- privát életutak;
- extra generálások;
- vizuális generálás.

### Később opcionális

- scenario pack;
- historical worlds;
- creator worlds;
- extra visual generation;
- community creator economy.

A fizetési modellből kerülendő:

> „Fizess, hogy megtudd a valódi jövődet.”

A monetizált érték:

> több szimuláció, több mélység, több világ, több folytatás.

---

# 29. Bizalom, felelősség és kommunikáció

A termék érzékeny témákat érinthet:

- kapcsolat;
- pénz;
- munka;
- egészség;
- család.

Ezért fontos következetesen jelezni:

> a szimuláció nem jóslat.

Nem kell minden képernyőt disclaimerrel teleírni.

De a terméknyelvben végig látszódjon.

## Kerülendő

> „87% esélyed van a válásra.”

Ha nincs valódi, validált modell, ez pszeudo-statisztika.

## Jobb

> „Ebben az ágon a növekvő munkaterhelés fokozatos kapcsolatbeli feszültséget hozott létre.”

Ez narratív következmény, nem hamis predikció.

---

# 30. Márka- és névadási következmények

A pozicionálás alapján a névnek nem célszerű:

- kizárólag coachingra utalnia;
- „future self”-re szűkítenie;
- döntési kalkulátorra utalnia;
- túl technikai AI-nevet használnia.

A névnek működnie kell:

```text
Create a ______
Explore ______
Share your ______
Continue your ______
Fork your ______
```

A korábban felmerült **Branchward** ebből a szempontból jó irány:

- branch = elágazás;
- forward/ward = irány;
- nem szűkíti a terméket egyetlen funkcióra;
- közösségi platformként is működhet.

Példák:

> My Branchward life

> Branch this timeline

> Explore another branch

A végleges név kiválasztásánál külön domain- és védjegykutatás szükséges.

---

# 31. Sikerességi mérőszámok

## North Star jellegű metrika

### Continued Life Sessions

Hány alternatív életet folytatnak legalább egy további alkalommal?

---

## Elsődleges MVP KPI-k

### Onboarding Completion Rate

Hányan jutnak el az első szimulációig?

### First Simulation Completion

Hányan olvassák/viszik végig az első fejezetet?

### First Decision Rate

Hányan hoznak tényleges döntést?

### Continuation Rate

Hányan kattintanak:

> Continue

### Return Rate

Hányan térnek vissza:

- 1 nap;
- 7 nap;
- 30 nap.

### Branch Rate

Hányan próbálnak ki alternatív ágat?

---

## Másodlagos KPI-k

- átlagos döntésszám életutanként;
- átlagos timeline-hossz;
- megosztási arány;
- publikus életutak aránya;
- AI-generálási költség aktív felhasználónként;
- fizető konverzió;
- churn.

---

# 32. Kockázatok

## 32.1. „Egyszer kipróbálom” probléma

Ez a legnagyobb termékkockázat.

Ha nincs folytatás:

> novelty app.

Megoldás:

- persistent world;
- cliffhanger;
- döntési pontok;
- következmény;
- visszatérő szereplők;
- hosszú távú cél.

---

## 32.2. Generikus AI-szöveg

Ha a felhasználó azt érzi:

> „ezt ChatGPT-ben is megkaphattam volna”,

a termék értéke összeomlik.

Megoldás:

- strukturált state;
- saját simulation engine;
- visszatérő memória;
- vizuális timeline;
- branch rendszer;
- domain-specifikus UX.

---

## 32.3. Inkonzisztens világ

Példa:

- valaki 2027-ben eladta a vállalkozását;
- 2029-ben az AI úgy beszél róla, mintha még mindig az övé lenne.

Ez nagyon gyorsan tönkreteszi az élményt.

Megoldás:

- explicit world state;
- event ledger;
- relationship state;
- canonical facts.

---

## 32.4. Túl sok onboarding

Ha a tökéletes szimulációhoz 50 kérdés kell, sok felhasználó nem jut el az élményhez.

Megoldás:

> progressive profiling.

Először kevés adat.

Később kérdezünk tovább.

---

## 32.5. Túl komoly döntési autoritás

Ha a rendszer túl magabiztosan közöl „eredményeket”, a felhasználó döntéstámogató szakértőként kezelheti.

Megoldás:

- scenario language;
- valószínűségek csak akkor, ha tényleges modellből jönnek;
- egyértelmű keretezés.

---

## 32.6. AI-költség

Persistent story esetén az input context gyorsan nőhet.

Megoldás:

- structured memory;
- summarization;
- event retrieval;
- tiered models;
- csak releváns state-et küldeni a generáló modellnek.

---

# 33. Stratégiai döntések

Az alábbi döntéseket érdemes a projekt jelenlegi irányának tekinteni.

## Döntés 1

**Nem future-prediction appot építünk.**

---

## Döntés 2

**Nem elsődlegesen coaching appot építünk.**

---

## Döntés 3

**Nem egyszeri döntéselemző riport a fő termék.**

---

## Döntés 4

**Persistent alternate-life simulation a termék magja.**

---

## Döntés 5

**A strukturált világállapot fontosabb, mint a látványos AI-szöveg.**

---

## Döntés 6

**A narratíva szükséges, de a narratíva a szimuláció megjelenítése.**

---

## Döntés 7

**A cél irányt ad, nem fix befejezést.**

---

## Döntés 8

**A felhasználói döntéseknek tartós következménye legyen.**

---

## Döntés 9

**Minden fontos döntés potenciális branch point.**

---

## Döntés 10

**Web-first fejlesztés, később közös backendre épülő mobilkliens.**

---

## Döntés 11

**A social layer a szimuláció után jön, nem előtte.**

---

## Döntés 12

**A közösségi objektum a timeline/branch, nem az üres profil.**

---

# 34. Nyitott kérdések és validálandó hipotézisek

Ezeket nem érdemes most „igazságnak” tekinteni.

Tesztelni kell őket.

## Hipotézis A

A felhasználók személyes életet akarnak szimulálni, nem csak kitalált karaktert.

## Hipotézis B

A strukturált onboarding növeli az eredmény személyességét annyira, hogy megéri a plusz súrlódást.

## Hipotézis C

A felhasználó szívesebben folytat egy meglévő életet, mint új szimulációt indít.

## Hipotézis D

A branch funkció önmagában retention-driver.

## Hipotézis E

A felhasználók megosztják az érdekes timeline-okat.

## Hipotézis F

Mások életútjainak felfedezése önálló fogyasztási élménnyé válhat.

## Hipotézis G

A történetszerű megjelenítés értékesebb, mint egy tisztán analitikus report.

---

# 35. Javasolt fejlesztési sorrend

## Phase 0 – Product prototype

Cél:

> működik-e az élmény?

Tartalom:

- rövid profil;
- cél;
- AI által generált 1. fejezet;
- döntés;
- folytatás.

---

## Phase 1 – Persistent MVP

Cél:

> visszajön-e a felhasználó?

Tartalom:

- user account;
- world state;
- event history;
- save;
- continue;
- timeline;
- branch.

---

## Phase 2 – Simulation quality

Cél:

> hihető marad-e hosszú távon?

Tartalom:

- state transition engine;
- consequence rules;
- relationship model;
- financial model;
- contextual retrieval;
- model routing.

---

## Phase 3 – Replayability

Tartalom:

- több élet;
- template-ek;
- új célok;
- életúttípusok;
- visual comparison;
- achievements opcionálisan.

---

## Phase 4 – Community

Tartalom:

- public timeline;
- share;
- discovery;
- reactions;
- comments;
- follow;
- fork another timeline.

---

## Phase 5 – Platform

Tartalom:

- creator scenarios;
- historical worlds;
- fictional worlds;
- community templates;
- API / plugin lehetőség;
- mobilapp.

---

# 36. Végleges pozicionálási nyilatkozat

## Rövid stratégiai definíció

> **A projekt egy AI-alapú, tartós alternatív élet-szimulációs platform, amelyben a felhasználó személyes profilból és célokból kiindulva lehetséges életutakat élhet végig, döntéseket hozhat, elágazásokat hozhat létre, és hosszú távon követheti döntéseinek következményeit.**

## Megkülönböztetés

> **Nem egyszeri jövőjóslatot vagy döntési riportot generálunk. Egy folyamatosan fejlődő alternatív életet építünk.**

## Érzelmi ígéret

> **One life is real. The others are yours to explore.**

---

# 37. Rövid pitch-változatok

## Egy mondat

> An AI-powered alternate-life simulator where your choices create persistent timelines you can continue, revisit and branch.

## Rövid webes változat

> Build an alternate version of your life, make decisions, move through the years, and see where each path leads.

## Marketingesebb változat

> You only get one real life. Here, you can explore the others.

## Funkcionális változat

> Create a profile, choose a direction, make decisions and watch a persistent AI-simulated life evolve over time.

## Közösségi jövőkép

> Live another life. Branch it. Share it. See where others went.

---

# 38. Források és konkurencia-referenciák

Az alábbi szolgáltatásokat érdemes referenciaként és konkurenciaként rendszeresen figyelni.

## Unlived

https://unlived.app/

2026-10-02-i állapot szerint:

- alternatív döntési utak;
- két párhuzamos élet;
- Fork Score;
- Regret Forecast;
- Bridge Plan;
- plauzibilis trajectory kommunikáció.

---

## NextSelf AI

https://nextselfai.app/

2026-10-02-i állapot szerint a felület többek között:

- coaching;
- dashboard;
- Decision Simulator;
- goals;
- journal;
- Outcome Architecture;
- chat;
- weekly check-in

modulokat mutat.

---

## Alter Pathways

https://alterpathways.com/

2026-10-02-i állapot szerint:

- strukturált döntési riport;
- három jövőbeli út;
- Regret Probability Index;
- Path Resilience Analysis;
- Butterfly Impact Engine;
- Ghost Letter;
- PDF-export;
- freemium + egyszeri csomag + havi előfizetés.

A szolgáltatás azért különösen releváns, mert egyértelműen a „decision report” pozíciót foglalja el, amelytől a saját projektünket célszerű elkülöníteni.

---

## Altworld

https://altworld.io/

Releváns jellemzők:

- open-ended AI life simulation;
- persistent world;
- NPC memory;
- hosszú távú következmények;
- szabad szöveges döntések.

A saját projektünkhöz főleg a persistent simulation technikai és UX-megközelítése miatt releváns.

---

## Future Self Emulator – open-source referencia

https://github.com/shehanmakani/future-self-emulator

Releváns megközelítés:

- több jövőbeli én;
- több lehetséges életpálya;
- döntési trade-offok;
- profilalapú személyre szabás.

---

# Záró megállapítás

A projekt legerősebb lehetősége nem az, hogy egy AI „okosabban megjósolja” a jövőt, mint más rendszerek.

A legerősebb lehetőség az, hogy létrehozzon egy új típusú fogyasztói élményt:

> **egy személyes, tartós, elágazó második életet.**

A megfelelő stratégiai fókusz ezért:

```text
NOT:
AI prediction
AI coaching
decision report
generic chatbot
traditional game

BUT:
PERSONAL
+
PERSISTENT
+
BRANCHING
+
AI-SIMULATED
+
NARRATIVE
+
SOCIAL-READY
ALTERNATE LIFE
```

Ha ezt a magot sikerül erősen megépíteni, később ugyanarra az alapra ráépíthető:

- döntésszimuláció;
- önreflexió;
- coaching-jellegű nézet;
- közösség;
- történelmi világok;
- fikciós világok;
- creator platform;
- mobilalkalmazás.

A sorrend azonban kritikus:

> **először olyan alternatív életet kell létrehozni, amelyet a felhasználó folytatni akar.**

Ez legyen a projekt első valódi termékcélja.
