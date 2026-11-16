import { AccountAccess } from '../../components/account-access';
import { BackLink, SiteHeader } from '../../components/site-header';
import { turnstileSiteKey } from '../../lib/turnstile';
export default function Page() {
  return (
    <>
      <SiteHeader />
      <main className="shell">
        <BackLink />
        <AccountAccess turnstileSiteKey={turnstileSiteKey()} />
      </main>
    </>
  );
}
