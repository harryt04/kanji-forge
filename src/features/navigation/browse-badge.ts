'use client'

import { isCardDue } from '@/core/srs/schedule'

export const BROWSE_BADGE_SETTING = 'nav.browse-badge'
export const BROWSE_BADGE_SETTING_CHANGED_EVENT =
  'kanjiforge:browse-badge-setting-changed'
export const BROWSE_BADGE_DECK_CHANGED_EVENT =
  'kanjiforge:browse-badge-deck-changed'

export const BROWSE_BADGE_PREFERENCES = [
  'due',
  'total',
  'unstudied',
  'off',
] as const
export type BrowseBadgePreference = (typeof BROWSE_BADGE_PREFERENCES)[number]

export function isBrowseBadgePreference(
  value: string,
): value is BrowseBadgePreference {
  return BROWSE_BADGE_PREFERENCES.includes(value as BrowseBadgePreference)
}

export function countBrowseBadgeCards(
  cards: ReadonlyArray<{
    readonly state:
      { readonly level: number; readonly dueAt: number | null } | undefined
  }>,
  preference: BrowseBadgePreference,
  now: number,
): number {
  if (preference === 'off') return 0
  if (preference === 'total') return cards.length
  if (preference === 'unstudied')
    return cards.filter((card) => (card.state?.level ?? 0) === 0).length
  return cards.filter((card) => isCardDue(card.state, now)).length
}

export function browseBadgeLabel(
  count: number,
  preference: BrowseBadgePreference,
  deckName: string,
): string {
  const suffix = count === 1 ? 'card' : 'cards'
  if (preference === 'total') return `${count} ${suffix} in ${deckName}`
  if (preference === 'unstudied')
    return `${count} ${suffix} not started in ${deckName}`
  return `${count} ${suffix} due in ${deckName}`
}

/** Tells the nav which deck Browse is currently showing. */
export function announceBrowseDeck(deckId: string): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<{ deckId: string }>(BROWSE_BADGE_DECK_CHANGED_EVENT, {
      detail: { deckId },
    }),
  )
}
