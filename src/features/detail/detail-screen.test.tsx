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
import { searchDictionary } from '@/data/packs'
import { DetailScreen } from './detail-screen'
import { SAVE_BEHAVIOR_SETTING } from './save-behavior'

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
    expect(screen.getByText('School grade')).toBeInTheDocument()
    expect(screen.getByText('Grade 1')).toBeInTheDocument()
    expect(screen.getByText('JLPT')).toBeInTheDocument()
    expect(screen.getByText('N4')).toBeInTheDocument()
    expect(screen.getByText('Frequency rank')).toBeInTheDocument()
    expect(screen.getByText('#1')).toBeInTheDocument()
    expect(screen.getByText('Name readings')).toBeInTheDocument()
    expect(
      screen.getByText(
        'あ、あき、いる、く、くさ、こう、す、たち、に、にっ、につ、へ',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Stroke order' }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('stroke-animation')).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: 'Stroke order animation for 日' }),
    ).toBeInTheDocument()
    expect(screen.getByText('0 of 4 strokes')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Radical and components' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'No component decomposition is available in the installed stroke pack.',
      ),
    ).toBeInTheDocument()
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

  it('plays the selected kanji reading with the device voice when available', async () => {
    const speak = vi.fn()
    const cancel = vi.fn()
    class FakeUtterance {
      lang = ''
      rate = 1
      constructor(readonly text: string) {}
    }
    vi.stubGlobal('speechSynthesis', { speak, cancel })
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)

    bootstrapUserRuntime(`detail-${userId}`)
    render(<DetailScreen />)

    const button = await screen.findByRole('button', {
      name: 'Play synthesized Japanese audio for 日',
    })
    await userEvent.click(button)

    expect(cancel).toHaveBeenCalledOnce()
    expect(speak).toHaveBeenCalledOnce()
    expect(speak.mock.calls[0]?.[0]).toMatchObject({
      text: 'ニチ',
      lang: 'ja-JP',
      rate: 0.85,
    })
    expect(screen.getByText('Synthesized voice')).toBeInTheDocument()
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
      screen.getByRole('heading', { name: 'Radical and components' }),
    ).toBeInTheDocument()
    expect(
      screen.getAllByRole('list', { name: 'Character elements' }).length,
    ).toBeGreaterThan(0)
    expect(screen.getAllByText('囗').length).toBeGreaterThan(0)
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

    await userEvent.click(screen.getByRole('button', { name: 'Next →' }))
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

  it('opens an analyzed word detail and saves the word offline', async () => {
    const result = (await searchDictionary('お金')).find(
      (entry) => entry.type === 'word',
    )
    if (!result || result.type !== 'word')
      throw new Error('Word fixture missing')
    const runtime = bootstrapUserRuntime(`detail-${userId}`)
    window.history.replaceState(
      {},
      '',
      `/detail?contentRef=${encodeURIComponent(`word:${result.record.id}`)}`,
    )
    const user = userEvent.setup()
    render(<DetailScreen />)

    expect(await screen.findByTestId('word-detail')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'お金、御金' }),
    ).toBeInTheDocument()
    expect(screen.getByText('money')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save to Saved' }))

    expect(await screen.findByRole('button', { name: 'Saved' })).toBeDisabled()
    await expect(
      createUserRepositories(runtime.database).deckMembership.list(),
    ).resolves.toMatchObject([
      { contentRef: `word:${result.record.id}`, deckId: 'saved' },
    ])
  })

  it('adds the selected kanji to an existing custom deck', async () => {
    const runtime = bootstrapUserRuntime(`detail-${userId}`)
    const repositories = createUserRepositories(runtime.database)
    const now = Date.now()
    await repositories.recordDeck({
      deck: {
        id: 'custom-travel',
        name: 'Travel',
        kind: 'custom',
        definitionId: null,
        updatedAt: now,
      },
      mutation: {
        id: crypto.randomUUID(),
        mutType: 'deck.upsert',
        payload: JSON.stringify({ id: 'custom-travel' }),
        createdAt: now,
        attempts: 0,
      },
    })
    const user = userEvent.setup()
    render(<DetailScreen />)

    await user.click(
      await screen.findByRole('button', { name: 'Add to Travel' }),
    )

    expect(
      await screen.findByRole('button', { name: 'Added to Travel' }),
    ).toBeDisabled()
    await expect(
      repositories.deckMembership.list('custom-travel'),
    ).resolves.toMatchObject([
      { deckId: 'custom-travel', contentRef: 'kanji:日', sortOrder: 0 },
    ])
    expect((await repositories.outbox.pending()).at(-1)).toMatchObject({
      mutType: 'deckMembership.upsert',
    })
  })

  it('asks before saving when the preference is enabled', async () => {
    const runtime = bootstrapUserRuntime(`detail-${userId}`)
    await createUserRepositories(runtime.database).settings.set({
      key: SAVE_BEHAVIOR_SETTING,
      value: 'ask',
      updatedAt: Date.now(),
    })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const user = userEvent.setup()
    render(<DetailScreen />)

    await user.click(
      await screen.findByRole('button', { name: 'Save to Saved' }),
    )

    expect(confirm).toHaveBeenCalledWith('Save 日 to your Saved deck?')
    await expect(
      createUserRepositories(runtime.database).deckMembership.list(),
    ).resolves.toEqual([])
    confirm.mockRestore()
  })

  it('saves per-sticky notes and normalized tags offline', async () => {
    const runtime = bootstrapUserRuntime(`detail-${userId}`)
    const user = userEvent.setup()
    render(<DetailScreen />)

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Notes and tags' }),
      ).toBeInTheDocument(),
    )
    await user.type(
      screen.getByLabelText('Personal note'),
      'Use this in a sentence.',
    )
    await user.type(screen.getByLabelText('Tags'), ' tricky, radical, tricky ')
    await user.click(
      screen.getByRole('button', { name: 'Save notes and tags' }),
    )

    expect(
      await screen.findByText('Saved locally and queued for sync.'),
    ).toBeInTheDocument()
    expect(
      await createUserRepositories(runtime.database).annotations.get(
        'dev-kanji',
        'kanji:日',
      ),
    ).toMatchObject({
      note: 'Use this in a sentence.',
      tags: ['tricky', 'radical'],
    })
    expect(
      (await createUserRepositories(runtime.database).outbox.pending()).at(-1),
    ).toMatchObject({ mutType: 'annotation.upsert' })
  })

  it('steps through stroke order controls offline', async () => {
    bootstrapUserRuntime(`detail-${userId}`)
    render(<DetailScreen />)

    await waitFor(() =>
      expect(screen.getByTestId('stroke-animation')).toBeInTheDocument(),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Next stroke' }))
    expect(screen.getByText('1 of 4 strokes')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Restart' }))
    expect(screen.getByText('0 of 4 strokes')).toBeInTheDocument()
  })
})
