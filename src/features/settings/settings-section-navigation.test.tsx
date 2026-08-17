import { readFileSync } from 'fs'
import { join } from 'path'
import { render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bootstrapUserRuntime, clearUserRuntime } from '@/auth/runtime'
import { SettingsScreen } from './settings-screen'

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

describe('Settings section navigation', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fixtureFetch())
    bootstrapUserRuntime(`settings-navigation-${crypto.randomUUID()}`)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    clearUserRuntime()
  })

  it('links to every top-level settings heading', async () => {
    render(<SettingsScreen />)

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Appearance' }),
      ).toBeInTheDocument(),
    )

    const navigation = screen.getByRole('navigation', {
      name: 'Settings sections',
    })
    const links = within(navigation).getAllByRole('link')
    const headings = screen.getAllByRole('heading', { level: 2 })

    expect(links).toHaveLength(headings.length)
    for (const link of links) {
      const href = link.getAttribute('href')
      expect(href).toMatch(/^#[\w-]+$/)
      const target = document.querySelector(href ?? '')
      expect(target?.tagName).toBe('H2')
      expect(headings).toContain(target)
    }
  })
})
