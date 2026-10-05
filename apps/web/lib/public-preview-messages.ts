import type {
  Locale,
  PublicPreviewCopy,
  PublicReviewReport,
} from '@future-flow/contracts';
const en = {
  heading: 'Prepare a story copy',
  intro:
    'Review a separate copy of your AI story. Your private life and its choices stay as they are.',
  privacy: 'Privacy preview',
  content: 'Content preview',
  back: 'Back to your life',
  loading: 'Loading your private copy…',
  reload: 'Reload the source',
  reloadHint: 'Reloading discards unsaved edits.',
  private: 'Private copy · AI-generated fiction',
  guidance:
    'Remove real names, precise locations, contact details, workplaces and sensitive information about you or anyone else. Keep the meaning of the story while using general descriptions.',
  sourceNote:
    'The starting text comes from your private story and still needs your review.',
  metadata: 'About this copy',
  title: 'Title',
  summary: 'Summary',
  category: 'Category',
  goal: 'Goal description',
  chapterTitle: 'Chapter title',
  body: 'Chapter text',
  eventTitle: 'Event title',
  eventSummary: 'Event summary',
  prompt: 'Decision question',
  optionLabel: 'Option label',
  optionDescription: 'Option description',
  acknowledge: 'I have reviewed this copy for personal and sensitive details.',
  save: 'Check and save private preview',
  saving: 'Checking and saving…',
  saveHint:
    'This checks for contact details, references and known private names. Saving does not run AI or publish anything.',
  checked: 'Your private preview is saved. You can now read the complete copy.',
  unsaved:
    'These edits are unsaved. Save a new preview before checking its AI result or viewing the saved content.',
  validation: 'Check the length of the highlighted fields.',
  preflight: 'Remove the details found in these fields, then save again.',
  review: 'AI review',
  startReview: 'Run AI review',
  reviewQueued: 'Your AI review is queued. This copy remains private.',
  reviewConsent:
    'I agree to send this saved copy to AI for a privacy and content check.',
  reviewCost:
    'This uses the available AI allowance. One attempt is allowed per saved copy; refreshing the status does not use AI.',
  reviewDisabled:
    'AI reviews are currently unavailable. You can keep editing your private copy.',
  refreshReview: 'Refresh review status',
  curation: 'Copy text review',
  curationConsent:
    'I agree to send this saved copy for a trusted privacy and content review.',
  submitCuration: 'Request a copy text review',
  curationHint:
    'This makes no additional AI call. The review covers this copy text; publishing will need a separate confirmation.',
  curationDisabled: 'Trusted copy text reviews are not available yet.',
  curationPending:
    'Your copy is waiting for a text review. It remains private.',
  curationReviewed:
    'The copy text review is complete. This preview remains private.',
  curationChanges:
    'The reviewer requested changes. Edit this copy and save a new preview.',
  curationRejected:
    'This copy was declined for further preparation. It remains private.',
  curationReasons: {
    privacy: 'Privacy',
    content: 'Content',
    quality: 'Writing quality',
    story_consistency: 'Story consistency',
    other: 'Further review needed',
  },
  notStarted: 'An AI review has not been run for this saved copy.',
  running: 'The AI review is in progress. This copy remains private.',
  failed:
    'The AI review did not finish. Start a new preview before another check.',
  noFindings:
    'The AI check reported no findings. Please still review the whole copy; it remains private.',
  reviewRequired:
    'The AI check found details that need attention. Edit the indicated fields and save a new preview.',
  unable:
    'The AI could not assess this copy. It remains private and needs further review.',
  reviewUnavailable:
    'The review status could not be verified. Please refresh it.',
  expired:
    'This preview has expired. Start a new preview using your reviewed text.',
  newPreview: 'Start a new preview',
  publication:
    'This is a private preview. Publishing and sharing are not available yet.',
  copiedProfile: 'Generalized starting profile',
  age: 'Age range',
  country: 'Country',
  work: 'Employment status',
  unknown: 'Not specified',
  dates: 'Starting point',
  labels: 'Story labels',
  aiGenerated: 'AI-generated',
  edited: 'Copy edited by you',
  unchanged: 'Source story text preserved',
  chosen: 'Choice recorded in the private life',
  openDecision: 'This decision is still open.',
  noFork: 'This copy cannot start a new life yet.',
  expires: 'Private preview valid until',
  categories: {
    career: 'Career',
    business: 'Business',
    money: 'Money',
    relationships: 'Relationships',
    family: 'Family',
    education: 'Education',
    lifestyle: 'Lifestyle',
    moving_abroad: 'Moving abroad',
    starting_over: 'Starting over',
    personal_growth: 'Personal growth',
    adventure: 'Adventure',
    historical: 'Historical',
    fictional: 'Fictional',
  } satisfies Record<PublicPreviewCopy['category'], string>,
  reviewCategories: {
    person_name: 'Person name',
    precise_location: 'Precise location',
    organization: 'Workplace or organization',
    contact_details: 'Contact details',
    identifying_combination: 'Identifying combination of details',
    private_financial: 'Private financial details',
    sensitive_personal: 'Sensitive personal information',
    third_party_sensitive: 'Sensitive information about someone else',
    harassment: 'Harassment',
    hate: 'Hate',
    sexual: 'Sexual content',
    violence: 'Violence',
    self_harm: 'Self-harm',
    illegal: 'Illegal activity',
    scam: 'Scam',
    impersonation: 'Impersonation',
    spam: 'Spam',
    embedded_instructions: 'Instructions embedded in the story',
    language: 'English language quality',
  } satisfies Record<
    PublicReviewReport['findings'][number]['category'],
    string
  >,
  actions: {
    remove: 'Remove this detail',
    generalize: 'Use a general description',
    manual_review: 'Review carefully',
  },
  preflightCodes: {
    email: 'Email address',
    link: 'Web link',
    phone_or_identifier: 'Phone number or identifier',
    internal_reference: 'Private reference',
    private_label: 'Known private name or location',
  },
};
// Hungarian remains hidden; future release languages can supply a catalog here.
export const publicPreviewMessages: Record<Locale, typeof en> = { en, hu: en };
