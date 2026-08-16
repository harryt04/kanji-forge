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

interface StudyWritingPanelProps {
  readonly contentRef: string
  readonly literal: string
  readonly validationEnabled: boolean
  readonly leniency: StrokeLeniency
}

/**
 * Stroke-order writing practice for the study answer side. A kanji card gets
 * one canvas; a word card gets a kanji picker (defaulting to the first
 * kanji) so the learner can practice each kanji in the compound.
 */
export function StudyWritingPanel({
  contentRef,
  literal,
  validationEnabled,
  leniency,
}: StudyWritingPanelProps): React.ReactElement | null {
  const kanji = kanjiInLiteral(literal)
  const [selected, setSelected] = useState(0)

  useEffect(() => {
    setSelected(0)
  }, [contentRef])

  if (kanji.length === 0) return null

  const active = kanji[Math.min(selected, kanji.length - 1)]!

  return (
    <section
      className="border-border bg-background w-full max-w-sm rounded-md border p-3"
      aria-labelledby="study-writing-heading"
      data-study-writing="true"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 id="study-writing-heading" className="font-semibold">
          Writing practice
        </h3>
      </div>
      {kanji.length > 1 && (
        <div
          className="mt-2 flex flex-wrap gap-2"
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
              aria-label={`Practice writing ${character}`}
              onClick={() => setSelected(index)}
            >
              {character}
            </Button>
          ))}
        </div>
      )}
      <div className="mt-3">
        <WritingPad
          key={active}
          literal={active}
          validationEnabled={validationEnabled}
          leniency={leniency}
          compact
        />
      </div>
    </section>
  )
}
