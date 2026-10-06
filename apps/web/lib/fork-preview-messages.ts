import type { Locale } from '@future-flow/contracts';
const en = {
  heading: 'Decision starting points',
  intro:
    'Inspect the situation before each choice, including the conditions and consequences of every option. You can generalize the descriptions without changing the facts.',
  private: 'Private preparation',
  fullReview:
    'These decision details still need a complete privacy and content review. The story text review does not cover them. Publishing and starting another life are not available yet.',
  loading: 'Loading decision details…',
  reload: 'Reload decision details',
  reloadHint:
    'Reloading discards unsaved changes to these details. It does not use AI.',
  decision: 'Decision to inspect',
  version: 'Preparation to inspect',
  candidate: 'New generalized preparation',
  savedVersion: 'Saved preparation',
  unavailable:
    'This decision cannot be prepared safely from the current copy. Continue reviewing the story text or create a new preview.',
  unavailableReasons: {
    privacy: 'Some details need further privacy review.',
    reference: 'Some references cannot be preserved safely.',
    consistency: 'The situation and options cannot be verified together.',
  },
  startingState: 'Situation before the choice',
  goals: 'Goals and progress',
  constraints: 'Constraints',
  noConstraints: 'No active constraints.',
  choices: 'Options and immediate consequences',
  optionsHint:
    'The question and option wording come from your saved story copy. Edit that copy and save a new preview to change them.',
  noConditions: 'No additional conditions.',
  noChanges:
    'No immediate factual changes. Later consequences are generated when the life continues.',
  conditions: 'Conditions',
  consequences: 'Immediate consequences',
  descriptions: 'Generalized descriptions',
  descriptionHint:
    'Use general descriptions for people, places, workplaces and sensitive details. Keep the meaning consistent with the story and options.',
  acknowledge:
    'I have reviewed these descriptions, facts and consequences for personal and sensitive details.',
  save: 'Check and save private decision details',
  saving: 'Checking and saving…',
  saved:
    'These private decision details are saved. A complete review is still required.',
  saveHint:
    'Saving checks consistency and known personal details. It does not use AI or publish the story.',
  validation: 'Check the length of the highlighted descriptions.',
  invalidResponse:
    'The decision details could not be verified for this copy. Reload the saved story preview.',
};
// Hungarian remains hidden. Future enabled languages can supply a catalog here.
export const forkPreviewMessages: Record<Locale, typeof en> = { en, hu: en };
