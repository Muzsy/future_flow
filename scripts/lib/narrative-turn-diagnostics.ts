// Diagnostics of the planner's turn label (living-world generation). Evidence
// for the reader of a run, never a gate: no repair, no request, no verdict.
// The label is a planning note; the editor's sequence signature is a coarse,
// separate observation, so the mapping below is deliberately permissive and an
// `inconsistent` result only marks a chapter worth reading, not a defect.
import {
  FICTION_TURN_TYPES,
  type FictionTurnType,
} from '@future-flow/contracts';

type SignatureField =
  | 'dramaticEngine'
  | 'turningPointDriver'
  | 'resolutionMode'
  | 'protagonistResponse';

// For each labelled type, the signature values that fit it, per field. A label
// is consistent when ANY listed field of the signature carries a listed value.
export const TURN_SIGNATURE_TABLE: Record<
  Exclude<FictionTurnType, 'other'>,
  Partial<Record<SignatureField, readonly string[]>>
> = {
  attempt_meets_resistance: {
    dramaticEngine: [
      'failed_attempt',
      'material_experiment',
      'deadline_pressure',
      'mixed',
    ],
    turningPointDriver: ['protagonist', 'environment', 'artifact'],
  },
  outsider_reads_the_work: {
    dramaticEngine: [
      'material_experiment',
      'failed_attempt',
      'misunderstanding',
      'discovery',
    ],
    turningPointDriver: ['npc', 'institution', 'shared'],
  },
  other_persons_aim_crosses: {
    dramaticEngine: [
      'social_friction',
      'negotiation',
      'misunderstanding',
      'role_reversal',
      'mixed',
    ],
    turningPointDriver: ['npc', 'institution', 'shared', 'mixed'],
  },
  old_matter_returns: {
    dramaticEngine: [
      'relationship_shift',
      'social_friction',
      'negotiation',
      'misunderstanding',
      'mixed',
    ],
    turningPointDriver: ['npc', 'shared', 'mixed'],
  },
  event_from_outside: {
    dramaticEngine: [
      'external_opportunity',
      'deadline_pressure',
      'discovery',
      'other',
      'mixed',
    ],
    turningPointDriver: ['environment', 'chance', 'institution'],
  },
  success_with_price: {
    resolutionMode: [
      'commitment',
      'consequence',
      'partial_resolution',
      'experiment',
    ],
  },
  relationship_shift: {
    dramaticEngine: ['relationship_shift', 'social_friction', 'mixed'],
    turningPointDriver: ['npc', 'shared', 'mixed'],
  },
  protagonist_refuses_or_withdraws: {
    resolutionMode: ['withdrawal', 'unresolved'],
    turningPointDriver: ['protagonist'],
  },
  delayed_cost_of_earlier_choice: {
    resolutionMode: ['consequence', 'reframe'],
    turningPointDriver: ['protagonist', 'environment', 'artifact', 'mixed'],
  },
  quiet_persistence: {
    dramaticEngine: ['mixed', 'other', 'discovery'],
    protagonistResponse: ['persist', 'delayed_change', 'no_correction_arc'],
  },
};

export type TurnDiagnostics = {
  label: FictionTurnType | null;
  // labelled: a catalogue type that takes part in the rotation; other / null:
  // the planner named none; absent: the stored draft predates the label.
  coverage: 'labelled' | 'other' | 'null' | 'absent';
  // 1 = the least recently used type of the request's turnQueue.
  queueRank: number | null;
  // True when the label is one of the two most recent chapters' types.
  restingChosen: boolean | null;
  signatureConsistency: 'consistent' | 'inconsistent' | 'unchecked';
};

export function turnDiagnostics(input: {
  // undefined: the artifact/draft carries no key at all.
  turnType: unknown;
  ledger?: {
    turnQueue?: readonly string[];
    restingTurns?: readonly string[];
  } | null;
  signature?: Partial<Record<SignatureField, string>> | null;
}): TurnDiagnostics {
  const known = (FICTION_TURN_TYPES as readonly string[]).includes(
    input.turnType as string,
  );
  const label = known ? (input.turnType as FictionTurnType) : null;
  const coverage: TurnDiagnostics['coverage'] =
    input.turnType === undefined
      ? 'absent'
      : label === null
        ? 'null'
        : label === 'other'
          ? 'other'
          : 'labelled';
  const rotating = coverage === 'labelled' ? label : null;
  const queue = input.ledger?.turnQueue;
  const rank = rotating && queue ? queue.indexOf(rotating) : -1;
  const accepted =
    rotating && rotating !== 'other' ? TURN_SIGNATURE_TABLE[rotating] : null;
  const signature = input.signature;
  return {
    label,
    coverage,
    queueRank: rank >= 0 ? rank + 1 : null,
    restingChosen:
      rotating && input.ledger?.restingTurns
        ? input.ledger.restingTurns.includes(rotating)
        : null,
    signatureConsistency:
      accepted && signature
        ? (
            Object.entries(accepted) as [SignatureField, readonly string[]][]
          ).some(([field, values]) => values.includes(signature[field] ?? ''))
          ? 'consistent'
          : 'inconsistent'
        : 'unchecked',
  };
}

// Counts over the chapters of one run, for the comparison report.
export function turnSummary(turns: readonly (TurnDiagnostics | null)[]) {
  const have = turns.filter((t): t is TurnDiagnostics => t !== null);
  const count = (coverage: TurnDiagnostics['coverage']) =>
    have.filter((t) => t.coverage === coverage).length;
  return {
    chapters: have.length,
    labelled: count('labelled'),
    other: count('other'),
    null: count('null'),
    absent: count('absent'),
    restingChosen: have.filter((t) => t.restingChosen === true).length,
    queueRanks: have.flatMap((t) =>
      t.queueRank === null ? [] : [t.queueRank],
    ),
    inconsistent: have.filter((t) => t.signatureConsistency === 'inconsistent')
      .length,
  };
}
