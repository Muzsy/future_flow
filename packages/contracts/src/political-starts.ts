type PoliticalSubtype = 'local' | 'organization' | 'staff' | 'civic';

type PoliticalStart = {
  id: string;
  subtype: PoliticalSubtype;
  hu: string;
  en: string;
  huDescription: string;
  brief: string;
};

// Released entries are immutable. A revised rendering can keep the same issue
// identity, which is independent of the version and of the displayed title.
export const politicalStarts: readonly PoliticalStart[] = [
  {
    id: 'pol.transit_renewal',
    subtype: 'local',
    hu: 'Két buszjárat, egy szerződés',
    huDescription:
      'Lejár két támogatott járat szerződése, és az új ajánlatok alapján a testület csak az egyiket tudja a jelenlegi szinten megújítani. A hajnali járat műszakkezdéshez igazodik, a másik a falvakból tesz lehetővé oda-vissza utat a piacra.',
    en: 'Two bus routes, one contract',
    brief:
      'Two contracts expire. The local council can renew only one service at its current level. The early route serves shift workers and the other gives outlying villages a same-day return from market. As a councillor you can investigate journeys and propose a motion before offers expire. The council decides together.',
  },
  {
    id: 'pol.market_relocation',
    subtype: 'local',
    hu: 'A piac költözése',
    huDescription:
      'A csarnok felújítása alatt két ideiglenes helyszín merül fel. A vasútállomásnál megmaradna a gyalogos vevőkör, de az árusok nehezen rakodnának.',
    en: 'Moving the market',
    brief:
      'Renovations displace a market ahead of its busy season. A central site preserves foot traffic but complicates deliveries. An outer site handles deliveries and refrigeration but is harder for regular customers to reach. As a councillor you can inspect sites and propose lease conditions before commitments are signed.',
  },
  {
    id: 'pol.school_construction',
    subtype: 'local',
    hu: 'Építkezés az iskola mellett',
    huDescription:
      'A fejlesztő időben akarja elkezdeni a munkát, az iskola pedig a reggeli és délutáni gyalogos útvonalat szeretné szabadon tartani. A munkakezdés előtt a testület az önkormányzati útszakasz ideiglenes használatának feltételeit tárgyalja.',
    en: 'Construction next to the school',
    brief:
      'Construction is about to begin alongside a school. The builder needs predictable access while families want to keep the walking route clear at arrival and dismissal. The council sets conditions on use of its road. You can propose delivery times or a usable detour before work starts.',
  },
  {
    id: 'pol.street_renaming',
    subtype: 'local',
    hu: 'Amikor az utca neve megoszt',
    huDescription:
      'Egy helyi csoport névváltoztatást kezdeményez, más lakók a megszokott címet és a hozzá kötődő emlékeket védenék. A város címtáblákat rendel, a napirendre vett indítványról a megrendelés előtt kell állást foglalni.',
    en: 'A street name divides the town',
    brief:
      'Residents disagree about a proposed street rename, balancing public memory and meaningful participation against continuity and the burden of changing addresses. A sign order is due. As a councillor you can seek a hearing, propose a modification or move the timing of the decision.',
  },
  {
    id: 'pol.bridge_closure',
    subtype: 'local',
    hu: 'A lezárt gyaloghíd',
    huDescription:
      'Egy műszaki vizsgálat után azonnal lezárják a két városrészt összekötő gyaloghidat. Az ideiglenes pótlás gyorsan rövidítené a kerülőt, de a fedezetét egy már vállalt kerületi felújításból kellene átcsoportosítani.',
    en: 'The closed footbridge',
    brief:
      'An inspection forces a footbridge between districts to close. Restoring safe access will take time. An interim crossing or route would help residents now but could draw funding from a promised repair elsewhere. At an emergency meeting you can propose temporary access or phased funding. The safety closure stands.',
  },
  {
    id: 'pol.ally_audit',
    subtype: 'local',
    hu: 'Egy régi szövetséges hibás elszámolása',
    huDescription:
      'Egy ellenőrzés hiányosságokat talál egy támogatott egyesület elszámolásában. Az egyesület korábban a képviselő egyik ügyét is támogatta.',
    en: 'An ally faces a grant audit',
    brief:
      'An audit finds gaps in a grant report from an association that once supported your work. Other applicants expect equal treatment and a local programme may be interrupted. Disclose your connection and, where permitted, propose the same review or correction process available to others. The committee decides.',
  },
  {
    id: 'pol.chamber_election',
    subtype: 'organization',
    hu: 'Ki képviselje a tagságot?',
    huDescription:
      'Két jelölt indul a szakmai kamara vezetéséért. Az egyik több beleszólást ígér a kisebb tagszervezeteknek, a másik a széthúzó bizottságok gyorsabb döntését vállalja.',
    en: 'Who represents the members?',
    brief:
      'Two candidates for chamber leadership offer broader representation and quicker decisions respectively. You have worked with both groups. Before nominations close, you can endorse, seek commitments or request a debate. Members elect their leader and your working relationships survive the vote.',
  },
  {
    id: 'pol.bargaining_mandate',
    subtype: 'organization',
    hu: 'Egyéni vagy közös tárgyalás',
    huDescription:
      'Egy beszállító kedvezőbb feltételeket ajánl a nagyobb tagszervezeteknek, ha külön szerződnek. A kisebbek a közös beszerzési tárgyalástól remélnek jobb alkupozíciót.',
    en: 'Separate deals or a shared mandate',
    brief:
      'A supplier offers bigger members favourable separate terms. Smaller members rely on collective negotiations. You can propose a negotiating mandate or seek an alternative before the offer expires. An immediate saving could weaken the association’s future bargaining position.',
  },
  {
    id: 'pol.accreditation_rules',
    subtype: 'organization',
    hu: 'Az akkreditáció feltételei',
    huDescription:
      'Egy szakmai szövetség megújítja saját minősítési rendszerét. A megrendelők következetesebb szakmai ellenőrzést szeretnének, a kisebb tagszervezetek az új adminisztráció és díjak miatt kerülhetnek hátrányba.',
    en: 'The accreditation rules',
    brief:
      'Clients want the association to make its accreditation checks more consistent. Smaller practices face new fees and paperwork. Before the renewal notice, you can propose a pilot, staged requirements or an equivalent way to show competence. The association decides what its accreditation will mean.',
  },
  {
    id: 'pol.jury_conflict',
    subtype: 'organization',
    hu: 'A díj zsűrije',
    huDescription:
      'Egy szakmai díj döntőjében egy zsűritag korábbi munkatársa is szerepel. A tag szakértelmére szükség van, a többi pályázó viszont hiteles eljárást vár.',
    en: 'A conflict on the prize jury',
    brief:
      'A juror once worked closely with a finalist. Other applicants expect an impartial process, but the jury needs the member’s expertise. Before scoring closes, you can ask for disclosure, a restricted role or a replacement. The award remains a collective decision.',
  },
  {
    id: 'pol.merger_terms',
    subtype: 'organization',
    hu: 'Egyesülés vagy önállóság',
    huDescription:
      'Két helyi tagszervezet közösen fizetne adminisztrációt és szakmai szolgáltatásokat. Az egyik pénzügyi biztonságot keres, a másik attól tart, hogy elveszíti a helyi programjai fölötti döntést.',
    en: 'Merge or stay independent',
    brief:
      'Two chapters seek to share costs. One needs financial stability, the other wants to keep control of local programmes. Before their annual budgets, you can propose shared services or negotiated local discretion. Members decide how much independence to give up.',
  },
  {
    id: 'pol.mentor_guidance',
    subtype: 'organization',
    hu: 'A mentor elavult útmutatója',
    huDescription:
      'Egy új szakmai felülvizsgálat több ponton elavultnak találja azt az útmutatót, amelyet a testület tekintélyes alapítója, a főszereplő egykori mentora írt. Az útmutatót használók gyors és világos javítást várnak, a testület tagjai a korrekció szakmai elfogadottságát és a mentor együttműködését féltik.',
    en: 'Your mentor’s outdated guidance',
    brief:
      'A review finds outdated guidance written by your former mentor. Users want a prompt correction and colleagues want cooperation from its respected author. Before the next edition closes, you can propose a documented correction, joint revision or independent review. The board approves the outcome.',
  },
  {
    id: 'pol.handover_report',
    subtype: 'staff',
    hu: 'A jelentés a vezetőváltás előtt',
    huDescription:
      'Két részleg eltérően értelmezi egy belső eredményjelentés adatait, a leköszönő vezető pedig még az átadás előtt lezárná a vitát. Az új vezetésnek beszámolóra van szüksége, az érintett munkatársak szeretnék, ha a fenntartásaik szerepelnének.',
    en: 'The disputed handover report',
    brief:
      'Two departments disagree about the findings of an internal report. The outgoing leader wants closure and the incoming team needs reliable evidence, including substantive objections. As an aide you can verify claims and recommend a handover format before the transition. The leader authorizes it.',
  },
  {
    id: 'pol.service_reductions',
    subtype: 'staff',
    hu: 'A vágás két címzettje',
    huDescription:
      'Egy bevételkiesés miatt a következő költségvetésben választani kell az esti ügyfélszolgálat és a terepi segítség között. Az egyik program vezetője korábbi egyeztetés alapján már folytatásra készül.',
    en: 'Two services face cuts',
    brief:
      'A revenue shortfall puts evening service and field assistance in competition. One programme expects to continue owing to earlier talks. You prepare the hearing and can advise on who is heard, assessment criteria and an orderly transition. The budget decision belongs to the authorised body.',
  },
  {
    id: 'pol.leaked_draft',
    subtype: 'staff',
    hu: 'Más került a tervezetbe',
    huDescription:
      'A sajtóban megjelenik egy korai tervezetrészlet, amelyből hiányzik egy fontos feltétel. Az érintettek kész döntésként olvassák, a vezető gyors közlést akar, a szakmai stáb előbb helyreállítaná az egyeztetést.',
    en: 'The leaked draft was incomplete',
    brief:
      'An early extract becomes public without a material condition. Affected people assume it is final. The leader wants a quick explanation and staff want consultation restored. You can verify the versions and recommend an order for correction and consultation before the briefing.',
  },
  {
    id: 'pol.public_promise',
    subtype: 'staff',
    hu: 'A vezető tarthatatlanná vált ígérete',
    huDescription:
      'A vezető korábban nyilvánosan megígérte egy szolgáltatás indulási napját. A friss adatok szerint a teljes indulás addig szakmailag nem készülhet el.',
    en: 'A promise the leader cannot keep',
    brief:
      'New evidence rules out full delivery on a publicly promised date. Users have already arranged travel or time off, and staff ask for a workable schedule. You can recommend a candid revised timetable or a genuinely deliverable partial launch. The leader approves any announcement.',
  },
  {
    id: 'pol.sponsor_conditions',
    subtype: 'staff',
    hu: 'A támogatás látható feltétele',
    huDescription:
      'Egy külső támogató fedezné a szolgáltatás bővítését, ha a program viselné a nevét, és rendszeres beszámolót kapna. A működtetőknek szükségük van a forrásra, a szakmai partnerek a szolgáltatás függetlenségét féltik.',
    en: 'Funding with visible strings',
    brief:
      'A sponsor would fund an expansion in exchange for naming rights and regular reports. Operators need resources and partners worry about independence. Before the offer expires, you can clarify reporting limits or negotiate different terms. Leadership decides whether to accept.',
  },
  {
    id: 'pol.ally_complaint',
    subtype: 'staff',
    hu: 'Belső panasz egy fontos szövetséges ellen',
    huDescription:
      'Eljárási visszaélésről érkezik panasz egy tisztségviselő ellen, akinek támogatása fontos a közelgő szavazáson. A panaszt a kijelölt független csatorna kezeli bizalmasan, a vizsgálat menetét az ülés és az alku nem befolyásolhatja.',
    en: 'A complaint against an ally',
    brief:
      'An independent channel handles a confidential complaint against a key voting ally. Its work stays independent of the vote. As an adviser, you can recommend what procedural information leadership needs and how to plan for the vote without relying on the ally. The issue is trust and whether a political commitment can still be kept.',
  },
  {
    id: 'pol.pilot_terms',
    subtype: 'civic',
    hu: 'Mit ér a próbaidő?',
    huDescription:
      'Egy lakossági kezdeményezés három hónapra kapna kihelyezett ügyintézést a központban. Egyesek gyors hozzáférést kapnának, a peremtelepülések viszont kimaradnának, és a próba eredményei a következő állandó helyszínről szóló döntésbe is bekerülnének.',
    en: 'What should a pilot prove?',
    brief:
      'A service provider offers a short central pilot which serves some residents quickly but misses outlying areas. Its results will influence permanent provision. Before the hearing, you can ask your group to accept, request broader coverage or propose better measures. The provider decides scope.',
  },
  {
    id: 'pol.shared_forum',
    subtype: 'civic',
    hu: 'Két ügy, egy közös fellépés',
    huDescription:
      'A piac áruszállítói több rakodási helyet szeretnének, a biztonságos iskolai közlekedésért dolgozó csoport a reggeli forgalmat csökkentené ugyanabban az utcában. A nyilvános fórum előtt közös felszólalást ajánlanak nekik.',
    en: 'Two causes, one joint proposal',
    brief:
      'Market suppliers want loading access and a school travel group wants less morning traffic on the same street. A joint statement is offered before a public forum. As an organiser you can negotiate a proposal your group can actually endorse, affecting access for both groups.',
  },
  {
    id: 'pol.access_evidence',
    subtype: 'civic',
    hu: 'Egy felmérés vagy tíz történet?',
    huDescription:
      'Egy lakókörnyezeti akadálymentesítési csoport beszámolót készít. A személyes példák megmutatják, kit zár ki a jelenlegi rendszer, az intézmény összesített adatok alapján rangsorolná a beavatkozásokat.',
    en: 'One survey or ten personal accounts?',
    brief:
      'An accessibility group has vivid personal accounts and an institution prioritises aggregate evidence. Before submissions close, you can coordinate a survey, collect accounts with consent or combine the two forms. The group’s trust and the strength of the case depend on how you collect and present it.',
  },
  {
    id: 'pol.coalition_signature',
    subtype: 'civic',
    hu: 'A visszavont közös nyilatkozat',
    huDescription:
      'Több egyesület már közös vállalást tett egy szolgáltatási megállapodásért. Egy partner visszavonná aláírását, mert az utolsó tervezetből kikerült az általa képviselt csoport feltétele.',
    en: 'A coalition signature withdrawn',
    brief:
      'A partner would withdraw from a public commitment because the latest service agreement omits its condition. Before the text closes, you can reopen talks, look for a common minimum or bring a separate position to your group. The result must be both deliverable and acceptable to the coalition.',
  },
  {
    id: 'pol.conditional_offer',
    subtype: 'civic',
    hu: 'Feltételes ajánlat a hivataltól',
    huDescription:
      'A hivatal vállalná a csoport egy sürgős kérésének teljesítését, ha az egyeztetés alatt elhalasztják a nyilvános fórumot, és addig nem közölnek újabb anyagot. A szolgáltatást várók gyors eredményt szeretnének, más tagok szerint ellenőrizhető vállalás és nyilvánosan hozzáférhető hiteles mérés nélkül az ajánlat gyenge.',
    en: 'A conditional offer from the office',
    brief:
      'An institution offers a quick improvement if your group postpones a forum and pauses its publications while talks run. Some need relief soon and others want verifiable commitments and access to existing evidence. Before announcing the forum you can negotiate timing separately from access to evidence, ask for written terms or return to your members.',
  },
  {
    id: 'pol.leaflet_correction',
    subtype: 'civic',
    hu: 'Téves adat a saját szórólapon',
    huDescription:
      'Kiderül, hogy a csoport egyik már kiosztott anyagában hibás a fő állítást alátámasztó szám. Az érintettek gyors, jól látható korrekciót várnak, a szervezők egy része a kapcsolódó adatok megbízhatóságát is ellenőrizné.',
    en: 'The error on your own leaflet',
    brief:
      'A key claim in your distributed material has a wrong number. The group stops distribution and acknowledges the error. Before the next meeting, you can propose a full correction of verified facts now or withdraw the material until the remaining claims are checked. The group must own its error.',
  },
];

export const politicalStartSituations = Object.fromEntries(
  politicalStarts.map(({ id, subtype, brief }) => [
    id,
    { issueKey: id, subtypes: [subtype], selectable: true, engine: { brief } },
  ]),
);

export const politicalStartLabels = Object.fromEntries(
  politicalStarts.map(({ id, hu, en, huDescription, brief }) => [
    id,
    { label: { hu, en }, description: { hu: huDescription, en: brief } },
  ]),
);
