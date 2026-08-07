import { seededRandom } from './schedule'
import type { CardState, SrsConfig } from './types'

export interface QueueCard {
  deckId: string
  stickyId: string
  /** Missing state is a lazy, brand-new card. */
  state?: CardState
  order: number
  /** Characters on the card, used only for best-effort priming avoidance. */
  characters?: readonly string[]
}

export interface QueueOptions {
  now: number
  config: SrsConfig
  dailyGoal?: number
  dayOfYear: number
}

function levelOf(card: QueueCard): number {
  return card.state?.level ?? 0
}
function dueOf(card: QueueCard): number {
  return card.state?.dueAt ?? 0
}
function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1))
    ;[result[index], result[other]] = [result[other]!, result[index]!]
  }
  return result
}
function sharesCharacter(left: QueueCard, right: QueueCard): boolean {
  return (left.characters ?? []).some((character) =>
    (right.characters ?? []).includes(character),
  )
}

/** Builds the never-block study queue from explicit pools, without mutating card state. */
export function buildQueue(
  cards: readonly QueueCard[],
  options: QueueOptions,
): QueueCard[] {
  const { now, config } = options
  const due = cards
    .filter(
      (card) => levelOf(card) >= 1 && levelOf(card) <= 3 && dueOf(card) <= now,
    )
    .sort(
      (left, right) =>
        dueOf(left) - dueOf(right) ||
        levelOf(left) - levelOf(right) ||
        left.order - right.order,
    )
  const recycle = cards
    .filter((card) => levelOf(card) === 4 && dueOf(card) <= now)
    .sort(
      (left, right) => dueOf(left) - dueOf(right) || left.order - right.order,
    )
  // Definitions without a projection row are brand new. Existing L0 states are relearning
  // cards and must not consume the per-session introduction allowance.
  const newCards = cards
    .filter((card) => card.state === undefined)
    .sort((left, right) => left.order - right.order)
  // Untouched definitions have no state row and are candidates for introduction, not already
  // circulating cards. This preserves the lazy-card-state invariant.
  const circulation = cards.filter(
    (card) =>
      card.state !== undefined && (levelOf(card) === 0 || levelOf(card) === 1),
  ).length
  const newLimit = Math.max(
    0,
    Math.min(config.newPerSession, config.maxNewInCirculation - circulation),
  )
  const selectedNew = newCards.slice(0, newLimit)
  const target = options.dailyGoal ?? 10
  const selected = [...due, ...recycle, ...selectedNew]
  if (selected.length < target) {
    const selectedIds = new Set(selected.map((card) => card.stickyId))
    const ahead = cards
      .filter(
        (card) => levelOf(card) >= 1 && levelOf(card) <= 3 && dueOf(card) > now,
      )
      .sort(
        (left, right) => dueOf(left) - dueOf(right) || left.order - right.order,
      )
    for (const card of ahead) {
      if (selected.length >= target) break
      if (!selectedIds.has(card.stickyId)) selected.push(card)
    }
  }
  return interleaveQueue(
    selected,
    new Set(selectedNew.map((card) => card.stickyId)),
    `${cards[0]?.deckId ?? ''}:${options.dayOfYear}`,
  )
}

/** Mixes new cards through the already ordered review queue and makes equal choices reproducible. */
export function interleaveQueue(
  cards: readonly QueueCard[],
  newIds: ReadonlySet<string>,
  seed: string,
): QueueCard[] {
  const random = seededRandom(seed)
  const reviews = shuffled(
    cards.filter((card) => !newIds.has(card.stickyId)),
    random,
  )
  const newCards = cards.filter((card) => newIds.has(card.stickyId)) // deck order remains pedagogical
  const result = [...reviews]
  for (let index = 0; index < newCards.length; index += 1) {
    const position = Math.floor(
      ((index + 1) * (result.length + 1)) / (newCards.length + 1),
    )
    result.splice(position, 0, newCards[index]!)
  }
  // One forward pass is bounded O(n), and is intentionally best-effort.
  for (let index = 1; index < result.length; index += 1) {
    if (
      sharesCharacter(result[index - 1]!, result[index]!) &&
      index + 1 < result.length
    ) {
      ;[result[index], result[index + 1]] = [result[index + 1]!, result[index]!]
    }
  }
  return result
}

/** Inserts a failed learning card roughly five, then fifteen, cards later. */
export function requeueAfterAgain(
  queue: readonly QueueCard[],
  card: QueueCard,
  failureCount: number,
): QueueCard[] {
  const lag = failureCount <= 1 ? 5 : 15
  const withoutCard = queue.filter((item) => item.stickyId !== card.stickyId)
  const position = Math.min(lag, withoutCard.length)
  withoutCard.splice(position, 0, card)
  return withoutCard
}
