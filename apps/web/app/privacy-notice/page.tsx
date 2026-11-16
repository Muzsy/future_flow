import { BackLink, SiteHeader } from '../../components/site-header';
import { PrivacyNotice } from '../../components/privacy-notice';
export default function Page() {
  return (
    <>
      <SiteHeader />
      <main className="shell">
        <BackLink />
        <section
          className="panel privacy-copy"
          style={{ maxWidth: 800, margin: 'auto' }}
        >
          <PrivacyNotice />
        </section>
      </main>
    </>
  );
}
