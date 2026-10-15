---
status: canonical
owner: product
last_reviewed: 2026-10-15
supersedes:
  - ../PRODUCT_PLAN_HU.md
  - ../PROJECT_POSITIONING_AND_GOAL_DEFINITION_HU.md
related:
  - ../STATUS_HU.md
  - ../ROADMAP_HU.md
  - ../V2_SIMULATION_CONTRACT_HU.md
---

# Alterward — termékdefiníció

## 1. Mi az Alterward?

Az Alterward egy AI-alapú alternatív-élet szimulációs és történetplatform. A felhasználó egy kiinduló identitást, helyzetet, célt és fontos korlátokat ad meg; a rendszer ebből tartós világállapotot épít, eseményeket generál, döntési pontokat ad, majd a választások következményeit ugyanabban az életben viszi tovább.

A termék nem jövőjóslás. Lehetséges, koherens történeti/szimulációs útvonalakat mutat meg; nem rendel kitalált eseményekhez valós bekövetkezési valószínűséget.

## 2. Elsődleges érték

A fő élmény:

- kíváncsiság: „mi történne, ha?”;
- folytonosság: a döntéseknek tartós következményük van;
- felfedezés: ugyanaz az élet más ágakon is kipróbálható;
- történet: az állapotból olvasható, koherens fejezet készül;
- önreflexió: másodlagos érték, nem terápiás vagy prediktív ígéret.

## 3. Kanonikus szimulációs modell

A magmodell:

`Profile → WorldState → Event → Choice → Consequence → new WorldState`

Invariánsok:

- a világállapot és a strukturált domainadat az authoritative tényréteg;
- az AI prózát és strukturált javaslatot generál, de nem válik önmagában authority-vé;
- a választást és állapotváltozást tartósan menteni kell;
- folytatás ugyanabból az elfogadott állapotból indul;
- történeti fork új ágat hoz létre úgy, hogy az eredeti ág megmarad;
- egy élet újranyitás után ugyanabból a kanonikus állapotból folytatható.

A pontos technikai contract: `../V2_SIMULATION_CONTRACT_HU.md` és a gépi contractok.

## 4. Termékrétegek

### Private Personal Simulation

A felhasználó saját, privát alternatív élete. Ez az elsődleges termék és az első valódi béta fókusza.

### Official Lives / Scenarios

Kurált, előállított életutak és szcenáriók, amelyeket a felhasználó olvashat, felfedezhet vagy saját privát élet kiindulópontjaként használhat.

### Community / Public Lives

Önkéntes publikálási réteg, Discoveryvel, moderationnel és forkolási lehetőséggel. A kódban jelentős infrastruktúra létezik hozzá, de publikus termékaktiválása külön release-döntés.

### Shared Context

Több valós felhasználó korlátozott, privacy-tudatos közös szimulációs kontextusa. A személyes életállapotok nem olvadnak automatikusan össze; a Shared saját common canon és személyes impact réteget használ.

## 5. Első személyes user flow

1. fiók/belépés;
2. rövid profil és fő cél;
3. kiinduló világállapot;
4. első időszak generálása;
5. események/fejezet olvasása;
6. döntési pont;
7. választás és kanonikus állapotváltozás;
8. következő időszak;
9. későbbi visszatérés vagy történeti fork.

Cél: a felhasználó ne egyszeri promptot kapjon, hanem tartós, folytatható életet.

## 6. AI szerepe

AI szükséges a termékhez; AI nélküli fő termékváltozat nincs tervben.

Az AI feladata:

- strukturált esemény/javaslat létrehozása;
- narratív fejezet;
- konzisztencia támogatása;
- korlátozott szerkesztői/quality funkciók.

Az AI nem döntheti el önkényesen:

- a felhasználó entitlementjét;
- a privacy policyt;
- a kanonikus state végleges értékét validáció nélkül;
- a költség/budget felülírását;
- más felhasználó privát adatának megosztását.

## 7. Nyelv és piacra lépés

Első kiadás:

- angol UI;
- angol AI-történetek;
- 18+ célközönség;
- korlátozott béta a nyilvános release előtt.

A magyar felület és további nyelvek későbbi bővítések.

## 8. Shared termékelv

A Shared nem chat és nem realtime közösségi háló.

Célja, hogy valós emberek életének korlátozottan megosztott részei egy közös eseménytérben találkozhassanak úgy, hogy:

- a résztvevők kontrollálják a megosztást;
- a közös canon elkülönül a személyes canontól;
- személyes hatás csak explicit szabályokkal kerül vissza a saját életbe;
- a rendszer fail-closed módon kezeli a hiányzó entitlementet/consentet.

Az első Shared release `friend_group` fókuszú.

## 9. Monetizációs alapelv

A fizetési modell a létrehozás/kezdeményezés értékét monetizálja, nem minden meghívott jelenlétet.

Jelenlegi entitlement-logika:

- Free: nincs saját Shared context; egy targeted friend Guest részvétel engedhető;
- Explorer: egy saját friend context;
- Connected: több, személyesebb/kollaboratív context;
- World: legnagyobb context-keret és sports team.

A végleges árak és payment provider külön döntés. Az entitlement-modell megléte nem jelenti, hogy billing már kész.

## 10. Privacy és data ownership

Alapelvek:

- private by default;
- publikálás és Shared részvétel explicit;
- másik user nyers privát state-je nem válik automatikusan közös adattá;
- export/revoke/delete kontrollok alapvető termékfunkciók;
- fizetési státusz nem szüntetheti meg a szükséges adatkontroll lehetőségét;
- privacy/security gate-et AI vagy UX kényelmi okból nem lazítunk.

## 11. Mi nem az Alterward?

Nem:

- jósló rendszer;
- mentális egészségügyi diagnosztika;
- pénzügyi/jogi/orvosi döntési motor;
- nyers LLM-chat tartós state nélkül;
- hagyományos realtime messenger;
- automatikus közösségi profilpublikáló platform.

## 12. Termék-success mérés

A béta során elsősorban:

- eljut-e a user az első értelmes döntésig;
- folytat-e újabb időszakkal;
- visszatér-e a mentett élethez;
- érthető és következetes-e a történet;
- mennyire hasznos a Scenario/Official kiindulópont;
- Shared körben létrejön-e valódi közös érték privacy-zavar nélkül;
- AI-költség/user és hibaarány tartható-e.

A hosszú távú monetizációt és retentiont valós használatból kell kalibrálni, nem előzetes feltételezésekből.


## Történetminőség és gazdaságos működés

A személyes történet minősége elsődleges termékkövetelmény. A történet legyen több időszakon át élvezetes, sajátos, okszerű és a tényleges választásoktól függő; a schema/domain megfelelés és a modell saját editor pontja önmagában nem elég. A működési költséget az ezt elérő változatok között kell optimalizálni. Gyenge szöveg nem elfogadható kizárólag azért, mert olcsóbb.

A gazdaságosság egysége egy ténylegesen elfogadott fejezet teljes előállítási költsége: az elutasított próbák és javítások költsége is számít. A mérés külön mutassa az automatikus kapun átment és a független ember által értékelt eredményt. A technikai pass nem emberi minőségigazolás. Árazás/használati keret csak a mért költség, sikerarány és várakozási idő alapján dönthető el; ebből nem következik automatikus production budgetemelés vagy új billing-szabály.


A személyes történetek gyakoriságának és fenntartható tartalommennyiségének [konkrét gazdaságossági javaslata](../plans/PERSONAL_STORY_ECONOMICS_PROPOSAL_HU.md) elkészült. A havi fejezetkeret és az árazás még nem termékszabály. A minőség és a tényleges tovább olvasási kedv előfeltétel; nem daraboljuk mesterségesen a történetet több fizetős egységre, és nem adunk gyengébb alapcsomagos prózát pusztán költségcsökkentésért.
