'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import posthog from 'posthog-js'

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY
const runningInProduction =
  process.env.NODE_ENV === 'production' && typeof window !== 'undefined'
const analyticsEnabled = runningInProduction && Boolean(POSTHOG_KEY)

if (runningInProduction && POSTHOG_KEY) {
  posthog.init(POSTHOG_KEY, {
    api_host: '/ingest',
    ui_host: 'https://us.posthog.com',
    // Keep analytics useful for product usage without sending study content.
    autocapture: true,
    mask_all_text: true,
    mask_all_element_attributes: true,
    disable_session_recording: true,
  })
}

/**
 * Mounted once in the root layout, alongside `ThemeController`/`PwaRegistration`. No-ops
 * outside production or when the optional key is absent, so an unconfigured deployment
 * still renders normally. Pageviews are captured manually because App Router client-side
 * navigations aren't caught by PostHog's built-in SPA detection.
 */
export function PostHogInit(): null {
  const pathname = usePathname()

  useEffect(() => {
    if (!analyticsEnabled) return
    posthog.capture('$pageview', { pathName: pathname })
  }, [pathname])

  return null
}
