# alterward — a mentési életciklus aktiválási bizonyítéka

2026-10-11 00:53 UTC · [Aktuális sorrend](NEXT_STEPS.md) · [Működés és korlátok](RECOVERY_LIFECYCLE_AUTOMATION_HU.md) · [Hosztolt helyreállítás](SUPABASE_RECOVERY_COVERAGE_HU.md).

A szerveres napi és külön managed/történeti mentési életciklus **1525943697c6dc9d407c7051ba673d62fb15a0ee** forrással aktív. Az alkalmazás továbbra 9eb7732; a tesztelői jogosultság, fizetett AI és a harmincnapos bétaidőszak inaktív. A feladat nem változtatta meg az Access-, DNS-, tanúsítvány- vagy általános SSH-beállításokat.

## Tényleges ellenőrzések

| Kapu                    | Bizonyíték                                                                                                                                                                                                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Forrás és audit         | 65 tényleges Linux célpróba, kihagyás nélkül; Windows attestation- és pinpróba; pontos Claude Cloud-delta; [verify/container CI](https://github.com/Muzsy/future_flow/actions/runs/38087321460) sikeres.                                                         |
| Napi alkalmazásmentés   | A javított forrás tényleges capture-je és helyi titkosított másolata elkészült. 2026-10-11 00:49 UTC izolált offsite restore: 97 tábla, 1633 sor, 55 konfigurációfájl egyezik; sérült ciphertext elutasítva.                                                     |
| Managed capture         | Tényleges systemd-futás 00:44 UTC: ellenőrzött DB TLS, repeatable-read exportált snapshot és független HTTPS-idő. Eredeti capture-határ 2026-10-11T00:44:14.070988Z, eredeti expiry 2026-10-18T00:44:14.070988Z.                                                 |
| Managed offsite restore | Mind a 35 Auth/Storage tábla és 171 megőrzött sor hash-e egyezik. A 97 public tábla adat nélkül, teljes vizsgált szerkezeti/grant/RLS digest egyezik; ephemerális token/upload adatok üresek.                                                                    |
| Megszakítás             | Egy kizárólag saját, szintetikus process tényleges SIGKILL-je után a következő valódi systemd-futás eltakarította a saját scratch/pending fájlokat és elkülönített klienst. Eredeti manifestbyte-ok és capture-dátumok változatlanok; valódi archívum törlése 0. |
| Helyi feladatok         | A meglévő napi másoló és az új managed recovery task tényleges Windows-feladatindítása eredmény 0. Managed sync 00:50 UTC: három friss csomag, teljes kétoldali egyezés és szerveres siker-attestation. Napi sync 00:53 UTC: hét helyi titkosított archívum.     |
| Automatikus futás       | Mindhárom saját szervertimer enabled/active. A recovery timer tényleges első futása 00:52 UTC sikeres; új capture nem kellett, az eredeti időpont változatlan.                                                                                                   |
| Külső figyelés          | Ugyanazzal a korlátozott SSH-kulccsal kilenc pozitív bit; tetszőleges parancs elutasítva. [A telepítés utáni GitHub-próba](https://github.com/Muzsy/future_flow/actions/runs/38099870141) publikus és korlátozott privát lépése sikeres.                         |

A külön Windows-task az óránkénti UTC :11 és belépési triggerrel, az eredeti felhasználó korlátozott jogával működik. A felügyelt javítás csak egy forráspint cserélt a meglévő 46 elemű pinlistában; eredeti wrapper megőrizve, task XML/principal/schedule változatlan. A tényleges indítás a Windows feladatkezelőjén keresztül történt; az új task következő óránkénti triggerének futását ez az időponti riport még nem igazolja. A régi napi wrapper nem igényelt változtatást.

## A javítás és az észlelt jelzés

A PG17 image alapértelmezett PGDATA volume-ja egy megszakadt dumpkliensben írható anonymous mountot hozott létre. A szigorú takarítás ezt elutasította. A napi és managed dumpkliensek pontos, csak olvasható 1 MiB tmpfs override-ot kaptak; a célgépi mount-próba és a megismételt SIGKILL-próba sikeres. A validator és a takarítás scope-ja nem bővült. A kizárólag saját, azonosított szintetikus kliens eredeti, üres volume-ját külön ellenőrzött operátori javítás távolította el; idegen volume nem változott.

A source-only recovery javítás az eredeti 6a61b95 forrásból kizárólag a managed.py ezen argv-deltáját és kötését frissítette. Az eredeti config/capture/status metadata megőrizve; a korábbi archívumok és dátumuk nem módosultak. A javítás után új tényleges capture készült. A napi mentés saját timerei a felügyelt frissítés idejére szüneteltek, majd a friss izolált restore után újra aktiválódtak.

A [23:36 UTC ütemezett figyelés](https://github.com/Muzsy/future_flow/actions/runs/38095585971) a karbantartás közben hibát jelzett a privát egészségprojekción; a publikus hozzáférési ellenőrzés sikeres volt. Ezt a negatív bizonyítékot megtartjuk. A javítás és aktiválás utáni kézi próba sikeres; az új forrás következő tényleges GitHub schedule-jét a riport nem állítja sikeresnek. A korábbi tényleges schedule és az értesítés Inbox-kézbesítése külön már igazolt.

## Megmaradó határok

A hét napos retention eredeti manifest- és naplóhatárral működik, nincs dátumhosszabbítás. Az első valódi lejárat későbbi; ebben a szeletben valódi lejárt archívum/történeti run törlése 0. A recovery-required marker tartós: eltűnt lifecycle-root a backup biten hiba, nem csendes kikapcsolás. A monitor ugyanazt a kilenc boolean vetületet adja; kulcs, authorized_keys, forced command és eredeti 2027-01-08T17:20:44Z lejárat változatlan.

Minden ideiglenes restore-konténer és plaintext eltávolítva; a meglévő kilenc futó és tíz összes konténer állapota változatlan. A visszafejtő kulcs kizárólag memóriában jelent meg a próbához, nem került szerverlemezre. Üzenet, Auth- vagy éles adatbázisírás, alkalmazási AI-hívás 0.

Ez **nem teljes hosted Auth-helyreállítás**: GoTrue/login/MFA nem indult, ownership/globális role/Vault/SMTP és külső fájlobjektumok kapui megmaradnak. A karanténos privacy-replayhez még valós authority/fence és kiszolgálási ellenőrzés kell; nincs automatikus restore vagy promotion. Béta-kompatibilis runtime-monitor, további célzott hibaút és a végső teljes béta-audit követi. Tesztelőket a műszakilag kész oldal után hívunk.
