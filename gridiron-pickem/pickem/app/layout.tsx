import type { Metadata } from 'next';
import { Bebas_Neue, Inter, Space_Mono } from 'next/font/google';
import './globals.css';
import NavBar from '@/components/NavBar';

// Note: next/font/google fetches these once at build time and self-hosts the
// result — no runtime calls to Google, no layout shift. It needs outbound
// network access *during the build only* (fine on Vercel; not available in
// this sandbox, which is why a local build here reports a fetch error).
const display = Bebas_Neue({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-display',
});

const body = Inter({
  subsets: ['latin'],
  variable: '--font-body',
});

const score = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-score',
});

export const metadata: Metadata = {
  title: 'Gridiron Pick\u2019em',
  description: 'The weekly college football pick\u2019em pool.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${score.variable}`}>
      <body className="font-body min-h-screen">
        <NavBar />
        <main className="mx-auto max-w-4xl px-4 pb-24 pt-6 sm:px-6">{children}</main>
      </body>
    </html>
  );
}
