'use client'

import { useEffect, useRef, useState } from 'react'
import { getActiveUserRuntime } from '@/auth/runtime'
import { createUserRepositories, type CardState, type Deck } from '@/data/repo'
import {
  findDictionaryEntriesInText,
  findDictionaryEntry,
  getKanjiByLiterals,
  getWordById,
  loadDeckDefinitions,
  parseContentRef,
} from '@/data/packs'
import { getDeviceId } from '@/lib/device-id'
import { loadDeck, loadStarterDeck } from '@/features/study/deck-loader'
import {
  AUDIO_PACK_PREFERENCE_AUTO,
  AUDIO_PACK_PREFERENCE_SETTING,
  STUDY_AUTO_PLAY_AUDIO_SETTING,
} from '@/features/study/audio'
import {
  countAudioPackRecordings,
  fetchAudioPack,
  installAudioPack,
  listAudioPacks,
  removeAudioPack,
  type AudioPackManifest,
} from '@/features/study/audio-pack'
import {
  getInstalledNamesPackManifest,
  installNamesPack,
  removeNamesPack,
  type NamesPackManifest,
} from './names-pack'
import {
  getInstalledWordsPack,
  installWordsPack,
  removeWordsPack,
  type WordsPackManifest,
} from './words-pack'
import { invalidateContentPack } from '@/data/packs'
import {
  APP_BADGE_PREFERENCES,
  APP_BADGE_SETTING,
  APP_BADGE_SETTING_CHANGED_EVENT,
  DAILY_REMINDER_ENABLED_SETTING,
  DAILY_REMINDER_SETTING_CHANGED_EVENT,
  DAILY_REMINDER_TIME_SETTING,
  DEFAULT_DAILY_REMINDER_TIME,
  disableBackgroundPush,
  enableBackgroundPush,
  getBackgroundPushStatus,
  isDailyReminderTime,
  isAppBadgePreference,
  readInstallGuidanceEnvironment,
  requestDailyReminderPermission,
  sendTestBackgroundPush,
  getStoragePersistenceStatus,
  requestStoragePersistence,
  shouldShowIosInstallGuidance,
  STORAGE_PERSISTENCE_REQUESTED_SETTING,
  type AppBadgePreference,
  type BackgroundPushStatus,
  type StoragePersistenceStatus,
} from '@/pwa'
import { Button } from '@/ui/button'
import { parseAnkiApkg, type AnkiImportValue } from '@/core/import/apkg'
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
  isSrsMode,
  SRS_MODE_OPTIONS,
  SRS_MODE_SETTING,
  DEFAULT_SRS_MODE,
  type SrsMode,
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
  chooseAutoBackupDirectory,
  forgetAutoBackupDirectory,
  getAutoBackupDirectory,
  supportsAutoBackup,
  writeBackupToDirectory,
} from './auto-backup'
import {
  isStrokeAnimationEnabled,
  STROKE_ANIMATION_SETTING,
} from '@/features/detail/stroke-animation'
import {
  isSaveBehavior,
  SAVE_BEHAVIOR_OPTIONS,
  SAVE_BEHAVIOR_SETTING,
  type SaveBehavior,
} from '@/features/detail/save-behavior'
import {
  THEME_PREFERENCES,
  type FontScalePreference,
  type ThemePreference,
} from './theme'
import {
  readFontScalePreference,
  readThemePreference,
  writeFontScalePreference,
  writeThemePreference,
} from './theme-storage'
import {
  formatDeckAsCsv,
  formatDeckAsJson,
  formatDeckAsText,
} from './deck-export'
import { createDeckShareUrl, formatDeckShareFile } from './deck-share'
import {
  guessKanjiColumn,
  parseCsvImport,
  parseImportColumn,
  parseImportValues,
  parseJsonKanjiImport,
  previewImport,
  isKanjiLiteral,
  type ImportEntry,
  type ImportPreviewItem,
  type CsvImportTable,
} from './deck-import'
import { deduplicateImportEntries } from '@/core/import/enrich'
import {
  deckFolderSettingKey,
  groupDecksByFolder,
  normalizeDeckFolder,
} from './deck-folders'
import { planProgressTransfer } from './deck-progress'
import { cardIdentity, combineDeckContent } from './deck-combine'
import {
  addRssFeed,
  JAPANESE_WIKINEWS_FEED,
  MAX_RSS_FEEDS,
  parseRssFeed,
  parseRssFeeds,
  removeRssFeed,
  RSS_FEEDS_SETTING,
  serializeRssFeeds,
  type RssFeed,
} from './rss-feeds'

interface DeckSourceOption {
  readonly id: string
  readonly name: string
  readonly contentRefs: readonly string[]
}

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

const FONT_SCALE_OPTIONS: ReadonlyArray<{
  value: FontScalePreference
  label: string
  description: string
}> = [
  {
    value: 'default',
    label: 'Default text',
    description: 'Use the standard app text size.',
  },
  {
    value: 'large',
    label: 'Large text',
    description: 'Increase text and controls by 12.5%.',
  },
  {
    value: 'x-large',
    label: 'Extra-large text',
    description: 'Increase text and controls by 25%.',
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

const STARTER_DECK_ID = 'dev-kanji'
const DEFAULT_STARTER_DECK_NAME = 'Development Kanji'

async function loadCardIdentities(
  sources: readonly DeckSourceOption[],
): Promise<ReadonlyMap<string, string>> {
  const refs = [...new Set(sources.flatMap((source) => source.contentRefs))]
  if (refs.length === 0) return new Map()
  const kanjiLiterals = refs.flatMap((contentRef) => {
    try {
      const parsed = parseContentRef(contentRef)
      return parsed.type === 'kanji' ? [parsed.key] : []
    } catch {
      return []
    }
  })
  const kanjiByLiteral = await getKanjiByLiterals(kanjiLiterals)
  const wordRefs = refs.flatMap((contentRef) => {
    try {
      const parsed = parseContentRef(contentRef)
      if (parsed.type !== 'word') return []
      const id = Number(parsed.key)
      return Number.isInteger(id) && id >= 0 ? [{ contentRef, id }] : []
    } catch {
      return []
    }
  })
  const wordRecords = await Promise.all(
    wordRefs.map(
      async ({ contentRef, id }) =>
        [contentRef, await getWordById(id)] as const,
    ),
  )

  const identities = new Map<string, string>()
  for (const contentRef of refs) {
    try {
      const parsed = parseContentRef(contentRef)
      if (parsed.type === 'kanji') {
        const record = kanjiByLiteral.get(parsed.key)
        if (record) {
          identities.set(
            contentRef,
            cardIdentity({
              question: record.literal,
              readings: [
                ...record.onReadings,
                ...record.kunReadings,
                ...record.nanori,
              ],
            }),
          )
        }
      }
    } catch {
      // Keep malformed or unsupported refs on their literal-ref fallback.
    }
  }
  for (const [contentRef, record] of wordRecords) {
    if (record && record.forms.length > 0) {
      identities.set(
        contentRef,
        cardIdentity({
          question: record.forms[0] ?? '',
          readings: record.readings,
        }),
      )
    }
  }
  return identities
}

export function SettingsScreen(): React.ReactElement {
  const runtime = getActiveUserRuntime()
  // Appearance is a device setting in localStorage, not a synced account row, so
  // it is available immediately and never waits on the database.
  const [preference, setPreference] =
    useState<ThemePreference>(readThemePreference)
  const [fontScale, setFontScale] = useState<FontScalePreference>(
    readFontScalePreference,
  )
  const [badgePreference, setBadgePreference] =
    useState<AppBadgePreference>('due')
  const [dailyReminderEnabled, setDailyReminderEnabled] = useState(false)
  const [dailyReminderTime, setDailyReminderTime] = useState(
    DEFAULT_DAILY_REMINDER_TIME,
  )
  const [studyQuestion, setStudyQuestion] = useState<StudyQuestion>('kanji')
  const [studyAnswer, setStudyAnswer] = useState<readonly StudyAnswer[]>(
    parseStudyAnswer(undefined),
  )
  const [twoTapStudy, setTwoTapStudy] = useState(false)
  const [srsMode, setSrsMode] = useState<SrsMode>(DEFAULT_SRS_MODE)
  const [autoPlayAudio, setAutoPlayAudio] = useState(false)
  const [audioPackPreference, setAudioPackPreference] = useState(
    AUDIO_PACK_PREFERENCE_AUTO,
  )
  const [audioPacks, setAudioPacks] = useState<readonly AudioPackManifest[]>([])
  const [audioPackBusy, setAudioPackBusy] = useState(false)
  const [audioPackUrl, setAudioPackUrl] = useState('')
  const [namesPack, setNamesPack] = useState<NamesPackManifest | null>(null)
  const [namesPackBusy, setNamesPackBusy] = useState(false)
  const [wordsPack, setWordsPack] = useState<WordsPackManifest | null>(null)
  const [wordsPackBusy, setWordsPackBusy] = useState(false)
  const [showStrokeAnimation, setShowStrokeAnimation] = useState(true)
  const [saveBehavior, setSaveBehavior] = useState<SaveBehavior>('direct')
  const [rssFeeds, setRssFeeds] = useState<readonly RssFeed[]>([])
  const [rssLabel, setRssLabel] = useState('')
  const [rssUrl, setRssUrl] = useState('')
  const [deckName, setDeckName] = useState(DEFAULT_STARTER_DECK_NAME)
  const [savedDeckExists, setSavedDeckExists] = useState(false)
  const [customDecks, setCustomDecks] = useState<readonly Deck[]>([])
  const [newDeckName, setNewDeckName] = useState('')
  const [deckSources, setDeckSources] = useState<readonly DeckSourceOption[]>(
    [],
  )
  const [selectedDeckSourceIds, setSelectedDeckSourceIds] = useState<
    readonly string[]
  >([])
  const [firstNInput, setFirstNInput] = useState('')
  const [deckFolders, setDeckFolders] = useState<Record<string, string>>({})
  const [deckFolderDrafts, setDeckFolderDrafts] = useState<
    Record<string, string>
  >({})
  const [deckFolderMessage, setDeckFolderMessage] = useState<string | null>(
    null,
  )
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [backupBusy, setBackupBusy] = useState(false)
  const [backupMessage, setBackupMessage] = useState<string | null>(null)
  const [backupReminder, setBackupReminder] = useState<BackupReminder>(null)
  const [autoBackupDirectory, setAutoBackupDirectory] = useState<string | null>(
    null,
  )
  const [autoBackupSupported, setAutoBackupSupported] = useState(false)
  const [resetBusy, setResetBusy] = useState(false)
  const [resetMessage, setResetMessage] = useState<string | null>(null)
  const [statisticsResetBusy, setStatisticsResetBusy] = useState(false)
  const [statisticsResetMessage, setStatisticsResetMessage] = useState<
    string | null
  >(null)
  const [progressTransferBusy, setProgressTransferBusy] = useState(false)
  const [progressTransferMessage, setProgressTransferMessage] = useState<
    string | null
  >(null)
  const [deckMessage, setDeckMessage] = useState<string | null>(null)
  const [deckExportBusy, setDeckExportBusy] = useState(false)
  const [deckExportMessage, setDeckExportMessage] = useState<string | null>(
    null,
  )
  const [shareDeckId, setShareDeckId] = useState(STARTER_DECK_ID)
  const [deckImportText, setDeckImportText] = useState('')
  const [importDeckId, setImportDeckId] = useState('saved')
  const [deckImportBusy, setDeckImportBusy] = useState(false)
  const [deckImportMessage, setDeckImportMessage] = useState<string | null>(
    null,
  )
  const [deckImportPreview, setDeckImportPreview] = useState<
    readonly ImportPreviewItem[] | null
  >(null)
  const [csvImportText, setCsvImportText] = useState('')
  const [csvImportTable, setCsvImportTable] = useState<CsvImportTable | null>(
    null,
  )
  const [csvKanjiColumn, setCsvKanjiColumn] = useState(0)
  const [jsonImportText, setJsonImportText] = useState('')
  const [ankiImportFile, setAnkiImportFile] = useState<File | null>(null)
  const [notificationStatus, setNotificationStatus] = useState<
    NotificationPermission | 'unsupported' | null
  >(null)
  const [backgroundPushStatus, setBackgroundPushStatus] =
    useState<BackgroundPushStatus | null>(null)
  const [backgroundPushTesting, setBackgroundPushTesting] = useState(false)
  const [backgroundPushMessage, setBackgroundPushMessage] = useState<
    string | null
  >(null)
  const [storagePersistenceStatus, setStoragePersistenceStatus] =
    useState<StoragePersistenceStatus | null>(null)
  const [showIosInstallGuidance, setShowIosInstallGuidance] = useState(false)
  const backupInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!runtime) return
    let cancelled = false
    setAutoBackupSupported(supportsAutoBackup())
    setShowIosInstallGuidance(
      shouldShowIosInstallGuidance(readInstallGuidanceEnvironment()),
    )
    void (async () => {
      await runtime.database.ready
      const repositories = createUserRepositories(runtime.database)
      const [
        savedBadge,
        savedReminderEnabled,
        savedReminderTime,
        savedQuestion,
        savedAnswer,
        savedTwoTap,
        savedSrsMode,
        savedAutoPlayAudio,
        savedAudioPackPreference,
        savedStrokeAnimation,
        savedSaveBehavior,
        savedRssFeeds,
        savedBackup,
        savedDeck,
        savedUserDeck,
        savedFolder,
        savedSavedFolder,
        existingDecks,
        allSettings,
      ] = await Promise.all([
        repositories.settings.get(APP_BADGE_SETTING),
        repositories.settings.get(DAILY_REMINDER_ENABLED_SETTING),
        repositories.settings.get(DAILY_REMINDER_TIME_SETTING),
        repositories.settings.get(STUDY_QUESTION_SETTING),
        repositories.settings.get(STUDY_ANSWER_SETTING),
        repositories.settings.get(STUDY_TWO_TAP_SETTING),
        repositories.settings.get(SRS_MODE_SETTING),
        repositories.settings.get(STUDY_AUTO_PLAY_AUDIO_SETTING),
        repositories.settings.get(AUDIO_PACK_PREFERENCE_SETTING),
        repositories.settings.get(STROKE_ANIMATION_SETTING),
        repositories.settings.get(SAVE_BEHAVIOR_SETTING),
        repositories.settings.get(RSS_FEEDS_SETTING),
        repositories.settings.get(BACKUP_LAST_EXPORTED_SETTING),
        repositories.decks.get(STARTER_DECK_ID),
        repositories.decks.get('saved'),
        repositories.settings.get(deckFolderSettingKey(STARTER_DECK_ID)),
        repositories.settings.get(deckFolderSettingKey('saved')),
        repositories.decks.list(),
        repositories.settings.list(),
      ])
      if (cancelled) return
      const nextBadgePreference = savedBadge?.value ?? ''
      if (isAppBadgePreference(nextBadgePreference))
        setBadgePreference(nextBadgePreference)
      setDailyReminderEnabled(savedReminderEnabled?.value === 'true')
      if (isDailyReminderTime(savedReminderTime?.value ?? ''))
        setDailyReminderTime(savedReminderTime!.value)
      setNotificationStatus(
        typeof Notification === 'undefined'
          ? 'unsupported'
          : Notification.permission,
      )
      if (savedReminderEnabled?.value === 'true')
        setBackgroundPushStatus(await getBackgroundPushStatus())
      setStoragePersistenceStatus(await getStoragePersistenceStatus())
      if (savedQuestion && isStudyQuestion(savedQuestion.value))
        setStudyQuestion(savedQuestion.value as StudyQuestion)
      setStudyAnswer(parseStudyAnswer(savedAnswer?.value))
      setTwoTapStudy(savedTwoTap?.value === 'true')
      if (savedSrsMode && isSrsMode(savedSrsMode.value))
        setSrsMode(savedSrsMode.value)
      setAutoPlayAudio(savedAutoPlayAudio?.value === 'true')
      setAudioPackPreference(
        savedAudioPackPreference?.value || AUDIO_PACK_PREFERENCE_AUTO,
      )
      setShowStrokeAnimation(
        isStrokeAnimationEnabled(savedStrokeAnimation?.value),
      )
      if (isSaveBehavior(savedSaveBehavior?.value))
        setSaveBehavior(savedSaveBehavior.value)
      setRssFeeds(parseRssFeeds(savedRssFeeds?.value))
      setDeckName(savedDeck?.name ?? DEFAULT_STARTER_DECK_NAME)
      setShareDeckId(STARTER_DECK_ID)
      setSavedDeckExists(savedUserDeck !== undefined)
      const nextCustomDecks = existingDecks.filter(
        (deck) => deck.kind === 'custom',
      )
      setCustomDecks(nextCustomDecks)
      const definitions = await loadDeckDefinitions()
      const membershipSources = await Promise.all(
        [savedUserDeck, ...nextCustomDecks]
          .filter((deck): deck is Deck => deck !== undefined)
          .map(async (deck) => ({
            deck,
            memberships: await repositories.deckMembership.list(deck.id),
          })),
      )
      const builtInSources: DeckSourceOption[] = definitions
        .filter((definition) => definition.contentType === 'kanji')
        .map((definition) => ({
          id: definition.id,
          name:
            definition.id === STARTER_DECK_ID
              ? (savedDeck?.name ?? definition.name)
              : definition.name,
          contentRefs: definition.contentRefs,
        }))
      const userSources: DeckSourceOption[] = membershipSources.map(
        ({ deck, memberships }) => ({
          id: deck.id,
          name: deck.name,
          contentRefs: memberships.map((membership) => membership.contentRef),
        }),
      )
      setDeckSources([...builtInSources, ...userSources])
      const loadedDeckFolders: Record<string, string> = {
        [STARTER_DECK_ID]: normalizeDeckFolder(savedFolder?.value),
        saved: normalizeDeckFolder(savedSavedFolder?.value),
      }
      for (const deck of existingDecks) {
        loadedDeckFolders[deck.id] = normalizeDeckFolder(
          allSettings.find(
            (setting) => setting.key === deckFolderSettingKey(deck.id),
          )?.value,
        )
      }
      setDeckFolders(loadedDeckFolders)
      setDeckFolderDrafts(loadedDeckFolders)
      const lastBackupAt = savedBackup?.value
        ? Number(savedBackup.value)
        : undefined
      setBackupReminder(getBackupReminder(lastBackupAt))
      const savedAutoBackupDirectory = await getAutoBackupDirectory(
        runtime.userId,
      )
      if (!cancelled)
        setAutoBackupDirectory(savedAutoBackupDirectory?.name ?? null)
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
    void listAudioPacks().then(setAudioPacks)
  }, [])

  useEffect(() => {
    void getInstalledNamesPackManifest().then(setNamesPack)
  }, [])

  useEffect(() => {
    void getInstalledWordsPack().then((pack) =>
      setWordsPack(pack?.manifest ?? null),
    )
  }, [])

  // Appearance writes to localStorage and `ThemeController` — mounted in the root
  // layout — picks the change up and repaints. Nothing to await, nothing to roll
  // back, and no database, so these two stay synchronous unlike every other setting.
  function choosePreference(next: ThemePreference): void {
    if (next === preference) return
    setPreference(next)
    writeThemePreference(next)
  }

  function chooseFontScale(next: FontScalePreference): void {
    if (next === fontScale) return
    setFontScale(next)
    writeFontScalePreference(next)
  }

  async function saveRssFeeds(nextFeeds: readonly RssFeed[]): Promise<void> {
    if (!runtime) return
    const previous = rssFeeds
    setRssFeeds(nextFeeds)
    setError(null)
    setSaving(true)
    try {
      await createUserRepositories(runtime.database).settings.set({
        key: RSS_FEEDS_SETTING,
        value: serializeRssFeeds(nextFeeds),
        updatedAt: Date.now(),
      })
    } catch (reason: unknown) {
      setRssFeeds(previous)
      setError(
        reason instanceof Error ? reason.message : 'Could not save news links.',
      )
    } finally {
      setSaving(false)
    }
  }

  async function addNewsFeed(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault()
    const feed = parseRssFeed(rssLabel, rssUrl)
    if (!feed) {
      setError('Enter an HTTP or HTTPS RSS feed URL without credentials.')
      return
    }
    if (rssFeeds.some((candidate) => candidate.url === feed.url)) {
      setError('That RSS source is already saved.')
      return
    }
    const nextFeeds = addRssFeed(rssFeeds, feed)
    if (nextFeeds.length === rssFeeds.length) {
      setError('You can save up to 12 RSS sources.')
      return
    }
    await saveRssFeeds(nextFeeds)
    setRssLabel('')
    setRssUrl('')
  }

  async function addJapaneseWikinews(): Promise<void> {
    if (rssFeeds.some((feed) => feed.url === JAPANESE_WIKINEWS_FEED.url)) {
      setError('Japanese Wikinews is already saved.')
      return
    }
    if (rssFeeds.length >= MAX_RSS_FEEDS) {
      setError('You can save up to 12 RSS sources.')
      return
    }
    await saveRssFeeds(addRssFeed(rssFeeds, JAPANESE_WIKINEWS_FEED))
  }

  async function removeNewsFeed(url: string): Promise<void> {
    await saveRssFeeds(removeRssFeed(rssFeeds, url))
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

  async function chooseDailyReminderTime(next: string): Promise<void> {
    if (!runtime || !isDailyReminderTime(next) || next === dailyReminderTime)
      return
    const previous = dailyReminderTime
    setDailyReminderTime(next)
    setError(null)
    setSaving(true)
    try {
      await createUserRepositories(runtime.database).settings.set({
        key: DAILY_REMINDER_TIME_SETTING,
        value: next,
        updatedAt: Date.now(),
      })
      // Re-register an already-subscribed device so a timezone change is
      // reflected in the server-side background reminder row as well.
      if (dailyReminderEnabled) {
        void enableBackgroundPush()
          .then(setBackgroundPushStatus)
          .catch(() => setBackgroundPushStatus('not-configured'))
      }
      window.dispatchEvent(new Event(DAILY_REMINDER_SETTING_CHANGED_EVENT))
    } catch (reason: unknown) {
      setDailyReminderTime(previous)
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not save the reminder time.',
      )
    } finally {
      setSaving(false)
    }
  }

  async function toggleDailyReminder(): Promise<void> {
    if (!runtime || saving) return
    const previous = dailyReminderEnabled
    setError(null)
    if (!previous) {
      const permission = await requestDailyReminderPermission()
      setNotificationStatus(permission)
      if (permission !== 'granted') {
        setError(
          permission === 'unsupported'
            ? 'This browser does not support study notifications.'
            : 'Allow notifications in your browser to enable the daily reminder.',
        )
        return
      }
    }
    const next = !previous
    if (next) {
      void enableBackgroundPush()
        .then(setBackgroundPushStatus)
        .catch(() => setBackgroundPushStatus('not-configured'))
    } else {
      setBackgroundPushStatus(null)
      void disableBackgroundPush().catch(() => {
        // Local reminders remain usable if the server subscription cannot be removed.
      })
    }
    setDailyReminderEnabled(next)
    setSaving(true)
    try {
      await createUserRepositories(runtime.database).settings.set({
        key: DAILY_REMINDER_ENABLED_SETTING,
        value: String(next),
        updatedAt: Date.now(),
      })
      window.dispatchEvent(new Event(DAILY_REMINDER_SETTING_CHANGED_EVENT))
    } catch (reason: unknown) {
      setDailyReminderEnabled(previous)
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not save the daily reminder setting.',
      )
    } finally {
      setSaving(false)
    }
  }

  async function sendTestReminder(): Promise<void> {
    if (backgroundPushStatus !== 'subscribed' || backgroundPushTesting) return
    setBackgroundPushTesting(true)
    setBackgroundPushMessage(null)
    try {
      await sendTestBackgroundPush()
      setBackgroundPushMessage(
        'Test reminder sent. It should appear even when KanjiForge is in the background.',
      )
    } catch (reason: unknown) {
      setBackgroundPushMessage(
        reason instanceof Error
          ? reason.message
          : 'Could not send a test reminder.',
      )
    } finally {
      setBackgroundPushTesting(false)
    }
  }

  async function protectStorage(): Promise<void> {
    if (!runtime || saving) return
    setSaving(true)
    setError(null)
    try {
      const status = await requestStoragePersistence()
      await createUserRepositories(runtime.database).settings.set({
        key: STORAGE_PERSISTENCE_REQUESTED_SETTING,
        value: 'true',
        updatedAt: Date.now(),
      })
      setStoragePersistenceStatus(status)
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not protect local study storage.',
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

  async function chooseSrsMode(next: SrsMode): Promise<void> {
    if (!runtime || next === srsMode || saving) return
    const previous = srsMode
    setSrsMode(next)
    setError(null)
    setSaving(true)
    try {
      await createUserRepositories(runtime.database).settings.set({
        key: SRS_MODE_SETTING,
        value: next,
        updatedAt: Date.now(),
      })
    } catch (reason: unknown) {
      setSrsMode(previous)
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not save the scheduler setting.',
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

  async function chooseAudioPackPreference(next: string): Promise<void> {
    if (!runtime || next === audioPackPreference || saving) return
    const previous = audioPackPreference
    setAudioPackPreference(next)
    setError(null)
    setSaving(true)
    try {
      await createUserRepositories(runtime.database).settings.set({
        key: AUDIO_PACK_PREFERENCE_SETTING,
        value: next,
        updatedAt: Date.now(),
      })
    } catch (reason: unknown) {
      setAudioPackPreference(previous)
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not save the audio pack preference.',
      )
    } finally {
      setSaving(false)
    }
  }

  async function handleAudioPackFile(file: File | undefined): Promise<void> {
    if (!file) return
    setAudioPackBusy(true)
    setError(null)
    try {
      const manifest = await installAudioPack(
        new Uint8Array(await file.arrayBuffer()),
      )
      setAudioPacks(await listAudioPacks())
      setError(`Installed ${manifest.name} ${manifest.version}.`)
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not install audio pack.',
      )
    } finally {
      setAudioPackBusy(false)
    }
  }

  async function handleAudioPackUrl(): Promise<void> {
    if (!audioPackUrl.trim()) return
    setAudioPackBusy(true)
    setError(null)
    try {
      const manifest = await fetchAudioPack(audioPackUrl)
      setAudioPacks(await listAudioPacks())
      setAudioPackUrl('')
      setError(`Installed ${manifest.name} ${manifest.version}.`)
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not install audio pack.',
      )
    } finally {
      setAudioPackBusy(false)
    }
  }

  async function handleRemoveAudioPack(pack: AudioPackManifest): Promise<void> {
    setAudioPackBusy(true)
    setError(null)
    try {
      await removeAudioPack(pack.id)
      setAudioPacks(await listAudioPacks())
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not remove audio pack.',
      )
    } finally {
      setAudioPackBusy(false)
    }
  }

  async function handleNamesPackFile(file: File | undefined): Promise<void> {
    if (!file) return
    setNamesPackBusy(true)
    setError(null)
    try {
      const manifest = await installNamesPack(
        new Uint8Array(await file.arrayBuffer()),
      )
      invalidateContentPack('names-v1.sqlite')
      setNamesPack(manifest)
      setError(`Installed ${manifest.name} ${manifest.version}.`)
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not install names pack.',
      )
    } finally {
      setNamesPackBusy(false)
    }
  }

  async function handleRemoveNamesPack(): Promise<void> {
    setNamesPackBusy(true)
    setError(null)
    try {
      await removeNamesPack()
      invalidateContentPack('names-v1.sqlite')
      setNamesPack(null)
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not remove names pack.',
      )
    } finally {
      setNamesPackBusy(false)
    }
  }

  async function handleWordsPackFile(file: File | undefined): Promise<void> {
    if (!file) return
    setWordsPackBusy(true)
    setError(null)
    try {
      const manifest = await installWordsPack(
        new Uint8Array(await file.arrayBuffer()),
      )
      invalidateContentPack('words-full-v1.sqlite')
      setWordsPack(manifest)
      setError(`Installed ${manifest.name} ${manifest.version}.`)
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not install full dictionary pack.',
      )
    } finally {
      setWordsPackBusy(false)
    }
  }

  async function handleRemoveWordsPack(): Promise<void> {
    setWordsPackBusy(true)
    setError(null)
    try {
      await removeWordsPack()
      invalidateContentPack('words-full-v1.sqlite')
      setWordsPack(null)
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not remove full dictionary pack.',
      )
    } finally {
      setWordsPackBusy(false)
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

  async function chooseSaveBehavior(next: SaveBehavior): Promise<void> {
    if (!runtime || next === saveBehavior || saving) return
    const previous = saveBehavior
    setSaveBehavior(next)
    setError(null)
    setSaving(true)
    try {
      await createUserRepositories(runtime.database).settings.set({
        key: SAVE_BEHAVIOR_SETTING,
        value: next,
        updatedAt: Date.now(),
      })
    } catch (reason: unknown) {
      setSaveBehavior(previous)
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not save the Saved deck behavior.',
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

  async function saveDeckName(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault()
    if (!runtime || saving) return
    const nextName = deckName.trim()
    if (!nextName) {
      setError('Deck name cannot be empty.')
      return
    }

    await persistDeckName(nextName)
  }

  async function persistDeckName(nextName: string): Promise<void> {
    if (!runtime || saving) return
    const repositories = createUserRepositories(runtime.database)
    setError(null)
    setDeckMessage(null)
    setSaving(true)
    try {
      const existingDeck = await repositories.decks.get(STARTER_DECK_ID)
      const deck = {
        id: STARTER_DECK_ID,
        name: nextName,
        kind: existingDeck?.kind ?? ('derived' as const),
        definitionId: existingDeck?.definitionId ?? STARTER_DECK_ID,
        updatedAt: Date.now(),
      }
      const mutationId = crypto.randomUUID()
      await repositories.recordDeck({
        deck,
        mutation: {
          id: mutationId,
          mutType: 'deck.upsert',
          payload: JSON.stringify({
            id: deck.id,
            name: deck.name,
            updatedAt: deck.updatedAt,
          }),
          createdAt: deck.updatedAt,
          attempts: 0,
        },
      })
      setDeckMessage(`Renamed deck to “${nextName}”.`)
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : 'Could not rename deck.',
      )
    } finally {
      setSaving(false)
    }
  }

  async function createCustomDeck(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault()
    if (!runtime || saving) return
    const name = newDeckName.trim()
    if (!name) {
      setError('New deck name cannot be empty.')
      return
    }
    if (
      customDecks.some(
        (deck) =>
          deck.name.localeCompare(name, undefined, { sensitivity: 'base' }) ===
          0,
      )
    ) {
      setError('A custom deck with that name already exists.')
      return
    }

    setError(null)
    setDeckMessage(null)
    setSaving(true)
    try {
      const now = Date.now()
      const firstN = firstNInput.trim() ? Number(firstNInput) : undefined
      if (firstN !== undefined && (!Number.isInteger(firstN) || firstN < 1)) {
        setError('The first-card limit must be a positive whole number.')
        return
      }
      const selectedSources = deckSources.filter((source) =>
        selectedDeckSourceIds.includes(source.id),
      )
      const cardIdentities = await loadCardIdentities(selectedSources)
      const contentRefs = combineDeckContent(
        selectedSources.map(({ id, contentRefs: refs }) => ({
          deckId: id,
          contentRefs: refs,
          cardIdentities,
        })),
        firstN,
      )
      const deck: Deck = {
        id: `custom-${crypto.randomUUID()}`,
        name,
        kind: 'custom',
        definitionId: null,
        updatedAt: now,
      }
      const repositories = createUserRepositories(runtime.database)
      const deckMutation = {
        id: crypto.randomUUID(),
        mutType: 'deck.upsert' as const,
        payload: JSON.stringify(deck),
        createdAt: now,
        attempts: 0,
      }
      const memberships = contentRefs.map((contentRef, sortOrder) => ({
        membership: {
          deckId: deck.id,
          contentRef,
          sortOrder,
          addedAt: now,
          updatedAt: now,
        },
        mutation: {
          id: crypto.randomUUID(),
          mutType: 'deckMembership.upsert' as const,
          payload: JSON.stringify({
            deckId: deck.id,
            contentRef,
            sortOrder,
            sourceDeckIds: selectedSources.map((source) => source.id),
          }),
          createdAt: now,
          attempts: 0,
        },
      }))
      if (memberships.length > 0) {
        await repositories.recordDeckMemberships({
          deck,
          deckMutation,
          memberships,
        })
      } else {
        await repositories.recordDeck({
          deck,
          mutation: deckMutation,
        })
      }
      setCustomDecks((current) => [...current, deck])
      setDeckSources((current) => [
        ...current,
        { id: deck.id, name: deck.name, contentRefs },
      ])
      setDeckFolders((current) => ({ ...current, [deck.id]: '' }))
      setDeckFolderDrafts((current) => ({ ...current, [deck.id]: '' }))
      setNewDeckName('')
      setFirstNInput('')
      setSelectedDeckSourceIds([])
      setDeckMessage(
        contentRefs.length > 0
          ? `Created “${name}” with ${contentRefs.length} ${contentRefs.length === 1 ? 'card' : 'cards'} from ${selectedSources.length} ${selectedSources.length === 1 ? 'deck' : 'decks'}.`
          : `Created “${name}” as an empty deck. Add cards to it from the deck tools.`,
      )
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : 'Could not create the deck.',
      )
    } finally {
      setSaving(false)
    }
  }

  function toggleDeckSource(deckId: string): void {
    setSelectedDeckSourceIds((current) =>
      current.includes(deckId)
        ? current.filter((id) => id !== deckId)
        : [...current, deckId],
    )
  }

  async function saveDeckFolder(deckId: string, value: string): Promise<void> {
    if (!runtime || saving) return
    const nextFolder = normalizeDeckFolder(value)
    const previous = deckFolders[deckId] ?? ''
    setDeckFolders((current) => ({ ...current, [deckId]: nextFolder }))
    setDeckFolderMessage(null)
    setError(null)
    setSaving(true)
    try {
      await createUserRepositories(runtime.database).settings.set({
        key: deckFolderSettingKey(deckId),
        value: nextFolder,
        updatedAt: Date.now(),
      })
      setDeckFolders((current) => ({ ...current, [deckId]: nextFolder }))
      setDeckFolderMessage(
        nextFolder
          ? `Placed deck in the “${nextFolder}” folder.`
          : 'Removed the deck from its folder.',
      )
    } catch (reason: unknown) {
      setDeckFolders((current) => ({ ...current, [deckId]: previous }))
      setDeckFolderDrafts((current) => ({ ...current, [deckId]: previous }))
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not save the deck folder.',
      )
    } finally {
      setSaving(false)
    }
  }

  async function deleteUserDeck(
    deck: Pick<Deck, 'id' | 'name'>,
  ): Promise<void> {
    const isSavedDeck = deck.id === 'saved'
    const exists = isSavedDeck
      ? savedDeckExists
      : customDecks.some((candidate) => candidate.id === deck.id)
    if (
      !runtime ||
      saving ||
      !exists ||
      !window.confirm(
        `Delete the ${deck.name} deck? Its cards, progress, notes, and review history will be removed from this device.`,
      )
    )
      return

    setSaving(true)
    setDeckMessage(null)
    setError(null)
    try {
      const now = Date.now()
      await createUserRepositories(runtime.database).deleteDeck({
        deckId: deck.id,
        mutation: {
          id: crypto.randomUUID(),
          mutType: 'deck.delete',
          payload: JSON.stringify({ deckId: deck.id, deletedAt: now }),
          createdAt: now,
          attempts: 0,
        },
      })
      if (isSavedDeck) {
        setSavedDeckExists(false)
      } else {
        setCustomDecks((current) =>
          current.filter((candidate) => candidate.id !== deck.id),
        )
      }
      setDeckSources((current) =>
        current.filter((source) => source.id !== deck.id),
      )
      setSelectedDeckSourceIds((current) =>
        current.filter((sourceId) => sourceId !== deck.id),
      )
      setDeckFolders((current) => {
        const next = { ...current }
        delete next[deck.id]
        return next
      })
      setDeckFolderDrafts((current) => {
        const next = { ...current }
        delete next[deck.id]
        return next
      })
      if (shareDeckId === deck.id) setShareDeckId(STARTER_DECK_ID)
      if (importDeckId === deck.id) setImportDeckId('saved')
      setDeckMessage(
        isSavedDeck
          ? 'Deleted the Saved deck. It will be recreated when you save a card.'
          : `Deleted the “${deck.name}” deck.`,
      )
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : `Could not delete the ${deck.name} deck.`,
      )
    } finally {
      setSaving(false)
    }
  }

  async function restoreDeckName(): Promise<void> {
    if (!runtime || saving || deckName === DEFAULT_STARTER_DECK_NAME) return
    setDeckName(DEFAULT_STARTER_DECK_NAME)
    await persistDeckName(DEFAULT_STARTER_DECK_NAME)
  }

  async function exportDeckToClipboard(): Promise<void> {
    if (!runtime || deckExportBusy) return
    setDeckExportBusy(true)
    setDeckExportMessage(null)
    setError(null)
    try {
      await runtime.database.ready
      if (!navigator.clipboard?.writeText)
        throw new Error('Clipboard access is unavailable in this browser.')
      const deck = await loadStarterDeck(runtime.database, STARTER_DECK_ID)
      await navigator.clipboard.writeText(formatDeckAsText(deck))
      setDeckExportMessage(
        `Copied ${deck.cards.filter((card) => deck.content.has(card.contentRef)).length} cards from “${deck.name}” as text.`,
      )
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : 'Could not export deck.',
      )
    } finally {
      setDeckExportBusy(false)
    }
  }

  async function shareDeckByLink(): Promise<void> {
    if (!runtime || deckExportBusy) return
    setDeckExportBusy(true)
    setDeckExportMessage(null)
    setError(null)
    try {
      await runtime.database.ready
      if (!navigator.clipboard?.writeText)
        throw new Error('Clipboard access is unavailable in this browser.')
      const deck = await loadDeck(runtime.database, shareDeckId)
      const link = createDeckShareUrl(window.location.origin, deck)
      if (link.length > 8_000)
        throw new Error(
          'This deck is too large for a reliable share link. Use JSON export instead.',
        )
      await navigator.clipboard.writeText(link)
      setDeckExportMessage(
        `Copied a share link for “${deck.name}”. It contains card content only, not study progress.`,
      )
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : 'Could not share deck.',
      )
    } finally {
      setDeckExportBusy(false)
    }
  }

  async function downloadDeckShareFile(): Promise<void> {
    if (!runtime || deckExportBusy) return
    setDeckExportBusy(true)
    setDeckExportMessage(null)
    setError(null)
    try {
      await runtime.database.ready
      const deck = await loadDeck(runtime.database, shareDeckId)
      const blob = new Blob([formatDeckShareFile(deck)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${
        deck.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/giu, '-')
          .replace(/^-|-$/gu, '') || 'kanjiforge-deck'
      }.kanjiforge-share.json`
      anchor.click()
      URL.revokeObjectURL(url)
      setDeckExportMessage(
        `Downloaded a content-only share file for “${deck.name}”. It does not include study progress.`,
      )
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : 'Could not share deck.',
      )
    } finally {
      setDeckExportBusy(false)
    }
  }

  async function downloadDeck(format: 'csv' | 'json'): Promise<void> {
    if (!runtime || deckExportBusy) return
    setDeckExportBusy(true)
    setDeckExportMessage(null)
    setError(null)
    try {
      await runtime.database.ready
      const deck = await loadStarterDeck(runtime.database, STARTER_DECK_ID)
      const content =
        format === 'csv' ? formatDeckAsCsv(deck) : formatDeckAsJson(deck)
      const blob = new Blob([content], {
        type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${
        deck.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/giu, '-')
          .replace(/^-|-$/gu, '') || 'kanjiforge-deck'
      }.${format}`
      anchor.click()
      URL.revokeObjectURL(url)
      const count = deck.cards.filter((card) =>
        deck.content.has(card.contentRef),
      ).length
      setDeckExportMessage(
        `Downloaded ${count} cards from “${deck.name}” as ${format.toUpperCase()}.`,
      )
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : 'Could not export deck.',
      )
    } finally {
      setDeckExportBusy(false)
    }
  }

  async function resolveImportValues(
    values: readonly (string | AnkiImportValue)[],
  ): Promise<readonly ImportEntry[]> {
    const entries: ImportEntry[] = []

    async function add(
      value: string,
      tags: readonly string[] = [],
    ): Promise<void> {
      const match = await findDictionaryEntry(value)
      if (!match) {
        entries.push({
          label: value,
          contentRef: null,
          kind: 'unknown',
          ...(tags.length > 0 ? { tags } : {}),
        })
        return
      }
      entries.push({
        label: value,
        contentRef:
          match.type === 'kanji'
            ? `kanji:${match.record.literal}`
            : `${match.type}:${match.record.id}`,
        kind: match.type,
        ...(tags.length > 0 ? { tags } : {}),
      })
    }

    for (const imported of values) {
      const value = typeof imported === 'string' ? imported : imported.value
      const tags = typeof imported === 'string' ? [] : imported.tags
      const direct = await findDictionaryEntry(value)
      if (direct || [...value].length <= 1) {
        await add(value, tags)
        continue
      }
      // A compact kanji list such as 日本 still works when it is not also a
      // dictionary word; exact words take precedence for one-per-line input.
      const characters = [...value]
      if (characters.every((character) => isKanjiLiteral(character))) {
        for (const character of characters) await add(character, tags)
      } else {
        const segmented = await findDictionaryEntriesInText(value)
        if (segmented.length === 0) {
          await add(value, tags)
        } else {
          for (const { text, result } of segmented) {
            entries.push({
              label: text,
              contentRef:
                result.type === 'kanji'
                  ? `kanji:${result.record.literal}`
                  : `${result.type}:${result.record.id}`,
              kind: result.type,
              ...(tags.length > 0 ? { tags } : {}),
            })
          }
        }
      }
    }
    return deduplicateImportEntries(entries)
  }

  async function previewImportValues(
    values: readonly (string | AnkiImportValue)[],
    emptyMessage: string,
  ): Promise<void> {
    if (!runtime || deckImportBusy) return
    if (values.length === 0) {
      setDeckImportMessage(emptyMessage)
      return
    }

    setDeckImportBusy(true)
    setDeckImportMessage(null)
    setError(null)
    try {
      await runtime.database.ready
      const repositories = createUserRepositories(runtime.database)
      const existing = await repositories.deckMembership.list(importDeckId)
      const entries = await resolveImportValues(values)
      setDeckImportPreview(
        previewImport(
          entries,
          new Set(existing.map((membership) => membership.contentRef)),
        ),
      )
      setDeckImportMessage('Review the import preview before adding cards.')
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not preview kanji import.',
      )
    } finally {
      setDeckImportBusy(false)
    }
  }

  async function previewKanjiList(): Promise<void> {
    await previewImportValues(
      parseImportValues(deckImportText),
      'Paste one or more kanji or dictionary words to import.',
    )
  }

  function parseCsvTable(): void {
    try {
      const table = parseCsvImport(csvImportText)
      if (table.headers.length === 0 || table.rows.length === 0) {
        setDeckImportMessage(
          'Paste a CSV with a header row and at least one data row.',
        )
        return
      }
      setCsvImportTable(table)
      setCsvKanjiColumn(guessKanjiColumn(table.headers))
      setDeckImportMessage(
        'Choose the kanji or word column, then preview the import.',
      )
    } catch (reason: unknown) {
      setCsvImportTable(null)
      setDeckImportMessage(
        reason instanceof Error ? reason.message : 'Could not parse CSV.',
      )
    }
  }

  async function previewCsvList(): Promise<void> {
    if (!csvImportTable) return
    await previewImportValues(
      parseImportColumn(csvImportTable, csvKanjiColumn),
      'The selected CSV column contains no kanji or words to import.',
    )
  }

  async function previewJsonList(): Promise<void> {
    try {
      await previewImportValues(
        parseJsonKanjiImport(jsonImportText),
        'Paste a KanjiForge JSON deck export to import.',
      )
    } catch (reason: unknown) {
      setDeckImportMessage(
        reason instanceof Error ? reason.message : 'Could not parse JSON.',
      )
    }
  }

  async function previewAnkiList(): Promise<void> {
    if (!ankiImportFile) {
      setDeckImportMessage('Choose an Anki .apkg file to import.')
      return
    }
    try {
      const deck = await parseAnkiApkg(await ankiImportFile.arrayBuffer())
      if (deck.values.length === 0 && deck.kanji.length === 0) {
        setDeckImportMessage(
          'The Anki package contains no Japanese content in its note fields.',
        )
        return
      }
      await previewImportValues(
        deck.taggedValues.length > 0
          ? deck.taggedValues
          : deck.values.length > 0
            ? deck.values
            : deck.kanji,
        'The Anki package contains no Japanese content in its note fields.',
      )
      setDeckImportMessage(
        `Previewing ${deck.values.length || deck.kanji.length} Japanese entries from ${deck.deckName ? `“${deck.deckName}”` : 'the Anki package'}.`,
      )
    } catch (reason: unknown) {
      setDeckImportMessage(
        reason instanceof Error
          ? reason.message
          : 'Could not read Anki package.',
      )
    }
  }

  async function importMatchedCards(): Promise<void> {
    if (!runtime || deckImportBusy || !deckImportPreview) return
    const matched = deckImportPreview.filter(
      (item) => item.status === 'matched',
    )
    if (matched.length === 0) {
      setDeckImportMessage('There are no new matched cards to add.')
      return
    }

    setDeckImportBusy(true)
    setDeckImportMessage(null)
    setError(null)
    try {
      await runtime.database.ready
      const repositories = createUserRepositories(runtime.database)
      const existing = await repositories.deckMembership.list(importDeckId)
      const existingRefs = new Set(
        existing.map((membership) => membership.contentRef),
      )
      const existingTarget = await repositories.decks.get(importDeckId)
      if (!existingTarget && importDeckId !== 'saved') {
        throw new Error('The selected import deck no longer exists.')
      }
      const targetDeck: Deck = existingTarget ?? {
        id: 'saved',
        name: 'Saved',
        kind: 'saved',
        definitionId: null,
        updatedAt: Date.now(),
      }
      if (targetDeck.kind === 'derived') {
        throw new Error('Built-in decks cannot receive imported cards.')
      }
      const now = Date.now()
      let sortOrder = existing.length
      let imported = 0

      for (const { contentRef } of matched) {
        if (!contentRef || existingRefs.has(contentRef)) continue
        const membership = {
          deckId: targetDeck.id,
          contentRef,
          sortOrder,
          addedAt: now,
          updatedAt: now,
        }
        await repositories.recordDeckMembership({
          deck: { ...targetDeck, updatedAt: now },
          membership,
          mutation: {
            id: crypto.randomUUID(),
            mutType: 'deckMembership.upsert',
            payload: JSON.stringify(membership),
            createdAt: now,
            attempts: 0,
          },
        })
        existingRefs.add(contentRef)
        sortOrder += 1
        imported += 1
      }

      const annotated = deckImportPreview.filter(
        (item) =>
          item.contentRef &&
          item.tags &&
          item.tags.length > 0 &&
          (item.status === 'matched' || item.status === 'already-in-target'),
      )
      for (const item of annotated) {
        if (!item.contentRef || !item.tags) continue
        const previous = await repositories.annotations.get(
          targetDeck.id,
          item.contentRef,
        )
        const tags = [...new Set([...(previous?.tags ?? []), ...item.tags])]
        const annotation = {
          deckId: targetDeck.id,
          contentRef: item.contentRef,
          note: previous?.note ?? '',
          tags,
          updatedAt: now,
          updatedBy: getDeviceId(),
        }
        await repositories.annotations.upsert(annotation, {
          id: crypto.randomUUID(),
          mutType: 'annotation.upsert',
          payload: JSON.stringify(annotation),
          createdAt: now,
          attempts: 0,
        })
      }

      const alreadyInTarget = deckImportPreview.filter(
        (item) => item.status === 'already-in-target',
      ).length
      const unknown = deckImportPreview.filter(
        (item) => item.status === 'not-found',
      ).length
      setDeckImportText('')
      setDeckImportPreview(null)
      if (targetDeck.id === 'saved') setSavedDeckExists(true)
      const importedLabel = matched.every((item) => item.kind === 'kanji')
        ? 'kanji'
        : 'card'
      setDeckImportMessage(
        `Added ${imported} ${importedLabel}${imported === 1 ? '' : 's'} to ${targetDeck.name}.${alreadyInTarget > 0 ? ` ${alreadyInTarget} already in ${targetDeck.name}.` : ''}${unknown > 0 ? ` ${unknown} were not found in the installed dictionary.` : ''}`,
      )
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : 'Could not import cards.',
      )
    } finally {
      setDeckImportBusy(false)
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

  async function chooseAutomaticBackupFolder(): Promise<void> {
    if (!runtime || backupBusy) return
    setBackupBusy(true)
    setBackupMessage(null)
    setError(null)
    try {
      await runtime.database.ready
      const handle = await chooseAutoBackupDirectory(runtime.userId)
      const repositories = createUserRepositories(runtime.database)
      const backup = await createBackup(repositories, runtime.userId)
      await writeBackupToDirectory(handle, backup)
      await repositories.settings.set({
        key: BACKUP_LAST_EXPORTED_SETTING,
        value: String(backup.exportedAt),
        updatedAt: Date.now(),
      })
      setAutoBackupDirectory(handle.name)
      setBackupReminder(null)
      setBackupMessage(
        `Automatic backups will be saved to “${handle.name}” once per day when the app is opened.`,
      )
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not enable automatic backups.',
      )
    } finally {
      setBackupBusy(false)
    }
  }

  async function forgetAutomaticBackupFolder(): Promise<void> {
    if (!runtime || backupBusy) return
    setBackupBusy(true)
    setBackupMessage(null)
    setError(null)
    try {
      await forgetAutoBackupDirectory(runtime.userId)
      setAutoBackupDirectory(null)
      setBackupMessage('Automatic backups disabled.')
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not disable automatic backups.',
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

  async function resetColors(): Promise<void> {
    if (
      !runtime ||
      resetBusy ||
      !window.confirm(
        'Reset all starter-deck colors to New? Review totals and history will be kept.',
      )
    )
      return

    setResetBusy(true)
    setResetMessage(null)
    setError(null)
    try {
      await runtime.database.ready
      const repositories = createUserRepositories(runtime.database)
      const states = await repositories.cardStates.list('dev-kanji')
      const now = Date.now()
      const updatedBy = getDeviceId()
      const changes = states.map((state: CardState) => ({
        state: {
          ...state,
          level: 0 as const,
          dueAt: null,
          correctStreak: 0,
          manualOverride: false,
          updatedAt: now,
          updatedBy,
        },
        mutation: {
          id: crypto.randomUUID(),
          mutType: 'cardState.upsert' as const,
          payload: JSON.stringify({
            deckId: state.deckId,
            contentRef: state.contentRef,
            level: 0,
            source: 'reset-colors',
            updatedAt: now,
          }),
          createdAt: now,
          attempts: 0,
        },
      }))
      await repositories.recordCardStates(changes)
      setResetMessage(
        states.length === 0
          ? 'No studied colors needed resetting.'
          : `Reset colors for ${states.length} ${states.length === 1 ? 'card' : 'cards'}. Review totals were kept.`,
      )
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : 'Could not reset colors.',
      )
    } finally {
      setResetBusy(false)
    }
  }

  async function resetStatistics(): Promise<void> {
    if (
      !runtime ||
      statisticsResetBusy ||
      !window.confirm(
        'Reset all starter-deck statistics? This removes review history and study time, and returns colors to New. Flags and notes will be kept.',
      )
    )
      return

    setStatisticsResetBusy(true)
    setStatisticsResetMessage(null)
    setError(null)
    try {
      await runtime.database.ready
      const repositories = createUserRepositories(runtime.database)
      const states = await repositories.cardStates.list(STARTER_DECK_ID)
      const now = Date.now()
      const updatedBy = getDeviceId()
      await repositories.resetStatistics({
        deckId: STARTER_DECK_ID,
        states: states.map((state: CardState) => ({
          state: {
            ...state,
            level: 0,
            dueAt: null,
            lastReviewedAt: null,
            correctStreak: 0,
            totalReviews: 0,
            totalCorrect: 0,
            lapses: 0,
            manualOverride: false,
            updatedAt: now,
            updatedBy,
          },
          mutation: {
            id: crypto.randomUUID(),
            mutType: 'cardState.upsert',
            payload: JSON.stringify({
              deckId: state.deckId,
              contentRef: state.contentRef,
              level: 0,
              source: 'reset-statistics',
              updatedAt: now,
            }),
            createdAt: now,
            attempts: 0,
          },
        })),
      })
      setStatisticsResetMessage(
        states.length === 0
          ? 'No starter-deck statistics needed resetting.'
          : `Reset statistics for ${states.length} ${states.length === 1 ? 'card' : 'cards'}. Review history and study time were cleared.`,
      )
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not reset statistics.',
      )
    } finally {
      setStatisticsResetBusy(false)
    }
  }

  async function transferStarterProgress(): Promise<void> {
    if (
      !runtime ||
      progressTransferBusy ||
      !window.confirm(
        'Copy studied progress from the starter deck into matching Saved cards? Existing Saved progress for those cards will be replaced. Saved flags and notes will be kept.',
      )
    )
      return

    setProgressTransferBusy(true)
    setProgressTransferMessage(null)
    setError(null)
    try {
      await runtime.database.ready
      const repositories = createUserRepositories(runtime.database)
      const source = await loadStarterDeck(runtime.database, STARTER_DECK_ID)
      const memberships = await repositories.deckMembership.list()
      const targetCards = await Promise.all(
        memberships.map(async (membership) => ({
          deckId: membership.deckId,
          contentRef: membership.contentRef,
          state: await repositories.cardStates.get(
            membership.deckId,
            membership.contentRef,
          ),
        })),
      )
      const now = Date.now()
      const transfers = planProgressTransfer(
        source.cards,
        targetCards,
        'saved',
        now,
        getDeviceId(),
      )
      await repositories.recordCardStates(
        transfers.map(({ state, sourceDeckId }) => ({
          state,
          mutation: {
            id: crypto.randomUUID(),
            mutType: 'cardState.upsert' as const,
            payload: JSON.stringify({
              ...state,
              source: 'transfer',
              sourceDeckId,
              targetDeckId: 'saved',
            }),
            createdAt: now,
            attempts: 0,
          },
        })),
      )
      setProgressTransferMessage(
        transfers.length === 0
          ? 'No studied shared cards needed transferring.'
          : `Transferred progress for ${transfers.length} ${transfers.length === 1 ? 'shared card' : 'shared cards'} into Saved. Saved flags and notes were kept.`,
      )
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not transfer deck progress.',
      )
    } finally {
      setProgressTransferBusy(false)
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
              className="h-auto min-h-14 justify-start px-4 py-3 text-left"
              onClick={() => choosePreference(value)}
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
        <h2 className="text-lg font-semibold">Text size</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Increase app text and controls for easier reading. This setting is
          saved on this device and works offline.
        </p>
        <div
          className="mt-5 grid gap-3"
          role="radiogroup"
          aria-label="Text size"
        >
          {FONT_SCALE_OPTIONS.map(({ value, label, description }) => (
            <Button
              key={value}
              type="button"
              variant={fontScale === value ? 'secondary' : 'outline'}
              aria-checked={fontScale === value}
              role="radio"
              className="h-auto min-h-14 justify-start px-4 py-3 text-left"
              onClick={() => chooseFontScale(value)}
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
        <h2 className="text-lg font-semibold">Japanese news links</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Keep a personal list of RSS sources and open them in your browser.
          KanjiForge stores URLs only: it does not fetch, cache, or reproduce
          feed content.
        </p>
        <div className="border-border bg-background mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-3 text-sm">
          <p className="max-w-2xl">
            Try{' '}
            <a
              className="text-primary font-medium underline-offset-4 hover:underline"
              href="https://ja.wikinews.org/wiki/メインページ"
              target="_blank"
              rel="noopener noreferrer"
            >
              Japanese Wikinews
            </a>{' '}
            — a Japanese, Creative Commons news source. KanjiForge links out to
            it and does not reproduce its articles.
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={saving || rssFeeds.length >= MAX_RSS_FEEDS}
            onClick={() => void addJapaneseWikinews()}
          >
            Add Japanese Wikinews
          </Button>
        </div>
        <form
          className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] sm:items-end"
          onSubmit={(event) => void addNewsFeed(event)}
        >
          <label className="grid gap-2 text-sm font-medium" htmlFor="rss-label">
            Label
            <input
              id="rss-label"
              className="border-input bg-background focus-visible:ring-ring h-10 rounded-md border px-3 py-2 font-normal outline-none focus-visible:ring-2"
              value={rssLabel}
              onChange={(event) => setRssLabel(event.target.value)}
              maxLength={80}
              placeholder="NHK Easy"
              disabled={saving}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium" htmlFor="rss-url">
            RSS URL
            <input
              id="rss-url"
              className="border-input bg-background focus-visible:ring-ring h-10 rounded-md border px-3 py-2 font-normal outline-none focus-visible:ring-2"
              value={rssUrl}
              onChange={(event) => setRssUrl(event.target.value)}
              type="url"
              inputMode="url"
              placeholder="https://example.com/feed.xml"
              required
              disabled={saving}
            />
          </label>
          <Button
            type="submit"
            disabled={saving || rssFeeds.length >= MAX_RSS_FEEDS}
          >
            Add source
          </Button>
        </form>
        {rssFeeds.length > 0 ? (
          <ul className="mt-5 grid gap-2" aria-label="Saved RSS sources">
            {rssFeeds.map((feed) => (
              <li
                key={feed.url}
                className="border-border bg-background flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2"
              >
                <div className="min-w-0">
                  <a
                    className="text-primary font-medium underline-offset-4 hover:underline"
                    href={feed.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {feed.label}
                  </a>
                  <p className="text-muted-foreground truncate text-xs">
                    {feed.url}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={saving}
                  aria-label={`Remove RSS source ${feed.label}`}
                  onClick={() => void removeNewsFeed(feed.url)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground mt-5 text-sm">
            No news sources saved yet.
          </p>
        )}
      </section>
      <section className="border-border bg-card mt-6 rounded-[var(--radius)] border p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-lg font-semibold">Create a deck</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Create a user-owned deck, optionally combining cards from existing
          decks. Duplicate cards are kept once in source order, and the result
          is saved locally and queued for sync immediately.
        </p>
        <form
          className="mt-5 flex flex-wrap items-end gap-3"
          onSubmit={(event) => void createCustomDeck(event)}
        >
          <label
            className="grid min-w-60 flex-1 gap-2 text-sm font-medium"
            htmlFor="new-deck-name"
          >
            New deck name
            <input
              id="new-deck-name"
              className="border-input bg-background focus-visible:ring-ring h-10 rounded-md border px-3 py-2 font-normal outline-none focus-visible:ring-2"
              value={newDeckName}
              onChange={(event) => setNewDeckName(event.target.value)}
              maxLength={80}
              disabled={saving}
              placeholder="Travel kanji"
            />
          </label>
          <Button type="submit" disabled={saving || !newDeckName.trim()}>
            {saving ? 'Creating…' : 'Create deck'}
          </Button>
        </form>
        <fieldset className="mt-5 space-y-3">
          <legend className="text-sm font-medium">Include cards from</legend>
          <p className="text-muted-foreground text-sm">
            Select one or more decks to combine. Leave every deck unchecked to
            create an empty deck.
          </p>
          <div className="grid gap-2">
            {deckSources.map((source) => (
              <label
                key={source.id}
                className="border-border bg-background flex min-h-11 items-center gap-3 rounded-md border px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={selectedDeckSourceIds.includes(source.id)}
                  onChange={() => toggleDeckSource(source.id)}
                  disabled={saving}
                />
                <span>
                  <span className="font-medium">{source.name}</span>
                  <span className="text-muted-foreground ml-2">
                    {source.contentRefs.length}{' '}
                    {source.contentRefs.length === 1 ? 'card' : 'cards'}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <label
          className="mt-5 grid max-w-xs gap-2 text-sm font-medium"
          htmlFor="new-deck-first-n"
        >
          First N cards (optional)
          <input
            id="new-deck-first-n"
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            className="border-input bg-background focus-visible:ring-ring h-10 rounded-md border px-3 py-2 font-normal outline-none focus-visible:ring-2"
            value={firstNInput}
            onChange={(event) => setFirstNInput(event.target.value)}
            disabled={saving}
            placeholder="All cards"
          />
          <span className="text-muted-foreground font-normal">
            Applied after duplicates are removed from the combined deck.
          </span>
        </label>
        {customDecks.length > 0 && (
          <p className="text-muted-foreground mt-4 text-sm">
            {customDecks.length} custom{' '}
            {customDecks.length === 1 ? 'deck is' : 'decks are'} available in
            your local deck shelf.
          </p>
        )}
      </section>
      <section className="border-border bg-card mt-6 rounded-[var(--radius)] border p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-lg font-semibold">Scheduler</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Adaptive intervals use your review history for due dates while keeping
          the visible five-level belt-rank progression unchanged.
        </p>
        <div
          className="mt-5 grid gap-3"
          role="radiogroup"
          aria-label="Scheduler"
        >
          {SRS_MODE_OPTIONS.map(({ value, label, description }) => (
            <Button
              key={value}
              type="button"
              variant={srsMode === value ? 'secondary' : 'outline'}
              aria-checked={srsMode === value}
              role="radio"
              disabled={saving}
              className="h-auto min-h-14 justify-start px-4 py-3 text-left"
              onClick={() => void chooseSrsMode(value)}
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
          card, or install a licensed community recording pack below.
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
              Auto-play Japanese audio
            </span>
            <span className="text-muted-foreground block text-sm font-normal">
              Speak the first Japanese reading when the answer is revealed.
            </span>
          </span>
        </Button>
      </section>
      <section className="border-border bg-card mt-6 rounded-[var(--radius)] border p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-lg font-semibold">Optional names dictionary</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Install the licensed JMnedict SQLite pack to search proper names and
          places offline. A raw names-v1.sqlite file uses the built-in JMnedict
          attribution; ZIP files may include their own manifest.json.
        </p>
        <label
          className="mt-4 block text-sm font-medium"
          htmlFor="names-pack-file"
        >
          Install names pack
        </label>
        <input
          id="names-pack-file"
          type="file"
          accept=".sqlite,.zip,application/zip,application/x-sqlite3"
          disabled={namesPackBusy}
          className="mt-2 block w-full text-sm"
          onChange={(event) => {
            void handleNamesPackFile(event.target.files?.[0])
            event.target.value = ''
          }}
        />
        {namesPack ? (
          <div className="border-border mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm">
            <span>
              <span className="block font-medium">
                {namesPack.name} {namesPack.version}
              </span>
              <span className="text-muted-foreground block">
                {namesPack.license} · {namesPack.attribution}
              </span>
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={namesPackBusy}
              onClick={() => void handleRemoveNamesPack()}
            >
              Remove
            </Button>
          </div>
        ) : (
          <p className="text-muted-foreground mt-4 text-sm">
            No optional names pack installed. Core dictionary search remains
            available.
          </p>
        )}
      </section>
      <section className="border-border bg-card mt-6 rounded-[var(--radius)] border p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-lg font-semibold">Optional full dictionary</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Install the larger full-JMdict SQLite pack to search less-common
          vocabulary offline. It extends the built-in dictionary without
          changing study cards or progress.
        </p>
        <label
          className="mt-4 block text-sm font-medium"
          htmlFor="words-pack-file"
        >
          Install full dictionary pack
        </label>
        <input
          id="words-pack-file"
          type="file"
          accept=".sqlite,.zip,application/zip,application/x-sqlite3"
          disabled={wordsPackBusy}
          className="mt-2 block w-full text-sm"
          onChange={(event) => {
            void handleWordsPackFile(event.target.files?.[0])
            event.target.value = ''
          }}
        />
        {wordsPack ? (
          <div className="border-border mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm">
            <span>
              <span className="block font-medium">
                {wordsPack.name} {wordsPack.version}
              </span>
              <span className="text-muted-foreground block">
                {wordsPack.license} · {wordsPack.attribution}
              </span>
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={wordsPackBusy}
              onClick={() => void handleRemoveWordsPack()}
            >
              Remove
            </Button>
          </div>
        ) : (
          <p className="text-muted-foreground mt-4 text-sm">
            No full dictionary installed. The smaller core dictionary remains
            available.
          </p>
        )}
      </section>
      <section className="border-border bg-card mt-6 rounded-[var(--radius)] border p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-lg font-semibold">Community audio packs</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Install a ZIP containing a manifest.json and recordings. Packs are
          stored only in this browser and must include their own license and
          attribution.
        </p>
        <label
          className="mt-4 block text-sm font-medium"
          htmlFor="audio-pack-file"
        >
          Install audio pack
        </label>
        <input
          id="audio-pack-file"
          type="file"
          accept=".zip,application/zip"
          disabled={audioPackBusy}
          className="mt-2 block w-full text-sm"
          onChange={(event) => {
            void handleAudioPackFile(event.target.files?.[0])
            event.target.value = ''
          }}
        />
        <label
          className="mt-4 block text-sm font-medium"
          htmlFor="audio-pack-url"
        >
          Or install from a URL
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            id="audio-pack-url"
            type="url"
            value={audioPackUrl}
            onChange={(event) => setAudioPackUrl(event.target.value)}
            placeholder="https://example.org/japanese-audio.zip"
            autoComplete="url"
            disabled={audioPackBusy}
            className="border-input bg-background h-11 min-w-0 flex-1 rounded-md border px-3 text-base"
          />
          <Button
            type="button"
            variant="outline"
            disabled={audioPackBusy || !audioPackUrl.trim()}
            onClick={() => void handleAudioPackUrl()}
          >
            Install URL
          </Button>
        </div>
        <p className="text-muted-foreground mt-2 text-xs">
          The host must allow browser downloads (CORS). Only HTTP(S) URLs are
          accepted; credentials are not sent.
        </p>
        {audioPacks.length > 0 ? (
          <>
            <h3 className="mt-5 font-medium">Preferred recording pack</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              Automatic uses the first matching recording. Choose a pack when
              multiple installed voices cover the same word.
            </p>
            <div
              className="mt-3 grid gap-2"
              role="radiogroup"
              aria-label="Preferred recording pack"
            >
              <Button
                type="button"
                variant={
                  audioPackPreference === AUDIO_PACK_PREFERENCE_AUTO
                    ? 'secondary'
                    : 'outline'
                }
                role="radio"
                aria-checked={
                  audioPackPreference === AUDIO_PACK_PREFERENCE_AUTO
                }
                disabled={saving || audioPackBusy}
                className="h-auto justify-start px-4 py-3 text-left"
                onClick={() =>
                  void chooseAudioPackPreference(AUDIO_PACK_PREFERENCE_AUTO)
                }
              >
                <span>
                  <span className="block font-semibold">Automatic</span>
                  <span className="text-muted-foreground block text-sm font-normal">
                    Use any installed matching recording.
                  </span>
                </span>
              </Button>
              {audioPacks.map((pack) => (
                <Button
                  key={pack.id}
                  type="button"
                  variant={
                    audioPackPreference === pack.id ? 'secondary' : 'outline'
                  }
                  role="radio"
                  aria-checked={audioPackPreference === pack.id}
                  disabled={saving || audioPackBusy}
                  className="h-auto justify-start px-4 py-3 text-left"
                  onClick={() => void chooseAudioPackPreference(pack.id)}
                >
                  <span>
                    <span className="block font-semibold">
                      {pack.name} {pack.version}
                    </span>
                    <span className="text-muted-foreground block text-sm font-normal">
                      {countAudioPackRecordings(pack)} recordings ·{' '}
                      {pack.license}
                    </span>
                  </span>
                </Button>
              ))}
            </div>
          </>
        ) : null}
        {audioPacks.length > 0 ? (
          <ul className="mt-4 grid gap-2" aria-label="Installed audio packs">
            {audioPacks.map((pack) => (
              <li
                key={pack.id}
                className="border-border flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm"
              >
                <span>
                  <span className="block font-medium">
                    {pack.name} {pack.version}
                  </span>
                  <span className="text-muted-foreground block">
                    {pack.license} · {pack.attribution}
                  </span>
                  <span className="text-muted-foreground block">
                    {countAudioPackRecordings(pack)}{' '}
                    {countAudioPackRecordings(pack) === 1
                      ? 'recording'
                      : 'recordings'}
                  </span>
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={audioPackBusy}
                  onClick={() => void handleRemoveAudioPack(pack)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground mt-4 text-sm">
            No community recordings installed. Device speech synthesis remains
            available when supported.
          </p>
        )}
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
        <h2 className="text-lg font-semibold">Saving cards</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Choose whether saving a card to the Saved deck needs confirmation.
          This setting works offline.
        </p>
        <div
          className="mt-5 grid gap-3"
          role="radiogroup"
          aria-label="Saving cards"
        >
          {SAVE_BEHAVIOR_OPTIONS.map(({ value, label, description }) => (
            <Button
              key={value}
              type="button"
              variant={saveBehavior === value ? 'secondary' : 'outline'}
              aria-checked={saveBehavior === value}
              role="radio"
              disabled={saving}
              className="h-auto min-h-14 justify-start px-4 py-3 text-left"
              onClick={() => void chooseSaveBehavior(value)}
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
        <h2 className="text-lg font-semibold">Study reminder</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Ask this browser to remind you once a day when cards are due. The
          offline fallback runs while KanjiForge is open. When the server is
          configured, enabling the reminder also registers this device for
          background Web Push delivery.
        </p>
        <div className="mt-5 flex flex-wrap items-end gap-4">
          <label
            className="grid gap-2 text-sm font-medium"
            htmlFor="daily-reminder-time"
          >
            Reminder time
            <input
              id="daily-reminder-time"
              type="time"
              value={dailyReminderTime}
              onChange={(event) =>
                void chooseDailyReminderTime(event.target.value)
              }
              disabled={saving}
              className="border-input bg-background focus-visible:ring-ring h-10 rounded-md border px-3 font-normal outline-none focus-visible:ring-2"
            />
          </label>
          <Button
            type="button"
            variant={dailyReminderEnabled ? 'secondary' : 'outline'}
            aria-checked={dailyReminderEnabled}
            role="checkbox"
            disabled={saving}
            onClick={() => void toggleDailyReminder()}
          >
            {dailyReminderEnabled
              ? 'Daily reminder on'
              : 'Enable daily reminder'}
          </Button>
        </div>
        <p className="text-muted-foreground mt-4 text-sm">
          {notificationStatus === 'granted'
            ? 'Browser notifications are allowed.'
            : notificationStatus === 'denied'
              ? 'Notifications are blocked. Allow them in browser settings to enable reminders.'
              : notificationStatus === 'unsupported'
                ? 'This browser does not provide notifications.'
                : 'Notifications are off until you enable a reminder.'}
        </p>
        {showIosInstallGuidance && notificationStatus !== 'granted' ? (
          <div className="border-border bg-muted mt-4 rounded-md border p-4">
            <p className="font-medium">Install KanjiForge for iOS reminders</p>
            <p className="text-muted-foreground mt-1 text-sm">
              iPhone and iPad Safari cannot deliver reminders reliably from an
              ordinary tab. Install KanjiForge from Safari’s Share menu, then
              reopen it from the Home Screen before enabling notifications.
            </p>
          </div>
        ) : null}
        <p className="text-muted-foreground mt-2 text-sm" role="status">
          {backgroundPushStatus === 'subscribed'
            ? 'Background Web Push is enabled for this device.'
            : backgroundPushStatus === 'not-configured'
              ? 'Background Web Push is unavailable on this server; the open-app fallback remains active.'
              : backgroundPushStatus === 'unsupported'
                ? 'This browser cannot receive background Web Push; the open-app fallback remains active.'
                : backgroundPushStatus === 'permission-denied'
                  ? 'Allow browser notifications before enabling background Web Push.'
                  : backgroundPushStatus === 'not-subscribed'
                    ? 'This device is not registered for background Web Push; the open-app fallback remains active.'
                    : 'When configured, enabling this reminder also registers this device for background Web Push.'}
        </p>
        {backgroundPushStatus === 'subscribed' ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={backgroundPushTesting}
              onClick={() => void sendTestReminder()}
            >
              {backgroundPushTesting
                ? 'Sending test reminder…'
                : 'Send test reminder'}
            </Button>
            <span className="text-muted-foreground text-sm">
              Check delivery now instead of waiting for the scheduled time.
            </span>
          </div>
        ) : null}
        {backgroundPushMessage ? (
          <p className="text-muted-foreground mt-3 text-sm" role="status">
            {backgroundPushMessage}
          </p>
        ) : null}
      </section>
      <section className="border-border bg-card mt-6 rounded-[var(--radius)] border p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-lg font-semibold">Storage protection</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          KanjiForge asks your browser to protect local study data from
          automatic eviction after your first completed study session.
        </p>
        {storagePersistenceStatus === 'granted' ? (
          <p className="text-muted-foreground mt-4 text-sm" role="status">
            This browser is protecting your local study data from automatic
            eviction.
          </p>
        ) : storagePersistenceStatus === 'unsupported' ? (
          <p className="text-muted-foreground mt-4 text-sm" role="alert">
            This browser does not offer storage protection. Keep regular backups
            so a browser cleanup cannot erase your progress.
          </p>
        ) : storagePersistenceStatus === 'denied' ? (
          <div
            className="border-destructive/40 bg-destructive/10 mt-4 rounded-md border p-4"
            role="alert"
          >
            <p className="font-medium">
              This browser may clear your local study data.
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              Allow storage protection or keep regular backups to preserve your
              progress.
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-3"
              disabled={saving}
              onClick={() => void protectStorage()}
            >
              Try storage protection again
            </Button>
          </div>
        ) : null}
        {showIosInstallGuidance && storagePersistenceStatus !== 'granted' ? (
          <div className="border-border bg-muted mt-4 rounded-md border p-4">
            <p className="font-medium">Keep KanjiForge on your Home Screen</p>
            <p className="text-muted-foreground mt-1 text-sm">
              iPhone and iPad Safari are more likely to retain offline study
              data when the app is installed. Tap Share, then “Add to Home
              Screen,” and open KanjiForge from there.
            </p>
          </div>
        ) : null}
      </section>
      <section className="border-border bg-card mt-6 rounded-[var(--radius)] border p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-lg font-semibold">Deck name</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Give the built-in starter deck a name that makes sense to you. The
          name is saved locally and works offline.
        </p>
        <form
          className="mt-5 flex flex-wrap items-end gap-3"
          onSubmit={(event) => void saveDeckName(event)}
        >
          <label
            className="grid min-w-60 flex-1 gap-2 text-sm font-medium"
            htmlFor="starter-deck-name"
          >
            Current deck name
            <input
              id="starter-deck-name"
              className="border-input bg-background focus-visible:ring-ring h-10 rounded-md border px-3 py-2 font-normal outline-none focus-visible:ring-2"
              value={deckName}
              onChange={(event) => setDeckName(event.target.value)}
              maxLength={80}
              disabled={saving}
            />
          </label>
          <Button type="submit" disabled={saving || !deckName.trim()}>
            {saving ? 'Saving…' : 'Save deck name'}
          </Button>
        </form>
        <Button
          type="button"
          variant="outline"
          className="mt-3"
          disabled={saving || deckName.trim() === DEFAULT_STARTER_DECK_NAME}
          onClick={() => void restoreDeckName()}
        >
          Restore original deck name
        </Button>
        {deckMessage && (
          <p className="text-muted-foreground mt-4 text-sm" role="status">
            {deckMessage}
          </p>
        )}
      </section>
      <section className="border-border bg-card mt-6 rounded-[var(--radius)] border p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-lg font-semibold">Deck organization</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Group your decks into named folders. Folder labels are saved on this
          device and work offline; leave a label empty to keep a deck in
          Unfiled.
        </p>
        <div className="mt-5 space-y-5">
          {groupDecksByFolder(
            [
              {
                id: STARTER_DECK_ID,
                name: deckName,
                kind: 'derived',
                definitionId: STARTER_DECK_ID,
                updatedAt: 0,
              },
              {
                id: 'saved',
                name: 'Saved',
                kind: 'saved',
                definitionId: null,
                updatedAt: 0,
              },
              ...customDecks,
            ],
            deckFolders,
          ).map((group) => (
            <div key={group.name}>
              <h3 className="font-medium">{group.name}</h3>
              <div className="mt-3 grid gap-3">
                {group.decks.map((deck) => (
                  <form
                    key={deck.id}
                    className="flex flex-wrap items-end gap-3"
                    onSubmit={(event) => {
                      event.preventDefault()
                      void saveDeckFolder(
                        deck.id,
                        deckFolderDrafts[deck.id] ?? '',
                      )
                    }}
                  >
                    <label
                      className="grid min-w-60 flex-1 gap-2 text-sm font-medium"
                      htmlFor={`deck-folder-${deck.id}`}
                    >
                      {deck.name} folder
                      <input
                        id={`deck-folder-${deck.id}`}
                        className="border-input bg-background focus-visible:ring-ring h-10 rounded-md border px-3 py-2 font-normal outline-none focus-visible:ring-2"
                        value={deckFolderDrafts[deck.id] ?? ''}
                        onChange={(event) =>
                          setDeckFolderDrafts((current) => ({
                            ...current,
                            [deck.id]: event.target.value,
                          }))
                        }
                        maxLength={40}
                        disabled={saving}
                        placeholder="Unfiled"
                      />
                    </label>
                    <Button type="submit" disabled={saving}>
                      Save folder
                    </Button>
                    {deck.kind === 'custom' && (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={saving}
                        onClick={() => void deleteUserDeck(deck)}
                      >
                        Delete {deck.name}
                      </Button>
                    )}
                  </form>
                ))}
              </div>
            </div>
          ))}
        </div>
        {deckFolderMessage && (
          <p className="text-muted-foreground mt-4 text-sm" role="status">
            {deckFolderMessage}
          </p>
        )}
      </section>
      <section className="border-border bg-card mt-6 rounded-[var(--radius)] border p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-lg font-semibold">Delete Saved deck</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Remove the Saved deck and its cards, progress, notes, and review
          history from this device. The built-in starter deck is not affected;
          saving a card creates Saved again.
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-5"
          disabled={saving || !savedDeckExists}
          onClick={() =>
            void deleteUserDeck({
              id: 'saved',
              name: 'Saved',
            })
          }
        >
          {savedDeckExists ? 'Delete Saved deck' : 'Saved deck is empty'}
        </Button>
      </section>
      <section className="border-border bg-card mt-6 rounded-[var(--radius)] border p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-lg font-semibold">Reset colors</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Return every studied card in the starter deck to New without deleting
          review totals, flags, or history. This is useful when you want to
          start the color progression again.
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-5"
          disabled={resetBusy}
          onClick={() => void resetColors()}
        >
          {resetBusy ? 'Resetting colors…' : 'Reset all colors'}
        </Button>
        {resetMessage && (
          <p className="text-muted-foreground mt-4 text-sm" role="status">
            {resetMessage}
          </p>
        )}
      </section>
      <section className="border-border bg-card mt-6 rounded-[var(--radius)] border p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-lg font-semibold">Reset statistics</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Clear the starter deck&apos;s review history, daily activity, and
          study time, and return its touched cards to New. Flags and notes are
          kept. This cannot be undone, so make a backup first if you may want
          the history later.
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-5"
          disabled={statisticsResetBusy}
          onClick={() => void resetStatistics()}
        >
          {statisticsResetBusy ? 'Resetting statistics…' : 'Reset statistics'}
        </Button>
        {statisticsResetMessage && (
          <p className="text-muted-foreground mt-4 text-sm" role="status">
            {statisticsResetMessage}
          </p>
        )}
      </section>
      <section className="border-border bg-card mt-6 rounded-[var(--radius)] border p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-lg font-semibold">Transfer progress</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Copy the starter deck&apos;s studied levels, schedules, and review
          totals to matching cards in Saved. Untouched cards are skipped, and
          Saved flags and notes stay with Saved.
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-5"
          disabled={progressTransferBusy}
          onClick={() => void transferStarterProgress()}
        >
          {progressTransferBusy
            ? 'Transferring progress…'
            : 'Transfer to Saved'}
        </Button>
        {progressTransferMessage && (
          <p className="text-muted-foreground mt-4 text-sm" role="status">
            {progressTransferMessage}
          </p>
        )}
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
        <div className="border-border mt-5 border-t pt-5">
          <h3 className="font-semibold">Automatic folder backup</h3>
          <p className="text-muted-foreground mt-1 text-sm">
            On supported desktop browsers, save a fresh full backup once per day
            when KanjiForge opens or returns to the foreground. The file is
            written locally to a folder you choose.
          </p>
          {!autoBackupSupported ? (
            <p className="text-muted-foreground mt-3 text-sm">
              This browser does not support choosing a backup folder. Download a
              backup above instead.
            </p>
          ) : autoBackupDirectory ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <p className="text-sm" role="status">
                Saving to <strong>{autoBackupDirectory}</strong>
              </p>
              <Button
                type="button"
                variant="outline"
                disabled={backupBusy}
                onClick={() => void forgetAutomaticBackupFolder()}
              >
                Forget folder
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="mt-3"
              disabled={backupBusy}
              onClick={() => void chooseAutomaticBackupFolder()}
            >
              Choose backup folder
            </Button>
          )}
        </div>
        <div className="border-border mt-5 border-t pt-5">
          <h3 className="font-semibold">Export this deck</h3>
          <p className="text-muted-foreground mt-1 text-sm">
            Copy the current starter deck as tab-separated kanji, readings, and
            meanings for pasting into another app or spreadsheet, or download
            the deck with its content and study progress.
          </p>
          <label
            className="mt-3 grid max-w-sm gap-2 text-sm font-medium"
            htmlFor="share-deck"
          >
            Deck to share
            <select
              id="share-deck"
              className="border-input bg-background focus-visible:ring-ring h-10 rounded-md border px-3 py-2 font-normal outline-none focus-visible:ring-2"
              value={shareDeckId}
              onChange={(event) => setShareDeckId(event.target.value)}
              disabled={deckExportBusy}
            >
              {deckSources
                .filter(
                  (source) =>
                    source.id === STARTER_DECK_ID ||
                    source.id === 'saved' ||
                    customDecks.some((deck) => deck.id === source.id),
                )
                .map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name}
                  </option>
                ))}
            </select>
            <span className="text-muted-foreground font-normal">
              Shared links and files contain dictionary-backed card content
              only, never private study progress.
            </span>
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={deckExportBusy}
              onClick={() => void exportDeckToClipboard()}
            >
              {deckExportBusy ? 'Exporting deck…' : 'Copy deck as text'}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={deckExportBusy}
              onClick={() => void downloadDeck('csv')}
            >
              Download CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={deckExportBusy}
              onClick={() => void downloadDeck('json')}
            >
              Download JSON
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={deckExportBusy}
              onClick={() => void shareDeckByLink()}
            >
              Copy share link
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={deckExportBusy}
              onClick={() => void downloadDeckShareFile()}
            >
              Download share file
            </Button>
          </div>
          {deckExportMessage && (
            <p className="text-muted-foreground mt-4 text-sm" role="status">
              {deckExportMessage}
            </p>
          )}
        </div>
        <div className="border-border mt-5 border-t pt-5">
          <h3 className="font-semibold">Import kanji and words</h3>
          <p className="text-muted-foreground mt-1 text-sm">
            Paste one kanji or dictionary word per line, a compact kanji list,
            or the first column from a KanjiForge text export. Exact dictionary
            matches are enriched offline and appended to the selected deck.
          </p>
          <label
            className="mt-3 grid max-w-sm gap-2 text-sm font-medium"
            htmlFor="import-destination"
          >
            Append imported cards to
            <select
              id="import-destination"
              className="border-input bg-background focus-visible:ring-ring h-10 rounded-md border px-3 py-2 font-normal outline-none focus-visible:ring-2"
              value={importDeckId}
              onChange={(event) => {
                setImportDeckId(event.target.value)
                setDeckImportPreview(null)
                setDeckImportMessage(null)
              }}
              disabled={deckImportBusy}
            >
              <option value="saved">Saved</option>
              {customDecks.map((deck) => (
                <option key={deck.id} value={deck.id}>
                  {deck.name}
                </option>
              ))}
            </select>
          </label>
          <textarea
            aria-label="Kanji to import"
            className="border-input bg-background focus-visible:ring-ring font-jp-ui mt-3 min-h-28 w-full rounded-md border p-3 outline-none focus-visible:ring-2"
            value={deckImportText}
            onChange={(event) => {
              setDeckImportText(event.target.value)
              setDeckImportPreview(null)
              setDeckImportMessage(null)
            }}
            placeholder={'日\nお金\n日本語'}
            disabled={deckImportBusy}
          />
          <Button
            type="button"
            className="mt-3"
            disabled={
              deckImportBusy ||
              deckImportPreview !== null ||
              parseImportValues(deckImportText).length === 0
            }
            onClick={() => void previewKanjiList()}
          >
            {deckImportBusy ? 'Previewing…' : 'Preview import'}
          </Button>
          {deckImportPreview && (
            <div
              aria-label="Import preview"
              className="border-border mt-4 rounded-md border p-3"
            >
              <p className="font-medium">Import preview</p>
              <ul className="text-muted-foreground mt-2 space-y-1 text-sm">
                {deckImportPreview.map((item) => (
                  <li key={`${item.label}-${item.contentRef ?? 'unknown'}`}>
                    <span className="font-jp-ui text-foreground">
                      {item.label}
                    </span>{' '}
                    {item.status === 'matched'
                      ? 'matched — will be added'
                      : item.status === 'already-in-target'
                        ? 'already in the selected deck'
                        : 'not found in the installed dictionary'}
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                className="mt-3"
                disabled={
                  deckImportBusy ||
                  !deckImportPreview.some((item) => item.status === 'matched')
                }
                onClick={() => void importMatchedCards()}
              >
                {deckImportBusy ? 'Importing…' : 'Import matched kanji'}
              </Button>
            </div>
          )}
          {deckImportMessage && (
            <p className="text-muted-foreground mt-4 text-sm" role="status">
              {deckImportMessage}
            </p>
          )}
          <div className="border-border mt-5 border-t pt-5">
            <h4 className="font-medium">Import from CSV</h4>
            <p className="text-muted-foreground mt-1 text-sm">
              Paste a CSV with a header row, or choose a CSV file. Select the
              column containing kanji before previewing the matched cards.
            </p>
            <input
              className="mt-3 block text-sm"
              type="file"
              accept="text/csv,.csv"
              aria-label="Choose CSV import file"
              disabled={deckImportBusy}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (!file) return
                void file.text().then((text) => {
                  setCsvImportText(text)
                  setCsvImportTable(null)
                  setDeckImportPreview(null)
                  setDeckImportMessage(null)
                })
              }}
            />
            <textarea
              aria-label="CSV to import"
              className="border-input bg-background focus-visible:ring-ring mt-3 min-h-28 w-full rounded-md border p-3 font-mono text-sm outline-none focus-visible:ring-2"
              value={csvImportText}
              onChange={(event) => {
                setCsvImportText(event.target.value)
                setCsvImportTable(null)
                setDeckImportPreview(null)
                setDeckImportMessage(null)
              }}
              placeholder={'kanji,reading,meaning\n日,ひ,day'}
              disabled={deckImportBusy}
            />
            <Button
              type="button"
              variant="outline"
              className="mt-3"
              disabled={deckImportBusy || csvImportText.trim().length === 0}
              onClick={parseCsvTable}
            >
              Read CSV columns
            </Button>
            {csvImportTable && (
              <div className="border-border mt-4 rounded-md border p-3">
                <label className="block text-sm" htmlFor="csv-kanji-column">
                  Kanji column
                </label>
                <select
                  id="csv-kanji-column"
                  className="border-input bg-background mt-2 rounded-md border p-2"
                  value={csvKanjiColumn}
                  onChange={(event) =>
                    setCsvKanjiColumn(Number(event.target.value))
                  }
                  disabled={deckImportBusy}
                >
                  {csvImportTable.headers.map((header, index) => (
                    <option key={`${index}-${header}`} value={index}>
                      {header}
                    </option>
                  ))}
                </select>
                <p className="text-muted-foreground mt-2 text-sm">
                  {csvImportTable.rows.length} data row
                  {csvImportTable.rows.length === 1 ? '' : 's'} detected.
                </p>
                <Button
                  type="button"
                  className="mt-3"
                  disabled={deckImportBusy}
                  onClick={() => void previewCsvList()}
                >
                  Preview CSV import
                </Button>
              </div>
            )}
            <div className="border-border mt-5 border-t pt-5">
              <h4 className="font-medium">Import from JSON</h4>
              <p className="text-muted-foreground mt-1 text-sm">
                Choose or paste a versioned KanjiForge deck export or
                content-only share file. Its content is previewed and added to
                Saved without replacing existing progress.
              </p>
              <input
                className="mt-3 block text-sm"
                type="file"
                accept="application/json,.json"
                aria-label="Choose JSON deck import file"
                disabled={deckImportBusy}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (!file) return
                  void file.text().then((text) => {
                    setJsonImportText(text)
                    setDeckImportPreview(null)
                    setDeckImportMessage(null)
                  })
                }}
              />
              <textarea
                aria-label="JSON deck to import"
                className="border-input bg-background focus-visible:ring-ring mt-3 min-h-28 w-full rounded-md border p-3 font-mono text-sm outline-none focus-visible:ring-2"
                value={jsonImportText}
                onChange={(event) => {
                  setJsonImportText(event.target.value)
                  setDeckImportPreview(null)
                  setDeckImportMessage(null)
                }}
                placeholder={'{"format":"kanjiforge-deck-export",…}'}
                disabled={deckImportBusy}
              />
              <Button
                type="button"
                className="mt-3"
                disabled={deckImportBusy || jsonImportText.trim().length === 0}
                onClick={() => void previewJsonList()}
              >
                Preview JSON import
              </Button>
            </div>
            <div className="border-border mt-5 border-t pt-5">
              <h4 className="font-medium">Import from Anki</h4>
              <p className="text-muted-foreground mt-1 text-sm">
                Choose an Anki .apkg export. Japanese words and kanji found in
                its note fields are enriched through the offline dictionary and
                previewed before being added to Saved; tags are preserved as
                sticky annotations, while scheduling and card templates are
                intentionally not imported.
              </p>
              <input
                className="mt-3 block text-sm"
                type="file"
                accept=".apkg,application/zip"
                aria-label="Choose Anki package import file"
                disabled={deckImportBusy}
                onChange={(event) => {
                  setAnkiImportFile(event.target.files?.[0] ?? null)
                  setDeckImportPreview(null)
                  setDeckImportMessage(null)
                }}
              />
              <Button
                type="button"
                className="mt-3"
                disabled={deckImportBusy || ankiImportFile === null}
                onClick={() => void previewAnkiList()}
              >
                Preview Anki import
              </Button>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
