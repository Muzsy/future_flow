// Plan 051/053: the two published Official sample stories linked from the
// home page. The slugs are the published public copies (noindex until the
// owner enables search exposure); the copy text lives in the i18n messages.
export const SAMPLE_STORIES = [
  {
    key: 'hometown',
    slug: 'official-54fea70a4812b23a3a6cc041af4dfc7f',
    title: 'Long Enough to Unpack',
    category: 'home.sampleHometownCategory',
    description: 'home.sampleHometownDescription',
  },
  {
    key: 'promotion',
    slug: 'official-e8acd32f71ecfb23ace2c4151c53daa1',
    title: 'Who Releases the Truck',
    category: 'home.samplePromotionCategory',
    description: 'home.samplePromotionDescription',
  },
] as const;
