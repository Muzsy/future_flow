# AGENTS.md

Ez a fájl az Alterward repositoryban dolgozó emberi és AI fejlesztők kötelező működési szerződése.

## 1. Kötelező olvasási sorrend

Minden új feladat előtt olvasd el, ebben a sorrendben:

1. `AGENTS.md`
2. `docs/DOCS_INDEX_HU.md`
3. `docs/STATUS_HU.md`
4. planning/implementation feladatnál a `docs/DEVELOPMENT_PLAN_HU.md` releváns részét
5. az adott feladathoz a Docs Indexben megjelölt kanonikus specifikációt
6. csak ezután a szükséges támogató vagy történeti dokumentumokat

Nem kell automatikusan az egész `docs/` könyvtárat kontextusba tölteni.

## 2. Source-of-truth sorrend

Ellentmondás esetén az elsőbbség:

1. futó kód, adatbázis-migrációk és géppel ellenőrzött contractok;
2. elfogadott ADR vagy kanonikus specifikáció;
3. kanonikus feature/product/architecture dokumentáció;
4. `docs/STATUS_HU.md`;
5. `docs/ROADMAP_HU.md`;
6. `docs/DEVELOPMENT_PLAN_HU.md` mint aktív részletes végrehajtási terv;
7. audit, report, closure vagy checkpoint;
8. `docs/archive/` és más történeti anyag.

Fontos: a kód azt mutatja, mi működik ténylegesen, de nem mindig azt, mi a kívánt termékviselkedés. Ha a kód és egy elfogadott termék- vagy ADR-döntés ütközik, ne válassz csendben. Dokumentáld a konfliktust a taskban/PR-ben, és csak egyértelmű scope alapján módosíts.

## 3. Dokumentum-státuszok

A státuszok és a részletes governance szabályok: `docs/DOCUMENTATION_GOVERNANCE_HU.md`.

Röviden:

- `canonical`: adott témában elsődleges emberi olvasású forrás;
- `active-supporting`: aktuális, de kanonikus dokumentumot egészít ki;
- `transitional`: még használható, de összevonásra vagy átírásra vár;
- `historical`: lezárt állapot, audit vagy riport; nem írhat felül aktuális döntést;
- `archived`: csak történeti hivatkozásra használható.

## 4. Git workflow

Normál fejlesztési sorrend:

`Issue → feature branch → implementáció → ellenőrzés → PR → review → CI → merge`

Szabályok:

- közvetlenül `main` ágra csak explicit emberi utasításra írj;
- egy branch egy jól körülhatárolt feladatot vigyen;
- ne keverj opportunista refactort a feladatba;
- ne változtass üzleti szabályt hallgatólagosan;
- a PR body mondja el a scope-ot, a teszteket, a dokumentációs hatást és az ismert kockázatokat;
- CI hibát ne kerülj meg vagy rejts el csak a zöld állapot kedvéért.

## 5. Scope-fegyelem

Az agent:

- csak a task elfogadási feltételeihez szükséges kódot és dokumentációt módosítsa;
- ne találjon ki új termékszabályt;
- ne töröljön adatvédelmi, biztonsági vagy recovery védelmet külön indoklás nélkül;
- ne lazítson entitlement-, privacy-, rate-limit-, budget- vagy writer-fence ellenőrzést pusztán tesztjavításért;
- migrációnál kezelje együtt a kódot, teszteket, restore/schema guardokat és dokumentációt;
- ha a feladat túlmutat a scope-on, külön Issue/PR legyen belőle.

## 6. Dokumentációs kötelezettség

Ugyanabban a PR-ben frissítsd a megfelelő kanonikus dokumentációt, ha változik:

- termékviselkedés vagy user flow;
- API/contract;
- adatmodell vagy migráció;
- entitlement/jogosultság;
- monetizáció;
- privacy/security határ;
- AI routing, budget vagy költségviselés;
- deployment, backup vagy recovery működés;
- béta/release gate;
- egy `Pxx`, `Sx` vagy új workstream státusza/acceptance gate-je.

Ha egy fejlesztési pont státusza változik, a témaspecifikus kanonikus dokumentum mellett a `docs/DEVELOPMENT_PLAN_HU.md` megfelelő sorát is frissíteni kell.

Lezárt munkáról ne hozz létre újabb státusz-riportot, ha az információ beilleszthető a kanonikus dokumentumba vagy az Issue/PR történetbe.

## 7. Kötelező ellenőrzések

A változtatás jellegétől függően futtasd legalább a releváns ellenőrzéseket:

```bash
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm schemas
```

Ha létezik `pnpm docs:check`, dokumentációt érintő PR-ben az is kötelező. Infrastruktúra-, backup-, recovery- vagy security-változtatásnál a kapcsolódó célzott script/runbook ellenőrzések is szükségesek.

## 8. Agent task és handoff

Új vagy nagyobb Issue strukturálásához: `docs/agents/TASK_TEMPLATE.md`.

Félbehagyott vagy más agentnek átadott munkához: `docs/agents/HANDOFF_TEMPLATE.md`.

Review-hoz: `docs/agents/REVIEW_TEMPLATE.md`.

A repository a tartós projektmemória. Chat- vagy agentmemória nem source of truth.

## 9. Titkok és éles adatok

Tilos commitolni:

- API kulcsot, jelszót, recovery kulcsot;
- session/cookie/tokent;
- személyes tesztelői adatot, ha arra nincs explicit repository-szintű szükség;
- éles credentialt vagy visszafejthető secretet.

Dokumentációban példaértékeket, környezeti változóneveket vagy maszkolt azonosítókat használj.

## 10. Archivált anyag használata

`docs/archive/`, auditok, reportok és closure/checkpoint fájlok használhatók eredettörténet, mérés vagy korábbi döntési kontextus rekonstruálására, de nem írhatják felül a kanonikus dokumentációt.

Ha egy történeti dokumentum állítása újra aktuálissá válik, emeld át a megfelelő kanonikus dokumentumba; ne tedd vissza a történeti fájlt aktív source of truth státuszba.
