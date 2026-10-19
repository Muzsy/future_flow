import { createHash } from 'node:crypto';

// Request-local naming aid for quality2.7. Without it every independent life
// in the same country converges on the model's favourite names (v7: "Niamh
// Byrne" in every run). The palette is seeded per life, so one life stays
// stable across periods while different lives diverge. It is a suggestion,
// never an allow-list: the author may still choose any locale-plausible name.
type Pool = { given: readonly string[]; family: readonly string[] };

const anglophoneGiven = [
  'Aisling',
  'Alan',
  'Amira',
  'Ben',
  'Bridget',
  'Carmel',
  'Cathal',
  'Chloe',
  'Conor',
  'Dara',
  'Deirdre',
  'Eamon',
  'Ella',
  'Fergal',
  'Fiona',
  'Gemma',
  'Gráinne',
  'Hannah',
  'Hugh',
  'Imelda',
  'Jack',
  'Joanne',
  'Karl',
  'Kate',
  'Liam',
  'Lorna',
  'Marek',
  'Martina',
  'Nuala',
  'Olu',
  'Pádraig',
  'Paula',
  'Ronan',
  'Rosa',
  'Sadhbh',
  'Shane',
  'Sinéad',
  'Tadhg',
  'Tomás',
  'Úna',
  'Vera',
  'Wen',
  'Yusuf',
  'Zofia',
  'Agnieszka',
  'Ifeoma',
  'Mateus',
  'Priya',
] as const;
const irishFamily = [
  'Ahern',
  'Barrett',
  'Brady',
  'Brennan',
  'Carroll',
  'Coady',
  'Coughlan',
  'Cullen',
  'Daly',
  'Dolan',
  'Farrell',
  'Fitzgerald',
  'Flood',
  'Gallagher',
  'Geraghty',
  'Hayes',
  'Hegarty',
  'Keane',
  'Kinsella',
  'Lynch',
  'Madden',
  'McGrath',
  'Moran',
  'Mulvey',
  'Nolan',
  'Phelan',
  'Quinlan',
  'Redmond',
  'Sheridan',
  'Tierney',
  'Tobin',
  'Whelan',
  'Nowak',
  'Okafor',
  'Silva',
  'Kowalczyk',
  'Chen',
  'Haddad',
] as const;
const britishFamily = [
  'Akhtar',
  'Barker',
  'Bennett',
  'Bowen',
  'Carter',
  'Dixon',
  'Ellis',
  'Fletcher',
  'Gill',
  'Hargreaves',
  'Holt',
  'Hussain',
  'Jarvis',
  'Khan',
  'Lawson',
  'Marsh',
  'Mensah',
  'Nash',
  'Osei',
  'Parry',
  'Pearce',
  'Rees',
  'Shaw',
  'Sutton',
  'Thorpe',
  'Walsh',
  'Webb',
  'Yates',
] as const;
const americanFamily = [
  'Alvarez',
  'Baker',
  'Brooks',
  'Castillo',
  'Coleman',
  'Diaz',
  'Fischer',
  'Foster',
  'Greene',
  'Hayes',
  'Jenkins',
  'Kim',
  'Lopez',
  'Moreno',
  'Nguyen',
  'Patel',
  'Price',
  'Reyes',
  'Russo',
  'Sanders',
  'Tran',
  'Vasquez',
  'Wallace',
  'Washington',
] as const;
const hungarianGiven = [
  'Ágnes',
  'András',
  'Anikó',
  'Attila',
  'Balázs',
  'Bence',
  'Csilla',
  'Dániel',
  'Dóra',
  'Edit',
  'Emese',
  'Ferenc',
  'Gábor',
  'Gergely',
  'Hajnalka',
  'Ildikó',
  'Imre',
  'Judit',
  'Katalin',
  'Kristóf',
  'Levente',
  'Lilla',
  'Márta',
  'Máté',
  'Noémi',
  'Orsolya',
  'Péter',
  'Réka',
  'Szabolcs',
  'Tamás',
  'Tímea',
  'Zsófia',
] as const;
const hungarianFamily = [
  'Balogh',
  'Bíró',
  'Bognár',
  'Deák',
  'Farkas',
  'Fodor',
  'Gulyás',
  'Halász',
  'Horváth',
  'Juhász',
  'Kardos',
  'Katona',
  'Kovács',
  'Lakatos',
  'Mészáros',
  'Molnár',
  'Nagy',
  'Németh',
  'Oláh',
  'Pap',
  'Pintér',
  'Rácz',
  'Simon',
  'Somogyi',
  'Szabó',
  'Szalai',
  'Takács',
  'Tóth',
  'Vass',
  'Vincze',
] as const;
const pools: Record<string, Pool> = {
  IE: { given: anglophoneGiven, family: irishFamily },
  GB: { given: anglophoneGiven, family: britishFamily },
  US: { given: anglophoneGiven, family: americanFamily },
  HU: { given: hungarianGiven, family: hungarianFamily },
};

function seeded<T>(items: readonly T[], seed: string, count: number) {
  return items
    .map((item, index) => ({
      item,
      key: createHash('sha256').update(`${seed}:${index}`).digest('hex'),
    }))
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(0, count)
    .map((x) => x.item);
}

export function fictionCastingProjection(input: {
  lifeId: string;
  country: string | null;
  locale: string;
  usedLabels: readonly string[];
}) {
  const pool =
    (input.country && pools[input.country]) ||
    (input.locale === 'hu' ? pools.HU : null);
  if (!pool) return null;
  // Exclude every token already used by a person in this life so the palette
  // never suggests a second "Niamh" (v7 reused names across separate people).
  const used = new Set(
    input.usedLabels.flatMap((l) =>
      (l.match(/[\p{L}'’-]+/gu) ?? []).map((w) => w.toLocaleLowerCase('en')),
    ),
  );
  const fresh = (items: readonly string[]) =>
    items.filter((n) => !used.has(n.toLocaleLowerCase('en')));
  return {
    givenNames: seeded(fresh(pool.given), `${input.lifeId}:given`, 10),
    familyNames: seeded(fresh(pool.family), `${input.lifeId}:family`, 8),
    rule: 'Optional palette for NEW invented people in this life only; supplied people keep their labels. Prefer it over habitual defaults, do not reuse a name already carried by another person in this life, and any other locale-plausible ordinary name remains allowed.',
  };
}
