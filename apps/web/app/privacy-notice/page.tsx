import { PrivacyNotice } from '../../components/privacy-notice';
export default function Page() {
  return (
    <main>
      <section
        className="panel privacy-copy"
        style={{ maxWidth: 800, margin: 'auto' }}
      >
        <PrivacyNotice />
      </section>
    </main>
  );
}
