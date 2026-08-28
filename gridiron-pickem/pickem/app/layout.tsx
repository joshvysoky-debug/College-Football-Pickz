import type { Metadata, Viewport } from 'next';
import { Bebas_Neue, Inter, Space_Mono } from 'next/font/google';
import './globals.css';
import NavBar from '@/components/NavBar';
import RegisterSW from '@/components/RegisterSW';

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
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'CFB Game Time',
  },
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#08090B',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${score.variable}`}>
      <body className="font-body min-h-screen">
        <RegisterSW />
        <NavBar />
        <main className="mx-auto max-w-4xl px-4 pb-24 pt-6 sm:px-6">{children}</main>
      </body>
    </html>
  );
}
