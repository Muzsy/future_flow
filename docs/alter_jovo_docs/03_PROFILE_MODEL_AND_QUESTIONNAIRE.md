# Alter Jövő — profilmodell és kérdőív

## 1. Cél

A profil legyen egyszerre strukturált és gazdag. A megoldás:
- fix mezők;
- kategóriák;
- 0–100 skálák;
- opcionális szabad szöveg;
- AI-derived trait-ek confidence-dal;
- felhasználói jóváhagyás.

## 2. Adattípusok

### Fact
Tényjellegű adat: korcsoport, gyermekek száma, munkahelyzet.

### Preference
Felhasználói preferencia: költözési hajlandóság, szabadidő fontossága.

### Trait
Folytonos dimenzió, általában `0..100`.

### Derived trait
AI/szabályrendszer becslése:
- value;
- confidence;
- source;
- evidence;
- userConfirmed.

### Narrative note
Szabad szöveg. Közvetlenül ne módosítsa a canonical profile-t.

## 3. Profilkategóriák

### Demográfia
- kor/korcsoport;
- ország;
- régió;
- településtípus;
- nyelv;
- időzóna.

### Lakhatás
- saját/bérelt/családi/egyéb;
- lakás/ház/egyéb;
- lakhatási stabilitás;
- költözési terv;
- helyhez kötődés.

### Család és háztartás
- párkapcsolati státusz;
- együttélés;
- gyermekek száma és korcsoportja;
- gondozási kötelezettség;
- közeli családi háló.

### Munka és karrier
- foglalkozási terület;
- alkalmazott/vállalkozó/tanuló/munkakereső/nyugdíjas;
- heti munkaidő;
- elégedettség;
- biztonság;
- autonómia;
- fejlődési lehetőség;
- szakmaváltási hajlandóság.

### Anyagi helyzet
- jövedelmi stabilitás;
- tartalék kategória;
- hitelterheltség kategória;
- pénzügyi stressz;
- kockázattűrés;
- célok.

Pontos összeget csak akkor kérjünk, ha később valóban szükséges.

### Kapcsolati háló
- kapcsolat típusa;
- erősség;
- találkozási gyakoriság;
- konfliktus;
- támogatás;
- földrajzi közelség.

Valódi név nem kötelező. Alapcímkék:
- Párom
- Barát A
- Testvér
- Kolléga A

### Hobbi és aktivitás
- kategória;
- heti idő;
- társas/egyéni;
- fejlődési szándék;
- versenyszerűség.

### Életmód
- rutin stabilitása;
- alvási rutin szubjektív minősége;
- fizikai aktivitás kategória;
- társasági aktivitás;
- utazási gyakoriság.

### Értékek
- család;
- pénzügyi biztonság;
- szabadság;
- státusz;
- tudás;
- kreativitás;
- közösség;
- kaland;
- kiszámíthatóság;
- egészség;
- teljesítmény;
- nyugalom.

Top 5 rendezhető.

### Célok
- kategória;
- leírás;
- fontosság;
- időhorizont;
- előrehaladás;
- kontrollálhatóság.

### Félelmek/kerülendő állapotok
Opcionális:
- anyagi bizonytalanság;
- magány;
- kudarc;
- konfliktus;
- költözés;
- monotonitás;
- túlterheltség;
- státuszvesztés.

## 4. Javasolt trait-ek

| Trait | 0 | 100 |
|---|---|---|
| riskTolerance | kockázatkerülő | kockázatvállaló |
| changeSeeking | stabilitáskereső | változáskereső |
| persistence | könnyen feladja | kitartó |
| impulsivity | megfontolt | impulzív |
| sociability | visszahúzódó | társaságkereső |
| noveltySeeking | ismert dolgok | új élmények |
| planningOrientation | spontán | erősen tervező |
| conscientiousness | laza | rendszerezett |
| conflictAvoidance | konfrontatív | konfliktuskerülő |
| autonomyNeed | alacsony autonómiaigény | magas |
| achievementDrive | alacsony | magas |
| statusDrive | alacsony | magas |
| securityNeed | bizonytalanságot tolerál | nagy biztonságigény |
| familyOrientation | kevésbé központi | nagyon központi |
| careerAmbition | alacsony | magas |
| financialAmbition | alacsony | magas |
| learningOrientation | alacsony | magas |
| adaptability | lassú | gyors |
| optimism | pesszimistább | optimistább |
| selfEfficacy | alacsony kontrollérzet | magas |
| patience | azonnali eredmény | hosszú távú türelem |
| empathyOrientation | alacsony | magas |
| socialInfluenceSensitivity | alacsony | magas |
| routinePreference | változatosság | rutin |
| stressReactivity | alacsony | magas |

Ezek nem klinikai skálák.

## 5. Kérdésstratégia

Egy trait-et lehetőleg több kérdés becsüljön.

`riskTolerance` például:
1. biztos kisebb eredmény vs bizonytalan nagyobb;
2. új munka bizonytalansága;
3. visszafordítható döntések kipróbálása;
4. pénzügyi kockázat külön aldimenzió.

## 6. Példa kérdések

**Ha egy stabil munka elfogadható, de nem érdekes, meddig maradsz?**
- ameddig csak lehet;
- amíg nincs biztos másik;
- aktívan keresek;
- gyorsan váltanék.

**Mennyire költöznél másik városba jobb lehetőségért?**
`0..100`

**Egy szabad hétvégén melyik jellemzőbb?**
- inkább egyedül töltődöm;
- vegyes;
- keresem a társaságot.

**Mennyire zavar, ha mások pontosan megmondják, hogyan végezd a munkád?**
`0..100`

**Rendezd fontosság szerint**
- család;
- pénzügyi biztonság;
- szabadság;
- szakmai siker;
- szabadidő.

## 7. Szabad szöveg feldolgozása

```text
raw note
 ↓
AI extraction
 ↓
candidate observations
 ↓
confidence + evidence
 ↓
user confirmation
 ↓
structured update
```

Példa:
> „Elegem van a munkából, de nem merek váltani.”

AI-javaslat:
- workSatisfaction: alacsony;
- changeDesire: magas;
- riskTolerance: alacsony;
- securityNeed: magas.

A UI kérdezze vissza, helyes-e.

## 8. Confidence

```json
{
  "trait": "riskTolerance",
  "value": 36,
  "confidence": 0.71,
  "source": "questionnaire+text",
  "userConfirmed": false
}
```

Belső szintek:
- 0.00–0.39 gyenge;
- 0.40–0.69 közepes;
- 0.70–0.89 erős;
- 0.90–1.00 nagyon erős.

## 9. Ellentmondás

Ha slider és szöveg ellentmond:
- ne írjuk felül automatikusan;
- jelöljük conflictként;
- célzott kérdéssel oldjuk fel.

## 10. Profilverzió

Minden jelentős commit új snapshot:
- profileId;
- versionNo;
- source;
- supersedes;
- createdAt.

A future mindig konkrét versionből készül.

## 11. Adatminimalizálás

Minden mezőnél kérdés:
> „Javítja ez ténylegesen a szimulációt vagy az élményt?”

MVP-ben lehetőleg ne kérjünk:
- vallást;
- politikai nézetet;
- szexuális életet;
- diagnózist;
- biometrikus/genetikai adatot;
- pontos pénzügyi adatot.

## 12. Profilkészültség

Dimenziónként:
```json
{
  "overall": 0.68,
  "lifeContext": 0.90,
  "relationships": 0.45,
  "traits": 0.72,
  "goals": 0.60
}
```

## 13. MVP kérdőívméret

Javaslat:
- 25–35 gyors/kötelező kérdés;
- 15–25 opcionális;
- 5–10 szabad szöveges kiegészítés.

Cél:
- minimum: 7–10 perc;
- jó minőségű profil: 12–18 perc.
