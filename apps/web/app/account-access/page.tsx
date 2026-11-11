import { AccountAccess } from '../../components/account-access';
import { turnstileSiteKey } from '../../lib/turnstile';
export default function Page() {
  return (
    <main>
      <AccountAccess turnstileSiteKey={turnstileSiteKey()} />
    </main>
  );
}
