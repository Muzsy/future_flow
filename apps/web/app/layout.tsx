import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Alter Jövő · Egy élet. Több lehetőség.',
  description:
    'Fedezz fel személyes, AI által alkotott alternatív életutakat. A következő döntés a tiéd.',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="hu">
      <body>{children}</body>
    </html>
  );
}
