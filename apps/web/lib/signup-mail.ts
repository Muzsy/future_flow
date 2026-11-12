// After a sign-up the confirmation email is sent by Supabase. A second request
// for the same unconfirmed address inside this window is refused by Supabase,
// so the screen offers "send again" only after it.
export const RESEND_COOLDOWN_SECONDS = 60;

export function resendSecondsLeft(sentAt: number, now: number): number {
  return Math.max(
    0,
    Math.ceil(RESEND_COOLDOWN_SECONDS - (now - sentAt) / 1000),
  );
}
