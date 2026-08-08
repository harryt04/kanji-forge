import { create } from 'zustand'
import { applyGrade } from '@/core/srs/grade'
import { buildQueue, requeueAfterAgain, type QueueCard } from '@/core/srs/queue'
import { nextDue } from '@/core/srs/schedule'
import { adaptiveDueAt } from '@/core/srs/adaptive'
import {
  DEFAULT_SRS_CONFIG,
  emptyCardState,
  type Grade,
} from '@/core/srs/types'
import type { SrsMode } from './study-style'
import type { UserRepositories } from '@/data/repo'
import { getDeviceId } from '@/lib/device-id'
import { toCoreState, toRepoState } from './adapters'
import type { LoadedDeck, StudyCard } from './deck-loader'

export interface SessionSummary {
  readonly seen: number
  readonly correct: number
  readonly incorrect: number
  readonly wentGreen: number
  readonly wentRed: number
}

interface UndoEntry {
  readonly queueSnapshot: readonly QueueCard[]
  readonly indexSnapshot: number
  readonly summarySnapshot: SessionSummary
  readonly deckId: string
  readonly contentRef: string
  readonly restoreToLevel: 0 | 1 | 2 | 3 | 4
}

interface StudyState {
  deckId: string | null
  deckName: string
  content: ReadonlyMap<string, StudyCard>
  queue: QueueCard[]
  index: number
  revealed: boolean
  finished: boolean
  summary: SessionSummary
  schedulerMode: SrsMode
  lastGrade: UndoEntry | null
  start(loaded: LoadedDeck, schedulerMode?: SrsMode): void
  reveal(): void
  toggleFlag(repo: UserRepositories): Promise<void>
  grade(repo: UserRepositories, grade: Grade): Promise<void>
  undo(repo: UserRepositories): Promise<void>
  finish(): void
}

const emptySummary: SessionSummary = {
  seen: 0,
  correct: 0,
  incorrect: 0,
  wentGreen: 0,
  wentRed: 0,
}

export const useStudyStore = create<StudyState>((set, get) => ({
  deckId: null,
  deckName: '',
  content: new Map(),
  queue: [],
  index: 0,
  revealed: false,
  finished: false,
  summary: emptySummary,
  schedulerMode: 'sticky',
  lastGrade: null,

  start(loaded, schedulerMode = 'sticky') {
    const now = Date.now()
    const queueCards: QueueCard[] = loaded.cards.map((card, order) => ({
      deckId: card.deckId,
      stickyId: card.contentRef,
      state: card.state ? toCoreState(card.state) : undefined,
      order,
      characters: [loaded.content.get(card.contentRef)?.literal ?? ''],
    }))
    const queue = buildQueue(queueCards, {
      now,
      config: DEFAULT_SRS_CONFIG,
      dayOfYear: Math.floor(now / 86_400_000),
      dailyGoal: DEFAULT_SRS_CONFIG.newPerSession,
      schedulerMode,
    })
    set({
      deckId: loaded.deckId,
      deckName: loaded.name,
      content: loaded.content,
      queue,
      index: 0,
      revealed: false,
      finished: queue.length === 0,
      summary: emptySummary,
      schedulerMode,
      lastGrade: null,
    })
  },

  reveal() {
    set({ revealed: true })
  },

  async toggleFlag(repo) {
    const state = get()
    const card = state.queue[state.index]
    if (!card || !state.deckId) return

    const now = Date.now()
    const deviceId = getDeviceId()
    const before =
      card.state ?? emptyCardState(card.deckId, card.stickyId, deviceId)
    const after = {
      ...before,
      flagged: !before.flagged,
      updatedAt: now,
      updatedBy: deviceId,
    }
    const mutationId = crypto.randomUUID()

    await repo.recordCardState({
      state: toRepoState(after),
      mutation: {
        id: mutationId,
        mutType: 'cardState.upsert',
        payload: JSON.stringify({
          deckId: card.deckId,
          contentRef: card.stickyId,
          flagged: after.flagged,
          updatedAt: now,
          updatedBy: deviceId,
        }),
        createdAt: now,
        attempts: 0,
      },
    })

    const queue = [...state.queue]
    queue[state.index] = { ...card, state: after }
    set({ queue })
  },

  async grade(repo, grade) {
    const state = get()
    const card = state.queue[state.index]
    if (!card || !state.deckId) return

    const queueSnapshot = state.queue
    const indexSnapshot = state.index
    const summarySnapshot = state.summary

    const now = Date.now()
    const deviceId = getDeviceId()
    const before =
      card.state ?? emptyCardState(card.deckId, card.stickyId, deviceId)
    const redCount = state.queue.filter(
      (entry) => (entry.state?.level ?? 0) === 0,
    ).length
    const after = applyGrade({
      state: before,
      grade,
      config: DEFAULT_SRS_CONFIG,
      redCount,
      at: now,
      deviceId,
    })
    after.dueAt =
      state.schedulerMode === 'adaptive'
        ? adaptiveDueAt(after, grade, now)
        : nextDue(after.level, DEFAULT_SRS_CONFIG, now)

    const reviewId = crypto.randomUUID()
    await repo.recordGrade({
      review: {
        id: reviewId,
        deckId: card.deckId,
        contentRef: card.stickyId,
        at: now,
        grade,
        levelBefore: before.level,
        levelAfter: after.level,
        intervalBefore: before.dueAt ? Math.max(0, before.dueAt - now) : 0,
        elapsedDays: before.lastReviewedAt
          ? (now - before.lastReviewedAt) / 86_400_000
          : 0,
        responseMs: 0,
        source: 'study',
        deviceId,
      },
      nextState: toRepoState(after),
      day: new Date(now).toISOString().slice(0, 10),
      mutation: {
        id: reviewId,
        mutType: 'review.append',
        payload: JSON.stringify({
          deckId: card.deckId,
          contentRef: card.stickyId,
          grade,
          at: now,
        }),
        createdAt: now,
        attempts: 0,
      },
    })

    const updatedCard: QueueCard = { ...card, state: after }
    let queue = [...state.queue]
    queue[state.index] = updatedCard
    let nextIndex = state.index + 1
    if (grade === 'again') {
      const withoutCurrent = queue.filter(
        (_entry, position) => position !== state.index,
      )
      queue = requeueAfterAgain(withoutCurrent, updatedCard, before.lapses + 1)
      nextIndex = state.index // the next card has shifted into this position
    }

    const summary: SessionSummary = {
      seen: state.summary.seen + 1,
      correct: state.summary.correct + (grade === 'again' ? 0 : 1),
      incorrect: state.summary.incorrect + (grade === 'again' ? 1 : 0),
      wentGreen:
        state.summary.wentGreen +
        (after.level === 4 && before.level !== 4 ? 1 : 0),
      wentRed:
        state.summary.wentRed +
        (after.level === 0 && before.level !== 0 ? 1 : 0),
    }

    set({
      queue,
      index: nextIndex,
      revealed: false,
      summary,
      lastGrade: {
        queueSnapshot,
        indexSnapshot,
        summarySnapshot,
        deckId: card.deckId,
        contentRef: card.stickyId,
        restoreToLevel: before.level,
      },
      finished: nextIndex >= queue.length,
    })
  },

  async undo(repo) {
    const entry = get().lastGrade
    if (!entry) return

    const now = Date.now()
    const deviceId = getDeviceId()
    const reviewId = crypto.randomUUID()
    // A manual-source review is an absolute level assignment in replay() (SRS-SPEC), so this
    // compensating record restores the pre-grade level without deleting review history.
    await repo.recordGrade({
      review: {
        id: reviewId,
        deckId: entry.deckId,
        contentRef: entry.contentRef,
        at: now,
        grade: 'again',
        levelBefore: entry.restoreToLevel,
        levelAfter: entry.restoreToLevel,
        intervalBefore: 0,
        elapsedDays: 0,
        responseMs: 0,
        source: 'manual',
        deviceId,
      },
      nextState: toRepoState({
        ...(entry.queueSnapshot[entry.indexSnapshot]?.state ??
          emptyCardState(entry.deckId, entry.contentRef, deviceId)),
        level: entry.restoreToLevel,
        updatedAt: now,
        updatedBy: deviceId,
        manualOverride: true,
      }),
      day: new Date(now).toISOString().slice(0, 10),
      mutation: {
        id: reviewId,
        mutType: 'review.append',
        payload: JSON.stringify({
          undo: true,
          deckId: entry.deckId,
          contentRef: entry.contentRef,
        }),
        createdAt: now,
        attempts: 0,
      },
    })

    set({
      queue: [...entry.queueSnapshot],
      index: entry.indexSnapshot,
      summary: entry.summarySnapshot,
      revealed: false,
      finished: false,
      lastGrade: null,
    })
  },

  finish() {
    set({ finished: true })
  },
}))
