import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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
} from '@/features/study/study-style'

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
