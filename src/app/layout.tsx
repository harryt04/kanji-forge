import type { Metadata, Viewport } from 'next'
import {
  Fraunces,
  JetBrains_Mono,
  Klee_One,
  Noto_Sans_JP,
  Public_Sans,
} from 'next/font/google'
import './globals.css'
import { ThemeController } from '@/features/settings/theme-controller'
import { THEME_INIT_SCRIPT } from '@/features/settings/theme-script'
import { PwaRegistration } from '@/pwa'
import { SITE_URL } from '@/lib/site'
import { cn } from '@/lib/utils'

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['500', '600', '700', '900'],
  variable: '--font-display',
  display: 'swap',
})
const notoSansJP = Noto_Sans_JP({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-jp-ui',
  display: 'swap',
})
const publicSans = Public_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-body',
  display: 'swap',
})
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
})
// A flash of fallback kanji is worse than a brief blank — fallback fonts can
// render a structurally different (simplified/Chinese-variant) glyph — so this
// one stays `display: 'block'` per docs/BRAND-DESIGN-LANGUAGE.md §4, unlike the
// other four families above.
const kleeOne = Klee_One({
  subsets: ['latin'],
  weight: ['600'],
  variable: '--font-jp-display',
  display: 'block',
})

const title = 'KanjiForge — Japanese kanji study'
const description =
  'A free, offline-first web app for studying kanji with the StickyStudy SRS system.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title,
  description,
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'KanjiForge',
  },
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'KanjiForge',
    title,
    description,
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  // The `theme-color` meta is rendered by hand in `<head>` below instead of here,
  // so the pre-paint script can find and patch a single, known element before the
  // first frame. Next's metadata injection gives no ordering guarantee against
  // that script.
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}): React.ReactElement {
  return (
    <html
      lang="en"
      // The pre-paint script below writes `class` and `data-theme` onto this
      // element before React hydrates, so the two never match on first render.
      suppressHydrationWarning
      className={cn(
        fraunces.variable,
        notoSansJP.variable,
        publicSans.variable,
        jetbrainsMono.variable,
        kleeOne.variable,
      )}
    >
      <head>
        {/* This meta must precede the theme script: the script patches it in place. */}
        <meta name="theme-color" content="#f7f4ec" />
        {/* Resolves light/dark before the first paint. Nothing above it renders
            pixels, so a dark-mode visitor never sees a light frame. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <meta name="color-scheme" content="light dark" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link
          rel="icon"
          type="image/svg+xml"
          href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 192 192'%3E%3Ctext x='96' y='120' font-size='120' font-family='serif' text-anchor='middle' dominant-baseline='middle'%3E鍛%3C/text%3E%3C/svg%3E"
        />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="application-name" content="KanjiForge" />
        <meta name="apple-mobile-web-app-title" content="KanjiForge" />
      </head>
      <body>
        <ThemeController />
        <PwaRegistration />
        {children}
      </body>
    </html>
  )
}
