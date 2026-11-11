import { SetMetadata } from '@nestjs/common';

// Only server handlers whose creation/retry path reaches the chapter ledger
// carry this marker. Cloudflare identity, beta admission and request data do
// not establish chapter-billing support.
export const CHAPTER_BILLED_GENERATION = 'alterward:chapter-billed-generation';
export const ChapterBilledGeneration = () =>
  SetMetadata(CHAPTER_BILLED_GENERATION, true);
