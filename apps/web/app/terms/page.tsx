import { BackLink, SiteHeader } from '../../components/site-header';
import { TermsOfUse } from '../../components/terms-of-use';
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
          <TermsOfUse />
        </section>
      </main>
    </>
  );
}
