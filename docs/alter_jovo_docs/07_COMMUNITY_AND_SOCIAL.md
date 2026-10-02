# Alter Jövő — közösségi és social rendszer

## 1. Alapelv

Ne klasszikus közösségi hálót építsünk. A kapcsolódás alapja:
- élethelyzet;
- dilemma;
- jövőág;
- hasonló kiindulópont;
- cél;
- történet.

## 2. Privacy szintek

1. `private`
2. `unlisted`
3. `anonymous_community`
4. `public` — csak később

Default: `private`.

## 3. Anonim közösségi profil

Megjelenhet:
- korcsoport;
- általános régió;
- élethelyzet kategória;
- érdeklődés.

Ne jelenjen meg automatikusan:
- valódi név;
- pontos lakhely;
- munkáltató;
- családtag neve;
- pontos pénzügy;
- egyedi azonosító leírás.

## 4. Life cluster

Lehetséges cluster:
- pályaváltás;
- vállalkozás;
- költözés;
- újrakezdés;
- család–munka;
- kreatív hobbi;
- tanulás;
- társasági élet;
- vidéki élet;
- külföld.

## 5. „Hasonló kiindulópont”

Csak opt-in esetén.

Matching input:
- korcsoport;
- településtípus;
- munkahelyzet;
- top értékek;
- cél kategória;
- selected trait bucket.

Ne használjunk „98% hasonlóság” típusú hamis pontosságot.

## 6. Megosztható story card

User kiválasztja:
- címet;
- 1–3 eventet;
- branch nevet;
- esetleg illusztrációt.

Megosztás előtt automatikus redaction + preview.

## 7. Community post típusok

- „Az én Alter ágamban…”
- kérdés;
- decision dilemma;
- branch compare;
- tapasztalat;
- történetrész.

Tartalomcímkék:
- `REAL_LIFE`
- `ALTER_STORY`
- `MIXED_CONTEXT`

## 8. Reakció

MVP community:
- komment;
- hasznos;
- érdekes.

Kerülendő:
- „jobb élet” szavazás;
- ranglista;
- domináns follower count;
- életpontszám.

## 9. Aggregált insight

Példa:
> „Ebben a dilemmatípusban a megosztott Alter branchek 41%-a tartalmazott költözést.”

Kötelező:
- megfelelő mintanagyság;
- privacy threshold;
- anonimizálás;
- világos jelzés: ez szimulációs minta, nem valós kimeneti statisztika.

## 10. Moderáció

Kell:
- report;
- block;
- mute;
- safety prefilter;
- admin queue;
- audit trail.

Korlátozandó:
- doxxing;
- zaklatás;
- fenyegetés;
- explicit káros tartalom;
- más személy adatainak megosztása;
- megtévesztő „biztos jövő” állítás.

## 11. DM

Első community release-ben **ne legyen**.

A DM jelentősen növeli:
- zaklatási kockázatot;
- moderációs költséget;
- adatvédelmi komplexitást.

## 12. Páros/közös jövő

Későbbi premium funkció.

Két user explicit consenttel:
- kiválaszt megosztható adatokat;
- közös scenario készül;
- egyik sem látja automatikusan a másik teljes profilját.

## 13. Community rollout

### C0
Nincs community.

### C1
Unlisted story link.

### C2
Anonim story feed.

### C3
Tematikus cluster + komment.

### C4
Matching + aggregált insight.

### C5
Közös jövő/private circles.

A core MVP-hez community nem szükséges.
