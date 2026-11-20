import type { Metadata } from 'next';
import { SiteHeader } from '../components/site-header';

export const metadata: Metadata = {
  title: 'Page not found · alterward',
  robots: { index: false, follow: false },
};
export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="publication-page">
        <h1>Page not found</h1>
        <p>This address does not lead to a page on alterward.</p>
        <p>
          <a className="primary" href="/">
            Go to the home page
          </a>
        </p>
      </main>
    </>
  );
}
