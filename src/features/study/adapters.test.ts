import { describe, expect, it } from 'vitest'
import { repoCardState } from '../../../test/factories'
import { toCoreState, toRepoState } from './adapters'

describe('core/repo card-state adapters', () => {
  it('round-trips contentRef to stickyId and back', () => {
    const repoState = repoCardState()
    const coreState = toCoreState(repoState)
    expect(coreState.stickyId).toBe(repoState.contentRef)
    expect(toRepoState(coreState)).toEqual(repoState)
  })

  it('preserves every other field unchanged in both directions', () => {
    const repoState = repoCardState({ level: 3, flagged: true })
    const coreState = toCoreState(repoState)
    expect(coreState).toMatchObject({
      deckId: repoState.deckId,
      level: repoState.level,
      flagged: repoState.flagged,
    })
    expect(toRepoState(coreState)).toMatchObject({
      deckId: repoState.deckId,
      contentRef: repoState.contentRef,
      level: repoState.level,
      flagged: repoState.flagged,
    })
  })
})
