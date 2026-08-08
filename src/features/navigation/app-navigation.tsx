'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getActiveUserRuntime } from '@/auth/runtime'
import { loadStarterDeck } from '@/features/study/deck-loader'

interface AppNavigationProps {
  readonly userId: string
}

/**
 * Primary navigation for authenticated screens.
 *
 * The Browse badge is deliberately sourced from the installed deck rather than
 * hard-coded. This keeps the count useful when a content pack or deck
 * definition changes, and it remains available offline with the same local
 * source of truth as Browse itself. Help is a bundled route so it remains
 * available alongside the study surfaces when the network is unavailable.
 */
export function AppNavigation({
  userId,
}: AppNavigationProps): React.ReactElement {
  const [browseCount, setBrowseCount] = useState<number | null>(null)

  useEffect(() => {
    const runtime = getActiveUserRuntime()
    if (!runtime || runtime.userId !== userId) return
    let active = true

    void (async () => {
      try {
        await runtime.database.ready
        const deck = await loadStarterDeck(runtime.database)
        if (active) setBrowseCount(deck.cards.length)
      } catch {
        // Navigation remains usable if the pack is still loading or unavailable.
      }
    })()

    return () => {
      active = false
    }
  }, [userId])

  return (
    <nav
      className="flex min-w-0 items-center gap-1 overflow-x-auto"
      aria-label="Primary"
    >
      <NavLink href="/">Home</NavLink>
      <NavLink href="/study">Study</NavLink>
      <Link
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring relative inline-flex min-h-11 items-center gap-2 rounded-md px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
        href="/browse"
        aria-label={
          browseCount === null ? 'Browse' : `Browse, ${browseCount} stickies`
        }
      >
        <span>Browse</span>
        {browseCount !== null && (
          <span
            className="bg-primary text-primary-foreground inline-flex min-w-6 items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums"
            data-testid="browse-count-badge"
            aria-hidden="true"
          >
            {browseCount}
          </span>
        )}
      </Link>
      <NavLink href="/history">History</NavLink>
      <NavLink href="/dictionary">Dictionary</NavLink>
      <NavLink href="/help">Help</NavLink>
    </nav>
  )
}

function NavLink({
  href,
  children,
}: {
  readonly href: string
  readonly children: React.ReactNode
}): React.ReactElement {
  return (
    <Link
      className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex min-h-11 items-center rounded-md px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
      href={href}
    >
      {children}
    </Link>
  )
}
