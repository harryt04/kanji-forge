import { readFileSync } from 'fs'
import { join } from 'path'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
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
import { WritingScreen } from './writing-screen'
import {
  WRITING_LENIENCY_SETTING,
  WRITING_VALIDATION_SETTING,
} from './settings'

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

/**
 * Size the canvas to the KanjiVG box so client coordinates in a test map one to
 * one onto the guide's own coordinates.
 */
function mockCanvasBounds(surface: HTMLElement): void {
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
    bottom: 109,
    height: 109,
    left: 0,
    right: 109,
    top: 0,
    width: 109,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  })
}

beforeEach(() => {
  vi.stubGlobal('fetch', fixtureFetch())
  window.history.replaceState({}, '', '/writing?contentRef=kanji%3A%E6%97%A5')
})

afterEach(() => {
  cleanup()
  clearUserRuntime()
  vi.useRealTimers()
})

describe('WritingScreen', () => {
  it('requires authentication', () => {
    render(<WritingScreen />)
    expect(screen.getByText('Sign in to practice writing.')).toBeInTheDocument()
  })

  it('loads an offline kanji guide', async () => {
    bootstrapUserRuntime('writing-user')
    render(<WritingScreen />)

    await screen.findByRole('application', {
      name: 'Writing canvas for 日',
    })
    expect(screen.getByRole('heading', { name: '日' })).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByText('0 strokes captured of 4')).toBeInTheDocument(),
    )
  })

  it('persists the correct-strokes preference offline', async () => {
    bootstrapUserRuntime('writing-settings-user')
    const user = userEvent.setup()
    render(<WritingScreen />)

    const checkbox = await screen.findByRole('checkbox', {
      name: 'Check stroke order',
    })
    await user.click(checkbox)

    const runtime = getActiveUserRuntime()
    await waitFor(async () =>
      expect(
        await createUserRepositories(runtime!.database).settings.get(
          WRITING_VALIDATION_SETTING,
        ),
      ).toMatchObject({ value: 'false' }),
    )
  })

  it('persists and restores the stroke matching tolerance offline', async () => {
    bootstrapUserRuntime('writing-leniency-user')
    const user = userEvent.setup()
    const { unmount } = render(<WritingScreen />)

    const select = await screen.findByRole('combobox', {
      name: 'Stroke matching tolerance',
    })
    expect(select).toHaveValue('forgiving')
    await user.selectOptions(select, 'strict')

    const runtime = getActiveUserRuntime()
    await waitFor(async () =>
      expect(
        await createUserRepositories(runtime!.database).settings.get(
          WRITING_LENIENCY_SETTING,
        ),
      ).toMatchObject({ value: 'strict' }),
    )

    unmount()
    render(<WritingScreen />)
    expect(
      await screen.findByRole('combobox', {
        name: 'Stroke matching tolerance',
      }),
    ).toHaveValue('strict')
  })

  it('clears the canvas automatically once the kanji is finished outside a drill', async () => {
    bootstrapUserRuntime('writing-autoclear-user')
    render(<WritingScreen />)

    const surface = await screen.findByRole('application', {
      name: 'Writing canvas for 日',
    })
    await waitFor(() =>
      expect(screen.getByText('0 strokes captured of 4')).toBeInTheDocument(),
    )
    mockCanvasBounds(surface)
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Check stroke order' }),
    )

    const drawStroke = (pointerId: number): void => {
      fireEvent.pointerDown(surface, { pointerId, clientX: 20, clientY: 20 })
      fireEvent.pointerMove(surface, { pointerId, clientX: 70, clientY: 70 })
      fireEvent.pointerUp(surface, { pointerId, clientX: 80, clientY: 80 })
    }

    // Fake timers must be in place before the last stroke schedules the
    // auto-clear timeout, or advancing them later has nothing to act on.
    vi.useFakeTimers()
    for (let index = 0; index < 4; index += 1) drawStroke(index + 1)
    expect(screen.getByText('4 strokes captured of 4')).toBeInTheDocument()
    expect(
      screen.getByText(/Nicely drawn — clearing the canvas/),
    ).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(1200))

    expect(screen.getByText('0 strokes captured of 4')).toBeInTheDocument()
    expect(screen.queryByLabelText(/Captured stroke/)).not.toBeInTheDocument()
  })

  it('keeps the finished repetition on screen until the advance delay elapses', async () => {
    bootstrapUserRuntime('writing-drill-noclear-user')
    render(<WritingScreen />)

    const surface = await screen.findByRole('application', {
      name: 'Writing canvas for 日',
    })
    await waitFor(() =>
      expect(screen.getByText('0 strokes captured of 4')).toBeInTheDocument(),
    )
    mockCanvasBounds(surface)
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Check stroke order' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Start drill' }))

    const drawStroke = (pointerId: number): void => {
      fireEvent.pointerDown(surface, { pointerId, clientX: 20, clientY: 20 })
      fireEvent.pointerMove(surface, { pointerId, clientX: 70, clientY: 70 })
      fireEvent.pointerUp(surface, { pointerId, clientX: 80, clientY: 80 })
    }

    // Fake timers must be in place before the last stroke schedules the
    // auto-advance timeout, or advancing them later has nothing to act on.
    vi.useFakeTimers()
    for (let index = 0; index < 4; index += 1) drawStroke(index + 1)

    expect(screen.getByText('4 strokes captured of 4')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Next repetition' }),
    ).toBeEnabled()
  })

  it('advances to the next repetition automatically once it is drawn correctly', async () => {
    bootstrapUserRuntime('writing-drill-autoadvance-user')
    render(<WritingScreen />)

    let surface = await screen.findByRole('application', {
      name: 'Writing canvas for 日',
    })
    await waitFor(() =>
      expect(screen.getByText('0 strokes captured of 4')).toBeInTheDocument(),
    )
    mockCanvasBounds(surface)
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Check stroke order' }),
    )
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Repetitions' }), {
      target: { value: '2' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Start drill' }))
    expect(screen.getByText('Repetition 1 of 2')).toBeInTheDocument()

    const drawStroke = (pointerId: number): void => {
      fireEvent.pointerDown(surface, { pointerId, clientX: 20, clientY: 20 })
      fireEvent.pointerMove(surface, { pointerId, clientX: 70, clientY: 70 })
      fireEvent.pointerUp(surface, { pointerId, clientX: 80, clientY: 80 })
    }

    vi.useFakeTimers()
    for (let index = 0; index < 4; index += 1) drawStroke(index + 1)
    expect(screen.getByText(/starting the next repetition/)).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(1200))

    expect(screen.getByText('Repetition 2 of 2')).toBeInTheDocument()

    // The drill starts a fresh repetition by remounting the pad, so the
    // canvas is a new DOM node — re-query it and flush its (microtask-only)
    // stroke guide fetch without leaving fake timers, so the earlier
    // schedule stays under test control throughout.
    surface = screen.getByRole('application', { name: 'Writing canvas for 日' })
    await act(() => Promise.resolve())
    mockCanvasBounds(surface)

    for (let index = 0; index < 4; index += 1) drawStroke(index + 10)
    expect(screen.getByText(/drill complete/i)).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(1200))

    expect(
      screen.getByText('Drill complete — 2 repetitions finished.'),
    ).toBeInTheDocument()
  })

  it('runs a standalone writing drill for a chosen number of repetitions', async () => {
    bootstrapUserRuntime('writing-drill-user')
    const user = userEvent.setup()
    render(<WritingScreen />)

    let surface = await screen.findByRole('application', {
      name: 'Writing canvas for 日',
    })
    await waitFor(() =>
      expect(screen.getByText('0 strokes captured of 4')).toBeInTheDocument(),
    )
    await user.click(
      screen.getByRole('checkbox', { name: 'Check stroke order' }),
    )
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Repetitions' }), {
      target: { value: '2' },
    })
    await user.click(screen.getByRole('button', { name: 'Start drill' }))
    expect(screen.getByText('Repetition 1 of 2')).toBeInTheDocument()

    const drawAllStrokes = (): void => {
      for (let index = 0; index < 4; index += 1) {
        const pointerId = index + 10
        fireEvent.pointerDown(surface, {
          pointerId,
          clientX: 20,
          clientY: 20,
        })
        fireEvent.pointerMove(surface, {
          pointerId,
          clientX: 70,
          clientY: 70,
        })
        fireEvent.pointerUp(surface, {
          pointerId,
          clientX: 80,
          clientY: 80,
        })
      }
    }

    drawAllStrokes()
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Next repetition' }),
      ).toBeEnabled(),
    )
    await user.click(screen.getByRole('button', { name: 'Next repetition' }))
    expect(screen.getByText('Repetition 2 of 2')).toBeInTheDocument()

    // The drill starts a fresh repetition by remounting the pad, so the
    // canvas is a new DOM node and needs to be re-queried.
    surface = await screen.findByRole('application', {
      name: 'Writing canvas for 日',
    })
    await waitFor(() =>
      expect(screen.getByText('0 strokes captured of 4')).toBeInTheDocument(),
    )

    drawAllStrokes()
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Finish drill' }),
      ).toBeEnabled(),
    )
    await user.click(screen.getByRole('button', { name: 'Finish drill' }))
    expect(
      screen.getByText('Drill complete — 2 repetitions finished.'),
    ).toBeInTheDocument()
  })

  it('walks the whole deck, not just one kanji', async () => {
    bootstrapUserRuntime('writing-queue-user')
    const user = userEvent.setup()
    window.history.replaceState({}, '', '/writing')
    render(<WritingScreen />)

    // The deck's first entry is not necessarily 日 — the trainer follows the
    // same SRS-ordered queue Study would use.
    await waitFor(() =>
      expect(
        screen.getByText(/Development Kanji · Character 1 of \d+/),
      ).toBeInTheDocument(),
    )
    const firstHeading = screen.getByRole('heading', { level: 1 })
    const firstLiteral = firstHeading.textContent
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() =>
      expect(
        screen.getByText(/Development Kanji · Character 2 of \d+/),
      ).toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled()
    expect(screen.getByRole('heading', { level: 1 }).textContent).not.toBe(
      firstLiteral,
    )

    await user.click(screen.getByRole('button', { name: 'Previous' }))
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
        firstLiteral,
      ),
    )
  })

  it('switches decks and expands a word deck into its kanji', async () => {
    bootstrapUserRuntime('writing-deck-switch-user')
    window.history.replaceState({}, '', '/writing')
    render(<WritingScreen />)

    await waitFor(() =>
      expect(
        screen.getByText(/Development Kanji · Character 1 of \d+/),
      ).toBeInTheDocument(),
    )
    const deckSelect = screen.getByRole('combobox', { name: 'Deck' })
    await waitFor(() =>
      expect(
        Array.from(deckSelect.querySelectorAll('option')).map(
          (option) => option.textContent,
        ),
      ).toContain('Development Words'),
    )

    fireEvent.change(deckSelect, {
      target: { value: 'dev-words' },
    })

    await waitFor(() =>
      expect(
        screen.getByText(/Development Words · Character 1 of \d+/),
      ).toBeInTheDocument(),
    )
    // Every option in the character picker must be a single kanji, never kana.
    const characterSelect = screen.getByRole('combobox', {
      name: 'Character',
    })
    for (const option of Array.from(
      characterSelect.querySelectorAll('option'),
    )) {
      expect(option.textContent).toMatch(/^[一-鿿㐀-䶿]$/u)
    }
  })
})
