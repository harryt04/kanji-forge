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
import { useStudyStore } from './store'
import { StudyScreen } from './study-screen'

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
  bootstrapUserRuntime(`study-screen-user-${userId}`)
})

afterEach(() => {
  vi.useRealTimers()
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
    const revealButton = screen.getByRole('button', { name: 'Reveal (Space)' })
    await userEvent.click(revealButton)
    expect(screen.getByRole('button', { name: /I know/ })).toBeInTheDocument()
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
})
