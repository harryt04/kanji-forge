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
import { createUserRepositories } from '@/data/repo'
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
      screen.getByRole('heading', { name: 'Example sentences' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'No example sentences are available in the installed sentence pack.',
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

  it('moves through deck cards with detail navigation controls', async () => {
    bootstrapUserRuntime(`detail-${userId}`)
    render(<DetailScreen />)

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: '日' })).toBeInTheDocument(),
    )
    expect(screen.getByText('1 of 200')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Previous/ })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: /Next/ }))
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: '一' })).toBeInTheDocument(),
    )
    expect(window.location.search).toBe('?contentRef=kanji%3A%E4%B8%80')
    expect(screen.getByText('2 of 200')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Previous/ }))
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: '日' })).toBeInTheDocument(),
    )
  })

  it('moves to the adjacent sticky after a horizontal touch swipe', async () => {
    bootstrapUserRuntime(`detail-${userId}`)
    render(<DetailScreen />)

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: '日' })).toBeInTheDocument(),
    )
    const main = screen.getByRole('main')
    fireEvent.touchStart(main, { touches: [{ clientX: 240 }] })
    fireEvent.touchEnd(main, { changedTouches: [{ clientX: 150 }] })

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: '一' })).toBeInTheDocument(),
    )
  })

  it('renders offline sentence breakdowns with highlighted kanji and attribution', async () => {
    bootstrapUserRuntime(`detail-${userId}`)
    window.history.replaceState({}, '', '/detail?contentRef=kanji%3A%E7%AB%8B')
    render(<DetailScreen />)

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: '立' })).toBeInTheDocument(),
    )

    expect(screen.getByText('Example sentences')).toBeInTheDocument()
    expect(screen.getByLabelText('立ちなさい。')).toBeInTheDocument()
    expect(screen.getByText('Stand up!')).toBeInTheDocument()
    expect(
      screen.getByText('Tatoeba · Japanese by mookeee · English by CK'),
    ).toBeInTheDocument()
    expect(screen.queryByText('ぼく')).not.toBeInTheDocument()
    expect(
      screen
        .getAllByText('立')
        .some((element) => element.classList.contains('bg-primary/20')),
    ).toBe(true)
  })

  it('saves the selected kanji to the offline Saved deck', async () => {
    const runtime = bootstrapUserRuntime(`detail-${userId}`)
    const user = userEvent.setup()
    render(<DetailScreen />)

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Save to Saved' }),
      ).toBeInTheDocument(),
    )
    await user.click(screen.getByRole('button', { name: 'Save to Saved' }))

    expect(await screen.findByRole('button', { name: 'Saved' })).toBeDisabled()
    expect(
      await createUserRepositories(runtime.database).deckMembership.list(),
    ).toMatchObject([{ contentRef: 'kanji:日', deckId: 'saved' }])
    expect(
      (await createUserRepositories(runtime.database).outbox.pending())[0],
    ).toMatchObject({ mutType: 'deckMembership.upsert' })
  })
})
