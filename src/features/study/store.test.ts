import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserRepositories } from '@/data/repo'
import { requeueAfterAgain } from '@/core/srs/queue'
import { useStudyStore } from './store'
import type { LoadedDeck } from './deck-loader'

const initialState = useStudyStore.getState()

beforeEach(() => {
  useStudyStore.setState(initialState, true)
  window.localStorage.clear()
})

function loadedDeck(cardCount = 3): LoadedDeck {
  const cards = Array.from({ length: cardCount }, (_, index) => ({
    deckId: 'dev-kanji',
    contentRef: `kanji:${index}`,
    state: undefined,
  }))
  const content = new Map(
    cards.map((card, index) => [
      card.contentRef,
      {
        contentRef: card.contentRef,
        literal: String(index),
        meanings: ['test'],
        onReadings: [],
        kunReadings: [],
      },
    ]),
  )
  return { deckId: 'dev-kanji', name: 'Dev Kanji', cards, content }
}

function fakeRepo(overrides: Partial<UserRepositories> = {}): UserRepositories {
  return {
    recordGrade: vi.fn(async () => {}),
    ...overrides,
  } as unknown as UserRepositories
}

describe('useStudyStore.start', () => {
  it('builds the session queue from the loaded deck', () => {
    useStudyStore.getState().start(loadedDeck(3))
    const state = useStudyStore.getState()
    expect(state.deckId).toBe('dev-kanji')
    expect(state.deckName).toBe('Dev Kanji')
    expect(state.queue).toHaveLength(3)
    expect(state.index).toBe(0)
    expect(state.revealed).toBe(false)
    expect(state.finished).toBe(false)
  })

  it('marks the session finished immediately for an empty deck', () => {
    useStudyStore.getState().start(loadedDeck(0))
    expect(useStudyStore.getState().finished).toBe(true)
  })
})

describe('useStudyStore.reveal', () => {
  it('flips the answer face', () => {
    useStudyStore.getState().start(loadedDeck(1))
    useStudyStore.getState().reveal()
    expect(useStudyStore.getState().revealed).toBe(true)
  })
})

describe('useStudyStore.toggleFlag', () => {
  it('persists and toggles the current card flag', async () => {
    useStudyStore.getState().start(loadedDeck(1))
    const repo = fakeRepo({ recordCardState: vi.fn(async () => {}) })

    await useStudyStore.getState().toggleFlag(repo)

    expect(useStudyStore.getState().queue[0]?.state?.flagged).toBe(true)
    expect(repo.recordCardState).toHaveBeenCalledTimes(1)
    expect(vi.mocked(repo.recordCardState).mock.calls[0]![0]).toMatchObject({
      state: { deckId: 'dev-kanji', contentRef: 'kanji:0', flagged: true },
      mutation: { mutType: 'cardState.upsert' },
    })

    await useStudyStore.getState().toggleFlag(repo)
    expect(useStudyStore.getState().queue[0]?.state?.flagged).toBe(false)
    expect(repo.recordCardState).toHaveBeenCalledTimes(2)
  })
})

describe('useStudyStore.grade', () => {
  it('persists the grade via repo.recordGrade with the current card', async () => {
    useStudyStore.getState().start(loadedDeck(2))
    const repo = fakeRepo()
    const firstCard = useStudyStore.getState().queue[0]!

    await useStudyStore.getState().grade(repo, 'good')

    expect(repo.recordGrade).toHaveBeenCalledTimes(1)
    const call = vi.mocked(repo.recordGrade).mock.calls[0]![0]
    expect(call.review).toMatchObject({
      deckId: firstCard.deckId,
      contentRef: firstCard.stickyId,
      grade: 'good',
      source: 'study',
    })
  })

  it('advances the index and tallies the summary on a passing grade', async () => {
    useStudyStore.getState().start(loadedDeck(2))
    await useStudyStore.getState().grade(fakeRepo(), 'good')

    const state = useStudyStore.getState()
    expect(state.index).toBe(1)
    expect(state.revealed).toBe(false)
    expect(state.summary).toMatchObject({
      seen: 1,
      correct: 1,
      incorrect: 0,
    })
  })

  it('tallies wentGreen when a card first reaches level four', async () => {
    useStudyStore.getState().start(loadedDeck(1))
    await useStudyStore.getState().grade(fakeRepo(), 'easy')
    expect(useStudyStore.getState().summary.wentGreen).toBe(1)
  })

  it('requeues an "again" card per requeueAfterAgain and keeps the index in place', async () => {
    useStudyStore.getState().start(loadedDeck(3))
    const queueBefore = useStudyStore.getState().queue
    const failedCard = queueBefore[0]!

    await useStudyStore.getState().grade(fakeRepo(), 'again')

    const state = useStudyStore.getState()
    expect(state.index).toBe(0) // the next card shifted into this position
    expect(state.summary).toMatchObject({ seen: 1, incorrect: 1, correct: 0 })

    const withoutCurrent = queueBefore.filter(
      (_entry, position) => position !== 0,
    )
    // The requeue position follows requeueAfterAgain's failureCount=1 rule (lag 5, or
    // end-of-queue for short queues) regardless of the exact updated state contents.
    const expectedIndex = requeueAfterAgain(
      withoutCurrent,
      { ...failedCard, state: undefined },
      1,
    ).findIndex((card) => card.stickyId === failedCard.stickyId)
    const actualIndex = state.queue.findIndex(
      (card) => card.stickyId === failedCard.stickyId,
    )
    expect(actualIndex).toBe(expectedIndex)
  })

  it('finishes the session once the last card is graded', async () => {
    useStudyStore.getState().start(loadedDeck(1))
    await useStudyStore.getState().grade(fakeRepo(), 'good')
    expect(useStudyStore.getState().finished).toBe(true)
  })

  it('does not touch the store when persistence fails, leaving the queue intact', async () => {
    useStudyStore.getState().start(loadedDeck(2))
    const before = useStudyStore.getState()
    const repo = fakeRepo({
      recordGrade: vi.fn(async () => {
        throw new Error('offline')
      }),
    })

    await expect(useStudyStore.getState().grade(repo, 'good')).rejects.toThrow(
      'offline',
    )

    const after = useStudyStore.getState()
    expect(after.queue).toBe(before.queue)
    expect(after.index).toBe(before.index)
    expect(after.summary).toBe(before.summary)
  })

  it('does nothing when the queue is exhausted', async () => {
    useStudyStore.getState().start(loadedDeck(0))
    const repo = fakeRepo()
    await useStudyStore.getState().grade(repo, 'good')
    expect(repo.recordGrade).not.toHaveBeenCalled()
  })
})

describe('useStudyStore.undo', () => {
  it('restores the prior queue, index, and summary snapshot', async () => {
    useStudyStore.getState().start(loadedDeck(2))
    const snapshotBeforeGrade = useStudyStore.getState()
    const repo = fakeRepo()
    await useStudyStore.getState().grade(repo, 'good')
    expect(useStudyStore.getState().index).toBe(1)

    await useStudyStore.getState().undo(repo)

    const state = useStudyStore.getState()
    expect(state.index).toBe(snapshotBeforeGrade.index)
    expect(state.queue).toEqual(snapshotBeforeGrade.queue)
    expect(state.summary).toEqual(snapshotBeforeGrade.summary)
    expect(state.lastGrade).toBeNull()
  })

  it('writes a compensating manual-source review restoring the prior level', async () => {
    useStudyStore.getState().start(loadedDeck(1))
    const repo = fakeRepo()
    await useStudyStore.getState().grade(repo, 'easy')

    await useStudyStore.getState().undo(repo)

    const undoCall = vi.mocked(repo.recordGrade).mock.calls[1]![0]
    expect(undoCall.review).toMatchObject({
      source: 'manual',
      levelBefore: 0,
      levelAfter: 0,
    })
  })

  it('does nothing when there is nothing to undo', async () => {
    useStudyStore.getState().start(loadedDeck(1))
    const repo = fakeRepo()
    await useStudyStore.getState().undo(repo)
    expect(repo.recordGrade).not.toHaveBeenCalled()
  })
})

describe('useStudyStore.finish', () => {
  it('marks the session finished', () => {
    useStudyStore.getState().start(loadedDeck(2))
    useStudyStore.getState().finish()
    expect(useStudyStore.getState().finished).toBe(true)
  })
})
