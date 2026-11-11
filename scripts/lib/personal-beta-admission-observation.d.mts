export const DATABASE_IDENTITY_SHA256: string;
export function validateParticipants(value: unknown): {
  emails: string[];
  users: string[];
};
export function validateIdentityRecords(
  participants: unknown,
  records: unknown,
  observedAt: Date,
): string;
