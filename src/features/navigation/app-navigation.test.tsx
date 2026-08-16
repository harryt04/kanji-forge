import { readFileSync } from 'fs'
import { join } from 'path'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bootstrapUserRuntime, clearUserRuntime } from '@/auth/runtime'
import { AppNavigation } from './app-navigation'

const pathnameState = vi.hoisted(() => ({ current: '/home' }))

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameState.current,
}))

const FIXTURE_ROOT = join(process.cwd(), 'public', 'packs-dev')

function fixtureFetch(): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input).replace(/^\/packs-dev\//, '')
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
      expect(screen.getByTestId('browse-count-badge')).toHaveTextContent('200'),
    )
    expect(
      screen.getByRole('link', { name: 'Browse, 200 stickies' }),
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
      expect(screen.getByTestId('browse-count-badge')).toHaveTextContent('200'),
    )
    expect(screen.getByRole('link', { name: 'Dictionary' })).toHaveClass(
      'w-full',
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
