import type { Locale } from '@future-flow/contracts';
const en = {
  heading: 'Prepare the complete story',
  intro:
    'Choose the saved decision details to include with this story. You can keep the story readable without any starting points.',
  noPoint: 'Story only at this decision',
  version: 'Saved decision details',
  acknowledge:
    'I have reviewed the complete story and the decision details selected below, including their personal and sensitive information.',
  save: 'Save complete private preparation',
  saved:
    'The complete private preparation is saved. Full AI and curator review are still required.',
  pendingReview:
    'The story text review does not cover this complete preparation. Publication requires a clear complete AI review, curator approval and separate confirmation. Starting another life from it will be available later.',
  proposed: 'Review the story and selected starting points',
  none: 'This preparation includes the story without starting points.',
  savedCopy: 'Saved complete preparation',
  inspect: 'Preparation to inspect',
  reload: 'Reload complete preparations',
  reloadHint:
    'Reload after saving new decision details above. Reloading clears your unsaved selection and does not use AI.',
  disabled: 'Saving new complete preparations is currently unavailable.',
  loading: 'Loading complete preparations…',
  saving: 'Saving…',
  invalid:
    'This complete preparation could not be verified for the saved story. Reload the preview.',
};
export const publicContentMessages: Record<Locale, typeof en> = { en, hu: en };
