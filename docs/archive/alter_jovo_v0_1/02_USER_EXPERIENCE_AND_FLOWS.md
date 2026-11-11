# Alter Jövő — UX és fő felhasználói folyamatok

## 1. UX-cél

Sok adatot szeretnénk megtudni a felhasználóról, de az onboarding nem lehet egy 100 mezős űrlap. Legyen szakaszos, érthető, megszakítható és folytatható.

## 2. Onboarding flow

```text
Landing
 ↓
Regisztráció
 ↓
Rövid adatvédelmi + „nem jóslás” tájékoztató
 ↓
Alapprofil
 ↓
Élethelyzet
 ↓
Személyiség / habitus
 ↓
Kapcsolatok
 ↓
Célok és prioritások
 ↓
Profilösszegzés
 ↓
Jóváhagyás / javítás
 ↓
Első jövő generálása
 ↓
Első fejezet + timeline
 ↓
Első döntési pont
```

## 3. Profilkitöltési módok

### A — strukturált
Alapértelmezett:
- radio;
- checkbox;
- 0–100 slider;
- kategória;
- intervallum;
- prioritásrendezés.

### B — strukturált + opcionális szabad szöveg
Minden nagy blokk végén:
> „Ha szeretnéd, pár mondatban pontosíthatod.”

Az AI csak javasolt profilfinomítást készít.

### C — beszélgetős finomítás
Későbbi funkció:
> „Finomítsuk a profilod 5 rövid kérdéssel.”

## 4. Minimum profil

A generálás ne követeljen 100%-os profilt.

Minimum:
- korcsoport;
- ország + régió/településtípus;
- családi/párkapcsolati helyzet;
- munkahelyzet;
- anyagi stabilitás kategória;
- 8–12 habitusskála;
- 3–5 prioritás;
- 1–3 cél;
- változtatási hajlandóság;
- legalább 2 fontos kapcsolat vagy „nincs ilyen”.

A UI inkább „részletességet” jelezzen, ne „jövőpontosságot”.

## 5. Profilösszegző képernyő

Példa:

**Jelenlegi helyzet**
- stabil, de kevéssé inspiráló munka;
- erős helyhez kötődés;
- szűk, stabil baráti kör.

**Fő motivációk**
- biztonság;
- család;
- önállóság.

**Feszültségek**
- magas változásvágy + magas biztonságigény.

**AI által becsült**
- konfliktuskerülés: 64/100, közepes bizonyosság.

A felhasználó elfogadhatja, módosíthatja vagy törölheti az AI-becslést.

## 6. First future UX

A generálás async job.

Valódi állapotok:
1. kiinduló state;
2. lehetséges fordulópontok;
3. idővonal;
4. chapter.

Ne legyen többperces blokkoló request.

## 7. Jövő fő nézete

### Header
- future neve;
- branch neve;
- profile version;
- „szcenárió, nem előrejelzés” jelölés.

### Timeline
Event card:
- időablak;
- cím;
- leírás;
- érintett területek;
- decision flag;
- uncertainty;
- „miért?” magyarázat.

### Story
Olvasható chapter.

### State
Strukturált pillanatkép.

## 8. Döntési pont

```text
Event
 ↓
Decision
 ↓
2–4 opció VAGY saját szöveg
 ↓
Decision parsing
 ↓
új branch
 ↓
state transition
 ↓
új eventek
```

A rendszer ne jelölje egyik opciót sem „helyesnek”.

## 9. „Mi lenne, ha?” flow

A felhasználó módosíthat:
- trait-et;
- életkörülményt;
- döntést;
- célt;
- lakhelyet;
- munkát;
- kapcsolatot.

Példa:
`riskTolerance: 35 → 70`

A rendszer klónozza a branch-et, scenario override-ot hoz létre, és onnan újraszimulál.

## 10. Valós élet frissítése

Későbbi retention-funkció:
- munkahelyváltás;
- költözés;
- új kapcsolat;
- gyermek;
- képzés;
- új vállalkozás.

Mindig új profile snapshot készül, a régi nem íródik át.

## 11. Fő nézetek

- Timeline
- Chapters
- Branch map
- State
- Compare

## 12. Közösségi megosztás

Privacy szintek:
1. private;
2. unlisted;
3. anonymous community;
4. public — később.

Megosztás előtt preview kötelező.

## 13. Mobil UX később

**Mobil prioritás**
- új chapter;
- decision;
- gyors profile update;
- értesítés;
- community.

**Web prioritás**
- részletes profil;
- branch map;
- compare;
- hosszú történet;
- beállítás/adatkezelés.

## 14. Kerülendő UX

- kamu valószínűségek;
- automatikus boldog vég;
- „AI szerint ezt kell tenned”;
- moralizáló trait-értékelés;
- nyilvános profil default;
- manipuláló streak;
- félelemalapú retention.
