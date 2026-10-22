import type { LifeStateV2 } from '@future-flow/contracts';

// The exact numbers that the structured state and a draft's typed changes
// hold: available hours, energy, income, funds, shares. They are bookkeeping
// of the simulation, not scenery, and the living-world author is asked never
// to restate one in the prose. The list is computed from the life's own data
// at request time and is deterministic: no text is saved in a prompt or here
// (the rule in the prompt is general; only the figures are specific, and they
// are the life's, not a story's).
export type FictionMechanicsFigure = { path: string; value: number };
export const FICTION_MECHANICS_FIGURES_MAX = 12;
export const FICTION_MECHANICS_FIGURES_BYTES = 512;

type ChangeLike = { type?: unknown; value?: unknown };
type EventLike = { changes?: unknown };

const num = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function fromObject(
  prefix: string,
  value: unknown,
  keys: readonly string[],
): FictionMechanicsFigure[] {
  if (!value || typeof value !== 'object') return [];
  return keys.flatMap((key) => {
    const v = (value as Record<string, unknown>)[key];
    return num(v) ? [{ path: `${prefix}.${key}`, value: v }] : [];
  });
}

export function fictionMechanicsFigures(
  state: LifeStateV2,
  candidateEvents: readonly EventLike[] = [],
): FictionMechanicsFigure[] {
  const found: FictionMechanicsFigure[] = [
    ...fromObject('resources', state.resources, [
      'availableHoursPerWeek',
      'energy',
    ]),
    ...fromObject('finance', state.finance, ['monthlyIncome', 'liquidFunds']),
    ...state.ownedAssets.flatMap((asset, index) =>
      fromObject(`ownedAssets.${index}`, asset, ['sharePercent']),
    ),
  ];
  // This period's own typed changes to those figures, in event order.
  for (const event of candidateEvents)
    for (const change of Array.isArray(event.changes)
      ? (event.changes as ChangeLike[])
      : []) {
      if (change?.type === 'resources_set')
        found.push(
          ...fromObject('resources', change.value, [
            'availableHoursPerWeek',
            'energy',
          ]),
        );
      else if (change?.type === 'finance_set')
        found.push(
          ...fromObject('finance', change.value, [
            'monthlyIncome',
            'liquidFunds',
          ]),
        );
    }
  const seen = new Set<string>();
  const unique = found.filter((f) => {
    const key = `${f.path}=${f.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const out = unique.slice(0, FICTION_MECHANICS_FIGURES_MAX);
  while (
    out.length &&
    Buffer.byteLength(JSON.stringify(out), 'utf8') >
      FICTION_MECHANICS_FIGURES_BYTES
  )
    out.pop();
  return out;
}

// Diagnostic only (never a gate): which of the figures the prose recounts as a
// numeral or a spelled-out number next to it. A match can be a coincidence
// (a number that happens to equal a figure), so the result is a flag for the
// reader of the evaluation, not a verdict.
const WORDS_EN = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
  'twenty',
];
const WORDS_HU = [
  'nulla',
  'egy',
  'kettő|két',
  'három',
  'négy',
  'öt',
  'hat',
  'hét',
  'nyolc',
  'kilenc',
  'tíz',
  'tizenegy',
  'tizenkettő|tizenkét',
  'tizenhárom',
  'tizennégy',
  'tizenöt',
  'tizenhat',
  'tizenhét',
  'tizennyolc',
  'tizenkilenc',
  'húsz',
];
const esc = (s: string) => s.replace(/[.*+?^${}()[\]\\]/g, '\\$&');

export function fictionMechanicsRecount(
  body: string,
  figures: readonly FictionMechanicsFigure[],
  locale: 'en' | 'hu' = 'en',
) {
  const text = body.toLocaleLowerCase(locale);
  return figures.filter(({ value }) => {
    // A figure inside a longer number ("2025", "4.5") is not a match of 4.
    const numeral = new RegExp(
      `(?<![\\p{L}\\p{N}.,])${String(value).split('.').map(esc).join('[.,]')}(?![\\p{L}\\p{N}]|[.,]\\d)`,
      'u',
    );
    if (numeral.test(text)) return true;
    // Spelled-out small whole numbers; "one"/"egy" are skipped (an article).
    if (!Number.isInteger(value) || value < 2 || value > 20) return false;
    const words = (
      locale === 'hu' ? WORDS_HU[value]!.split('|') : [WORDS_EN[value]!]
    ).map(esc);
    return new RegExp(
      `(?<![\\p{L}])(?:${words.join('|')})(?![\\p{L}])`,
      'u',
    ).test(text);
  });
}
