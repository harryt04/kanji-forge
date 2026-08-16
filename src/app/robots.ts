import type { MetadataRoute } from 'next'
import { IS_PRODUCTION_HOST, SITE_URL } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  // Non-production hosts (beta, previews, localhost) serve the same build, so
  // block them outright instead of letting them get indexed as duplicates of
  // the production origin.
  if (!IS_PRODUCTION_HOST) {
    return {
      rules: { userAgent: '*', disallow: '/' },
    }
  }

  return {
    rules: {
      // AI assistant crawlers are allowed deliberately: for a free,
      // open-source app, being cited as an answer to "what's a good free
      // kanji app" is distribution, not theft.
      userAgent: '*',
      allow: '/',
      disallow: [
        '/home',
        '/study',
        '/browse',
        '/detail',
        '/dictionary',
        '/history',
        '/settings',
        '/writing',
        '/analyze',
        '/help',
        '/prototype',
        '/api/',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
