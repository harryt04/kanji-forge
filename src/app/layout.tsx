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
  applicationName: 'KanjiForge',
  authors: [{ name: 'KanjiForge contributors' }],
  creator: 'KanjiForge contributors',
  publisher: 'KanjiForge contributors',
  formatDetection: { telephone: false },
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
    images: ['/opengraph-image'],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: ['/opengraph-image'],
  },
  // Tokens live in env vars so they never need committing. Unset in
  // development/beta; set them on the production Coolify app once the sites
  // are registered in Search Console / Bing Webmaster Tools.
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION,
    other: process.env.BING_SITE_VERIFICATION
      ? { 'msvalidate.01': process.env.BING_SITE_VERIFICATION }
      : undefined,
  },
}

const WEBSITE_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'KanjiForge',
  url: SITE_URL,
  description,
}

const ORGANIZATION_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'KanjiForge',
  url: SITE_URL,
  logo: `${SITE_URL}/icon-512.png`,
  sameAs: ['https://github.com/harryt04/kanji-forge'],
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
        <meta name="theme-color" content="#e8e4dc" />
        {/* Resolves light/dark before the first paint. Nothing above it renders
            pixels, so a dark-mode visitor never sees a light frame. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <meta name="color-scheme" content="light dark" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/svg+xml" href="/icon.svg" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="application-name" content="KanjiForge" />
        <meta name="apple-mobile-web-app-title" content="KanjiForge" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(WEBSITE_JSON_LD) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(ORGANIZATION_JSON_LD),
          }}
        />
      </head>
      <body>
        <ThemeController />
        <PwaRegistration />
        {children}
      </body>
    </html>
  )
}
