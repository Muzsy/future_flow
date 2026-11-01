import { ClientError, clientErrorMessage } from './client';

export type LifeNotice = Readonly<{
  userId: string | null;
  message: string;
  billingReason:
    'BILLING_NO_ENTITLEMENT' | 'BILLING_ALLOWANCE_EXHAUSTED' | null;
}>;

// Only an actual API client quota rejection offers the subscription route.
// An unavailable billing service or a network/auth failure is not an upsell.
export function lifeNoticeForError(
  error: unknown,
  userId: string | null,
): LifeNotice {
  return {
    userId,
    message: clientErrorMessage(error),
    billingReason:
      error instanceof ClientError &&
      (error.code === 'BILLING_NO_ENTITLEMENT' ||
        error.code === 'BILLING_ALLOWANCE_EXHAUSTED')
        ? error.code
        : null,
  };
}

export function visibleLifeNotice(
  notice: LifeNotice | null,
  userId: string | null,
): LifeNotice | null {
  return userId && notice?.userId === userId ? notice : null;
}
