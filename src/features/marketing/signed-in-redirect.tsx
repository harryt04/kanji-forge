'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getSession } from '@/auth/client'

/**
 * The landing page renders server-side for crawlers and first paint, so this
 * runs after the fact rather than blocking render — a signed-in visitor sees
 * the marketing page for an instant, then bounces to the app. That trade-off
 * is deliberate: a public page that blocks on a session check defeats the
 * point of being public.
 */
export function SignedInRedirect({
  to = '/home',
}: {
  readonly to?: string
}): null {
  const router = useRouter()

  useEffect(() => {
    let cancelled = false
    void getSession().then((user) => {
      if (!cancelled && user) router.replace(to)
    })
    return () => {
      cancelled = true
    }
  }, [router, to])

  return null
}
