import { readFileSync } from 'fs'
import { join } from 'path'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bootstrapUserRuntime, clearUserRuntime } from '@/auth/runtime'
import { DetailScreen } from './detail-screen'

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
  userId += 1
  window.history.replaceState({}, '', '/detail?contentRef=kanji%3A%E6%97%A5')
})

afterEach(() => {
  cleanup()
  clearUserRuntime()
})

describe('DetailScreen', () => {
  it('prompts anonymous users to sign in', () => {
    render(<DetailScreen />)
    expect(screen.getByText('Sign in to view details.')).toBeInTheDocument()
  })

  it('loads the selected kanji detail from the offline pack', async () => {
    bootstrapUserRuntime(`detail-${userId}`)
    render(<DetailScreen />)

    await waitFor(() =>
      expect(screen.getByTestId('kanji-detail')).toBeInTheDocument(),
    )

    expect(screen.getByRole('heading', { name: '日' })).toBeInTheDocument()
    expect(
      screen.getByText('day; sun; Japan; counter for days'),
    ).toBeInTheDocument()
    expect(screen.getByText('Stroke count')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Example words' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'No example words are available in the installed dictionary pack.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: '← Back to Browse' }),
    ).toHaveAttribute('href', '/browse')
  })

  it('opens a similar kanji that is outside the starter deck', async () => {
    bootstrapUserRuntime(`detail-${userId}`)
    window.history.replaceState({}, '', '/detail?contentRef=kanji%3A%E5%9B%BD')
    render(<DetailScreen />)

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: '国' })).toBeInTheDocument(),
    )
    expect(screen.getByText('country')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Example words' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/love of one's country/)).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Similar-looking kanji' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'View details for 固' }),
    ).toHaveAttribute('href', '/detail?contentRef=kanji%3A%E5%9B%BA')
  })
})
