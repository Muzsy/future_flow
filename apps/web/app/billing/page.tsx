import { BillingPanel } from '../../components/billing-panel';
import { BackLink, SiteHeader } from '../../components/site-header';
export default function Page() {
  return (
    <>
      <SiteHeader current="billing" />
      <main className="shell">
        <BackLink />
        <BillingPanel />
      </main>
    </>
  );
}
