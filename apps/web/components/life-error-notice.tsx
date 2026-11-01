import type { Locale } from '@future-flow/contracts';
import { translate } from '../lib/i18n';
import { visibleLifeNotice, type LifeNotice } from '../lib/life-notice';

export function LifeErrorNotice({
  notice,
  userId,
  locale,
}: {
  notice: LifeNotice | null;
  userId: string | null;
  locale: Locale;
}) {
  const shown = visibleLifeNotice(notice, userId);
  if (!shown) return null;
  return (
    <div className="notice error" role="alert">
      {shown.billingReason
        ? translate(
            locale,
            shown.billingReason === 'BILLING_NO_ENTITLEMENT'
              ? 'billing.needSubscription'
              : 'billing.allowanceExhausted',
          )
        : shown.message}
      {shown.billingReason && (
        <p>
          <a href="/billing">{translate(locale, 'billing.view')}</a>
        </p>
      )}
    </div>
  );
}
