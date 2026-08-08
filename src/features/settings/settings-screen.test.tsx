import { readFileSync } from 'fs'
import { join } from 'path'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  bootstrapUserRuntime,
  clearUserRuntime,
  getActiveUserRuntime,
} from '@/auth/runtime'
import { createUserRepositories } from '@/data/repo'
import {
  APP_BADGE_SETTING,
  DAILY_REMINDER_ENABLED_SETTING,
  DAILY_REMINDER_TIME_SETTING,
} from '@/pwa'
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
import { SAVE_BEHAVIOR_SETTING } from '@/features/detail/save-behavior'
import { deckFolderSettingKey } from './deck-folders'
import { repoCardState, repoReview } from '../../../test/factories'

const FIXTURE_ROOT = join(process.cwd(), 'public', 'packs-dev')

function fixtureFetch(): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input).replace(/^\/packs-dev\//, '')
    try {
      const buffer = readFileSync(join(FIXTURE_ROOT, path))
      const body = path.endsWith('.json')
        ? buffer.toString('utf8')
        : new Uint8Array(buffer)
      return new Response(body as BodyInit, { status: 200 })
    } catch {
      return new Response('not found', { status: 404 })
    }
  }) as unknown as typeof fetch
}

describe('SettingsScreen', () => {
  const originalStorage = Object.getOwnPropertyDescriptor(navigator, 'storage')

  beforeEach(() => {
    vi.stubGlobal('fetch', fixtureFetch())
    bootstrapUserRuntime(`settings-test-${crypto.randomUUID()}`)
  })

  afterEach(() => {
    if (originalStorage) {
      Object.defineProperty(navigator, 'storage', originalStorage)
    } else {
      Reflect.deleteProperty(navigator, 'storage')
    }
    vi.unstubAllGlobals()
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

  it('persists a permissioned daily reminder and its local time offline', async () => {
    const user = userEvent.setup()
    const requestPermission = vi.fn().mockResolvedValue('granted')
    vi.stubGlobal('Notification', {
      permission: 'default',
      requestPermission,
    })
    render(<SettingsScreen />)

    expect(
      await screen.findByRole('heading', { name: 'Study reminder' }),
    ).toBeInTheDocument()
    const time = screen.getByLabelText('Reminder time')
    fireEvent.change(time, { target: { value: '07:30' } })
    await user.click(
      screen.getByRole('checkbox', { name: 'Enable daily reminder' }),
    )

    const runtime = getActiveUserRuntime()!
    await waitFor(async () => {
      expect(
        await createUserRepositories(runtime.database).settings.get(
          DAILY_REMINDER_TIME_SETTING,
        ),
      ).toMatchObject({ value: '07:30' })
      expect(
        await createUserRepositories(runtime.database).settings.get(
          DAILY_REMINDER_ENABLED_SETTING,
        ),
      ).toMatchObject({ value: 'true' })
    })
    expect(requestPermission).toHaveBeenCalledOnce()
    expect(
      screen.getByRole('checkbox', { name: 'Daily reminder on' }),
    ).toHaveAttribute('aria-checked', 'true')
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

  it('warns when the browser can evict local data and supports retrying protection', async () => {
    const user = userEvent.setup()
    const persist = vi.fn().mockResolvedValue(true)
    const persisted = vi.fn().mockResolvedValue(false)
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { persist, persisted },
    })
    render(<SettingsScreen />)

    expect(
      await screen.findByText('This browser may clear your local study data.'),
    ).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Try storage protection again' }),
    )

    expect(
      await screen.findByText(
        'This browser is protecting your local study data from automatic eviction.',
      ),
    ).toBeInTheDocument()
    expect(persist).toHaveBeenCalledOnce()
  })

  it('persists the Saved deck confirmation preference offline', async () => {
    const user = userEvent.setup()
    render(<SettingsScreen />)

    expect(
      await screen.findByRole('heading', { name: 'Saving cards' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: /Ask every time/ }))

    const runtime = getActiveUserRuntime()!
    await waitFor(async () =>
      expect(
        await createUserRepositories(runtime.database).settings.get(
          SAVE_BEHAVIOR_SETTING,
        ),
      ).toMatchObject({ value: 'ask' }),
    )
  })

  it('renames the starter deck offline and queues the metadata mutation', async () => {
    const user = userEvent.setup()
    const runtime = getActiveUserRuntime()!
    await createUserRepositories(runtime.database).decks.upsert({
      id: 'dev-kanji',
      name: 'Development Kanji',
      kind: 'derived',
      definitionId: 'dev-kanji',
      updatedAt: 1,
    })
    render(<SettingsScreen />)

    const name = await screen.findByRole('textbox', {
      name: 'Current deck name',
    })
    await user.clear(name)
    await user.type(name, 'N5 commute deck')
    await user.click(screen.getByRole('button', { name: 'Save deck name' }))

    await waitFor(async () =>
      expect(
        await createUserRepositories(runtime.database).decks.get('dev-kanji'),
      ).toMatchObject({ name: 'N5 commute deck' }),
    )
    expect(
      (await createUserRepositories(runtime.database).outbox.pending())[0],
    ).toMatchObject({ mutType: 'deck.upsert' })
    expect(
      await screen.findByText('Renamed deck to “N5 commute deck”.'),
    ).toBeInTheDocument()
  })

  it('restores the built-in starter deck name offline', async () => {
    const user = userEvent.setup()
    const runtime = getActiveUserRuntime()!
    await createUserRepositories(runtime.database).decks.upsert({
      id: 'dev-kanji',
      name: 'N5 commute deck',
      kind: 'derived',
      definitionId: 'dev-kanji',
      updatedAt: 1,
    })
    render(<SettingsScreen />)

    await screen.findByRole('heading', { name: 'Deck name' })
    await user.click(
      screen.getByRole('button', { name: 'Restore original deck name' }),
    )

    await waitFor(async () =>
      expect(
        await createUserRepositories(runtime.database).decks.get('dev-kanji'),
      ).toMatchObject({ name: 'Development Kanji' }),
    )
    expect(
      await screen.findByText('Renamed deck to “Development Kanji”.'),
    ).toBeInTheDocument()
    expect(
      (await createUserRepositories(runtime.database).outbox.pending())[0],
    ).toMatchObject({ mutType: 'deck.upsert' })
  })

  it('persists offline folder labels for the starter and Saved decks', async () => {
    const user = userEvent.setup()
    const runtime = getActiveUserRuntime()!
    render(<SettingsScreen />)

    expect(
      await screen.findByRole('heading', { name: 'Deck organization' }),
    ).toBeInTheDocument()
    const starterFolder = screen.getByRole('textbox', {
      name: 'Development Kanji folder',
    })
    await user.type(starterFolder, 'JLPT N5')
    await user.click(screen.getAllByRole('button', { name: 'Save folder' })[0]!)

    await waitFor(async () =>
      expect(
        await createUserRepositories(runtime.database).settings.get(
          deckFolderSettingKey('dev-kanji'),
        ),
      ).toMatchObject({ value: 'JLPT N5' }),
    )
    expect(
      await screen.findByText('Placed deck in the “JLPT N5” folder.'),
    ).toBeInTheDocument()
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

  it('resets starter-deck statistics and keeps flags', async () => {
    const user = userEvent.setup()
    const runtime = getActiveUserRuntime()!
    const repositories = createUserRepositories(runtime.database)
    const reviewedAt = Date.now() - 86_400_000
    const review = repoReview({
      id: crypto.randomUUID(),
      deckId: 'dev-kanji',
      contentRef: 'kanji:日',
      at: reviewedAt,
    })
    await repositories.recordGrade({
      review,
      nextState: repoCardState({
        deckId: 'dev-kanji',
        contentRef: 'kanji:日',
        level: 3,
        totalReviews: 4,
        totalCorrect: 3,
        lapses: 1,
        flagged: true,
      }),
      day: '2023-11-14',
      mutation: {
        id: review.id,
        mutType: 'review.append',
        payload: JSON.stringify(review),
        createdAt: reviewedAt,
        attempts: 0,
      },
    })
    await repositories.sessions.start({
      id: 'settings-statistics-session',
      deckId: 'dev-kanji',
      startedAt: 1,
      endedAt: 2,
    })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<SettingsScreen />)

    await screen.findByRole('heading', { name: 'Reset statistics' })
    await user.click(screen.getByRole('button', { name: 'Reset statistics' }))

    expect(
      await screen.findByText(
        'Reset statistics for 1 card. Review history and study time were cleared.',
      ),
    ).toBeInTheDocument()
    expect(confirm).toHaveBeenCalledOnce()
    await expect(repositories.reviews.list('dev-kanji')).resolves.toEqual([])
    await expect(repositories.dailyStats.list()).resolves.toEqual([])
    await expect(repositories.sessions.list('dev-kanji')).resolves.toEqual([])
    await expect(
      repositories.cardStates.get('dev-kanji', 'kanji:日'),
    ).resolves.toMatchObject({
      level: 0,
      dueAt: null,
      lastReviewedAt: null,
      totalReviews: 0,
      totalCorrect: 0,
      lapses: 0,
      flagged: true,
    })
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

  it('copies the starter deck as text for offline export', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    render(<SettingsScreen />)

    await screen.findByRole('heading', { name: 'Backup & restore' })
    await user.click(screen.getByRole('button', { name: 'Copy deck as text' }))

    expect(
      await screen.findByText(
        /Copied 200 cards from “Development Kanji” as text\./,
      ),
    ).toBeInTheDocument()
    expect(writeText).toHaveBeenCalledOnce()
    expect(writeText.mock.calls[0]?.[0]).toContain('日\t')
    expect(writeText.mock.calls[0]?.[0]).toContain('\n')
  })

  it('copies a content-only starter-deck share link', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    render(<SettingsScreen />)

    await screen.findByRole('heading', { name: 'Backup & restore' })
    await user.click(screen.getByRole('button', { name: 'Copy share link' }))

    expect(
      await screen.findByText(
        /Copied a share link for “Development Kanji”\. It contains card content only/u,
      ),
    ).toBeInTheDocument()
    expect(writeText).toHaveBeenCalledOnce()
    expect(writeText.mock.calls[0]?.[0]).toMatch(
      /^http:\/\/localhost(?::\d+)?\/analyze\?deck=/u,
    )
    expect(writeText.mock.calls[0]?.[0]).not.toContain('totalReviews')
  })

  it('previews and then imports matched kanji while reporting existing and unknown input', async () => {
    const user = userEvent.setup()
    const runtime = getActiveUserRuntime()!
    await createUserRepositories(runtime.database).deckMembership.save({
      deckId: 'saved',
      contentRef: 'kanji:本',
      sortOrder: 0,
      addedAt: Date.now(),
      updatedAt: Date.now(),
    })
    render(<SettingsScreen />)

    await screen.findByRole('heading', { name: 'Backup & restore' })
    await user.type(screen.getByLabelText('Kanji to import'), '日\n本\n𠮷')
    await user.click(screen.getByRole('button', { name: 'Preview import' }))

    expect(await screen.findByLabelText('Import preview')).toHaveTextContent(
      '日 matched — will be added',
    )
    expect(screen.getByLabelText('Import preview')).toHaveTextContent(
      '本 already in Saved',
    )
    expect(screen.getByLabelText('Import preview')).toHaveTextContent(
      '𠮷 not found in the installed dictionary',
    )
    await expect(
      createUserRepositories(runtime.database).deckMembership.list(),
    ).resolves.toMatchObject([{ contentRef: 'kanji:本' }])
    await user.click(
      screen.getByRole('button', { name: 'Import matched kanji' }),
    )

    expect(
      await screen.findByText(
        'Added 1 kanji to Saved. 1 already in Saved. 1 were not found in the installed dictionary.',
      ),
    ).toBeInTheDocument()
    await expect(
      createUserRepositories(runtime.database).deckMembership.list(),
    ).resolves.toMatchObject([
      { contentRef: 'kanji:本' },
      { contentRef: 'kanji:日' },
    ])
    await expect(
      createUserRepositories(runtime.database).outbox.pending(),
    ).resolves.toMatchObject([{ mutType: 'deckMembership.upsert' }])
  })

  it('maps a CSV kanji column into the existing offline import preview', async () => {
    const user = userEvent.setup()
    render(<SettingsScreen />)

    await screen.findByRole('heading', { name: 'Backup & restore' })
    await user.type(
      screen.getByLabelText('CSV to import'),
      'meaning,character\nday,"日"\nbook,"本"',
    )
    await user.click(screen.getByRole('button', { name: 'Read CSV columns' }))
    expect(screen.getByLabelText('Kanji column')).toHaveValue('1')
    await user.click(screen.getByRole('button', { name: 'Preview CSV import' }))

    expect(await screen.findByLabelText('Import preview')).toHaveTextContent(
      '日 matched — will be added',
    )
    expect(screen.getByLabelText('Import preview')).toHaveTextContent(
      '本 matched — will be added',
    )
  })

  it('loads a KanjiForge JSON export into the existing offline import preview', async () => {
    const user = userEvent.setup()
    const json = JSON.stringify({
      format: 'kanjiforge-deck-export',
      version: 1,
      deck: { id: 'dev-kanji', name: 'Development Kanji' },
      cards: [{ kanji: '日' }, { kanji: '本' }],
    })
    const file = new File([json], 'kanjiforge-deck.json', {
      type: 'application/json',
    })
    Object.defineProperty(file, 'text', {
      value: async () => json,
    })
    render(<SettingsScreen />)

    await screen.findByRole('heading', { name: 'Backup & restore' })
    await user.upload(
      screen.getByLabelText('Choose JSON deck import file'),
      file,
    )
    await waitFor(() =>
      expect(screen.getByLabelText('JSON deck to import')).toHaveValue(json),
    )
    await user.click(
      screen.getByRole('button', { name: 'Preview JSON import' }),
    )

    expect(await screen.findByLabelText('Import preview')).toHaveTextContent(
      '日 matched — will be added',
    )
    expect(screen.getByLabelText('Import preview')).toHaveTextContent(
      '本 matched — will be added',
    )
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
    expect(
      screen.getByText(
        'Keep a copy of your progress in case this device clears local storage.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Back up now' }),
    ).toBeInTheDocument()
  })
})
