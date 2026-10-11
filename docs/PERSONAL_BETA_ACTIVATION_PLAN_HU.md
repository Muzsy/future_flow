# alterward — a személyes béta bekapcsolásának terve

2026-10-11 · [Kiadási sorrend](NEXT_STEPS.md) · [Két tesztkör](BETA_ROLLOUT_SEQUENCE_HU.md) · [Tulajdonosi konfiguráció](CLOSED_SITE_OWNER_RELEASE_MATRIX_HU.md).

Az angol tulajdonosi oldal a Contabón fut. A személyes béta nem pusztán új emailek hozzáadása: a Cloudflare-kapu, az origin, a Supabase-fiók, a fizetett UUID-lista és a rögzített költségidőszak egymástól külön védelem. A tesztelők névsora az üzemeltetőtől a műszaki előkészítés után érkezik. Előkészítéskor nem hozunk létre helyettesítő felhasználókat és nem indítjuk el a harminc napot.

## Identitások nélkül elvégezhető munka

1. Végső összesített Claude Cloud forrásaudit és minden igazolt kiadási hiba javítása. A pontos commit CI-je és szükséges izolált célpróbája külön bizonyíték. Az audit nem helyettesít éles jogosultsági ellenőrzést.
2. Külön személyesbéta-konfigurációs előkészítő és visszaállítási eljárás. A jelenlegi `contabo-owner-upgrade` kizárólag image-cserét enged; tesztelői env-, Access- vagy keretmódosításra nem használható. Az eredeti ellenőrzéseit nem lazítjuk meg.
3. A candidate a jelenlegi, hash-ellenőrzött root-only env/manifest/frozen Compose állapotból készül. Csak előre meghatározott személyesbéta-mezők térhetnek el; ugyanaz az app-image, CA, origin JWT-team/AUD, szolgáltatások, erőforrások, hálózatok és közös proxy marad. A publikálási/operator/Shared funkciók és külső kitettség tiltottak.
4. A teljes candidate újrarenderelése, worker-only providerellenőrzés és pontos API/worker-lista/keret egyezés. A személyes élet/folytatás, Official fork és Scenario-start szükséges flagfüggőségei külön ellenőrzendők; olvasható katalógus nem bizonyít engedélyezett továbbindítást.
5. Tartós előkészítési/apply-napló, ismételt alkalmazás/drift/megszakítás elutasítása; saját szolgáltatásokra korlátozott váltás és hibánál ellenőrzött rollback. A monitor, napi/managed mentés és privacy-recovery előellenőrzés az új állapotot is helyesen kell kezelje. Régi env vagy manifest vak szerkesztése nem aktiválás.
6. Szintetikus, nulla költésű fixture: jogosulatlan és visszavont UUID, több mint tíz fő, eltérő listák/keretek, lejárt vagy meghosszabbított időszak, nem workerben lévő kulcs, Shared/exposure és idegen konfiguráció elutasítása; sikeres váltás és kikényszerített post-check-hibából helyreállítás. A célpróba nem használ éles adatot vagy valódi providert.

Ez a konfigurációváltó és saját célpróbája még fejlesztési kapu. Az első owner-aktiváló és az image-only frissítő sikeres próbái önmagukban nem igazolják.

A külön policy már olvasói candidate-ot is készít: csak az origin két emaillistája változhat, UUID/kulcs/keret/indulási flag marad inaktív. Ez lehetővé teszi a tényleges első belépést a fizetett UUID-aktiválás előtt. A tényleges overlayvel külön HTTP-olvasói próba sikeres (saját draft/feedback/export; idegen branch és tizenkét paid-entry elutasított, queue/költségleltár változatlan). A későbbi fizetett candidate csak az ellenőrzött olvasói névsorhoz egyező identitáspárokból készülhet. Kilenc regresszió sikeres; az éles Access, szerverfájl, manifest és szolgáltatásváltás még nincs bekötve. A [generálási korlát javítása](GENERATION_LIMIT_HARDENING_HU.md) külön igazolt auditfinding, kiadása megelőzi a fizetett starts bekapcsolását.

## Tényleges résztvevőkhöz kötött sorrend

1. Legfeljebb tíz kifejezetten kiválasztott emailcím. Cloudflare Access és az origin név szerinti listája egyezzen; nyílt signup marad tiltott. Meghívó küldése a konkrét címzettekre szóló üzemeltetői utasítással történik.
2. Saját Supabase-fiók és HTTPS-belépés; a kiküldött meghívók címzettenkénti kézbesítési ellenőrzése. Az angol `Alterward` feladó és `info@alterward.com` mellett előre jelezzük a spam mappa ellenőrzését. Nincs automatikus ismételt levélküldés.
3. Friss, csak olvasott Auth/application egyeztetés: pontos email–UUID párok, aktív fiók, nincs tiltás/törlés, korábbi Shared-tagság vagy megtanult Shared-emlék. Email nem kerül a fizetett UUID-listába, azonosítók és kulcsok nem kerülnek nyilvános riportba.
4. Pontos candidate és operátori ellenőrzés után egyszeri rögzített UTC kezdő/záróidő, pontosan harminc nap. Maximum 2 USD OpenAI, a külön fenntartott Claude-audit rész maximum 1 USD; a közös személyes plafon 0,50 USD. A jelenlegi személyes worker OpenAI-t használ; Claude-tartalékból nem vezetünk be automatikusan új szolgáltatót. Az összes jóváhagyott induló költés és előállítási napló megmarad. [Költségszabály](AI_PRODUCTION_BUDGET_HU.md).
5. Aktiválás után tényleges origin/anon tiltás, megengedett és nem megengedett fiók, személyes paid-entry, worker és monitor ellenőrzés. Az első valós AI-folyamat a jóváhagyott használati keretből, költségnaplóval indul; előtte nincs providerhívás.
6. Meghívott résztvevővel saját élet → döntés → folytatás, Official fork és Scenario-start, saját export/törlés, visszajelzés. A tényleges személyes béta indulási idejét és konfigurációbizonyítékát külön rögzítjük; nem hosszabbítjuk újraaktiválás vagy hiba miatt.

## Megmaradó korlátok

A hosztolt Supabase-projekt teljes elvesztésekor az oldal zárva marad és kézzel épül újra; a teljes Auth/MFA/settings helyreállítás nem próbált, az üzemeltető a személyes bétára elfogadta. A törlésvédett held replay/független ellenőrzés és az izolált worker-kiesési bizonyíték ettől külön lezárt kapuk. Fizikai host-reboot és éles, aktív jobot futtató worker megölése nincs igazolva.

A Gmail inbox-kézbesítés nem garantált. Shared és a későbbi öt páros teszt külön privacy/retention/monitor/audit kiadás; a teljes P01–P13 és S0–S7 terv megmarad. Tíz fő feletti bővítés, új keret és automatikus időszak-megújítás nincs engedélyezve.
