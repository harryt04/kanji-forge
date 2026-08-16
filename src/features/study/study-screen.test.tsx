import { readFileSync } from 'fs'
import { join } from 'path'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  bootstrapUserRuntime,
  clearUserRuntime,
  getActiveUserRuntime,
} from '@/auth/runtime'
import { createUserRepositories } from '@/data/repo'
import { findDictionaryEntry } from '@/data/packs'
import { useStudyStore } from './store'
import { GREY_STICKIES_SETTING, StudyScreen } from './study-screen'
import {
  STUDY_ANSWER_SETTING,
  STUDY_QUESTION_SETTING,
  SRS_MODE_SETTING,
  STUDY_TWO_TAP_SETTING,
} from './study-style'
import { STUDY_AUTO_PLAY_AUDIO_SETTING } from './audio'
import { installAudioPack, removeAudioPack } from './audio-pack'
import { zipSync } from 'fflate'

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
const originalStorage = Object.getOwnPropertyDescriptor(navigator, 'storage')

function setPointerCoarse(coarse: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: coarse,
      media: '(pointer: coarse)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
}

beforeEach(() => {
  vi.stubGlobal('fetch', fixtureFetch())
  userId += 1
  bootstrapUserRuntime(`study-screen-user-${userId}`)
})

afterEach(() => {
  if (originalStorage) {
    Object.defineProperty(navigator, 'storage', originalStorage)
  } else {
    Reflect.deleteProperty(navigator, 'storage')
  }
  vi.useRealTimers()
  vi.unstubAllGlobals()
  cleanup()
  clearUserRuntime()
  useStudyStore.setState(useStudyStore.getInitialState(), true)
})

async function renderReady(): Promise<void> {
  render(<StudyScreen />)
  await waitFor(() =>
    expect(screen.queryByText('Loading deck…')).not.toBeInTheDocument(),
  )
}

describe('StudyScreen', () => {
  it('shows the sign-in prompt when there is no active runtime', () => {
    clearUserRuntime()
    render(<StudyScreen />)
    expect(screen.getByText('Sign in to study.')).toBeInTheDocument()
  })

  it('loads the deck and reveals the card on tap', async () => {
    await renderReady()
    expect(screen.getByTestId('study-question')).toHaveClass(
      'text-[length:var(--text-display)]',
    )
    const revealButton = screen.getByRole('button', { name: 'Reveal (Space)' })
    await userEvent.click(revealButton)
    expect(screen.getByRole('button', { name: /I know/ })).toHaveClass(
      'bg-success',
    )
    expect(screen.getByRole('button', { name: /No problem/ })).toHaveClass(
      'bg-perfect',
    )
  })

  it('hides the keyboard hint on coarse-pointer devices', async () => {
    setPointerCoarse(true)
    await renderReady()

    expect(screen.getByRole('button', { name: 'Reveal' })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Reveal (Space)' }),
    ).not.toBeInTheDocument()
  })

  it('keeps the keyboard hint on fine-pointer devices', async () => {
    setPointerCoarse(false)
    await renderReady()

    expect(
      screen.getByRole('button', { name: 'Reveal (Space)' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Reveal' }),
    ).not.toBeInTheDocument()
  })

  it('announces study-card position and reveal state to assistive technology', async () => {
    await renderReady()
    const announcement = screen.getByTestId('study-announcement')

    expect(announcement).toHaveTextContent(
      `Card 1 of ${useStudyStore.getState().queue.length}`,
    )
    expect(announcement).toHaveTextContent('Answer hidden')

    await userEvent.click(
      screen.getByRole('button', { name: 'Reveal (Space)' }),
    )

    expect(announcement).toHaveTextContent('Answer revealed')
    expect(announcement).toHaveTextContent('Choose a grade')
  })

  it('allows the focused flashcard to reveal with Enter', async () => {
    await renderReady()
    const card = screen.getByRole('button', { name: 'Reveal answer' })

    card.focus()
    await userEvent.keyboard('{Enter}')

    expect(screen.getByRole('button', { name: /I know/ })).toBeInTheDocument()
  })

  it('does not expose audio controls for kanji-only cards', async () => {
    const speak = vi.fn()
    const cancel = vi.fn()
    class FakeUtterance {
      lang = ''
      rate = 1
      constructor(readonly text: string) {}
    }
    vi.stubGlobal('speechSynthesis', { speak, cancel })
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)

    await renderReady()
    expect(
      screen.queryByRole('button', { name: 'Play Japanese audio' }),
    ).not.toBeInTheDocument()

    await userEvent.click(
      screen.getByRole('button', { name: 'Reveal (Space)' }),
    )
    expect(speak).not.toHaveBeenCalled()
  })

  it('does not auto-play kanji audio even when the preference is enabled', async () => {
    const runtime = getActiveUserRuntime()!
    await createUserRepositories(runtime.database).settings.set({
      key: STUDY_AUTO_PLAY_AUDIO_SETTING,
      value: 'true',
      updatedAt: Date.now(),
    })
    const speak = vi.fn()
    const cancel = vi.fn()
    class FakeUtterance {
      lang = ''
      rate = 1
      constructor(readonly text: string) {}
    }
    vi.stubGlobal('speechSynthesis', { speak, cancel })
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)

    await renderReady()
    await userEvent.click(
      screen.getByRole('button', { name: 'Reveal (Space)' }),
    )
    expect(speak).not.toHaveBeenCalled()
  })

  it('flags and unflags the current card from the study screen', async () => {
    await renderReady()
    const flagButton = screen.getByRole('button', { name: 'Flag card' })

    await userEvent.click(flagButton)

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Unflag card' }),
      ).toHaveAttribute('aria-pressed', 'true'),
    )
    expect(useStudyStore.getState().queue[0]?.state?.flagged).toBe(true)

    await userEvent.click(screen.getByRole('button', { name: 'Unflag card' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Flag card' })).toHaveAttribute(
        'aria-pressed',
        'false',
      ),
    )
  })

  it('applies the motion-reduce class to the flashcard', async () => {
    await renderReady()
    const card = screen.getByRole('button', { name: 'Reveal answer' })
    expect(card.className).toContain('motion-reduce:transition-none')
  })

  it('keeps the session timer hidden until requested and updates it while visible', async () => {
    await renderReady()
    expect(screen.queryByText('Time 0:00')).not.toBeInTheDocument()

    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: 'Show timer' }))
    expect(screen.getByText('Time 0:00')).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(61_000))
    expect(screen.getByText('Time 1:01')).toBeInTheDocument()
  })

  it('persists the grey-stickies preference and hides study colors', async () => {
    await renderReady()
    const sticky = screen.getByRole('button', { name: 'Reveal answer' })
    const toggle = screen.getByRole('button', { name: 'Hide sticky colors' })

    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(toggle)

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Show sticky colors' }),
      ).toHaveAttribute('aria-pressed', 'true'),
    )
    expect(sticky).toHaveAttribute('data-grey-stickies', 'true')
    expect(sticky).toHaveStyle({ borderColor: 'var(--muted-foreground)' })
    expect(
      await createUserRepositories(
        getActiveUserRuntime()!.database,
      ).settings.get(GREY_STICKIES_SETTING),
    ).toMatchObject({ key: GREY_STICKIES_SETTING, value: 'true' })
  })

  it('loads the grey-stickies preference for a later study session', async () => {
    const runtime = getActiveUserRuntime()!
    await createUserRepositories(runtime.database).settings.set({
      key: GREY_STICKIES_SETTING,
      value: 'true',
      updatedAt: Date.now(),
    })

    await renderReady()

    expect(
      screen.getByRole('button', { name: 'Show sticky colors' }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(
      screen.getByRole('button', { name: 'Reveal answer' }),
    ).toHaveAttribute('data-grey-stickies', 'true')
  })

  it('uses the saved meaning as the question before reveal', async () => {
    const runtime = getActiveUserRuntime()!
    await createUserRepositories(runtime.database).settings.set({
      key: STUDY_QUESTION_SETTING,
      value: 'meaning',
      updatedAt: Date.now(),
    })

    await renderReady()

    const question = screen.getByTestId('study-question')
    expect(question).toHaveAttribute('data-study-question', 'meaning')
    expect(question).toHaveTextContent('country')
    expect(question).not.toHaveTextContent('日')
  })

  it('starts the session with the saved adaptive scheduler mode', async () => {
    const runtime = getActiveUserRuntime()!
    await createUserRepositories(runtime.database).settings.set({
      key: SRS_MODE_SETTING,
      value: 'adaptive',
      updatedAt: Date.now(),
    })

    await renderReady()

    expect(useStudyStore.getState().schedulerMode).toBe('adaptive')
  })

  it('renders only the saved answer fields after reveal', async () => {
    const runtime = getActiveUserRuntime()!
    await createUserRepositories(runtime.database).settings.set({
      key: STUDY_ANSWER_SETTING,
      value: 'meaning',
      updatedAt: Date.now(),
    })

    await renderReady()
    await userEvent.click(
      screen.getByRole('button', { name: 'Reveal (Space)' }),
    )

    const answer = screen.getByTestId('study-answer')
    expect(answer).toHaveTextContent('country')
    expect(answer).not.toHaveTextContent('音:')
    expect(answer).not.toHaveTextContent('訓:')
    expect(answer).not.toHaveTextContent('日')
  })

  it('hides related example readings and meanings until tapped', async () => {
    await renderReady()
    await userEvent.click(
      screen.getByRole('button', { name: 'Reveal (Space)' }),
    )

    const related = await screen.findByTestId('study-related')
    const disclose = within(related).getAllByRole('button', {
      name: /Show reading and meaning for/,
    })[0]
    if (!disclose) throw new Error('related example disclosure missing')
    expect(
      within(related).queryByTestId('study-related-details'),
    ).not.toBeInTheDocument()

    await userEvent.click(disclose)

    expect(
      within(related).getByTestId('study-related-details'),
    ).toBeInTheDocument()
  })

  it('renders writing practice on the answer side for every kanji card', async () => {
    await renderReady()
    await userEvent.click(
      screen.getByRole('button', { name: 'Reveal (Space)' }),
    )

    expect(
      screen.getByRole('application', { name: /Writing canvas for/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Clear all' }),
    ).toBeInTheDocument()
  })

  it('offers writing practice for the kanji inside a word card', async () => {
    const entry = await findDictionaryEntry('お金')
    if (!entry || entry.type !== 'word') throw new Error('word fixture missing')
    const runtime = getActiveUserRuntime()!
    const repo = createUserRepositories(runtime.database)
    const deck = {
      id: 'word-study-deck',
      name: 'Word study',
      kind: 'custom' as const,
      definitionId: null,
      updatedAt: 1,
    }
    await repo.recordDeckMembership({
      deck,
      membership: {
        deckId: deck.id,
        contentRef: `word:${entry.record.id}`,
        sortOrder: 0,
        addedAt: 1,
        updatedAt: 1,
      },
      mutation: {
        id: 'word-study-membership',
        mutType: 'deckMembership.upsert',
        payload: JSON.stringify({
          deckId: deck.id,
          contentRef: `word:${entry.record.id}`,
        }),
        createdAt: 1,
        attempts: 0,
      },
    })
    await repo.settings.set({
      key: STUDY_AUTO_PLAY_AUDIO_SETTING,
      value: 'true',
      updatedAt: Date.now(),
    })
    const speak = vi.fn()
    const cancel = vi.fn()
    class FakeUtterance {
      lang = ''
      rate = 1
      constructor(readonly text: string) {}
    }
    vi.stubGlobal('speechSynthesis', { speak, cancel })
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)

    render(<StudyScreen deckDefinitionId={deck.id} />)
    await waitFor(() =>
      expect(screen.getByTestId('study-question')).toHaveTextContent('お金'),
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Reveal (Space)' }),
    )

    expect(screen.getByTestId('study-answer')).toBeInTheDocument()
    expect(
      screen.getByRole('application', { name: 'Writing canvas for 金' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('radiogroup', { name: 'Kanji to practice writing' }),
    ).not.toBeInTheDocument()
    await waitFor(() => expect(speak).toHaveBeenCalledOnce())
  })

  it('exposes installed community audio when speech synthesis is unavailable', async () => {
    const entry = await findDictionaryEntry('お金')
    if (!entry || entry.type !== 'word') throw new Error('word fixture missing')
    const runtime = getActiveUserRuntime()!
    const repo = createUserRepositories(runtime.database)
    const deck = {
      id: 'community-audio-study-deck',
      name: 'Community audio study',
      kind: 'custom' as const,
      definitionId: null,
      updatedAt: 1,
    }
    await repo.recordDeckMembership({
      deck,
      membership: {
        deckId: deck.id,
        contentRef: `word:${entry.record.id}`,
        sortOrder: 0,
        addedAt: 1,
        updatedAt: 1,
      },
      mutation: {
        id: 'community-audio-study-membership',
        mutType: 'deckMembership.upsert',
        payload: JSON.stringify({
          deckId: deck.id,
          contentRef: `word:${entry.record.id}`,
        }),
        createdAt: 1,
        attempts: 0,
      },
    })
    const packId = `study-audio-${crypto.randomUUID()}`
    const pack = zipSync({
      'manifest.json': new TextEncoder().encode(
        JSON.stringify({
          id: packId,
          name: 'Study voice',
          version: '1.0.0',
          license: 'CC BY 4.0',
          attribution: 'A Japanese speaker',
          files: { 'お金|おかね': 'audio/okane.mp3' },
        }),
      ),
      'audio/okane.mp3': new Uint8Array([1, 2, 3]),
    })
    await installAudioPack(pack)
    const createObjectUrl = Object.getOwnPropertyDescriptor(
      URL,
      'createObjectURL',
    )
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: () => 'blob:study-audio',
    })

    try {
      class FakeAudio {
        static instances: FakeAudio[] = []
        constructor(readonly src: string) {
          FakeAudio.instances.push(this)
        }
        addEventListener(): void {}
        async play(): Promise<void> {}
      }
      vi.stubGlobal('Audio', FakeAudio)

      render(<StudyScreen deckDefinitionId={deck.id} />)
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: 'Play Japanese audio' }),
        ).toBeInTheDocument(),
      )
      expect(screen.getByText('Japanese audio')).toBeInTheDocument()

      await userEvent.click(
        screen.getByRole('button', { name: 'Play Japanese audio' }),
      )
      await waitFor(() => expect(FakeAudio.instances).toHaveLength(1))
    } finally {
      await removeAudioPack(packId)
      if (createObjectUrl) {
        Object.defineProperty(URL, 'createObjectURL', createObjectUrl)
      } else {
        Reflect.deleteProperty(URL, 'createObjectURL')
      }
    }
  })

  it('reveals readings first and all card details on the second tap', async () => {
    const runtime = getActiveUserRuntime()!
    await createUserRepositories(runtime.database).settings.set({
      key: STUDY_QUESTION_SETTING,
      value: 'meaning',
      updatedAt: Date.now(),
    })
    await createUserRepositories(runtime.database).settings.set({
      key: STUDY_ANSWER_SETTING,
      value: 'meaning',
      updatedAt: Date.now(),
    })
    await createUserRepositories(runtime.database).settings.set({
      key: STUDY_TWO_TAP_SETTING,
      value: 'true',
      updatedAt: Date.now(),
    })

    await renderReady()
    expect(screen.getByTestId('study-question')).toHaveAttribute(
      'data-study-question',
      'kanji',
    )
    expect(screen.getByTestId('study-question')).not.toHaveTextContent(
      'country',
    )
    expect(
      screen.getByRole('button', { name: 'Show readings (Space)' }),
    ).toBeInTheDocument()

    await userEvent.click(
      screen.getByRole('button', { name: 'Show readings (Space)' }),
    )
    expect(screen.getByTestId('study-two-tap-readings')).toHaveTextContent(
      '音:',
    )
    expect(
      screen.queryByRole('button', { name: /I know/ }),
    ).not.toBeInTheDocument()

    await userEvent.click(
      screen.getByRole('button', { name: 'Show everything (Space)' }),
    )
    expect(screen.getByRole('button', { name: /I know/ })).toBeInTheDocument()
    expect(screen.getByTestId('study-answer')).toHaveTextContent('country')
    expect(screen.getByTestId('study-answer')).toHaveTextContent('国')
  })

  it('grades via keyboard once revealed', async () => {
    await renderReady()
    const user = userEvent.setup()
    await user.keyboard(' ')
    await waitFor(() => expect(useStudyStore.getState().revealed).toBe(true))
    const before = useStudyStore.getState().index
    await user.keyboard('{ArrowRight}')
    await waitFor(() =>
      expect(useStudyStore.getState().summary.seen).toBeGreaterThan(0),
    )
    expect(useStudyStore.getState().index).not.toBe(before)
  })

  it('does not grade on arrow keys before reveal', async () => {
    await renderReady()
    const user = userEvent.setup()
    await user.keyboard('{ArrowRight}')
    expect(useStudyStore.getState().summary.seen).toBe(0)
  })

  it('grades via a left/right swipe gesture once revealed', async () => {
    await renderReady()
    const card = screen.getByRole('button', { name: 'Reveal answer' })
    await userEvent.click(
      screen.getByRole('button', { name: 'Reveal (Space)' }),
    )

    card.dispatchEvent(
      new TouchEvent('touchstart', {
        touches: [{ clientX: 200 } as Touch],
        bubbles: true,
      }),
    )
    card.dispatchEvent(
      new TouchEvent('touchend', {
        changedTouches: [{ clientX: 100 } as Touch],
        bubbles: true,
      }),
    )

    await waitFor(() =>
      expect(useStudyStore.getState().summary.seen).toBeGreaterThan(0),
    )
  })

  it('undo restores the previous card and disables itself again', async () => {
    await renderReady()
    await userEvent.click(
      screen.getByRole('button', { name: 'Reveal (Space)' }),
    )
    await userEvent.click(screen.getByRole('button', { name: /I know/ }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled(),
    )
    const indexAfterGrade = useStudyStore.getState().index

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))

    await waitFor(() =>
      expect(useStudyStore.getState().index).not.toBe(indexAfterGrade),
    )
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
  })

  it('shows a session summary with the correct totals when finished', async () => {
    await renderReady()
    await userEvent.click(screen.getByRole('button', { name: 'Finish' }))
    await waitFor(() =>
      expect(screen.getByText('Session summary')).toBeInTheDocument(),
    )
    expect(screen.getByText('Cards seen').nextElementSibling).toHaveTextContent(
      String(useStudyStore.getState().summary.seen),
    )
  })

  it('persists and closes the study session when finished', async () => {
    await renderReady()
    const runtime = getActiveUserRuntime()!
    const repo = createUserRepositories(runtime.database)

    await waitFor(async () =>
      expect(await repo.sessions.list('dev-kanji')).toHaveLength(1),
    )
    expect((await repo.sessions.list('dev-kanji'))[0]?.endedAt).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Finish' }))

    await waitFor(async () =>
      expect(
        (await repo.sessions.list('dev-kanji'))[0]?.endedAt,
      ).not.toBeNull(),
    )
  })

  it('requests durable storage after the first non-empty session finishes', async () => {
    const persist = vi.fn().mockResolvedValue(true)
    const persisted = vi.fn().mockResolvedValue(false)
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { persist, persisted },
    })
    const runtime = getActiveUserRuntime()!
    const repo = createUserRepositories(runtime.database)

    await renderReady()
    await userEvent.click(
      screen.getByRole('button', { name: 'Reveal (Space)' }),
    )
    await userEvent.click(screen.getByRole('button', { name: /I know/ }))
    await waitFor(() =>
      expect(useStudyStore.getState().summary.seen).toBeGreaterThan(0),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Finish' }))

    await waitFor(() => expect(persist).toHaveBeenCalledOnce())
    await expect(
      repo.settings.get('pwa.storagePersistenceRequested'),
    ).resolves.toMatchObject({ value: 'true' })
  })
})
