'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { getActiveUserRuntime } from '@/auth/runtime'
import { createUserRepositories } from '@/data/repo'
import { loadDeck } from '@/features/study/deck-loader'
import { STARTER_DECK_ID } from '@/features/decks/starter-deck'
import { APP_BADGE_STATE_CHANGED_EVENT } from '@/pwa/events'
import {
  BROWSE_BADGE_DECK_CHANGED_EVENT,
  BROWSE_BADGE_SETTING,
  BROWSE_BADGE_SETTING_CHANGED_EVENT,
  browseBadgeLabel,
  countBrowseBadgeCards,
  isBrowseBadgePreference,
  type BrowseBadgePreference,
} from './browse-badge'

interface AppNavigationProps {
  readonly userId: string
  readonly orientation?: 'horizontal' | 'vertical'
}

function browseDeckIdFromLocation(pathname: string): string {
  if (typeof window === 'undefined' || !pathname.startsWith('/browse'))
    return STARTER_DECK_ID
  const requested = new URL(window.location.href).searchParams.get('deckId')
  return requested || STARTER_DECK_ID
}

/**
 * Primary navigation for authenticated screens.
 *
 * The Browse badge is deliberately sourced from the installed deck rather than
 * hard-coded. It tracks whichever deck Browse currently shows (see
 * `announceBrowseDeck` in `browse-screen.tsx`), and its meaning (due / total /
 * unstudied / off) is a user setting read from `BROWSE_BADGE_SETTING`. It
 * remains available offline with the same local source of truth as Browse
 * itself. Help is a bundled route so it remains available alongside the study
 * surfaces when the network is unavailable.
 */
export function AppNavigation({
  userId,
  orientation = 'horizontal',
}: AppNavigationProps): React.ReactElement {
  const pathname = usePathname()
  const [browseBadge, setBrowseBadge] = useState<{
    count: number
    label: string
  } | null>(null)
  const [deckId, setDeckId] = useState(() => browseDeckIdFromLocation(pathname))
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    setDeckId(browseDeckIdFromLocation(pathname))
  }, [pathname])

  useEffect(() => {
    function onDeckChanged(event: Event): void {
      const detail = (event as CustomEvent<{ deckId: string }>).detail
      if (detail?.deckId) setDeckId(detail.deckId)
    }
    function bumpRefresh(): void {
      setRefreshKey((key) => key + 1)
    }
    window.addEventListener(BROWSE_BADGE_DECK_CHANGED_EVENT, onDeckChanged)
    window.addEventListener(BROWSE_BADGE_SETTING_CHANGED_EVENT, bumpRefresh)
    window.addEventListener(APP_BADGE_STATE_CHANGED_EVENT, bumpRefresh)
    window.addEventListener('popstate', bumpRefresh)
    return () => {
      window.removeEventListener(BROWSE_BADGE_DECK_CHANGED_EVENT, onDeckChanged)
      window.removeEventListener(
        BROWSE_BADGE_SETTING_CHANGED_EVENT,
        bumpRefresh,
      )
      window.removeEventListener(APP_BADGE_STATE_CHANGED_EVENT, bumpRefresh)
      window.removeEventListener('popstate', bumpRefresh)
    }
  }, [])

  useEffect(() => {
    const runtime = getActiveUserRuntime()
    if (!runtime || runtime.userId !== userId) return
    let active = true

    void (async () => {
      try {
        await runtime.database.ready
        const deck = await loadDeck(runtime.database, deckId)
        const repositories = createUserRepositories(runtime.database)
        const saved = await repositories.settings.get(BROWSE_BADGE_SETTING)
        const savedPreference = saved?.value ?? ''
        const preference: BrowseBadgePreference = isBrowseBadgePreference(
          savedPreference,
        )
          ? savedPreference
          : 'due'
        if (!active) return
        if (preference === 'off') {
          setBrowseBadge(null)
          return
        }
        const count = countBrowseBadgeCards(deck.cards, preference, Date.now())
        setBrowseBadge({
          count,
          label: browseBadgeLabel(count, preference, deck.name),
        })
      } catch {
        // Navigation remains usable if the pack is still loading or unavailable.
      }
    })()

    return () => {
      active = false
    }
  }, [userId, deckId, refreshKey])

  return (
    <div
      className={orientation === 'vertical' ? undefined : 'relative min-w-0'}
    >
      <nav
        className={
          orientation === 'vertical'
            ? 'grid w-full gap-1'
            : 'flex min-w-0 items-center gap-1 overflow-x-auto'
        }
        aria-label="Primary"
        data-orientation={orientation}
      >
        <NavLink href="/home" orientation={orientation} pathname={pathname}>
          Home
        </NavLink>
        <NavLink href="/study" orientation={orientation} pathname={pathname}>
          Study
        </NavLink>
        <NavLink href="/writing" orientation={orientation} pathname={pathname}>
          Writing
        </NavLink>
        <Link
          className={navigationLinkClassName(
            orientation,
            isNavigationPathActive(pathname, '/browse'),
            'relative gap-2',
          )}
          href="/browse"
          title={browseBadge?.label}
          aria-label={
            browseBadge === null ? 'Browse' : `Browse, ${browseBadge.label}`
          }
          aria-current={
            isNavigationPathActive(pathname, '/browse') ? 'page' : undefined
          }
        >
          <span>Browse</span>
          {browseBadge !== null && (
            <span
              className="bg-primary text-primary-foreground inline-flex min-w-6 items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums"
              data-testid="browse-count-badge"
              aria-hidden="true"
            >
              {browseBadge.count}
            </span>
          )}
        </Link>
        <NavLink href="/history" orientation={orientation} pathname={pathname}>
          History
        </NavLink>
        <NavLink
          href="/dictionary"
          orientation={orientation}
          pathname={pathname}
        >
          Dictionary
        </NavLink>
        <NavLink href="/help" orientation={orientation} pathname={pathname}>
          Help
        </NavLink>
      </nav>
      {orientation === 'horizontal' && (
        <span
          className="navigation-overflow-cue"
          data-testid="navigation-overflow-cue"
          aria-hidden="true"
        />
      )}
    </div>
  )
}

function NavLink({
  href,
  children,
  orientation,
  pathname,
}: {
  readonly href: string
  readonly children: React.ReactNode
  readonly orientation: 'horizontal' | 'vertical'
  readonly pathname: string
}): React.ReactElement {
  const active = isNavigationPathActive(pathname, href)

  return (
    <Link
      className={navigationLinkClassName(orientation, active)}
      aria-current={active ? 'page' : undefined}
      href={href}
    >
      {children}
    </Link>
  )
}

function isNavigationPathActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

function navigationLinkClassName(
  orientation: 'horizontal' | 'vertical',
  active: boolean,
  additionalClasses = '',
): string {
  return [
    active ? 'bg-muted text-foreground font-medium' : 'text-muted-foreground',
    'hover:text-foreground focus-visible:ring-ring inline-flex min-h-11 items-center rounded-md px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none',
    orientation === 'vertical' ? 'w-full' : '',
    additionalClasses,
  ]
    .filter(Boolean)
    .join(' ')
}
