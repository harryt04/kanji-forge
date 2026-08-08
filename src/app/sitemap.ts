import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

// Public routes only. Every authenticated route under `(app)` renders a
// sign-in form to a crawler, so listing one here would advertise a page with
// no real content to index — see `(app)/layout.tsx`'s `robots: { index: false }`.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return [
    {
      url: `${SITE_URL}/`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${SITE_URL}/sign-in`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/sign-up`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.5,
    },
  ]
}
