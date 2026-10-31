import { TermsOfUse } from '../../components/terms-of-use';
export default function Page() {
  return (
    <main>
      <section
        className="panel privacy-copy"
        style={{ maxWidth: 800, margin: 'auto' }}
      >
        <TermsOfUse />
      </section>
    </main>
  );
}
