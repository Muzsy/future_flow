# Alter Jövő — biztonság, adatvédelem és compliance

> Ez fejlesztési és terméktervezési dokumentum, nem jogi tanács. Nyilvános indulás előtt adatvédelmi/jogi felülvizsgálat szükséges.

## 1. Miért kritikus?

A szolgáltatás együttesen kezelhet:
- személyes adatokat;
- családi és kapcsolati információkat;
- munkahelyi adatokat;
- személyiségjellegű profilozást;
- célokat és félelmeket;
- más személyekre vonatkozó adatokat.

Ez akkor is magas adatvédelmi érzékenységet eredményez, ha nem minden mező minősül különleges adatnak.

## 2. Privacy by design

Már az első adatmodellben legyen:
- adatminimalizálás;
- privacy default;
- consent-kezelés;
- export;
- törlés;
- retention;
- admin audit;
- pseudonymous relationship label;
- PII elkülönítés;
- AI-provider adatáramlás dokumentálása.

## 3. Adatminimalizálás

MVP-ben ne kérjünk automatikusan:
- vallást;
- politikai nézetet;
- szexuális életet;
- diagnózist;
- genetikai/biometrikus adatot;
- pontos bankszámla- vagy vagyonadatot;
- más személy teljes nevét.

Ha később ilyen mező szükséges, külön adatvédelmi felülvizsgálat kell.

## 4. Harmadik személyek

A user családtagokról és barátokról is írhat.

Tervezési szabály:
- alapértelmezett pseudonym label;
- „Barát A”, „Párom”, „Kolléga A”;
- UI-figyelmeztetés: ne adj meg szükségtelen személyes adatot másokról;
- free text redaction lehetőség.

## 5. AI-provider adatáramlás

Providerenként dokumentálni kell:
- milyen adat megy ki;
- hol dolgozza fel;
- tárolja-e;
- használja-e modellfejlesztésre;
- retention;
- DPA;
- subprocessor;
- EU-n kívüli adattovábbítás.

Promptba csak az adott taskhoz szükséges minimum adat kerüljön.

## 6. GDPR alapelvek

A rendszerterv igazodjon:
- jogszerűség, tisztességesség, átláthatóság;
- célhoz kötöttség;
- adattakarékosság;
- pontosság;
- korlátozott tárolhatóság;
- integritás és bizalmas jelleg;
- elszámoltathatóság.

## 7. Jogalap

Feature-önként meg kell határozni.

Különösen:
- core service;
- analytics;
- marketing;
- community publication;
- opcionális profilfinomítás;
- AI-provider továbbítás.

Ne legyen egyetlen „mindenhez hozzájárulok” checkbox.

## 8. Consent

Ahol szükséges, legyen külön:
- terms acceptance;
- privacy acknowledgement;
- optional AI enrichment;
- community publication;
- marketing;
- kutatás/model improvement, ha egyáltalán lesz.

Consent:
- verziózott;
- timestampelt;
- visszavonható.

## 9. AI-transzparencia

A user mindig tudja:
- AI-val interaktál;
- generált tartalmat lát;
- a jövő szcenárió;
- milyen adatkategóriákból épül;
- a történet és a valós profil külön dolog.

## 10. Automatizált döntéshozás

Az Alter Jövő ne hozzon jelentős joghatású döntést.

Ne használjuk:
- hitelképességre;
- foglalkoztatási döntésre;
- biztosításra;
- jogosultságra;
- emberi értékpontszámra.

## 11. EU AI Act

2026-ban az EU AI Act több rendelkezése már alkalmazandó, köztük bizonyos AI-transzparencia-követelmények.

Termékminimum:
- egyértelmű AI-identitás;
- generált tartalom jelölése;
- tiltott manipulatív gyakorlatok kerülése;
- user agency;
- dokumentált AI use-case inventory.

A konkrét jogi besorolást launch előtt szakértővel kell ellenőrizni.

## 12. Kiskorúak

MVP-javaslat:
**18+ szolgáltatás.**

Ez csökkenti:
- consent-komplexitást;
- gyermekvédelmi kockázatot;
- érzékeny narratív problémákat.

## 13. Threat model

### Account takeover
- modern auth;
- re-auth törlés/export előtt;
- session management;
- MFA később.

### Broken object authorization
- minden resource ownership check;
- RLS defense-in-depth;
- UUID nem authorization.

### Prompt injection
- user text adatként;
- tool whitelist;
- schema output;
- provider key csak szerveren.

### Data exfiltration
- least privilege;
- secrets manager;
- no PII in logs;
- admin audit.

### Scraping
- rate limit;
- signed share links;
- public API-k korlátozása.

## 14. Titkosítás

- TLS;
- managed DB encryption at rest;
- storage encryption;
- secrets nem repo-ban;
- külön production credential.

Később érzékeny mezőknél application-level encryption mérlegelhető.

## 15. Logok

Logba ne kerüljön:
- teljes profil;
- raw prompt;
- auth token;
- jelszó;
- érzékeny free text.

Helyette:
- opaque id;
- task type;
- hash;
- error code.

## 16. Admin

Admin UI:
- role-based;
- minimális adat;
- audit log;
- support access indokolt esetben;
- ne legyen szabad „profilböngésző”.

## 17. Retention

Minden adattípusnak legyen policy:
- aktív account;
- deleted account;
- AI run;
- job;
- community;
- analytics;
- backup.

## 18. Backup

- titkosított;
- retention;
- restore teszt;
- törölt adat backup-életciklusa dokumentált.

## 19. User rights UX

Önkiszolgáló:
- adatletöltés;
- profil javítás;
- community visibility;
- account delete.

## 20. Safety copy

Minden future-nél:
> „Ez egy AI által készített lehetséges forgatókönyv, nem előrejelzés.”

Nagy súlyú témánál:
> „A szcenárió nem szakmai tanács.”

## 21. Tiltott termékmechanikák

- félelemkeltő retention;
- „ha nem térsz vissza, rosszabb lesz a jövőd”;
- trauma engagementért;
- sérülékenységre épülő upsell;
- kényszerítő social comparison;
- public profile default.

## 22. Release security checklist

- dependency scan;
- SAST;
- authz integration test;
- RLS test;
- rate limit;
- secret scan;
- CSP;
- CORS;
- secure headers;
- session review;
- backup restore test;
- delete test;
- export test;
- AI-provider privacy review;
- incident contact.

## 23. DPIA

A profilozás mélysége miatt korán meg kell vizsgálni, szükséges-e adatvédelmi hatásvizsgálat (DPIA).

## 24. Incidenskezelés

Legyen:
- severity;
- felelős;
- log preservation;
- key rotation;
- affected user scope;
- notification decision;
- postmortem.
