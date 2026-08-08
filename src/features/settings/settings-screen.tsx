'use client'

import { useEffect, useRef, useState } from 'react'
import { getActiveUserRuntime } from '@/auth/runtime'
import { createUserRepositories } from '@/data/repo'
import { STUDY_AUTO_PLAY_AUDIO_SETTING } from '@/features/study/audio'
import {
  APP_BADGE_PREFERENCES,
  APP_BADGE_SETTING,
  APP_BADGE_SETTING_CHANGED_EVENT,
  isAppBadgePreference,
  type AppBadgePreference,
} from '@/pwa'
import { Button } from '@/ui/button'
import {
  DEFAULT_STUDY_ANSWER,
  DEFAULT_STUDY_QUESTION,
  isStudyQuestion,
  parseStudyAnswer,
  serializeStudyAnswer,
  STUDY_ANSWER_OPTIONS,
  STUDY_ANSWER_SETTING,
  STUDY_QUESTION_OPTIONS,
  STUDY_QUESTION_SETTING,
  STUDY_TWO_TAP_SETTING,
  type StudyAnswer,
  type StudyQuestion,
} from '@/features/study/study-style'
import {
  BACKUP_LAST_EXPORTED_SETTING,
  createBackup,
  getBackupReminder,
  parseBackup,
  type BackupReminder,
} from './backup'
import {
  isStrokeAnimationEnabled,
  STROKE_ANIMATION_SETTING,
} from '@/features/detail/stroke-animation'
import {
  applyTheme,
  isThemePreference,
  resolveTheme,
  THEME_PREFERENCES,
  THEME_SETTING,
  type ThemePreference,
} from './theme'

const THEME_OPTIONS: ReadonlyArray<{
  value: ThemePreference
  label: string
  description: string
}> = [
  { value: 'light', label: 'Light', description: 'Use the warm paper theme.' },
  { value: 'dark', label: 'Dark', description: 'Use the warm ink theme.' },
  {
    value: 'system',
    label: 'Device setting',
    description: 'Follow your device color-scheme preference.',
  },
  {
    value: 'night',
    label: 'Night schedule',
    description: 'Use dark theme from 21:00 to 06:00 local time.',
  },
]

const APP_BADGE_OPTIONS: ReadonlyArray<{
  value: AppBadgePreference
  label: string
  description: string
}> = [
  {
    value: 'due',
    label: 'Cards to study',
    description: 'Show new and scheduled cards from the current deck.',
  },
  {
    value: 'total',
    label: 'All cards',
    description: 'Show the total number of cards in the current deck.',
  },
  {
    value: 'off',
    label: 'Off',
    description: 'Do not show a number on the app icon.',
  },
]

function getSystemPreference(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )
}

export function SettingsScreen(): React.ReactElement {
  const runtime = getActiveUserRuntime()
  const [preference, setPreference] = useState<ThemePreference>('light')
  const [badgePreference, setBadgePreference] =
    useState<AppBadgePreference>('due')
  const [studyQuestion, setStudyQuestion] = useState<StudyQuestion>('kanji')
  const [studyAnswer, setStudyAnswer] = useState<readonly StudyAnswer[]>(
    parseStudyAnswer(undefined),
  )
  const [twoTapStudy, setTwoTapStudy] = useState(false)
  const [autoPlayAudio, setAutoPlayAudio] = useState(false)
  const [showStrokeAnimation, setShowStrokeAnimation] = useState(true)
  const [systemDark, setSystemDark] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [backupBusy, setBackupBusy] = useState(false)
  const [backupMessage, setBackupMessage] = useState<string | null>(null)
  const [backupReminder, setBackupReminder] = useState<BackupReminder>(null)
  const backupInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!runtime) return
    let cancelled = false
    setSystemDark(getSystemPreference())
    void (async () => {
      await runtime.database.ready
      const repositories = createUserRepositories(runtime.database)
      const [
        saved,
        savedBadge,
        savedQuestion,
        savedAnswer,
        savedTwoTap,
        savedAutoPlayAudio,
        savedStrokeAnimation,
        savedBackup,
      ] = await Promise.all([
        repositories.settings.get(THEME_SETTING),
        repositories.settings.get(APP_BADGE_SETTING),
        repositories.settings.get(STUDY_QUESTION_SETTING),
        repositories.settings.get(STUDY_ANSWER_SETTING),
        repositories.settings.get(STUDY_TWO_TAP_SETTING),
        repositories.settings.get(STUDY_AUTO_PLAY_AUDIO_SETTING),
        repositories.settings.get(STROKE_ANIMATION_SETTING),
        repositories.settings.get(BACKUP_LAST_EXPORTED_SETTING),
      ])
      if (cancelled) return
      if (isThemePreference(saved?.value)) setPreference(saved.value)
      const nextBadgePreference = savedBadge?.value ?? ''
      if (isAppBadgePreference(nextBadgePreference))
        setBadgePreference(nextBadgePreference)
      if (savedQuestion && isStudyQuestion(savedQuestion.value))
        setStudyQuestion(savedQuestion.value as StudyQuestion)
      setStudyAnswer(parseStudyAnswer(savedAnswer?.value))
      setTwoTapStudy(savedTwoTap?.value === 'true')
      setAutoPlayAudio(savedAutoPlayAudio?.value === 'true')
      setShowStrokeAnimation(
        isStrokeAnimationEnabled(savedStrokeAnimation?.value),
      )
      const lastBackupAt = savedBackup?.value
        ? Number(savedBackup.value)
        : undefined
      setBackupReminder(getBackupReminder(lastBackupAt))
      setLoading(false)
    })().catch((reason: unknown) => {
      if (!cancelled) {
        setError(
          reason instanceof Error ? reason.message : 'Could not load settings.',
        )
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [runtime])

  useEffect(() => {
    applyTheme(resolveTheme(preference, new Date(), systemDark))
  }, [preference, systemDark])

  async function choosePreference(next: ThemePreference): Promise<void> {
    if (!runtime || next === preference) return
    setPreference(next)
    setError(null)
    setSaving(true)
    try {
      await createUserRepositories(runtime.database).settings.set({
        key: THEME_SETTING,
        value: next,
        updatedAt: Date.now(),
      })
    } catch (reason: unknown) {
      setPreference(preference)
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not save theme setting.',
      )
    } finally {
      setSaving(false)
    }
  }

  async function chooseBadgePreference(
    next: AppBadgePreference,
  ): Promise<void> {
    if (!runtime || next === badgePreference) return
    const previous = badgePreference
    setBadgePreference(next)
    setError(null)
    setSaving(true)
    try {
      await createUserRepositories(runtime.database).settings.set({
        key: APP_BADGE_SETTING,
        value: next,
        updatedAt: Date.now(),
      })
      window.dispatchEvent(new Event(APP_BADGE_SETTING_CHANGED_EVENT))
    } catch (reason: unknown) {
      setBadgePreference(previous)
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not save app badge setting.',
      )
    } finally {
      setSaving(false)
    }
  }

  async function chooseStudyQuestion(next: StudyQuestion): Promise<void> {
    if (!runtime || next === studyQuestion) return
    const previous = studyQuestion
    setStudyQuestion(next)
    setError(null)
    setSaving(true)
    try {
      await createUserRepositories(runtime.database).settings.set({
        key: STUDY_QUESTION_SETTING,
        value: next,
        updatedAt: Date.now(),
      })
    } catch (reason: unknown) {
      setStudyQuestion(previous)
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not save the study question setting.',
      )
    } finally {
      setSaving(false)
    }
  }

  async function toggleStudyAnswer(field: StudyAnswer): Promise<void> {
    if (!runtime || saving) return
    const previous = studyAnswer
    const next = previous.includes(field)
      ? previous.filter((value) => value !== field)
      : [...previous, field]
    if (next.length === 0) return
    setStudyAnswer(next)
    setError(null)
    setSaving(true)
    try {
      await createUserRepositories(runtime.database).settings.set({
        key: STUDY_ANSWER_SETTING,
        value: serializeStudyAnswer(next),
        updatedAt: Date.now(),
      })
    } catch (reason: unknown) {
      setStudyAnswer(previous)
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not save the study answer setting.',
      )
    } finally {
      setSaving(false)
    }
  }

  async function toggleTwoTapStudy(): Promise<void> {
    if (!runtime || saving) return
    const previous = twoTapStudy
    const next = !previous
    setTwoTapStudy(next)
    setError(null)
    setSaving(true)
    try {
      await createUserRepositories(runtime.database).settings.set({
        key: STUDY_TWO_TAP_SETTING,
        value: String(next),
        updatedAt: Date.now(),
      })
    } catch (reason: unknown) {
      setTwoTapStudy(previous)
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not save the two-tap study setting.',
      )
    } finally {
      setSaving(false)
    }
  }

  async function toggleAutoPlayAudio(): Promise<void> {
    if (!runtime || saving) return
    const previous = autoPlayAudio
    const next = !previous
    setAutoPlayAudio(next)
    setError(null)
    setSaving(true)
    try {
      await createUserRepositories(runtime.database).settings.set({
        key: STUDY_AUTO_PLAY_AUDIO_SETTING,
        value: String(next),
        updatedAt: Date.now(),
      })
    } catch (reason: unknown) {
      setAutoPlayAudio(previous)
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not save the audio setting.',
      )
    } finally {
      setSaving(false)
    }
  }

  async function toggleStrokeAnimation(): Promise<void> {
    if (!runtime || saving) return
    const previous = showStrokeAnimation
    const next = !previous
    setShowStrokeAnimation(next)
    setError(null)
    setSaving(true)
    try {
      await createUserRepositories(runtime.database).settings.set({
        key: STROKE_ANIMATION_SETTING,
        value: String(next),
        updatedAt: Date.now(),
      })
    } catch (reason: unknown) {
      setShowStrokeAnimation(previous)
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not save the stroke animation setting.',
      )
    } finally {
      setSaving(false)
    }
  }

  async function restoreStudyStyleDefaults(): Promise<void> {
    if (!runtime || saving) return
    const previousQuestion = studyQuestion
    const previousAnswer = studyAnswer
    const previousTwoTap = twoTapStudy
    const repositories = createUserRepositories(runtime.database)
    const updatedAt = Date.now()
    setStudyQuestion(DEFAULT_STUDY_QUESTION)
    setStudyAnswer([...DEFAULT_STUDY_ANSWER])
    setTwoTapStudy(false)
    setError(null)
    setSaving(true)
    try {
      await repositories.settings.set({
        key: STUDY_QUESTION_SETTING,
        value: DEFAULT_STUDY_QUESTION,
        updatedAt,
      })
      await repositories.settings.set({
        key: STUDY_ANSWER_SETTING,
        value: serializeStudyAnswer(DEFAULT_STUDY_ANSWER),
        updatedAt,
      })
      await repositories.settings.set({
        key: STUDY_TWO_TAP_SETTING,
        value: 'false',
        updatedAt,
      })
    } catch (reason: unknown) {
      setStudyQuestion(previousQuestion)
      setStudyAnswer(previousAnswer)
      setTwoTapStudy(previousTwoTap)
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not restore the default study style.',
      )
    } finally {
      setSaving(false)
    }
  }

  async function exportBackup(): Promise<void> {
    if (!runtime) return
    setBackupBusy(true)
    setBackupMessage(null)
    setError(null)
    try {
      await runtime.database.ready
      const backup = await createBackup(
        createUserRepositories(runtime.database),
        runtime.userId,
      )
      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `kanjiforge-backup-${new Date(backup.exportedAt).toISOString().slice(0, 10)}.json`
      anchor.click()
      URL.revokeObjectURL(url)
      await createUserRepositories(runtime.database).settings.set({
        key: BACKUP_LAST_EXPORTED_SETTING,
        value: String(backup.exportedAt),
        updatedAt: Date.now(),
      })
      setBackupReminder(null)
      setBackupMessage('Backup downloaded.')
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : 'Could not create backup.',
      )
    } finally {
      setBackupBusy(false)
    }
  }

  async function restoreBackup(file: File): Promise<void> {
    if (!runtime) return
    setBackupBusy(true)
    setBackupMessage(null)
    setError(null)
    try {
      await runtime.database.ready
      const fileText =
        typeof file.text === 'function'
          ? await file.text()
          : new TextDecoder().decode(await file.arrayBuffer())
      const backup = parseBackup(fileText, runtime.userId)
      await createUserRepositories(runtime.database).restoreBackup(backup)
      setBackupMessage(
        'Backup restored. Your local study data was merged safely.',
      )
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : 'Could not restore backup.',
      )
    } finally {
      setBackupBusy(false)
      if (backupInputRef.current) backupInputRef.current.value = ''
    }
  }

  if (!runtime)
    return (
      <p className="text-muted-foreground p-6">Sign in to open Settings.</p>
    )
  if (loading)
    return (
      <p className="text-muted-foreground p-6" aria-busy="true">
        Loading settings…
      </p>
    )

  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      <p className="font-jp-ui text-muted-foreground text-sm">環境設定</p>
      <h1 className="font-display mt-1 text-3xl font-bold">Settings</h1>
      <section className="border-border bg-card mt-8 rounded-[var(--radius)] border p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-lg font-semibold">Appearance</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Choose how KanjiForge should look. Your choice is saved on this device
          and works offline.
        </p>
        <div className="mt-5 grid gap-3" role="radiogroup" aria-label="Theme">
          {THEME_OPTIONS.filter(({ value }) =>
            THEME_PREFERENCES.includes(value),
          ).map(({ value, label, description }) => (
            <Button
              key={value}
              type="button"
              variant={preference === value ? 'secondary' : 'outline'}
              aria-checked={preference === value}
              role="radio"
              disabled={saving}
              className="h-auto min-h-14 justify-start px-4 py-3 text-left"
              onClick={() => void choosePreference(value)}
            >
              <span>
                <span className="block font-semibold">{label}</span>
                <span className="text-muted-foreground block text-sm font-normal">
                  {description}
                </span>
              </span>
            </Button>
          ))}
        </div>
        {error && (
          <p className="text-destructive mt-4 text-sm" role="alert">
            {error}
          </p>
        )}
      </section>
      <section className="border-border bg-card mt-6 rounded-[var(--radius)] border p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-lg font-semibold">Study question</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Choose what you recall before revealing the answer. This setting is
          saved on this device and works offline.
        </p>
        <div
          className="mt-5 grid gap-3"
          role="radiogroup"
          aria-label="Study question"
        >
          {STUDY_QUESTION_OPTIONS.map(({ value, label, description }) => (
            <Button
              key={value}
              type="button"
              variant={studyQuestion === value ? 'secondary' : 'outline'}
              aria-checked={studyQuestion === value}
              role="radio"
              disabled={saving}
              className="h-auto min-h-14 justify-start px-4 py-3 text-left"
              onClick={() => void chooseStudyQuestion(value)}
            >
              <span>
                <span className="block font-semibold">{label}</span>
                <span className="text-muted-foreground block text-sm font-normal">
                  {description}
                </span>
              </span>
            </Button>
          ))}
        </div>
      </section>
      <section className="border-border bg-card mt-6 rounded-[var(--radius)] border p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-lg font-semibold">Study answer</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Choose which fields appear after revealing the answer. Keep at least
          one field selected. This setting is saved on this device and works
          offline.
        </p>
        <div className="mt-5 grid gap-3" role="group" aria-label="Study answer">
          {STUDY_ANSWER_OPTIONS.map(({ value, label, description }) => {
            const checked = studyAnswer.includes(value)
            return (
              <Button
                key={value}
                type="button"
                variant={checked ? 'secondary' : 'outline'}
                aria-checked={checked}
                role="checkbox"
                disabled={saving || (checked && studyAnswer.length === 1)}
                className="h-auto min-h-14 justify-start px-4 py-3 text-left"
                onClick={() => void toggleStudyAnswer(value)}
              >
                <span>
                  <span className="block font-semibold">{label}</span>
                  <span className="text-muted-foreground block text-sm font-normal">
                    {description}
                  </span>
                </span>
              </Button>
            )
          })}
        </div>
        <Button
          type="button"
          variant="outline"
          className="mt-5"
          disabled={saving}
          onClick={() => void restoreStudyStyleDefaults()}
        >
          Restore study style defaults
        </Button>
      </section>
      <section className="border-border bg-card mt-6 rounded-[var(--radius)] border p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-lg font-semibold">Study taps</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Use two taps to reveal a card in stages: the word, its readings, then
          all configured details. This overrides the question and answer field
          choices while enabled.
        </p>
        <Button
          type="button"
          variant={twoTapStudy ? 'secondary' : 'outline'}
          aria-checked={twoTapStudy}
          role="checkbox"
          disabled={saving}
          className="mt-5 h-auto min-h-14 justify-start px-4 py-3 text-left"
          onClick={() => void toggleTwoTapStudy()}
        >
          <span>
            <span className="block font-semibold">Two-tap study</span>
            <span className="text-muted-foreground block text-sm font-normal">
              First tap shows readings; second tap shows everything.
            </span>
          </span>
        </Button>
      </section>
      <section className="border-border bg-card mt-6 rounded-[var(--radius)] border p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-lg font-semibold">Study audio</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Use your device&apos;s Japanese speech synthesis after revealing a
          card. The voice is generated on your device; no audio is downloaded.
        </p>
        <Button
          type="button"
          variant={autoPlayAudio ? 'secondary' : 'outline'}
          aria-checked={autoPlayAudio}
          role="checkbox"
          disabled={saving}
          className="mt-5 h-auto min-h-14 justify-start px-4 py-3 text-left"
          onClick={() => void toggleAutoPlayAudio()}
        >
          <span>
            <span className="block font-semibold">
              Auto-play synthesized voice
            </span>
            <span className="text-muted-foreground block text-sm font-normal">
              Speak the first Japanese reading when the answer is revealed.
            </span>
          </span>
        </Button>
      </section>
      <section className="border-border bg-card mt-6 rounded-[var(--radius)] border p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-lg font-semibold">Stroke animation</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Show the offline KanjiVG stroke-order player on kanji detail pages.
        </p>
        <Button
          type="button"
          variant={showStrokeAnimation ? 'secondary' : 'outline'}
          aria-checked={showStrokeAnimation}
          role="checkbox"
          disabled={saving}
          className="mt-5 h-auto min-h-14 justify-start px-4 py-3 text-left"
          onClick={() => void toggleStrokeAnimation()}
        >
          <span>
            <span className="block font-semibold">
              Show inline stroke animation
            </span>
            <span className="text-muted-foreground block text-sm font-normal">
              Play, pause, restart, or step through each stroke.
            </span>
          </span>
        </Button>
      </section>
      <section className="border-border bg-card mt-6 rounded-[var(--radius)] border p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-lg font-semibold">App icon badge</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          On supported browsers, choose the number shown on the installed app
          icon. It uses your local deck and works offline.
        </p>
        <div
          className="mt-5 grid gap-3"
          role="radiogroup"
          aria-label="App icon badge"
        >
          {APP_BADGE_OPTIONS.filter(({ value }) =>
            APP_BADGE_PREFERENCES.includes(value),
          ).map(({ value, label, description }) => (
            <Button
              key={value}
              type="button"
              variant={badgePreference === value ? 'secondary' : 'outline'}
              aria-checked={badgePreference === value}
              role="radio"
              disabled={saving}
              className="h-auto min-h-14 justify-start px-4 py-3 text-left"
              onClick={() => void chooseBadgePreference(value)}
            >
              <span>
                <span className="block font-semibold">{label}</span>
                <span className="text-muted-foreground block text-sm font-normal">
                  {description}
                </span>
              </span>
            </Button>
          ))}
        </div>
      </section>
      <section className="border-border bg-card mt-6 rounded-[var(--radius)] border p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-lg font-semibold">Backup &amp; restore</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Keep an open JSON copy of your decks, settings, and complete review
          history. Restoring merges data and never removes newer local records.
        </p>
        {backupReminder && (
          <div
            className="border-destructive/40 bg-destructive/10 mt-4 rounded-md border p-4"
            role="alert"
          >
            <p className="font-medium">
              {backupReminder === 'missing'
                ? 'You have not backed up your study data yet.'
                : 'Your last backup is more than 30 days old.'}
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              Keep a copy of your progress in case this device clears local
              storage.
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-3"
              disabled={backupBusy}
              onClick={() => void exportBackup()}
            >
              Back up now
            </Button>
          </div>
        )}
        <div className="mt-5 flex flex-wrap gap-3">
          <Button
            type="button"
            disabled={backupBusy}
            onClick={() => void exportBackup()}
          >
            Download full backup
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={backupBusy}
            onClick={() => backupInputRef.current?.click()}
          >
            Restore backup
          </Button>
          <input
            ref={backupInputRef}
            className="sr-only"
            type="file"
            accept="application/json,.json"
            aria-label="Choose KanjiForge backup file"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void restoreBackup(file)
            }}
          />
        </div>
        {backupMessage && (
          <p className="text-muted-foreground mt-4 text-sm" role="status">
            {backupMessage}
          </p>
        )}
      </section>
    </main>
  )
}
