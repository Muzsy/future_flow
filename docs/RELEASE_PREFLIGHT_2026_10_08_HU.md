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

1. A külön üzemeltetői login rögzítve, az `info@alterward.com` továbbítása megerősítve; dedikált SMTP2GO-t a felhasználó Supabase-be kötötte, első meghívó spambe kézbesült. HTTPS alapértelmezés, pontos callbackek és nyolc angol HTML-sablon elmentve/visszaellenőrizve. Új kézbesítés/fejlécek, éles Auth callback és válaszút még hátravan. [Email-checkpoint](SMTP2GO_DELIVERY_CHECKPOINT_HU.md).
2. A tényleges más alkalmazások figyelembevételével szerverkarbantartás és a failed unitok vizsgálata; teljes tűzfal-/portellenőrzés, hozzáférésvesztést megelőző visszaállítási eljárással. A reboot jelzés nem jogosít automatikus újraindításra a többi alkalmazás ellenőrzése nélkül.
3. Friss titkosított proxy/config és Supabase alkalmazási `public` séma mentése, helyi offsite példányból valódi izolált restore sikeres: 97 tábla/1632 sor, 24 config fájl és Caddy adapt/validate egyezik. [Runbook és bizonyíték](CONTABO_BACKUP_RESTORE_RUNBOOK_HU.md). Teljes hosztolt Auth/grant restore, törölt adatok visszajátszása, retention/ütemezés és tényleges kiadási rollback még hátravan; a próba nem írta az éles DB-t.
4. A későbbi, 2026-10-09-i [Cloudflare-konfiguráció](CLOUDFLARE_ACCESS_CONFIGURATION_HU.md) kész: Free/OTP, owner Allow, fő app/AUD, apex/www és külön rights/asset kivétel védetten rögzítve. Supabase signup Off dashboard/settings proof; az origin runtime email/AUD bekötése és élő Access/Auth még hátravan. Ezután izolált Contabo-rehearsal, privacy/retention és végleges flag-mátrix.
5. Konkrét main commit részletes Claude Cloud-auditja, önálló finding-ellenőrzés és javítás; védett telepítés és külső pozitív/negatív próbák. Tesztelői meghívás és a 30 napos fizetett időszak csak ezt követi.
