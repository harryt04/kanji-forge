import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  bootstrapUserRuntime,
  clearUserRuntime,
  getActiveUserRuntime,
} from '@/auth/runtime'
import { createUserRepositories } from '@/data/repo'
import { APP_BADGE_SETTING } from '@/pwa'
import { THEME_SETTING } from './theme'
import {
  BACKUP_FORMAT,
  BACKUP_LAST_EXPORTED_SETTING,
  BACKUP_VERSION,
} from './backup'
import { SettingsScreen } from './settings-screen'
import {
  STUDY_ANSWER_SETTING,
  STUDY_QUESTION_SETTING,
  STUDY_TWO_TAP_SETTING,
} from '@/features/study/study-style'
import { STUDY_AUTO_PLAY_AUDIO_SETTING } from '@/features/study/audio'
import { STROKE_ANIMATION_SETTING } from '@/features/detail/stroke-animation'
import { repoCardState } from '../../../test/factories'

describe('SettingsScreen', () => {
  beforeEach(() => {
    bootstrapUserRuntime(`settings-test-${crypto.randomUUID()}`)
  })

  afterEach(() => {
    clearUserRuntime()
    document.documentElement.className = ''
  })

  it('requires an authenticated runtime', () => {
    clearUserRuntime()
    render(<SettingsScreen />)
    expect(screen.getByText('Sign in to open Settings.')).toBeInTheDocument()
  })

  it('loads and persists the selected theme offline', async () => {
    const user = userEvent.setup()
    render(<SettingsScreen />)

    expect(
      await screen.findByRole('heading', { name: 'Appearance' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: /Dark/ }))

    await waitFor(() => expect(document.documentElement).toHaveClass('dark'))
    const runtime = getActiveUserRuntime()
    expect(runtime).toBeDefined()
    await expect(
      createUserRepositories(runtime!.database).settings.get(THEME_SETTING),
    ).resolves.toMatchObject({ value: 'dark' })
  })

  it('restores a saved night preference on a later render', async () => {
    const runtime = getActiveUserRuntime()!
    await createUserRepositories(runtime.database).settings.set({
      key: THEME_SETTING,
      value: 'night',
      updatedAt: Date.now(),
    })
    render(<SettingsScreen />)

    expect(
      await screen.findByRole('radio', { name: /Night schedule/ }),
    ).toHaveAttribute('aria-checked', 'true')
  })

  it('persists the selected study question offline', async () => {
    const user = userEvent.setup()
    render(<SettingsScreen />)

    expect(
      await screen.findByRole('heading', { name: 'Study question' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: /Meaning/ }))

    const runtime = getActiveUserRuntime()!
    await waitFor(async () =>
      expect(
        await createUserRepositories(runtime.database).settings.get(
          STUDY_QUESTION_SETTING,
        ),
      ).toMatchObject({ value: 'meaning' }),
    )
  })

  it('persists the selected study answer fields offline', async () => {
    const user = userEvent.setup()
    render(<SettingsScreen />)

    expect(
      await screen.findByRole('heading', { name: 'Study answer' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: /Meaning/ }))

    const runtime = getActiveUserRuntime()!
    await waitFor(async () =>
      expect(
        await createUserRepositories(runtime.database).settings.get(
          STUDY_ANSWER_SETTING,
        ),
      ).toMatchObject({ value: 'kanji,reading' }),
    )
  })

  it('persists the synthesized voice autoplay preference offline', async () => {
    const user = userEvent.setup()
    render(<SettingsScreen />)

    expect(
      await screen.findByRole('heading', { name: 'Study audio' }),
    ).toBeInTheDocument()
    await user.click(
      screen.getByRole('checkbox', { name: /Auto-play synthesized voice/ }),
    )

    const runtime = getActiveUserRuntime()!
    await waitFor(async () =>
      expect(
        await createUserRepositories(runtime.database).settings.get(
          STUDY_AUTO_PLAY_AUDIO_SETTING,
        ),
      ).toMatchObject({ value: 'true' }),
    )
  })

  it('persists two-tap study mode offline', async () => {
    const user = userEvent.setup()
    render(<SettingsScreen />)

    expect(
      await screen.findByRole('heading', { name: 'Study taps' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: /Two-tap study/ }))

    const runtime = getActiveUserRuntime()!
    await waitFor(async () =>
      expect(
        await createUserRepositories(runtime.database).settings.get(
          STUDY_TWO_TAP_SETTING,
        ),
      ).toMatchObject({ value: 'true' }),
    )
  })

  it('persists the inline stroke animation preference offline', async () => {
    const user = userEvent.setup()
    render(<SettingsScreen />)

    expect(
      await screen.findByRole('heading', { name: 'Stroke animation' }),
    ).toBeInTheDocument()
    await user.click(
      screen.getByRole('checkbox', { name: /Show inline stroke animation/ }),
    )

    const runtime = getActiveUserRuntime()
    await waitFor(async () =>
      expect(
        await createUserRepositories(runtime!.database).settings.get(
          STROKE_ANIMATION_SETTING,
        ),
      ).toMatchObject({ value: 'false' }),
    )
  })

  it('restores the default study style offline', async () => {
    const user = userEvent.setup()
    const runtime = getActiveUserRuntime()!
    await createUserRepositories(runtime.database).settings.set({
      key: STUDY_QUESTION_SETTING,
      value: 'meaning',
      updatedAt: Date.now(),
    })
    await createUserRepositories(runtime.database).settings.set({
      key: STUDY_ANSWER_SETTING,
      value: 'meaning',
      updatedAt: Date.now(),
    })
    await createUserRepositories(runtime.database).settings.set({
      key: STUDY_TWO_TAP_SETTING,
      value: 'true',
      updatedAt: Date.now(),
    })
    render(<SettingsScreen />)

    await screen.findByRole('heading', { name: 'Study answer' })
    await user.click(
      screen.getByRole('button', { name: 'Restore study style defaults' }),
    )

    await waitFor(async () => {
      expect(
        await createUserRepositories(runtime.database).settings.get(
          STUDY_QUESTION_SETTING,
        ),
      ).toMatchObject({ value: 'kanji' })
      expect(
        await createUserRepositories(runtime.database).settings.get(
          STUDY_ANSWER_SETTING,
        ),
      ).toMatchObject({ value: 'kanji,reading,meaning' })
      expect(
        await createUserRepositories(runtime.database).settings.get(
          STUDY_TWO_TAP_SETTING,
        ),
      ).toMatchObject({ value: 'false' })
    })
    expect(screen.getByRole('radio', { name: /Kanji/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })

  it('persists the selected app icon badge information offline', async () => {
    const user = userEvent.setup()
    render(<SettingsScreen />)

    expect(
      await screen.findByRole('heading', { name: 'App icon badge' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: /All cards/ }))

    const runtime = getActiveUserRuntime()
    expect(runtime).toBeDefined()
    await waitFor(async () =>
      expect(
        await createUserRepositories(runtime!.database).settings.get(
          APP_BADGE_SETTING,
        ),
      ).toMatchObject({ value: 'total' }),
    )
  })

  it('resets starter-deck colors without deleting review totals or history', async () => {
    const user = userEvent.setup()
    const runtime = getActiveUserRuntime()!
    const before = repoCardState({
      deckId: 'dev-kanji',
      contentRef: 'kanji:日',
      level: 3,
      dueAt: Date.now() + 86_400_000,
      lastReviewedAt: 123,
      correctStreak: 3,
      totalReviews: 8,
      totalCorrect: 6,
      lapses: 2,
      flagged: true,
    })
    await createUserRepositories(runtime.database).cardStates.upsert(before)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<SettingsScreen />)

    await screen.findByRole('heading', { name: 'Reset colors' })
    await user.click(screen.getByRole('button', { name: 'Reset all colors' }))

    expect(
      await screen.findByText(
        'Reset colors for 1 card. Review totals were kept.',
      ),
    ).toBeInTheDocument()
    expect(confirm).toHaveBeenCalledOnce()
    await expect(
      createUserRepositories(runtime.database).cardStates.get(
        'dev-kanji',
        'kanji:日',
      ),
    ).resolves.toMatchObject({
      level: 0,
      dueAt: null,
      lastReviewedAt: 123,
      correctStreak: 0,
      totalReviews: 8,
      totalCorrect: 6,
      lapses: 2,
      flagged: true,
      manualOverride: false,
    })
    expect(
      (await createUserRepositories(runtime.database).outbox.pending())[0],
    ).toMatchObject({ mutType: 'cardState.upsert' })
    confirm.mockRestore()
  })

  it('restores a same-account backup through the Settings file picker', async () => {
    const user = userEvent.setup()
    const runtime = getActiveUserRuntime()!
    render(<SettingsScreen />)

    expect(
      await screen.findByRole('heading', { name: 'Backup & restore' }),
    ).toBeInTheDocument()
    const backupJson = JSON.stringify({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: Date.now(),
      user: { id: runtime.userId },
      decks: [],
      settings: [{ key: 'theme', value: 'dark', updatedAt: 2 }],
      deckMembership: [],
      reviews: [],
    })
    const file = new File([backupJson], 'kanjiforge-backup.json', {
      type: 'application/json',
    })
    Object.defineProperty(file, 'text', {
      value: async () => backupJson,
    })
    await user.upload(
      screen.getByLabelText('Choose KanjiForge backup file'),
      file,
    )

    expect(
      await screen.findByText(
        'Backup restored. Your local study data was merged safely.',
      ),
    ).toBeInTheDocument()
    await expect(
      createUserRepositories(runtime.database).settings.get(THEME_SETTING),
    ).resolves.toMatchObject({ value: 'dark' })
  })

  it('shows a backup reminder when the last backup is more than 30 days old', async () => {
    const runtime = getActiveUserRuntime()!
    await createUserRepositories(runtime.database).settings.set({
      key: BACKUP_LAST_EXPORTED_SETTING,
      value: String(Date.now() - 31 * 24 * 60 * 60 * 1000),
      updatedAt: Date.now(),
    })
    await expect(
      createUserRepositories(runtime.database).settings.get(
        BACKUP_LAST_EXPORTED_SETTING,
      ),
    ).resolves.toBeDefined()
    render(<SettingsScreen />)

    expect(
      await screen.findByText('Your last backup is more than 30 days old.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Back up now' }),
    ).toBeInTheDocument()
  })
})
