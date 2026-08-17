import { readFileSync } from 'fs'
import { join } from 'path'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  bootstrapUserRuntime,
  clearUserRuntime,
  getActiveUserRuntime,
} from '@/auth/runtime'
import { createUserRepositories } from '@/data/repo'
import { AppNavigation } from './app-navigation'
import {
  BROWSE_BADGE_DECK_CHANGED_EVENT,
  BROWSE_BADGE_SETTING,
  BROWSE_BADGE_SETTING_CHANGED_EVENT,
} from './browse-badge'

const pathnameState = vi.hoisted(() => ({ current: '/home' }))

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameState.current,
}))

const FIXTURE_ROOT = join(process.cwd(), 'public', 'packs-dev')

function fixtureFetch(): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.startsWith('/packs/decks/')) {
      try {
        return new Response(
          readFileSync(join(process.cwd(), url.slice(1)), 'utf8'),
          { status: 200 },
        )
      } catch {
        return new Response('not found', { status: 404 })
      }
    }
    const path = url.replace(/^\/packs-dev\//, '')
    try {
      const buffer = readFileSync(join(FIXTURE_ROOT, path))
      const body = path.endsWith('.json')
        ? buffer.toString('utf8')
        : new Uint8Array(buffer)
      return new Response(body as BodyInit, { status: 200 })
    } catch {
      return new Response('not found', { status: 404 })
    }
  }) as unknown as typeof fetch
}

let userId = 0

beforeEach(() => {
  vi.stubGlobal('fetch', fixtureFetch())
  pathnameState.current = '/home'
  userId += 1
})

afterEach(() => {
  cleanup()
  clearUserRuntime()
})

describe('AppNavigation', () => {
  it('shows the installed sticky count on Browse and keeps primary routes accessible', async () => {
    const id = `navigation-${userId}`
    bootstrapUserRuntime(id)

    render(<AppNavigation userId={id} />)

    expect(
      screen.getByRole('navigation', { name: 'Primary' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Browse' })).toHaveAttribute(
      'href',
      '/browse',
    )
    await waitFor(() =>
      expect(screen.getByTestId('browse-count-badge')).toHaveTextContent('52'),
    )
    expect(
      screen.getByRole('link', {
        name: 'Browse, 52 cards due in JLPT Kanji N5',
      }),
    ).toHaveAttribute('href', '/browse')
    expect(screen.getByRole('link', { name: 'History' })).toHaveAttribute(
      'href',
      '/history',
    )
    expect(screen.getByRole('link', { name: 'Writing' })).toHaveAttribute(
      'href',
      '/writing',
    )
    expect(screen.getByRole('link', { name: 'Help' })).toHaveAttribute(
      'href',
      '/help',
    )
  })

  it('does not show a stale badge for an unavailable runtime', () => {
    render(<AppNavigation userId="missing-user" />)

    expect(screen.queryByTestId('browse-count-badge')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Browse' })).toBeInTheDocument()
  })

  it('shows a visual overflow cue for the horizontal destination scroller', () => {
    render(<AppNavigation userId="missing-user" />)

    expect(screen.getByTestId('navigation-overflow-cue')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
  })

  it('does not add a horizontal overflow cue to the desktop sidebar', () => {
    render(<AppNavigation userId="missing-user" orientation="vertical" />)

    expect(
      screen.queryByTestId('navigation-overflow-cue'),
    ).not.toBeInTheDocument()
  })

  it('supports the persistent desktop sidebar orientation', async () => {
    const id = `navigation-${userId}`
    bootstrapUserRuntime(id)

    render(<AppNavigation userId={id} orientation="vertical" />)

    expect(screen.getByRole('navigation', { name: 'Primary' })).toHaveAttribute(
      'data-orientation',
      'vertical',
    )
    await waitFor(() =>
      expect(screen.getByTestId('browse-count-badge')).toHaveTextContent('52'),
    )
    expect(screen.getByRole('link', { name: 'Dictionary' })).toHaveClass(
      'w-full',
    )
  })

  it('hides the badge when the browse badge preference is off', async () => {
    const id = `navigation-${userId}`
    bootstrapUserRuntime(id)
    const runtime = getActiveUserRuntime()!
    await runtime.database.ready
    await createUserRepositories(runtime.database).settings.set({
      key: BROWSE_BADGE_SETTING,
      value: 'off',
      updatedAt: Date.now(),
    })

    render(<AppNavigation userId={id} />)

    expect(screen.getByRole('link', { name: 'Browse' })).toBeInTheDocument()
    await waitFor(() =>
      expect(
        screen.queryByTestId('browse-count-badge'),
      ).not.toBeInTheDocument(),
    )
  })

  it('reacts to a Browse badge setting change without remounting', async () => {
    const id = `navigation-${userId}`
    bootstrapUserRuntime(id)

    render(<AppNavigation userId={id} />)
    await waitFor(() =>
      expect(screen.getByTestId('browse-count-badge')).toHaveTextContent('52'),
    )

    const runtime = getActiveUserRuntime()!
    await createUserRepositories(runtime.database).settings.set({
      key: BROWSE_BADGE_SETTING,
      value: 'off',
      updatedAt: Date.now(),
    })
    window.dispatchEvent(new Event(BROWSE_BADGE_SETTING_CHANGED_EVENT))

    await waitFor(() =>
      expect(
        screen.queryByTestId('browse-count-badge'),
      ).not.toBeInTheDocument(),
    )
  })

  it('follows the deck announced from Browse', async () => {
    const id = `navigation-${userId}`
    bootstrapUserRuntime(id)

    render(<AppNavigation userId={id} />)
    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: /JLPT Kanji N5/ }),
      ).toBeInTheDocument(),
    )

    window.dispatchEvent(
      new CustomEvent(BROWSE_BADGE_DECK_CHANGED_EVENT, {
        detail: { deckId: 'jlpt-kanji-n4' },
      }),
    )

    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: /JLPT Kanji N4/ }),
      ).toBeInTheDocument(),
    )
  })

  it.each([
    ['/home', 'Home'],
    ['/study', 'Study'],
    ['/writing', 'Writing'],
    ['/browse', 'Browse'],
    ['/history', 'History'],
    ['/dictionary', 'Dictionary'],
    ['/help', 'Help'],
  ])('marks %s as the current page', (pathname, label) => {
    pathnameState.current = pathname

    render(<AppNavigation userId="navigation-active" />)

    const activeLink = screen.getByRole('link', { name: label })
    expect(activeLink).toHaveAttribute('aria-current', 'page')
    expect(activeLink).toHaveClass('bg-muted', 'text-foreground')
    expect(
      screen
        .getAllByRole('link')
        .filter((link) => link !== activeLink)
        .every((link) => link.getAttribute('aria-current') !== 'page'),
    ).toBe(true)
  })
})
