# alterward — korlátozott külső állapotfigyelés

2026-10-10 · [Külső HTTPS-monitor](EXTERNAL_AVAILABILITY_MONITOR_HU.md) · [Kiadási sorrend](NEXT_STEPS.md).

## Előkészített működés

A [szerveres projekció](../scripts/ops/contabo-health-projection.py) a már telepített napi monitor pontos forráshashéhez kötött, védett státuszait olvassa. Kizárólag kilenc igaz/hamis ellenőrzést, az ellenőrzés idejét és a projekció forráshashét adja vissza. Felhasználói adatot, konfigurációértéket, SQL-t, mentést, hibaszöveget vagy kulcsot nem küld ki.

Az ellenőrzések: telepített forrásazonosság; fél óránál frissebb monitor; legfeljebb 26 órás sikeres mentési státusz; saját worker/runtime egészsége; adatbázis TLS-ellenőrzése; Access/origin határ; mentés frissessége; legalább 2 GiB szabad lemez; legalább harminc napig érvényes origin tanúsítvány. A monitor még a **tulajdonosi, AI-jogosultság nélküli konfigurációt** ellenőrzi. Bétaaktiválás előtt a napi monitor jogosultság- és queue-elvárását is frissíteni és újra auditálni kell; egy normális béta-job nem válhat hibajelzéssé.

A részletes booleanok friss, forrásazonos státuszban egy összesített monitorhiba mellett is segítik a diagnózist. Az összesített monitorhiba továbbra hibajelzés: nem lesz hamis pozitív siker egy váratlan konténerállapot-változásból. Nem friss vagy nem forrásazonos státusz egészséges értékként nem fogadható el.

## Hozzáférési korlát

A [külön telepítő](../scripts/ops/contabo-health-install.py) új Ed25519 publikus kulcshoz kizárólag a rögzített egészségprojekció futtatását engedi. A kulcs `restrict`, kötelező parancs és legfeljebb kilencven napos érvényesség mellett működik; nincs shell, PTY, forwarding, agent/X11 vagy user RC. A projekció csak az `alterward-health-v1` kérést fogadja. Más parancs kilenc hamis értéket és hibakódot kap, privát adat olvasása nélkül.

A telepítő az összes meglévő SSH-kulcsot megőrzi, a projekciót a publikus kulcs aktiválása előtt tartósan kiírja. Az `authorized_keys` módosítás privát tempfájlban, fsync és az eredeti fájl azonosságának újbóli ellenőrzése után atomikus cserével készül. Eltérő meglévő monitor-hozzáférés/forrás nem íródik felül. Nincs alkalmazás-, proxy-, firewall-, globális sshd- vagy timer-változtatás. A szerver csak a publikus új kulcsot kapja; a jelenlegi operátori privát kulcs nem kerül a GitHubra.

A [GitHub-kliens](../scripts/private-health.mjs) a külön monitor-identitást, origin címet és hostpint repository secretből kapja, kizárólag a manuális/ütemezett workflow adott lépésében. A végrehajtó pontos, ellenőrzött hostpint, külön identitást, kizárólag publikus kulcsos autentikációt és rögzített Ed25519 hostkey algoritmust követel; agentet, jelszót, általános SSH-konfigurációt vagy hostkey-frissítést nem használ. Húsz másodperces/16 KiB korlát és pontos JSON-envelope/hash/frissesség ellenőrzés van. A privát tempkulcs törlődik; nyers SSH-válasz vagy hiba nem kerül logba. A GitHub natív sikertelenfutás-email útját a korábbi, külön Inbox-kézbesítési próba igazolta.

## Bizonyíték és aktiválási állapot

A **8dab524** forrás tizenegy tényleges Linux fixture-próbája sikeres, kihagyás nélkül; hét Node envelope/credential-próba sikeres. A tényleges, kizárólag olvasási Contabo-próba kilenc igaz bitet adott; saját fixture-ek eltakarítva, kilenc futó konténer teljes állapota/image/restart/port változatlan. A külön kulcs helyben, védett titokkönyvtárban előkészítve, a telepítő valódi `check` módja sikeres. Új GitHub-secret, monitor-hozzáférés és opt-in flag **még nincs aktiválva**.

A 6c7893e statikus Claude-audit szűk aktiválást blokkoló forráshibát nem talált. PH-01 diagnosztikai összecsatolása javítva, PH-02 originadatok secretbe kerülnek, PH-03 SSH-opciók szigorítva, PH-04 végső newline normalizált. A 8dab524 pontos javításdeltát Claude elfogadta; a normalize-before-validation utolsó PH-04 pontosítását a 967df56 kliens és két új regresszió kezeli. A 8dab524 teljes verify/container CI sikeres (38071346257); az utolsó kliensdelta pontos ellenőrzése folyamatban. A forrásaudit nem tényleges GitHub/SSH-kapcsolati vagy béta-készenléti bizonyíték.

Aktiválási sorrend: új korlátozott hozzáférés és három GitHub-secret jóváhagyása; pontos installer `install`; külön identitással sikeres eredeti health-kérés és elutasított idegen parancs; secretek titkosított API-bekötése; opt-in flag; kézi, majd tényleges ütemezett Actions-próba. Sikertelen részlépésnél a flag kikapcsolt marad, a projekció nem indít más szolgáltatást. A tesztelők, Access-listák, AI-keret és harmincnapos bétaidőszak nem aktiválódnak ettől.

## Üzemeltetés és rotáció

Az új hozzáférés előkészített lejárata **2027-01-08 UTC**. Legkésőbb hét nappal előtte operátori ellenőrzés és szükség esetén ugyanolyan korlátú új kulcs kell. Lejárat után az SSH-kérés zártan hibázik; a külső Actions-futás jelez, ha maga a GitHub-futás és emailút elérhető.

Rotációkor az operátor előbb az új korlátozott kulcsot és pontos parancsot ellenőrzi, majd az eredeti fájlazonosságot őrző, ellenőrzött módosítással cseréli kizárólag a `alterward-readonly-health` sort. A többi tulajdonosi kulcs megmarad. Csak sikeres tényleges health/idegenparancs próba után kerülhet az új privát monitor-kulcs a GitHub-secretbe; a régi monitor-kulcs jogosultsága visszavonandó. A mostani telepítő eltérő sor esetén szándékosan megáll, nem végez implicit rotációt. Félbeszakadt `health.py` írásnál nincs automatikus újrapróba: az operátor pontos Git-byte-ra ellenőrzi és javítja a privát fájlt, majd új `check` kell.

Az óránkénti poll a helyi negyedórás monitorra támaszkodik, ezért hibajelzési késés lehet. GitHub-kiesés, elfogyott included Actions-keret, kimaradt schedule és email-spam mellett nincs garantált jelzés. A megerősített 0 USD Actions-budget/stop változatlan; a monitor nem használja a 10 USD alkalmazási AI-keretet. A friss státusz/hash nem védi ki a már kompromittált root host hamis állítását. Retention-, hosted restore-, writer-fence- és teljes hibaút-kapuk külön megmaradnak.
