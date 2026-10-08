# alterward — friss kiadási előellenőrzés

2026-10-08 · [Zárt indulási terv](CLOSED_SITE_RELEASE_PLAN_HU.md) · [Korábbi szerveraudit](CONTABO_SERVER_AUDIT_HU.md) · [Originvédelem](CLOSED_SITE_IMPLEMENTATION_REPORT_HU.md).

## Ellenőrzött tények

A 2026-10-08T20:02:50Z Contabo-próba kizárólag olvasási műveleteket végzett, a checkouton kívüli üzemeltetői kulccsal és a meglévő hostpinnel. A hostellenőrzést nem kapcsoltuk ki és nem cseréltünk hostkulcsot. A Windows szóközös pinfájljának SSH-opciója belső idézőjelezést igényel; a korábbi útmutatóban ezt pontosítottuk.

| Vizsgálat | Eredmény és korlát |
| --- | --- |
| SSH | Kulcsos kapcsolat sikeres; PasswordAuthentication és KbdInteractiveAuthentication no, root csak kulcsosan. |
| Futó alkalmazás | Hat konténer fut, alterward nevű konténer nincs. Éles alterward-telepítés nem történt. |
| Kapacitás | Körülbelül 4,8 GiB pillanatnyilag szabad memória és 78,5 GiB szabad root fájlrendszer. Ez kezdeti kapacitásadat, nem mért terhelési garancia. |
| Runtime | Docker 29.1.3; futó kernel 6.8.0-110-generic; reboot-required jelzés továbbra jelen van. |
| Tűzfal / service | UFW inaktív, két failed systemd unit. Ez nem teljes Docker/IPv4/IPv6/Contabo-tűzfalaudit vagy hibaok-vizsgálat. |
| Kapcsolati domain | Friss DNS-válaszban három Cloudflare Email Routing MX rekord szerepel. A webes A lekérdezés nem adott címet. Ez nem bizonyít kézbesítést az info@alterward.com címre vagy működő Auth SMTP-t. |

Szerver- vagy Cloudflare-módosítás, új AI-költés és meghívó nem történt. Magánkulcs, jelszó, API-kulcs vagy nyers auth token nem szerepel e riportban.

## Következő végrehajtási lépések

1. Üzemeltető belépési emailje és a kapcsolattartási továbbítás tényleges fogadó címe/működése tisztázandó. A public `info@alterward.com` cím önmagában nem az Access Allow identitása.
2. A tényleges más alkalmazások figyelembevételével szerverkarbantartás és a failed unitok vizsgálata; teljes tűzfal-/portellenőrzés, hozzáférésvesztést megelőző visszaállítási eljárással. A reboot jelzés nem jogosít automatikus újraindításra a többi alkalmazás ellenőrzése nélkül.
3. Friss, védett config/secret mentés és külön Supabase DB-mentés, izolált tényleges restore és rollback-bizonyíték; törölt adatok visszaállítási/retention kezelése. A régi hash-ellenőrzött másolat ezt még nem teljesíti.
4. Cloudflare Access team/app/AUD, explicit OTP és owner Allow, azonos origin email-lista; szűk rights/asset kivételek és Supabase signup/invite/recovery/SMTP. Ezután izolált Contabo-rehearsal, privacy/retention és végleges flag-mátrix.
5. Konkrét main commit részletes Claude Cloud-auditja, önálló finding-ellenőrzés és javítás; védett telepítés és külső pozitív/negatív próbák. Tesztelői meghívás és a 30 napos fizetett időszak csak ezt követi.
