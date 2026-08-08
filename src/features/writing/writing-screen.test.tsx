import { readFileSync } from 'fs'
import { join } from 'path'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bootstrapUserRuntime, clearUserRuntime } from '@/auth/runtime'
import { WritingScreen } from './writing-screen'

const FIXTURE_ROOT = join(process.cwd(), 'public', 'packs-dev')
const REPO_PACK_ROOT = join(process.cwd(), 'packs')

function fixtureFetch(): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input).replace(/^\/packs-dev\//, '')
    try {
      const buffer = readFileSync(
        join(path.startsWith('strokes/') ? REPO_PACK_ROOT : FIXTURE_ROOT, path),
      )
      const body = path.endsWith('.json')
        ? buffer.toString('utf8')
        : new Uint8Array(buffer)
      return new Response(body as BodyInit, { status: 200 })
    } catch {
      return new Response('not found', { status: 404 })
    }
  }) as unknown as typeof fetch
}

beforeEach(() => {
  vi.stubGlobal('fetch', fixtureFetch())
  window.history.replaceState({}, '', '/writing?contentRef=kanji%3A%E6%97%A5')
})

afterEach(() => {
  cleanup()
  clearUserRuntime()
})

describe('WritingScreen', () => {
  it('requires authentication', () => {
    render(<WritingScreen />)
    expect(screen.getByText('Sign in to practice writing.')).toBeInTheDocument()
  })

  it('loads an offline kanji guide and captures, undoes, and clears a pointer stroke', async () => {
    bootstrapUserRuntime('writing-user')
    const user = userEvent.setup()
    render(<WritingScreen />)

    const surface = await screen.findByRole('application', {
      name: 'Writing canvas for 日',
    })
    expect(screen.getByRole('heading', { name: '日' })).toBeInTheDocument()
    expect(screen.getByText('0 strokes captured of 4')).toBeInTheDocument()

    fireEvent.pointerDown(surface, {
      pointerId: 1,
      clientX: 20,
      clientY: 20,
    })
    fireEvent.pointerMove(surface, {
      pointerId: 1,
      clientX: 70,
      clientY: 70,
    })
    fireEvent.pointerUp(surface, {
      pointerId: 1,
      clientX: 80,
      clientY: 80,
    })

    await waitFor(() =>
      expect(screen.getByText('1 stroke captured of 4')).toBeInTheDocument(),
    )
    expect(screen.getByLabelText('Captured stroke 1')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Undo stroke' }))
    expect(screen.getByText('0 strokes captured of 4')).toBeInTheDocument()

    fireEvent.pointerDown(surface, { pointerId: 2, clientX: 20, clientY: 20 })
    fireEvent.pointerMove(surface, { pointerId: 2, clientX: 70, clientY: 70 })
    fireEvent.pointerUp(surface, { pointerId: 2, clientX: 80, clientY: 80 })
    await waitFor(() =>
      expect(screen.getByText('1 stroke captured of 4')).toBeInTheDocument(),
    )
    await user.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(screen.getByText('0 strokes captured of 4')).toBeInTheDocument()
  })
})
