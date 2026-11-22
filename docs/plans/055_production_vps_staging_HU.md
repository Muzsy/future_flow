<!--
status: active-supporting
owner: Ákos (döntések), Claude (megvalósítás)
created: 2026-11-22
related: 054_release_path_HU.md
-->

# 055 – Éles költözés új VPS-re, staging a régi gépen, image-tároló

> Váz a tulajdonosi döntésekkel (2026-11-22). A részletes lépések a 054 elkészülte után kerülnek ide.

## Döntések

- **Az éles oldal új, saját VPS-re költözik.** A mostani gép staging lesz, külön háttérrel; ezen a gépen fut más projekt (kereskedőbot, verloth, darts) is.
- **Új gép:** Contabo Cloud VPS 6 NVMe (2026): **6 vCPU, 12 GB RAM, 100 GB NVMe**.
- **Az image-tároló az új VPS-en lesz.** A KP7 (054 D5) ennek a tervnek a része: az image egyszer, a CI-ben épül, és pontosan az kerül stagingre, majd élesbe.

## Méretezés

- Az éles gép nem buildel és nem futtat próbát (KP7), csak kiszolgál és tárolja az image-eket; a CPU és a RAM ehhez bőven elég.
- **Lemez (szűk keresztmetszet):**
  - rendszer kb. 10 GB;
  - futó image-ek néhány GB;
  - tároló kb. 10–15 GB (egy image kb. 930 MB, a közös rétegekkel kevesebb);
  - mentések.
  - Kötelező: automatikus megőrzési szabály a tárolóban és a szerveren (054 KP6), riasztás 80%-os lemeztelítettségnél.
- **Tartalék:** a helyi build (lassabb) a tároló kiesésére megmarad.

## Javasolt elvek az image-tárolóhoz (a tulajdonos döntésére vár)

| #   | Kérdés             | Javaslat                                                                                                                         |
| --- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| K1  | Feltöltés a CI-ből | Saját aldomain (pl. `registry.alterward.com`) Cloudflare-proxy nélkül (a proxy kb. 100 MB-os kéréshatára miatt), saját TLS-sel   |
| K2  | Hozzáférések       | Külön, csak feltöltésre jogosult felhasználó a CI-nek (GitHub-secret); a szerver külön, csak letöltésre jogosult hozzáférést kap |
| K3  | Hitelesítés        | Saját aláírókulcs (cosign): a szerver csak aláírt, zöld CI-hez tartozó ujjlenyomatot fogad el                                    |
| K4  | Staging és éles    | Ugyanaz az ujjlenyomat előbb stagingre, majd élesbe                                                                              |
| K5  | Megőrzés           | A futó, a mentésekhez szükséges és az utolsó néhány kiadás image-e marad                                                         |
| K6  | Tároló kiesése     | A szerveres helyi build tartalék marad                                                                                           |
| K7  | Ellenőrzés         | A fence és a build-bizonyíték átírása külön PR, saját tesztekkel; az első kiadás teljes próbával és régi tartalékkal             |

## Sorrend

1. A 054 (kiadási út) kész és élesben.
2. Az új VPS beállítása: telepítők, Daily, recovery, health, tároló.
3. Az éles költöztetése próbával és rövid, bejelentett szünettel; Cloudflare-átirányítás.
4. A régi gépről az éles titkok törlése, és az éles titkok cseréje.
5. Staging a régi gépen: saját Supabase-projekt, Stripe tesztmód, külön AI-keret vagy szimulált AI; automatikus telepítés minden merge után.
6. KP7: CI-ben épített, aláírt image a tárolón keresztül, előbb stagingre, aztán élesbe.
