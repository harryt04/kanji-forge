import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthGate } from '@/auth/auth-gate';

export const metadata: Metadata = {
  title: 'KanjiForge — Japanese kanji study',
  description:
    'A free, offline-first web app for studying kanji with the StickyStudy SRS system.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'KanjiForge',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#f7f4ec',
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <html lang="en">
      <head>
        <meta name="color-scheme" content="light dark" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 192 192'%3E%3Ctext x='96' y='120' font-size='120' font-family='serif' text-anchor='middle' dominant-baseline='middle'%3E鍛%3C/text%3E%3C/svg%3E" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="application-name" content="KanjiForge" />
        <meta name="apple-mobile-web-app-title" content="KanjiForge" />
      </head>
      <body><AuthGate>{children}</AuthGate></body>
    </html>
  );
}
