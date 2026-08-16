import { beltLevelLabel, LEVEL_NAMES } from '@/features/level-rank'
import type { LevelCounts } from '@/features/decks/deck-summary'

const LEVELS = [0, 1, 2, 3, 4] as const

/**
 * The stacked 0→4 level distribution — one visual unit reused on the deck
 * rail (compact, non-interactive) and the Browse header (full-size, and
 * clickable as a level filter once `onSelectLevel` is wired in).
 *
 * No `.sticky-shape` fold here: segments are short and wide, so the fold's
 * `min(16px, 35%)` would exceed 50% of a thin bar's area and fail the
 * fold-overlay ratio check. The visible count text plus the `.level-swatch`
 * colour is the signal instead — colour is never the only channel.
 */
export function LevelRamp({
  counts,
  total,
  selectedLevel = null,
  onSelectLevel,
}: {
  readonly counts: LevelCounts
  readonly total: number
  readonly selectedLevel?: 0 | 1 | 2 | 3 | 4 | null
  readonly onSelectLevel?: (level: 0 | 1 | 2 | 3 | 4 | null) => void
}): React.ReactElement {
  const denominator = total > 0 ? total : 1

  return (
    <div className="grid gap-2">
      <div className="border-border flex h-3 overflow-hidden rounded-full border">
        {LEVELS.map((level) => {
          const count = counts[level]
          const widthPercent = (count / denominator) * 100
          const label = `${beltLevelLabel(level)}, ${LEVEL_NAMES[level]}, ${count} cards`
          const style = {
            width: count > 0 ? `max(4%, ${widthPercent}%)` : '0%',
          }

          if (!onSelectLevel) {
            return (
              <span
                key={level}
                className="level-swatch h-full"
                data-level={level}
                style={style}
                aria-label={label}
              />
            )
          }

          return (
            <button
              key={level}
              type="button"
              className="level-swatch h-full min-h-11 min-w-11"
              data-level={level}
              style={style}
              aria-pressed={selectedLevel === level}
              aria-label={label}
              onClick={() =>
                onSelectLevel(selectedLevel === level ? null : level)
              }
            />
          )
        })}
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm" aria-hidden="true">
        {LEVELS.map((level) => (
          <li key={level} className="text-muted-foreground">
            {LEVEL_NAMES[level]} · {counts[level]}
          </li>
        ))}
      </ul>
    </div>
  )
}
