'use client'

import { useLayoutEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { getSession, readCachedSession } from '@/auth/client'

/**
 * Wraps the marketing page's content. A first-time or anonymous visitor sees
 * it immediately (server-rendered, no delay) — the public page stays public.
 * A returning visitor who was signed in last time gets the content hidden
 * before paint (via the cached session in localStorage) until the real
 * session check confirms it, then bounces to the app instead of ever
 * flashing the marketing page.
 *
 * The hide is applied imperatively on the DOM node in useLayoutEffect,
 * never through render output, so the client's hydration render always
 * matches the server-rendered HTML (no hydration mismatch).
 */
export function SignedInRedirect({
  to = '/home',
  children,
}: {
  readonly to?: string
  readonly children: React.ReactNode
}): React.ReactElement {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (readCachedSession() === null) return
    const node = containerRef.current
    if (node) node.style.visibility = 'hidden'

    let cancelled = false
    void getSession().then((user) => {
      if (cancelled) return
      if (user) {
        router.replace(to)
        return
      }
      if (node) node.style.visibility = ''
    })
    return () => {
      cancelled = true
    }
  }, [router, to])

  return <div ref={containerRef}>{children}</div>
}
