import type { Metadata } from 'next'
import packageJson from '../../../package.json'
import { BeltRampExplainer } from '@/features/marketing/belt-ramp-explainer'
import { FeatureHighlights } from '@/features/marketing/feature-highlights'
import { Hero } from '@/features/marketing/hero'
import { InstallPwa } from '@/features/marketing/install-pwa'
import { LicensingHonesty } from '@/features/marketing/licensing-honesty'
import { OfflineOwnership } from '@/features/marketing/offline-ownership'
import { SignedInRedirect } from '@/features/marketing/signed-in-redirect'

export const metadata: Metadata = {
  title: 'KanjiForge — Your whole deck, as a wall of color',
  description:
    'A free, offline-first web app for studying kanji with the StickyStudy level-and-color SRS system. Open source, no ads, your data stays yours.',
  alternates: { canonical: '/' },
}

const JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'KanjiForge',
  applicationCategory: 'EducationalApplication',
  operatingSystem: 'Web',
  description:
    'A free, offline-first Japanese kanji study app using a level-and-color spaced-repetition system.',
  isAccessibleForFree: true,
  license: 'https://github.com/harryt04/kanji-forge/blob/master/LICENSE',
  codeRepository: 'https://github.com/harryt04/kanji-forge',
  softwareVersion: packageJson.version,
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
}

export default function LandingPage(): React.ReactElement {
  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
      <SignedInRedirect>
        <Hero />
        <BeltRampExplainer />
        <FeatureHighlights />
        <OfflineOwnership />
        <LicensingHonesty />
        <InstallPwa />
      </SignedInRedirect>
    </main>
  )
}
