import { AccountPanel } from '../../components/account-panel';
import { BackLink, SiteHeader } from '../../components/site-header';
import { turnstileSiteKey } from '../../lib/turnstile';
export default function Page() {
  return (
    <>
      <SiteHeader current="account" />
      <main className="shell">
        <BackLink />
        <AccountPanel turnstileSiteKey={turnstileSiteKey()} />
      </main>
    </>
  );
}
