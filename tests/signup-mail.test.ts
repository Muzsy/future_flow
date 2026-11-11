import { describe, expect, it } from 'vitest';
import { errorMessage } from '@future-flow/contracts';
import { messages, translate } from '../apps/web/lib/i18n';
import {
  RESEND_COOLDOWN_SECONDS,
  resendSecondsLeft,
} from '../apps/web/lib/signup-mail';

describe('sign-up confirmation email feedback', () => {
  it('locks "send again" for the cooldown and then releases it', () => {
    const sentAt = 1_000_000;
    expect(resendSecondsLeft(sentAt, sentAt)).toBe(RESEND_COOLDOWN_SECONDS);
    expect(resendSecondsLeft(sentAt, sentAt + 1)).toBe(RESEND_COOLDOWN_SECONDS);
    expect(resendSecondsLeft(sentAt, sentAt + 59_001)).toBe(1);
    expect(resendSecondsLeft(sentAt, sentAt + 60_000)).toBe(0);
    expect(resendSecondsLeft(sentAt, sentAt + 600_000)).toBe(0);
  });

  it('states the fact that the email was sent, in both locales', () => {
    for (const locale of ['en', 'hu'] as const) {
      const title = translate(locale, 'auth.mailSentTitle', {
        email: 'person@example.com',
      });
      expect(title).toContain('person@example.com');
      expect(translate(locale, 'auth.mailSentBody')).toMatch(/spam/i);
      expect(translate(locale, 'auth.mailResendWait', { seconds: 42 })).toMatch(
        /42/,
      );
      expect(messages[locale]['auth.mailSentButton']).not.toBe('');
      expect(messages[locale]['auth.mailResendButton']).not.toBe('');
    }
    expect(messages.hu['auth.mailSentButton']).toBe('Levél elküldve');
  });

  it('explains the Supabase email failures instead of the generic failure', () => {
    for (const code of [
      'over_email_send_rate_limit',
      'email_address_invalid',
      'unexpected_failure',
    ]) {
      for (const locale of ['en', 'hu'] as const) {
        expect(errorMessage(locale, code)).not.toBe(
          errorMessage(locale, 'REQUEST_FAILED'),
        );
      }
    }
    expect(errorMessage('hu', 'over_email_send_rate_limit')).toMatch(/spam/);
  });
});
