import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/sign-in', '/sign-up'],
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
