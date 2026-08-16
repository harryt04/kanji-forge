import { PostHog } from 'posthog-node'

/** Server-side PostHog client. No-ops outside production or without a key. */
export default function PostHogClient(): PostHog {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  if (process.env.NODE_ENV !== 'production' || !key) {
    return { capture: () => {} } as unknown as PostHog
  }

  return new PostHog(key, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    flushAt: 1,
    flushInterval: 0,
  })
}
