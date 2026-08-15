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

  it('loads an offline kanji guide and captures, undoes, and clears a pointer stroke', async () => {
    bootstrapUserRuntime('writing-user')
    const user = userEvent.setup()
    render(<WritingScreen />)

    const surface = await screen.findByRole('application', {
      name: 'Writing canvas for 日',
    })
    expect(screen.getByRole('heading', { name: '日' })).toBeInTheDocument()
    expect(screen.getByText('0 strokes captured of 4')).toBeInTheDocument()

    const guidePaths = Array.from(surface.querySelectorAll('svg path'))
    expect(guidePaths).toHaveLength(4)
    for (const path of guidePaths) {
      expect(path).toHaveAttribute('fill', 'none')
      expect(path).toHaveAttribute('stroke', 'currentColor')
    }

    await user.click(
      screen.getByRole('checkbox', { name: 'Check stroke order' }),
    )

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

  it('accepts a correctly traced stroke while validation is on', async () => {
    bootstrapUserRuntime('writing-accept-user')
    render(<WritingScreen />)

    const surface = await screen.findByRole('application', {
      name: 'Writing canvas for 日',
    })
    mockCanvasBounds(surface)

    // 日's first stroke: a thin vertical from (31.5,24.5) to (33.2,89.5).
    // Traced a little off, the way a trackpad drag lands.
    fireEvent.pointerDown(surface, { pointerId: 1, clientX: 32, clientY: 26 })
    for (const y of [40, 55, 70, 82]) {
      fireEvent.pointerMove(surface, { pointerId: 1, clientX: 34, clientY: y })
    }
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 33, clientY: 88 })

    await waitFor(() =>
      expect(screen.getByText('1 stroke captured of 4')).toBeInTheDocument(),
    )
    expect(screen.queryByText(/not close enough/)).not.toBeInTheDocument()
  })

  it('takes the stroke anyway after three rejected attempts', async () => {
    bootstrapUserRuntime('writing-assist-user')
    render(<WritingScreen />)

    const surface = await screen.findByRole('application', {
      name: 'Writing canvas for 日',
    })
    mockCanvasBounds(surface)

    const drawWrongStroke = (pointerId: number): void => {
      fireEvent.pointerDown(surface, { pointerId, clientX: 100, clientY: 5 })
      fireEvent.pointerMove(surface, { pointerId, clientX: 60, clientY: 8 })
      fireEvent.pointerUp(surface, { pointerId, clientX: 20, clientY: 10 })
    }

    drawWrongStroke(1)
    drawWrongStroke(2)
    drawWrongStroke(3)
    expect(screen.getByText('0 strokes captured of 4')).toBeInTheDocument()
    expect(
      screen.getByText(/next attempt will be accepted/),
    ).toBeInTheDocument()

    drawWrongStroke(4)
    await waitFor(() =>
      expect(screen.getByText('1 stroke captured of 4')).toBeInTheDocument(),
    )
    expect(screen.getByText(/Close enough — moving on/)).toBeInTheDocument()
  })

  it('clears the canvas automatically once the kanji is finished outside a drill', async () => {
    bootstrapUserRuntime('writing-autoclear-user')
    render(<WritingScreen />)

    const surface = await screen.findByRole('application', {
      name: 'Writing canvas for 日',
    })
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

  it('leaves a finished drill repetition on screen for the drill controls', async () => {
    bootstrapUserRuntime('writing-drill-noclear-user')
    render(<WritingScreen />)

    const surface = await screen.findByRole('application', {
      name: 'Writing canvas for 日',
    })
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

    for (let index = 0; index < 4; index += 1) drawStroke(index + 1)

    expect(screen.getByText('4 strokes captured of 4')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Next repetition' }),
    ).toBeEnabled()
  })

  it('escalates writing hints after repeated rejected strokes', async () => {
    bootstrapUserRuntime('writing-hints-user')
    render(<WritingScreen />)

    const surface = await screen.findByRole('application', {
      name: 'Writing canvas for 日',
    })
    mockCanvasBounds(surface)
    const rejectStroke = (pointerId: number): void => {
      fireEvent.pointerDown(surface, { pointerId, clientX: 0, clientY: 0 })
      fireEvent.pointerMove(surface, {
        pointerId,
        clientX: 100,
        clientY: 100,
      })
      fireEvent.pointerUp(surface, { pointerId, clientX: 100, clientY: 100 })
    }

    rejectStroke(1)
    expect(screen.queryByTestId('writing-hint-start')).not.toBeInTheDocument()
    rejectStroke(2)
    expect(screen.getByTestId('writing-hint-start')).toBeInTheDocument()
    expect(screen.getByText(/start at the highlighted dot/)).toBeInTheDocument()
    rejectStroke(3)
    expect(screen.getByTestId('writing-hint-stroke')).toHaveClass(
      'writing-hint-animate',
    )
    expect(screen.getByTestId('writing-hint-stroke')).toHaveAttribute(
      'fill',
      'none',
    )
    expect(screen.getByTestId('writing-hint-stroke')).toHaveAttribute(
      'stroke',
      'var(--accent)',
    )
    expect(screen.getByText(/animated stroke/)).toBeInTheDocument()
  })

  it('runs a standalone writing drill for a chosen number of repetitions', async () => {
    bootstrapUserRuntime('writing-drill-user')
    const user = userEvent.setup()
    render(<WritingScreen />)

    const surface = await screen.findByRole('application', {
      name: 'Writing canvas for 日',
    })
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
    expect(screen.getByText('0 strokes captured of 4')).toBeInTheDocument()

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
})
