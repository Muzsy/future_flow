export type Question = {
  key: string;
  label: string;
  section: string;
  type: 'select' | 'scale' | 'number' | 'text' | 'ranking' | 'boolean';
  options?: { value: string; label: string }[];
  help?: string;
};
const options = (entries: [string, string][]) =>
  entries.map(([value, label]) => ({ value, label }));
export const questionnaire = {
  version: '1.0.0',
  scoringVersion: 'self-report-v1',
  locale: 'hu-HU',
  questions: [
    {
      key: 'ageBand',
      label: 'Melyik korcsoportba tartozol?',
      section: 'Élethelyzet',
      type: 'select',
      options: options([
        ['18_24', '18–24'],
        ['25_34', '25–34'],
        ['35_44', '35–44'],
        ['45_54', '45–54'],
        ['55_64', '55–64'],
        ['65_plus', '65+'],
      ]),
    },
    {
      key: 'region',
      label: 'Melyik vármegyében vagy régióban élsz?',
      section: 'Élethelyzet',
      type: 'text',
      help: 'Pontos címet nem kérünk.',
    },
    {
      key: 'regionType',
      label: 'Milyen településen élsz?',
      section: 'Élethelyzet',
      type: 'select',
      options: options([
        ['capital', 'Budapest'],
        ['city', 'Nagyváros'],
        ['small_town', 'Kisváros'],
        ['village', 'Falu'],
      ]),
    },
    {
      key: 'relationshipStatus',
      label: 'Mi jellemzi a párkapcsolati helyzeted?',
      section: 'Élethelyzet',
      type: 'select',
      options: options([
        ['single', 'Egyedülálló'],
        ['partnered', 'Párkapcsolatban'],
        ['married', 'Házas'],
        ['separated', 'Különvált / elvált'],
        ['widowed', 'Özvegy'],
      ]),
    },
    {
      key: 'children',
      label: 'Hány gyermeked van?',
      section: 'Élethelyzet',
      type: 'number',
    },
    {
      key: 'employmentStatus',
      label: 'Mi a jelenlegi munkahelyzeted?',
      section: 'Munka és biztonság',
      type: 'select',
      options: options([
        ['employed', 'Alkalmazott'],
        ['self_employed', 'Vállalkozó'],
        ['student', 'Tanuló'],
        ['seeking_work', 'Munkát keresek'],
        ['retired', 'Nyugdíjas'],
        ['other', 'Egyéb'],
      ]),
    },
    {
      key: 'workDomain',
      label: 'Milyen területen dolgozol vagy szeretnél dolgozni?',
      section: 'Munka és biztonság',
      type: 'text',
      help: 'Munkáltató nevét nem szükséges megadni.',
    },
    {
      key: 'workSatisfaction',
      label: 'Mennyire vagy elégedett a munkáddal?',
      section: 'Munka és biztonság',
      type: 'scale',
    },
    {
      key: 'financialStability',
      label: 'Mennyire stabil az anyagi helyzeted?',
      section: 'Munka és biztonság',
      type: 'scale',
    },
    {
      key: 'housingStability',
      label: 'Mennyire stabil a lakhatásod?',
      section: 'Munka és biztonság',
      type: 'scale',
    },
    {
      key: 'relocationWillingness',
      label: 'Mennyire lennél nyitott költözésre?',
      section: 'Munka és biztonság',
      type: 'scale',
    },
    {
      key: 'careerChangeWillingness',
      label: 'Mennyire lennél nyitott pályaváltásra?',
      section: 'Munka és biztonság',
      type: 'scale',
    },
    {
      key: 'riskTolerance',
      label: 'Mennyire vállalsz kockázatot?',
      section: 'Habitus',
      type: 'scale',
    },
    {
      key: 'changeSeeking',
      label: 'Mennyire keresed a változást?',
      section: 'Habitus',
      type: 'scale',
    },
    {
      key: 'persistence',
      label: 'Mennyire tartasz ki egy cél mellett?',
      section: 'Habitus',
      type: 'scale',
    },
    {
      key: 'sociability',
      label: 'Mennyire keresed mások társaságát?',
      section: 'Habitus',
      type: 'scale',
    },
    {
      key: 'planningOrientation',
      label: 'Mennyire tervezel előre?',
      section: 'Habitus',
      type: 'scale',
    },
    {
      key: 'conflictAvoidance',
      label: 'Mennyire kerülöd a konfliktust?',
      section: 'Habitus',
      type: 'scale',
    },
    {
      key: 'autonomyNeed',
      label: 'Mennyire fontos az önállóság?',
      section: 'Habitus',
      type: 'scale',
    },
    {
      key: 'securityNeed',
      label: 'Mennyire fontos a kiszámíthatóság?',
      section: 'Habitus',
      type: 'scale',
    },
    {
      key: 'familyOrientation',
      label: 'Mennyire központi a család az életedben?',
      section: 'Habitus',
      type: 'scale',
    },
    {
      key: 'careerAmbition',
      label: 'Mennyire fontos a szakmai előrelépés?',
      section: 'Habitus',
      type: 'scale',
    },
    {
      key: 'learningOrientation',
      label: 'Mennyire keresed a tanulási lehetőségeket?',
      section: 'Habitus',
      type: 'scale',
    },
    {
      key: 'adaptability',
      label: 'Mennyire könnyen alkalmazkodsz új helyzetekhez?',
      section: 'Habitus',
      type: 'scale',
    },
    {
      key: 'values',
      label: 'Válassz 3–5 fontos értéket, fontossági sorrendben!',
      section: 'Irányok és kapcsolatok',
      type: 'ranking',
      options: options([
        ['family', 'Család'],
        ['security', 'Biztonság'],
        ['autonomy', 'Szabadság'],
        ['learning', 'Tanulás'],
        ['free_time', 'Szabadidő'],
        ['career', 'Karrier'],
        ['community', 'Közösség'],
        ['creativity', 'Kreativitás'],
        ['adventure', 'Kaland'],
        ['calm', 'Nyugalom'],
      ]),
    },
    {
      key: 'goalCategory',
      label: 'Melyik területhez kapcsolódik a fő célod?',
      section: 'Irányok és kapcsolatok',
      type: 'select',
      options: options([
        ['career', 'Karrier'],
        ['family', 'Család'],
        ['learning', 'Tanulás'],
        ['finance', 'Pénzügyek'],
        ['social', 'Kapcsolatok'],
        ['lifestyle', 'Életmód'],
      ]),
    },
    {
      key: 'goalTitle',
      label: 'Mit szeretnél elérni a következő években?',
      section: 'Irányok és kapcsolatok',
      type: 'text',
      help: 'Egy rövid, konkrét cél elég.',
    },
    {
      key: 'noCloseRelationships',
      label: 'Jelenleg nincs két olyan közeli kapcsolatom, amelyet megadnék.',
      section: 'Irányok és kapcsolatok',
      type: 'boolean',
      help: 'Ha ezt nem jelölöd, legalább két kapcsolatot kérünk az összegzésnél.',
    },
  ] satisfies Question[],
};
