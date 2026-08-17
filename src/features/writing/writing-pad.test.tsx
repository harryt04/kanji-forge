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
import { WritingPad } from './writing-pad'

const FIXTURE_ROOT = join(process.cwd(), 'public', 'packs-dev')
const REPO_PACK_ROOT = join(process.cwd(), 'packs')

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
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('WritingPad', () => {
  it('loads a guide and captures, undoes, and clears a pointer stroke', async () => {
    const user = userEvent.setup()
    render(
      <WritingPad literal="日" validationEnabled={false} leniency="normal" />,
    )

    const surface = await screen.findByRole('application', {
      name: 'Writing canvas for 日',
    })
    await waitFor(() =>
      expect(screen.getByText('0 strokes captured of 4')).toBeInTheDocument(),
    )

    const guidePaths = Array.from(surface.querySelectorAll('svg path'))
    expect(guidePaths).toHaveLength(4)
    for (const path of guidePaths) {
      expect(path).toHaveAttribute('fill', 'none')
      expect(path).toHaveAttribute('stroke', 'currentColor')
    }

    fireEvent.pointerDown(surface, { pointerId: 1, clientX: 20, clientY: 20 })
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 70, clientY: 70 })
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 80, clientY: 80 })

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

  it('accepts a correctly traced stroke while validation is on', async () => {
    render(
      <WritingPad literal="日" validationEnabled={true} leniency="normal" />,
    )

    const surface = await screen.findByRole('application', {
      name: 'Writing canvas for 日',
    })
    await waitFor(() =>
      expect(screen.getByText('0 strokes captured of 4')).toBeInTheDocument(),
    )
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
    render(
      <WritingPad literal="日" validationEnabled={true} leniency="normal" />,
    )

    const surface = await screen.findByRole('application', {
      name: 'Writing canvas for 日',
    })
    await waitFor(() =>
      expect(screen.getByText('0 strokes captured of 4')).toBeInTheDocument(),
    )
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

  it('escalates writing hints after repeated rejected strokes', async () => {
    render(
      <WritingPad literal="日" validationEnabled={true} leniency="normal" />,
    )

    const surface = await screen.findByRole('application', {
      name: 'Writing canvas for 日',
    })
    await waitFor(() =>
      expect(screen.getByText('0 strokes captured of 4')).toBeInTheDocument(),
    )
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

  it('clears the canvas automatically once the kanji is finished', async () => {
    render(
      <WritingPad literal="日" validationEnabled={false} leniency="normal" />,
    )

    const surface = await screen.findByRole('application', {
      name: 'Writing canvas for 日',
    })
    await waitFor(() =>
      expect(screen.getByText('0 strokes captured of 4')).toBeInTheDocument(),
    )
    mockCanvasBounds(surface)

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

  it('reports completion without clearing when autoClear is disabled', async () => {
    const onComplete = vi.fn()
    render(
      <WritingPad
        literal="日"
        validationEnabled={false}
        leniency="normal"
        autoClear={false}
        onComplete={onComplete}
      />,
    )

    const surface = await screen.findByRole('application', {
      name: 'Writing canvas for 日',
    })
    await waitFor(() =>
      expect(screen.getByText('0 strokes captured of 4')).toBeInTheDocument(),
    )
    mockCanvasBounds(surface)

    const drawStroke = (pointerId: number): void => {
      fireEvent.pointerDown(surface, { pointerId, clientX: 20, clientY: 20 })
      fireEvent.pointerMove(surface, { pointerId, clientX: 70, clientY: 70 })
      fireEvent.pointerUp(surface, { pointerId, clientX: 80, clientY: 80 })
    }

    for (let index = 0; index < 4; index += 1) drawStroke(index + 1)

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))
    expect(screen.getByText('4 strokes captured of 4')).toBeInTheDocument()
  })
})
