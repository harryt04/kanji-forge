'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { getActiveUserRuntime } from '@/auth/runtime'
import { createUserRepositories } from '@/data/repo'
import { Button } from '@/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/ui/dialog'
import { loadStarterDeck } from './deck-loader'
import { useStudyStore } from './store'

const LEVEL_LABELS = ['New', 'Seen', 'Learning', 'Known', 'Mastered'] as const

export function StudyScreen({
  deckDefinitionId = 'dev-kanji',
}: {
  deckDefinitionId?: string
}): React.ReactElement {
  const runtime = getActiveUserRuntime()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const touchStartX = useRef<number | null>(null)

  const {
    deckName,
    queue,
    index,
    revealed,
    finished,
    summary,
    lastGrade,
    content,
    start,
    reveal,
    grade,
    undo,
    finish,
  } = useStudyStore()

  useEffect(() => {
    if (!runtime) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      await runtime.database.ready
      const loaded = await loadStarterDeck(runtime.database, deckDefinitionId)
      if (!cancelled) {
        start(loaded)
        setLoading(false)
      }
    })().catch((reason: unknown) => {
      if (!cancelled) {
        setError(
          reason instanceof Error ? reason.message : 'Failed to load the deck.',
        )
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [runtime, deckDefinitionId, start])

  const card = queue[index]
  const studyCard = card ? content.get(card.stickyId) : undefined
  const repo = runtime ? createUserRepositories(runtime.database) : null

  const handleGrade = useCallback(
    (value: 'again' | 'good' | 'easy') => {
      if (!repo || !revealed) return
      void grade(repo, value)
    },
    [repo, revealed, grade],
  )

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === ' ') {
        event.preventDefault()
        if (!revealed) reveal()
        return
      }
      if (!revealed) return
      if (event.key === 'ArrowLeft') handleGrade('again')
      else if (event.key === 'ArrowRight') handleGrade('good')
      else if (event.key === 'ArrowUp') handleGrade('easy')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [revealed, reveal, handleGrade])

  function onTouchStart(event: React.TouchEvent): void {
    touchStartX.current = event.touches[0]?.clientX ?? null
  }
  function onTouchEnd(event: React.TouchEvent): void {
    if (touchStartX.current === null || !revealed) return
    const deltaX = (event.changedTouches[0]?.clientX ?? 0) - touchStartX.current
    touchStartX.current = null
    if (Math.abs(deltaX) < 60) return
    handleGrade(deltaX < 0 ? 'again' : 'good')
  }

  if (!runtime)
    return <p className="text-muted-foreground p-6">Sign in to study.</p>
  if (loading)
    return (
      <p className="text-muted-foreground p-6" aria-busy="true">
        Loading deck…
      </p>
    )
  if (error) return <p className="text-destructive p-6">{error}</p>

  const level = card?.state?.level ?? 0
  const remaining = Math.max(0, queue.length - index)

  return (
    <main className="flex min-h-[calc(100vh-3.5rem)] flex-col">
      <div className="border-border text-muted-foreground flex items-center justify-between border-b px-4 py-3 text-sm">
        <span>{deckName}</span>
        <span>{remaining} remaining</span>
      </div>

      {!finished && card && studyCard ? (
        <div
          className="flex flex-1 flex-col items-center justify-center gap-8 p-6"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <div
            className={`bg-card w-full max-w-sm rounded-[var(--radius)] border-4 p-10 text-center shadow-[var(--shadow-card)] transition-colors motion-reduce:transition-none`}
            style={{ borderColor: `var(--level-${level})` }}
            onClick={() => !revealed && reveal()}
            role="button"
            tabIndex={0}
            aria-label={revealed ? undefined : 'Reveal answer'}
          >
            <p className="font-jp-display text-8xl">{studyCard.literal}</p>
            {revealed && (
              <div className="mt-6 space-y-2 text-left">
                {studyCard.onReadings.length > 0 && (
                  <p className="font-jp-ui text-lg">
                    音: {studyCard.onReadings.join('、')}
                  </p>
                )}
                {studyCard.kunReadings.length > 0 && (
                  <p className="font-jp-ui text-lg">
                    訓: {studyCard.kunReadings.join('、')}
                  </p>
                )}
                <p className="text-muted-foreground">
                  {studyCard.meanings.join(', ')}
                </p>
              </div>
            )}
            <p className="text-muted-foreground mt-4 text-xs">
              Level {level} — {LEVEL_LABELS[level]}
            </p>
          </div>

          {!revealed ? (
            <Button size="lg" onClick={() => reveal()}>
              Reveal (Space)
            </Button>
          ) : (
            <div className="grid w-full max-w-sm grid-cols-3 gap-3">
              <Button
                variant="destructive"
                onClick={() => handleGrade('again')}
              >
                Don&apos;t know (←)
              </Button>
              <Button onClick={() => handleGrade('good')}>I know (→)</Button>
              <Button variant="secondary" onClick={() => handleGrade('easy')}>
                No problem (↑)
              </Button>
            </div>
          )}

          <div className="flex gap-3">
            <Button
              variant="ghost"
              size="sm"
              disabled={!lastGrade}
              onClick={() => repo && void undo(repo)}
            >
              Undo
            </Button>
            <Button variant="ghost" size="sm" onClick={() => finish()}>
              Finish
            </Button>
          </div>
        </div>
      ) : (
        <div className="text-muted-foreground flex flex-1 items-center justify-center p-6">
          {queue.length === 0 ? 'Nothing due right now — nice work.' : null}
        </div>
      )}

      <Dialog open={finished} onOpenChange={(open) => !open && finish()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Session summary</DialogTitle>
            <DialogDescription>{deckName}</DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <dt className="text-muted-foreground">Cards seen</dt>
            <dd className="text-right">{summary.seen}</dd>
            <dt className="text-muted-foreground">Correct</dt>
            <dd className="text-right">{summary.correct}</dd>
            <dt className="text-muted-foreground">Incorrect</dt>
            <dd className="text-right">{summary.incorrect}</dd>
            <dt className="text-muted-foreground">Went green</dt>
            <dd className="text-right">{summary.wentGreen}</dd>
            <dt className="text-muted-foreground">Went red</dt>
            <dd className="text-right">{summary.wentRed}</dd>
          </dl>
          <DialogFooter>
            <Button asChild>
              <Link href="/">Back to Home</Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}
