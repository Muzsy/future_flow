import { publicReportReasons } from '@future-flow/contracts';
export const publicReportLabels: Record<
  (typeof publicReportReasons)[number],
  string
> = {
  personal_data: 'Personal information',
  harassment: 'Harassment',
  hate: 'Hate',
  explicit_sexual_content: 'Explicit sexual content',
  violence: 'Violence',
  illegal_content: 'Illegal content',
  scam: 'Scam or fraud',
  impersonation: 'Impersonation',
  spam: 'Spam',
};
