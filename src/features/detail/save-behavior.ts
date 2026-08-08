export const SAVE_BEHAVIOR_SETTING = 'detail.saveBehavior'

export type SaveBehavior = 'direct' | 'ask'

export const SAVE_BEHAVIOR_OPTIONS: ReadonlyArray<{
  readonly value: SaveBehavior
  readonly label: string
  readonly description: string
}> = [
  {
    value: 'direct',
    label: 'Save directly',
    description: 'Add a card to your Saved deck with one tap.',
  },
  {
    value: 'ask',
    label: 'Ask every time',
    description: 'Confirm before adding a card to your Saved deck.',
  },
]

export function isSaveBehavior(
  value: string | undefined,
): value is SaveBehavior {
  return value === 'direct' || value === 'ask'
}
