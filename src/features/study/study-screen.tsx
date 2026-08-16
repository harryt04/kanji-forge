'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { getActiveUserRuntime } from '@/auth/runtime'
import { getExampleWords, type WordRecord } from '@/data/packs'
import { createUserRepositories, type UserRepositories } from '@/data/repo'
import { Button } from '@/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/ui/dialog'
import { loadDeck } from './deck-loader'
import {
  DEFAULT_STUDY_ANSWER,
  isStudyQuestion,
  parseStudyAnswer,
  parseStudyTwoTap,
  STUDY_ANSWER_SETTING,
  STUDY_QUESTION_SETTING,
  STUDY_TWO_TAP_SETTING,
  DEFAULT_SRS_MODE,
  isSrsMode,
  SRS_MODE_SETTING,
  type StudyAnswer,
  type StudyQuestion,
} from './study-style'
import {
  playJapaneseAudioForReadings,
  findInstalledJapaneseAudioReading,
  supportsStudyCardAudio,
  supportsJapaneseSpeech,
  STUDY_AUTO_PLAY_AUDIO_SETTING,
} from './audio'
import { useStudyStore } from './store'
import { hasWritingPractice, StudyWritingPanel } from './study-writing-panel'
import { requestStoragePersistenceAfterSession } from '@/pwa'
import {
  DEFAULT_WRITING_LENIENCY,
  isWritingValidationEnabled,
  parseWritingLeniency,
  WRITING_LENIENCY_SETTING,
  WRITING_VALIDATION_SETTING,
} from '@/features/writing'
import type { StrokeLeniency } from '@/core/stroke/match'

const LEVEL_LABELS = ['New', 'Seen', 'Learning', 'Known', 'Mastered'] as const
export const GREY_STICKIES_SETTING = 'study.greyStickies'

function formatElapsedTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
}

export function StudyScreen({
  deckDefinitionId = 'dev-kanji',
}: {
  deckDefinitionId?: string
}): React.ReactElement {
  const runtime = getActiveUserRuntime()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [coarsePointer, setCoarsePointer] = useState(false)
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [showTimer, setShowTimer] = useState(false)
  const [greyStickies, setGreyStickies] = useState(false)
  const [studyQuestion, setStudyQuestion] = useState<StudyQuestion>('kanji')
  const [studyAnswer, setStudyAnswer] =
    useState<readonly StudyAnswer[]>(DEFAULT_STUDY_ANSWER)
  const [twoTapStudy, setTwoTapStudy] = useState(false)
  const [twoTapStage, setTwoTapStage] = useState<0 | 1 | 2>(0)
  const [autoPlayAudio, setAutoPlayAudio] = useState(false)
  const [writingValidationEnabled, setWritingValidationEnabled] = useState(true)
  const [writingLeniency, setWritingLeniency] = useState<StrokeLeniency>(
    DEFAULT_WRITING_LENIENCY,
  )
  const [hasAudioRecording, setHasAudioRecording] = useState(false)
  const [relatedWords, setRelatedWords] = useState<readonly WordRecord[]>([])
  const [relatedWordsLoading, setRelatedWordsLoading] = useState(false)
  const [shownRelatedWordIds, setShownRelatedWordIds] = useState<
    ReadonlySet<number>
  >(new Set())
  const [preferenceError, setPreferenceError] = useState<string | null>(null)
  const touchStartX = useRef<number | null>(null)
  const sessionId = useRef<string | null>(null)
  const sessionRepo = useRef<UserRepositories | null>(null)
  const [selectedDeckId, setSelectedDeckId] = useState(deckDefinitionId)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const requested = new URL(window.location.href).searchParams.get('deckId')
    setSelectedDeckId(requested || deckDefinitionId)
  }, [deckDefinitionId])

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    )
      return

    const pointerQuery = window.matchMedia('(pointer: coarse)')
    const updatePointer = (): void => setCoarsePointer(pointerQuery.matches)
    updatePointer()
    pointerQuery.addEventListener('change', updatePointer)
    return () => pointerQuery.removeEventListener('change', updatePointer)
  }, [])

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
    toggleFlag,
    grade,
    undo,
    finish,
  } = useStudyStore()

  const endSession = useCallback(() => {
    const activeSessionId = sessionId.current
    const repoForSession = sessionRepo.current
    if (!activeSessionId || !repoForSession) return
    sessionId.current = null
    sessionRepo.current = null
    void repoForSession.sessions.end(activeSessionId, Date.now()).catch(() => {
      // The database may already be closing during route teardown.
    })
  }, [])

  useEffect(() => {
    if (!runtime) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      await runtime.database.ready
      const repoForSession = createUserRepositories(runtime.database)
      const loaded = await loadDeck(runtime.database, selectedDeckId)
      const [
        greyStickiesSetting,
        studyQuestionSetting,
        studyAnswerSetting,
        twoTapSetting,
        autoPlayAudioSetting,
        srsModeSetting,
        writingValidationSetting,
        writingLeniencySetting,
      ] = await Promise.all([
        repoForSession.settings.get(GREY_STICKIES_SETTING),
        repoForSession.settings.get(STUDY_QUESTION_SETTING),
        repoForSession.settings.get(STUDY_ANSWER_SETTING),
        repoForSession.settings.get(STUDY_TWO_TAP_SETTING),
        repoForSession.settings.get(STUDY_AUTO_PLAY_AUDIO_SETTING),
        repoForSession.settings.get(SRS_MODE_SETTING),
        repoForSession.settings.get(WRITING_VALIDATION_SETTING),
        repoForSession.settings.get(WRITING_LENIENCY_SETTING),
      ])
      const startedAt = Date.now()
      const startedSessionId = crypto.randomUUID()
      await repoForSession.sessions.start({
        id: startedSessionId,
        deckId: loaded.deckId,
        startedAt,
        endedAt: null,
      })
      if (cancelled) {
        await repoForSession.sessions.end(startedSessionId, Date.now())
        return
      }
      sessionId.current = startedSessionId
      sessionRepo.current = repoForSession
      if (!cancelled) {
        const savedSrsMode = srsModeSetting?.value ?? ''
        const nextSrsMode = isSrsMode(savedSrsMode)
          ? savedSrsMode
          : DEFAULT_SRS_MODE
        start(loaded, nextSrsMode)
        setSessionStartedAt(startedAt)
        setElapsedSeconds(0)
        setShowTimer(false)
        setGreyStickies(greyStickiesSetting?.value === 'true')
        const savedQuestion = studyQuestionSetting?.value ?? ''
        setStudyQuestion(
          isStudyQuestion(savedQuestion) ? savedQuestion : 'kanji',
        )
        setStudyAnswer(parseStudyAnswer(studyAnswerSetting?.value))
        setTwoTapStudy(parseStudyTwoTap(twoTapSetting?.value))
        setTwoTapStage(0)
        setAutoPlayAudio(autoPlayAudioSetting?.value === 'true')
        setWritingValidationEnabled(
          isWritingValidationEnabled(writingValidationSetting?.value),
        )
        setWritingLeniency(parseWritingLeniency(writingLeniencySetting?.value))
        setHasAudioRecording(false)
        setPreferenceError(null)
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
      endSession()
    }
  }, [runtime, endSession, selectedDeckId, start])

  useEffect(() => {
    if (finished) endSession()
  }, [endSession, finished])

  useEffect(() => {
    if (!runtime || !finished || summary.seen === 0) return
    void runtime.database.ready
      .then(() =>
        requestStoragePersistenceAfterSession(
          createUserRepositories(runtime.database),
        ),
      )
      .catch(() => {
        // Storage protection is best effort and must never interrupt a finished session.
      })
  }, [finished, runtime, summary.seen])

  useEffect(() => {
    if (sessionStartedAt === null || !showTimer || finished) return

    const updateElapsedTime = (): void => {
      setElapsedSeconds(
        Math.max(0, Math.floor((Date.now() - sessionStartedAt) / 1000)),
      )
    }
    updateElapsedTime()
    const timerId = window.setInterval(updateElapsedTime, 1000)
    return () => window.clearInterval(timerId)
  }, [finished, sessionStartedAt, showTimer])

  const card = queue[index]
  const studyCard = card ? content.get(card.stickyId) : undefined
  const repo = runtime ? createUserRepositories(runtime.database) : null

  useEffect(() => {
    let active = true
    if (!studyCard || !supportsStudyCardAudio(studyCard.contentType)) {
      setHasAudioRecording(false)
      return () => {
        active = false
      }
    }
    void findInstalledJapaneseAudioReading(
      studyCard.literal,
      studyCard.readings,
    ).then((available) => {
      if (active) setHasAudioRecording(Boolean(available))
    })
    return () => {
      active = false
    }
  }, [studyCard])

  useEffect(() => {
    let cancelled = false
    setRelatedWords([])
    setShownRelatedWordIds(new Set())

    if (!revealed || !studyCard || studyCard.contentType !== 'kanji') {
      setRelatedWordsLoading(false)
      return () => {
        cancelled = true
      }
    }

    setRelatedWordsLoading(true)
    void getExampleWords(studyCard.literal, 3)
      .then((words) => {
        if (cancelled) return
        setRelatedWords(words)
        setRelatedWordsLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setRelatedWords([])
        setRelatedWordsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [revealed, studyCard])

  const speakCurrentCard = useCallback(() => {
    if (!studyCard || !supportsStudyCardAudio(studyCard.contentType)) return
    void playJapaneseAudioForReadings(studyCard.literal, studyCard.readings)
  }, [studyCard])

  const handleReveal = useCallback(() => {
    if (twoTapStudy && !revealed) {
      if (twoTapStage === 0) {
        setTwoTapStage(1)
        return
      }
      setTwoTapStage(2)
    }
    reveal()
    if (autoPlayAudio) speakCurrentCard()
  }, [
    autoPlayAudio,
    reveal,
    revealed,
    speakCurrentCard,
    twoTapStage,
    twoTapStudy,
  ])

  const handleGrade = useCallback(
    (value: 'again' | 'good' | 'easy') => {
      if (!repo || !revealed) return
      void grade(repo, value).then(() => setTwoTapStage(0))
    },
    [repo, revealed, grade],
  )

  const handleToggleFlag = useCallback(() => {
    if (repo) void toggleFlag(repo)
  }, [repo, toggleFlag])

  const handleFinish = useCallback(() => {
    endSession()
    finish()
  }, [endSession, finish])

  const handleToggleGreyStickies = useCallback(async () => {
    if (!runtime) return
    const next = !greyStickies
    setGreyStickies(next)
    setPreferenceError(null)
    try {
      await createUserRepositories(runtime.database).settings.set({
        key: GREY_STICKIES_SETTING,
        value: String(next),
        updatedAt: Date.now(),
      })
    } catch (reason: unknown) {
      setGreyStickies(!next)
      setPreferenceError(
        reason instanceof Error
          ? reason.message
          : 'Could not save the sticky color setting.',
      )
    }
  }, [greyStickies, runtime])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (
        event.target instanceof Element &&
        event.target.closest('[data-study-writing]')
      )
        return
      if (event.key === ' ') {
        event.preventDefault()
        if (!revealed) handleReveal()
        return
      }
      if (!revealed) return
      if (event.key === 'ArrowLeft') handleGrade('again')
      else if (event.key === 'ArrowRight') handleGrade('good')
      else if (event.key === 'ArrowUp') handleGrade('easy')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [revealed, handleGrade, handleReveal])

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
  const flagged = card?.state?.flagged ?? false
  const remaining = Math.max(0, queue.length - index)
  const reading = studyCard?.readings[0]
  const questionText = twoTapStudy
    ? (studyCard?.literal ?? '')
    : studyQuestion === 'reading'
      ? (reading ?? studyCard?.literal ?? '')
      : studyQuestion === 'meaning'
        ? (studyCard?.meanings[0] ?? studyCard?.literal ?? '')
        : (studyCard?.literal ?? '')
  const questionIsJapanese = twoTapStudy || studyQuestion !== 'meaning'
  const canSpeak =
    supportsStudyCardAudio(studyCard?.contentType) &&
    (supportsJapaneseSpeech() || hasAudioRecording)
  const stickyColor = greyStickies
    ? 'var(--muted-foreground)'
    : `var(--level-${level})`
  const answerShows = (field: StudyAnswer): boolean =>
    twoTapStudy || studyAnswer.includes(field)
  const showingTwoTapReadings = twoTapStudy && !revealed && twoTapStage === 1
  const spaceHint = coarsePointer ? '' : ' (Space)'
  const revealLabel = twoTapStudy
    ? showingTwoTapReadings
      ? `Show everything${spaceHint}`
      : `Show readings${spaceHint}`
    : `Reveal${spaceHint}`
  const studyAnnouncement =
    queue.length === 0
      ? 'Nothing due right now.'
      : finished
        ? `Study session complete. ${summary.seen} ${summary.seen === 1 ? 'card' : 'cards'} seen.`
        : `Card ${index + 1} of ${queue.length}. ${questionText}. ${
            showingTwoTapReadings
              ? 'Readings shown. Activate the card or Show everything to reveal the answer.'
              : revealed
                ? 'Answer revealed. Choose a grade.'
                : 'Answer hidden. Activate the card or Reveal to show the answer.'
          } Level ${level}, ${LEVEL_LABELS[level]}.`

  return (
    <main className="flex min-h-[calc(100vh-3.5rem)] flex-col">
      <p
        id="study-announcement"
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="study-announcement"
      >
        {studyAnnouncement}
      </p>
      <div className="border-border text-muted-foreground flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-4 py-3 text-sm">
        <span className="min-w-0">{deckName}</span>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-3">
          {!finished && (
            <>
              {showTimer && (
                <span aria-live="polite">
                  Time {formatElapsedTime(elapsedSeconds)}
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                aria-expanded={showTimer}
                onClick={() => setShowTimer((visible) => !visible)}
              >
                {showTimer ? 'Hide timer' : 'Show timer'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-pressed={greyStickies}
                onClick={() => void handleToggleGreyStickies()}
              >
                {greyStickies ? 'Show sticky colors' : 'Hide sticky colors'}
              </Button>
              {canSpeak && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Play Japanese audio"
                    onClick={speakCurrentCard}
                  >
                    Speak
                  </Button>
                  <span className="text-xs">Japanese audio</span>
                </>
              )}
            </>
          )}
          <span data-testid="study-remaining">{remaining} remaining</span>
        </div>
      </div>

      {preferenceError && (
        <p className="text-destructive px-4 pt-3 text-sm" role="alert">
          {preferenceError}
        </p>
      )}

      {!finished && card && studyCard ? (
        <div
          className="flex flex-1 flex-col items-center justify-center gap-8 p-6"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {revealed && (
            <div className="grid w-full max-w-sm grid-cols-3 gap-3">
              <Button
                variant="destructive"
                onClick={() => handleGrade('again')}
              >
                Don&apos;t know (←)
              </Button>
              <Button variant="success" onClick={() => handleGrade('good')}>
                I know (→)
              </Button>
              <Button variant="perfect" onClick={() => handleGrade('easy')}>
                No problem (↑)
              </Button>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            aria-pressed={flagged}
            aria-label={flagged ? 'Unflag card' : 'Flag card'}
            onClick={handleToggleFlag}
            className="border-l-4"
            style={{ borderLeftColor: stickyColor }}
          >
            {flagged ? 'Flagged' : 'Flag'}
          </Button>
          <div
            className={`bg-card w-full max-w-sm rounded-[var(--radius)] border-4 p-10 text-center shadow-[var(--shadow-card)] transition-colors motion-reduce:transition-none ${revealed && hasWritingPractice(studyCard.literal) ? 'sm:max-w-md' : ''}`}
            style={{ borderColor: stickyColor }}
            data-grey-stickies={greyStickies}
            onClick={() => !revealed && handleReveal()}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !revealed) {
                event.preventDefault()
                handleReveal()
              }
            }}
            role="button"
            tabIndex={0}
            aria-describedby="study-announcement"
            aria-label={
              revealed
                ? undefined
                : twoTapStudy
                  ? revealLabel.replace(' (Space)', '')
                  : 'Reveal answer'
            }
          >
            {/* Once revealed, a writing-capable card replaces this glyph with
                the canvas below (its ghost guide shows the same character),
                so keeping both on screen would be a redundant duplicate that
                pushes the canvas below the fold on short viewports. */}
            {!(revealed && hasWritingPractice(studyCard.literal)) && (
              <p
                className={
                  questionIsJapanese
                    ? 'font-jp-display text-[length:var(--text-display)]'
                    : 'text-3xl font-semibold'
                }
                data-testid="study-question"
                data-study-question={twoTapStudy ? 'kanji' : studyQuestion}
                lang={questionIsJapanese ? 'ja' : undefined}
              >
                {questionText}
              </p>
            )}
            {showingTwoTapReadings && (
              <div
                className="mt-6 space-y-2 text-left"
                data-testid="study-two-tap-readings"
              >
                {studyCard.contentType === 'word' ? (
                  studyCard.readings.length > 0 && (
                    <p className="font-jp-ui text-lg" lang="ja">
                      読み: {studyCard.readings.join('、')}
                    </p>
                  )
                ) : (
                  <>
                    {studyCard.onReadings.length > 0 && (
                      <p className="font-jp-ui text-lg" lang="ja">
                        音: {studyCard.onReadings.join('、')}
                      </p>
                    )}
                    {studyCard.kunReadings.length > 0 && (
                      <p className="font-jp-ui text-lg" lang="ja">
                        訓: {studyCard.kunReadings.join('、')}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
            {revealed && (
              <div
                className="mt-6 space-y-4 text-left"
                data-testid="study-answer"
              >
                {hasWritingPractice(studyCard.literal) && (
                  <StudyWritingPanel
                    contentRef={card.stickyId}
                    literal={studyCard.literal}
                    validationEnabled={writingValidationEnabled}
                    leniency={writingLeniency}
                  />
                )}
                {answerShows('kanji') && (
                  <p className="font-jp-display text-5xl" lang="ja">
                    {studyCard.literal}
                  </p>
                )}
                {answerShows('reading') && studyCard.contentType === 'word' ? (
                  studyCard.readings.length > 0 && (
                    <p className="font-jp-ui text-lg" lang="ja">
                      読み: {studyCard.readings.join('、')}
                    </p>
                  )
                ) : (
                  <>
                    {answerShows('reading') &&
                      studyCard.onReadings.length > 0 && (
                        <p className="font-jp-ui text-lg" lang="ja">
                          音: {studyCard.onReadings.join('、')}
                        </p>
                      )}
                    {answerShows('reading') &&
                      studyCard.kunReadings.length > 0 && (
                        <p className="font-jp-ui text-lg" lang="ja">
                          訓: {studyCard.kunReadings.join('、')}
                        </p>
                      )}
                  </>
                )}
                {answerShows('meaning') && (
                  <p className="text-muted-foreground">
                    {studyCard.meanings.join(', ')}
                  </p>
                )}
                {studyCard.contentType === 'kanji' && (
                  <section
                    className="border-border mt-5 border-t pt-4"
                    aria-labelledby="study-related-heading"
                    data-testid="study-related"
                  >
                    <h3
                      id="study-related-heading"
                      className="text-muted-foreground text-sm font-semibold"
                    >
                      Related
                    </h3>
                    {relatedWordsLoading ? (
                      <p className="text-muted-foreground mt-2 text-sm">
                        Loading examples…
                      </p>
                    ) : relatedWords.length > 0 ? (
                      <ul className="mt-2 space-y-2">
                        {relatedWords.map((word) => {
                          const shown = shownRelatedWordIds.has(word.id)
                          const form = word.forms[0] ?? ''
                          return (
                            <li
                              key={word.id}
                              className="bg-muted/40 rounded-md px-3 py-2"
                              data-testid={`study-related-word-${word.id}`}
                            >
                              <p className="font-jp-ui" lang="ja">
                                {form}
                              </p>
                              {shown ? (
                                <p
                                  className="text-muted-foreground mt-1 text-sm"
                                  data-testid="study-related-details"
                                >
                                  <span lang="ja">
                                    {word.readings.join('、')}
                                  </span>
                                  {word.readings.length > 0 &&
                                  word.meanings.length > 0
                                    ? ' — '
                                    : ''}
                                  {word.meanings.join(', ')}
                                </p>
                              ) : (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="mt-1 h-auto min-h-11 px-0 text-sm"
                                  aria-expanded={false}
                                  onClick={() =>
                                    setShownRelatedWordIds((current) => {
                                      const next = new Set(current)
                                      next.add(word.id)
                                      return next
                                    })
                                  }
                                >
                                  Show reading and meaning for {form}
                                </Button>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    ) : (
                      <p className="text-muted-foreground mt-2 text-sm">
                        No related examples are available.
                      </p>
                    )}
                  </section>
                )}
              </div>
            )}
            <p className="text-muted-foreground mt-4 text-xs">
              Level {level} — {LEVEL_LABELS[level]}
            </p>
          </div>

          {!revealed && (
            <Button size="lg" onClick={handleReveal}>
              {revealLabel}
            </Button>
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
            <Button variant="ghost" size="sm" onClick={handleFinish}>
              Finish
            </Button>
          </div>
        </div>
      ) : (
        <div className="text-muted-foreground flex flex-1 items-center justify-center p-6">
          {queue.length === 0 ? 'Nothing due right now — nice work.' : null}
        </div>
      )}

      <Dialog open={finished} onOpenChange={(open) => !open && handleFinish()}>
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
              <Link href="/home">Back to Home</Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}
