import type { MetadataRoute } from 'next'
import { statSync } from 'node:fs'
import path from 'node:path'
import { SITE_URL } from '@/lib/site'
import { getCuratedLiterals } from '@/lib/seo/curated-literals'
import { getKanjiDecks } from '@/lib/seo/decks'

// The kanji pack's mtime is a reliable proxy for "when this content was last
// rebuilt" — the manifest itself carries no timestamp field, and a fresh
// `new Date()` on every request just trains crawlers to ignore the field.
const kanjiPackModifiedAt = statSync(
  path.join(process.cwd(), 'packs', 'kanji-v1.sqlite'),
).mtime

// Public routes only. Every authenticated route under `(app)` renders a
// sign-in form to a crawler, so listing one here would advertise a page with
// no real content to index — see `(app)/layout.tsx`'s `robots: { index: false }`.
// `/sign-in` is excluded too — see its own `robots: { index: false }`.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${SITE_URL}/sign-up`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/kanji`,
      lastModified: kanjiPackModifiedAt,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/kanji/lists`,
      lastModified: kanjiPackModifiedAt,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/about`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/open-source`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ]

  const deckPages: MetadataRoute.Sitemap = getKanjiDecks().map((deck) => ({
    url: `${SITE_URL}/kanji/lists/${deck.id}`,
    lastModified: kanjiPackModifiedAt,
    changeFrequency: 'monthly',
    priority: 0.7,
  }))

  const kanjiPages: MetadataRoute.Sitemap = getCuratedLiterals().map(
    (literal) => ({
      url: `${SITE_URL}/kanji/${encodeURIComponent(literal)}`,
      lastModified: kanjiPackModifiedAt,
      changeFrequency: 'yearly',
      priority: 0.5,
    }),
  )

  return [...staticPages, ...deckPages, ...kanjiPages]
}
