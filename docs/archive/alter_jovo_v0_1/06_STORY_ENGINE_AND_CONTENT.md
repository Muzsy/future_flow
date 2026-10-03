# Alter Jövő — történetmotor és tartalomrendszer

## 1. Cél

A strukturált szimulációból élvezhető, folyamatos történetet kell készíteni úgy, hogy a narratíva ne írja felül a canon-t.

## 2. Hierarchia

```text
Future
 └─ Branch
    └─ Arc
       └─ Chapter
          └─ Scene
```

- **Arc:** hosszabb témaszál.
- **Chapter:** olvasható epizód.
- **Scene:** kisebb narratív egység.

## 3. Chapter input

- canonical events;
- life state before;
- life state after;
- relevant relationships;
- profile summary;
- previous chapter summary;
- style settings;
- forbidden additions.

## 4. Chapter output

```json
{
  "title": "...",
  "lead": "...",
  "body": "...",
  "eventRefs": ["evt_1", "evt_2"],
  "decisionRef": "dec_1",
  "summary": "...",
  "toneTags": ["reflective", "grounded"]
}
```

A body nem truth source.

## 5. Történeti ritmus

Ne minden epizód legyen nagy fordulat.

Kiinduló arány:
- 50–60% hétköznapi előrehaladás;
- 20–30% kisebb változás;
- 10–15% fontos fordulópont;
- ritkán major event.

Ez konfiguráció, nem merev szabály.

## 6. Hétköznapiság

A hitelességhez kell:
- rutin;
- visszatérő szereplő;
- apró konfliktus;
- félbehagyott terv;
- lassú fejlődés;
- kompromisszum.

Kerülendő az „évente teljesen új élet” hatás.

## 7. Visszatérő motívumok

Narrative memory indexelheti:
- régi hobbi;
- halogatott cél;
- barát visszatérő szerepe;
- munkahelyi elégedetlenség;
- helyhez kötődés.

Ez csak canon-referenciákat tartson.

## 8. Epizódos publikálás

Két mód lehet:

### Immediate
Az első időszak azonnal olvasható.

### Serialized
A fejezetek később nyílnak meg.

MVP-ben:
- első 2–3 chapter azonnal;
- serialized mode feature flag mögött.

Az első validáció során ne kényszerítsünk mesterséges várakozásra.

## 9. Következő fejezet

```text
current canon
 ↓
next event window
 ↓
candidate events
 ↓
state transition
 ↓
chapter
 ↓
publish
```

## 10. Cliffhanger

Jó:
> „A beszélgetés után először merül fel komolyan, hogy talán mégsem kell ugyanott maradnod.”

Rossz:
> „Nem fogod elhinni, mi történik ezután.”

## 11. Narratív stílus

Default:
- második személy;
- realista;
- természetes;
- visszafogott;
- nem moralizáló;
- nem túl irodalmi.

Később user style:
- tömör;
- részletes;
- regényszerű;
- dokumentarista;
- könnyed.

## 12. Decision jelenet

A chapter vége lehet:
- nyitott döntés;
- következmény;
- időugrás.

A döntési opció a Simulation Engine-ből érkezik.

## 13. Branch compare story

Később:
> „Ugyanaz a 2028-as pont, két külön élet.”

Kiemelendő:
- első divergencia;
- fő következmények;
- kapcsolati eltérés;
- karrier;
- célok.

## 14. Valós élet vs Alter Jövő

Mindig külön:
- **Valós profil**
- **Alter branch**
- **Scenario override**

A történet ne mondja:
> „Ez fog történni.”

Hanem:
> „Ebben az életágban…”

## 15. Safety

Erősen korlátozott:
- halál;
- súlyos diagnózis;
- erőszak;
- önkárosítás;
- gyermekkel kapcsolatos tragédia.

Ne legyenek engagement-eszközök.

## 16. Story consistency checker

Publikálás előtt:
- fontos állítás event/state alapú;
- szereplő létezik;
- relationship label helyes;
- dátum helyes;
- branch helyes;
- nincs canon-ellentmondás;
- nincs tiltott új tény.

## 17. Story feed cardok

- új chapter;
- decision;
- régi döntés következménye;
- profile update;
- branch compare;
- opcionális community story.

A személyes és közösségi tartalom vizuálisan különüljön el.
