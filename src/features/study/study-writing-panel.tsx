'use client'

import { useEffect, useState } from 'react'
import { isKanjiLiteral } from '@/core/import/parse'
import type { StrokeLeniency } from '@/core/stroke/match'
import { WritingPad } from '@/features/writing'
import { Button } from '@/ui/button'

/** Unique kanji in a card's literal, in reading order. */
function kanjiInLiteral(literal: string): readonly string[] {
  const seen = new Set<string>()
  const kanji: string[] = []
  for (const character of literal) {
    if (!isKanjiLiteral(character) || seen.has(character)) continue
    seen.add(character)
    kanji.push(character)
  }
  return kanji
}

/** Whether the study card face can offer writing practice for this literal. */
export function hasWritingPractice(literal: string): boolean {
  return kanjiInLiteral(literal).length > 0
}

interface StudyWritingPanelProps {
  readonly contentRef: string
  readonly literal: string
  readonly validationEnabled: boolean
  readonly leniency: StrokeLeniency
}

/**
 * Stroke-order writing practice on the study card face. A kanji card gets one
 * canvas; a word card gets a kanji picker (defaulting to the first kanji), so
 * the learner can practice each character in the compound. Completed
 * characters get a tick on their chip.
 */
export function StudyWritingPanel({
  contentRef,
  literal,
  validationEnabled,
  leniency,
}: StudyWritingPanelProps): React.ReactElement | null {
  const kanji = kanjiInLiteral(literal)
  const [selected, setSelected] = useState(0)
  const [completed, setCompleted] = useState<ReadonlySet<string>>(new Set())

  useEffect(() => {
    setSelected(0)
    setCompleted(new Set())
  }, [contentRef])

  if (kanji.length === 0) return null

  const active = kanji[Math.min(selected, kanji.length - 1)]!

  return (
    <div data-study-writing="true">
      {kanji.length > 1 && (
        <div
          className="mb-3 flex flex-wrap gap-2"
          role="radiogroup"
          aria-label="Kanji to practice writing"
        >
          {kanji.map((character, index) => (
            <Button
              key={character}
              type="button"
              variant={index === selected ? 'secondary' : 'outline'}
              size="sm"
              role="radio"
              aria-checked={index === selected}
              lang="ja"
              className="min-h-11 min-w-11 text-lg"
              aria-label={`Practice writing ${character}${completed.has(character) ? ', completed' : ''}`}
              onClick={() => setSelected(index)}
            >
              {character}
              {completed.has(character) && (
                <span aria-hidden="true" className="text-success ml-1">
                  ✓
                </span>
              )}
            </Button>
          ))}
        </div>
      )}
      <WritingPad
        key={active}
        literal={active}
        validationEnabled={validationEnabled}
        leniency={leniency}
        fill
        onComplete={() =>
          setCompleted((current) => new Set(current).add(active))
        }
      />
    </div>
  )
}
