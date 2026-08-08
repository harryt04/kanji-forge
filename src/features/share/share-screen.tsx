'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getActiveUserRuntime } from '@/auth/runtime'
import {
  analyzeJapaneseText,
  getKanjiByLiterals,
  getWordById,
  type TextAnalysisToken,
} from '@/data/packs'
import { createUserRepositories } from '@/data/repo'
import { Button } from '@/ui/button'
import {
  parseKanjiImportText,
  previewImport,
  type ImportEntry,
  type ImportPreviewItem,
} from '@/features/settings/deck-import'
import {
  cardsFromDeckSharePayload,
  parseDeckSharePayload,
  type DeckSharePayload,
} from '@/features/settings/deck-share'
import {
  ANALYZER_DISPLAY_SETTING,
  DEFAULT_ANALYZER_DISPLAY_SETTINGS,
  FURIGANA_MODES,
  GLOSS_MODES,
  parseAnalyzerDisplaySettings,
  readingToRomaji,
  serializeAnalyzerDisplaySettings,
  type AnalyzerDisplaySettings,
} from './analyzer-settings'

export interface SharedTextPayload {
  readonly text: string
  readonly title: string | null
  readonly url: string | null
}

/** Reads the GET share-target fields without requiring a network round trip. */
export function readSharedTextPayload(search: string): SharedTextPayload {
  const params = new URLSearchParams(search)
  const text = params.get('text')?.trim() ?? ''
  const title = params.get('title')?.trim() || null
  const url = params.get('url')?.trim() || null
  return { text, title, url }
}

/** Only expose shared article URLs as links when they cannot invoke a script URL. */
export function isExternalArticleUrl(value: string | null): value is string {
  if (!value) return false
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/** Reads a content-only deck payload from a copied KanjiForge share link. */
export function readSharedDeckPayload(search: string): DeckSharePayload | null {
  const raw = new URLSearchParams(search).get('deck')
  return raw ? parseDeckSharePayload(raw) : null
}

async function resolveSharedDeckEntries(
  deck: DeckSharePayload,
): Promise<readonly ImportEntry[]> {
  const cards = cardsFromDeckSharePayload(deck)
  const kanji = await getKanjiByLiterals(
    cards.filter((card) => card.kind === 'kanji').map((card) => card.label),
  )
  const words = await Promise.all(
    cards.map(async (card) => {
      if (card.kind !== 'word') return null
      const id = Number(card.contentRef.slice('word:'.length))
      return [card.contentRef, await getWordById(id)] as const
    }),
  )
  const wordByRef = new Map(
    words.flatMap((entry) => (entry?.[1] ? [entry] : [])),
  )
  return cards.map((card) => ({
    label: card.label,
    contentRef:
      card.kind === 'kanji'
        ? kanji.has(card.label)
          ? card.contentRef
          : null
        : wordByRef.has(card.contentRef)
          ? card.contentRef
          : null,
    kind: card.kind,
  }))
}

async function resolveTextImportEntries(
  entries: readonly ImportEntry[],
): Promise<readonly ImportEntry[]> {
  const records = await getKanjiByLiterals(entries.map((entry) => entry.label))
  return entries.map((entry) => ({
    ...entry,
    contentRef: records.has(entry.label) ? `kanji:${entry.label}` : null,
    kind: 'kanji' as const,
  }))
}

/** Returns dictionary-backed word tokens that are not already in Saved. */
export function getUnsavedAnalysisWords(
  analysis: readonly TextAnalysisToken[],
  savedContentRefs: ReadonlySet<string>,
): readonly TextAnalysisToken[] {
  const seen = new Set<string>()
  return analysis.filter((token) => {
    if (
      token.type !== 'word' ||
      !token.contentRef ||
      savedContentRefs.has(token.contentRef) ||
      seen.has(token.contentRef)
    )
      return false
    seen.add(token.contentRef)
    return true
  })
}

export function ShareTargetScreen(): React.ReactElement {
  const runtime = getActiveUserRuntime()
  const [payload, setPayload] = useState<SharedTextPayload>({
    text: '',
    title: null,
    url: null,
  })
  const [sharedDeck, setSharedDeck] = useState<DeckSharePayload | null>(null)
  const [preview, setPreview] = useState<readonly ImportPreviewItem[] | null>(
    null,
  )
  const [draftText, setDraftText] = useState('')
  const [analysis, setAnalysis] = useState<readonly TextAnalysisToken[] | null>(
    null,
  )
  const [displaySettings, setDisplaySettings] =
    useState<AnalyzerDisplaySettings>(DEFAULT_ANALYZER_DISPLAY_SETTINGS)
  const [expandedGlosses, setExpandedGlosses] = useState<ReadonlySet<number>>(
    () => new Set(),
  )
  const [savedContentRefs, setSavedContentRefs] = useState<ReadonlySet<string>>(
    () => new Set(),
  )
  const [analyzing, setAnalyzing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let nextDeck: DeckSharePayload | null
    try {
      nextDeck = readSharedDeckPayload(window.location.search)
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : 'This deck link is invalid.',
      )
      setLoading(false)
      return
    }
    const nextPayload = readSharedTextPayload(window.location.search)
    setDraftText(nextPayload.text)
    setPayload(nextPayload)
    setSharedDeck(nextDeck)

    // A shared article should be useful immediately: analyze its supplied text
    // offline as soon as the share target opens. The user can still edit the
    // text and run another analysis manually afterward.
    let active = true
    if (nextPayload.text) {
      void analyzeJapaneseText(nextPayload.text)
        .then((nextAnalysis) => {
          if (active) setAnalysis(nextAnalysis)
        })
        .catch((reason: unknown) => {
          if (active)
            setError(
              reason instanceof Error
                ? reason.message
                : 'Could not analyze shared text.',
            )
        })
    }
    const importEntries = nextDeck
      ? resolveSharedDeckEntries(nextDeck)
      : Promise.resolve<readonly ImportEntry[]>(
          parseKanjiImportText(nextPayload.text).map((label) => ({
            label,
            contentRef: null,
            kind: 'unknown',
          })),
        )
    if (!runtime) {
      setLoading(false)
      return () => {
        active = false
      }
    }

    void (async () => {
      try {
        await runtime.database.ready
        const repositories = createUserRepositories(runtime.database)
        const [existing, savedDisplaySettings, entries] = await Promise.all([
          repositories.deckMembership.list(),
          repositories.settings.get(ANALYZER_DISPLAY_SETTING),
          importEntries,
        ])
        if (!active) return
        setDisplaySettings(
          parseAnalyzerDisplaySettings(savedDisplaySettings?.value),
        )
        setSavedContentRefs(
          new Set(
            existing
              .filter((membership) => membership.deckId === 'saved')
              .map((membership) => membership.contentRef),
          ),
        )
        const resolvedEntries = nextDeck
          ? entries
          : await resolveTextImportEntries(entries)
        setPreview(
          previewImport(
            resolvedEntries,
            new Set(
              existing
                .filter((membership) => membership.deckId === 'saved')
                .map((membership) => membership.contentRef),
            ),
          ),
        )
      } catch (reason: unknown) {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : 'Could not prepare the shared content.',
          )
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [runtime])

  async function analyzeText(): Promise<void> {
    if (!draftText.trim() || analyzing) return
    setAnalyzing(true)
    setError(null)
    try {
      setExpandedGlosses(new Set())
      setAnalysis(await analyzeJapaneseText(draftText))
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : 'Could not analyze text.',
      )
    } finally {
      setAnalyzing(false)
    }
  }

  async function updateDisplaySettings(
    update: Partial<AnalyzerDisplaySettings>,
  ): Promise<void> {
    if (!runtime) return
    const next = { ...displaySettings, ...update }
    setDisplaySettings(next)
    try {
      await runtime.database.ready
      await createUserRepositories(runtime.database).settings.set({
        key: ANALYZER_DISPLAY_SETTING,
        value: serializeAnalyzerDisplaySettings(next),
        updatedAt: Date.now(),
      })
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not save analyzer display settings.',
      )
    }
  }

  function toggleGloss(index: number): void {
    setExpandedGlosses((current) => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  async function importMatchedDeckCards(): Promise<void> {
    if (!runtime || !preview || importing) return
    const matched = preview.filter((item) => item.status === 'matched')
    if (matched.length === 0) {
      setMessage('There are no new matched cards to add.')
      return
    }

    setImporting(true)
    setMessage(null)
    setError(null)
    try {
      await runtime.database.ready
      const repositories = createUserRepositories(runtime.database)
      const existing = await repositories.deckMembership.list('saved')
      const existingRefs = new Set(
        existing.map((membership) => membership.contentRef),
      )
      const now = Date.now()
      let sortOrder = existing.length
      let imported = 0

      for (const item of matched) {
        if (!item.contentRef || existingRefs.has(item.contentRef)) continue
        const membership = {
          deckId: 'saved' as const,
          contentRef: item.contentRef,
          sortOrder,
          addedAt: now,
          updatedAt: now,
        }
        await repositories.recordDeckMembership({
          deck: {
            id: 'saved',
            name: 'Saved',
            kind: 'saved',
            definitionId: null,
            updatedAt: now,
          },
          membership,
          mutation: {
            id: crypto.randomUUID(),
            mutType: 'deckMembership.upsert',
            payload: JSON.stringify(membership),
            createdAt: now,
            attempts: 0,
          },
        })
        existingRefs.add(item.contentRef)
        sortOrder += 1
        imported += 1
      }

      const alreadySaved = preview.filter(
        (item) => item.status === 'already-in-target',
      ).length
      const unknown = preview.filter(
        (item) => item.status === 'not-found',
      ).length
      setPreview(
        preview.map((item) =>
          item.status === 'matched'
            ? { ...item, status: 'already-in-target' }
            : item,
        ),
      )
      setMessage(
        `Added ${sharedDeck ? `${imported} card${imported === 1 ? '' : 's'}` : `${imported} kanji`}${sharedDeck ? ` from “${sharedDeck.name}”` : ''} to Saved.${alreadySaved > 0 ? ` ${alreadySaved} already in Saved.` : ''}${unknown > 0 ? ` ${unknown} were not found in the installed dictionary.` : ''}`,
      )
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : 'Could not import cards.',
      )
    } finally {
      setImporting(false)
    }
  }

  async function saveUnsavedAnalysisWords(): Promise<void> {
    if (!runtime || !analysis || importing) return
    const words = getUnsavedAnalysisWords(analysis, savedContentRefs)
    if (words.length === 0) {
      setMessage('There are no new dictionary words to add.')
      return
    }

    setImporting(true)
    setMessage(null)
    setError(null)
    try {
      await runtime.database.ready
      const repositories = createUserRepositories(runtime.database)
      const existing = await repositories.deckMembership.list('saved')
      const now = Date.now()
      const savedDeck = {
        id: 'saved',
        name: 'Saved',
        kind: 'saved' as const,
        definitionId: null,
        updatedAt: now,
      }
      await repositories.recordDeckMemberships({
        deck: savedDeck,
        deckMutation: {
          id: crypto.randomUUID(),
          mutType: 'deck.upsert',
          payload: JSON.stringify(savedDeck),
          createdAt: now,
          attempts: 0,
        },
        memberships: words.map((token, index) => {
          const contentRef = token.contentRef!
          const membership = {
            deckId: 'saved' as const,
            contentRef,
            sortOrder: existing.length + index,
            addedAt: now,
            updatedAt: now,
          }
          return {
            membership,
            mutation: {
              id: crypto.randomUUID(),
              mutType: 'deckMembership.upsert' as const,
              payload: JSON.stringify(membership),
              createdAt: now,
              attempts: 0,
            },
          }
        }),
      })
      setSavedContentRefs((current) => {
        const next = new Set(current)
        for (const token of words) {
          if (token.contentRef) next.add(token.contentRef)
        }
        return next
      })
      setMessage(
        `Added ${words.length} word${words.length === 1 ? '' : 's'} to Saved.`,
      )
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not save analyzed words.',
      )
    } finally {
      setImporting(false)
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl p-5 sm:p-8">
      <p className="font-jp-ui text-muted-foreground text-sm">
        {sharedDeck ? '共有されたデッキ' : '共有された文章'}
      </p>
      <h1 className="font-display mt-2 text-3xl font-bold">
        {sharedDeck ? 'Import shared deck' : 'Import shared text'}
      </h1>
      <p className="text-muted-foreground mt-3">
        {sharedDeck
          ? `Review “${sharedDeck.name}” and add its dictionary-backed kanji and word cards to Saved without changing study progress.`
          : 'KanjiForge found dictionary-backed kanji offline. Review the preview, then add new cards to Saved without changing study progress.'}
      </p>
      {(payload.title || payload.url) && (
        <div className="bg-muted mt-5 rounded-md p-3 text-sm">
          {payload.title && <p className="font-medium">{payload.title}</p>}
          {isExternalArticleUrl(payload.url) ? (
            <a
              className="text-primary mt-1 block break-all underline underline-offset-4"
              href={payload.url}
              target="_blank"
              rel="noreferrer"
            >
              {payload.url}
            </a>
          ) : payload.url ? (
            <p className="text-muted-foreground break-all">{payload.url}</p>
          ) : null}
        </div>
      )}
      {!sharedDeck && (
        <blockquote className="border-primary bg-card mt-5 max-h-48 overflow-auto rounded-md border-l-4 p-4 text-lg whitespace-pre-wrap">
          {payload.text || 'No text field was included.'}
        </blockquote>
      )}
      <section
        aria-label="Japanese text analyzer"
        className="bg-card mt-6 grid gap-3 rounded-lg border p-4"
      >
        <div>
          <h2 className="font-display text-xl font-semibold">
            Analyze Japanese text
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Paste text to see offline dictionary-backed readings and meanings.
          </p>
        </div>
        <label htmlFor="analyze-text" className="text-sm font-medium">
          Japanese text
        </label>
        <textarea
          id="analyze-text"
          value={draftText}
          onChange={(event) => {
            setDraftText(event.target.value)
            setAnalysis(null)
          }}
          rows={5}
          placeholder="日本語の文章を貼り付けてください"
          className="border-input bg-background rounded-md border p-3 text-base"
        />
        <fieldset className="grid gap-3 rounded-md border p-3">
          <legend className="px-1 text-sm font-medium">Display options</legend>
          <label
            className="grid max-w-sm gap-1 text-sm"
            htmlFor="furigana-mode"
          >
            Furigana
            <select
              id="furigana-mode"
              aria-label="Furigana display"
              className="border-input bg-background h-10 rounded-md border px-2"
              value={displaySettings.furigana}
              onChange={(event) =>
                void updateDisplaySettings({
                  furigana: event.target
                    .value as (typeof FURIGANA_MODES)[number],
                })
              }
            >
              <option value="all">Above every reading</option>
              <option value="non-n5">Only above non-N5 kanji</option>
              <option value="off">Hidden</option>
            </select>
          </label>
          <Button
            type="button"
            variant={displaySettings.romaji ? 'secondary' : 'outline'}
            aria-checked={displaySettings.romaji}
            role="checkbox"
            className="h-auto min-h-11 justify-start px-3 py-2 text-left"
            onClick={() =>
              void updateDisplaySettings({ romaji: !displaySettings.romaji })
            }
          >
            <span>
              <span className="block font-medium">Show rōmaji</span>
              <span className="text-muted-foreground block text-sm font-normal">
                Show a Latin reading beneath each analyzed token.
              </span>
            </span>
          </Button>
          <label className="grid max-w-sm gap-1 text-sm" htmlFor="gloss-mode">
            English glosses
            <select
              id="gloss-mode"
              aria-label="English gloss display"
              className="border-input bg-background h-10 rounded-md border px-2"
              value={displaySettings.gloss}
              onChange={(event) =>
                void updateDisplaySettings({
                  gloss: event.target.value as (typeof GLOSS_MODES)[number],
                })
              }
            >
              <option value="inline">Show inline</option>
              <option value="tap">Show on tap</option>
            </select>
          </label>
        </fieldset>
        <Button
          className="w-fit"
          disabled={analyzing || !draftText.trim()}
          onClick={() => void analyzeText()}
        >
          {analyzing ? 'Analyzing…' : 'Analyze text'}
        </Button>
        {analysis && (
          <div
            aria-label="Text analysis results"
            className="border-border grid gap-3 rounded-md border p-3"
          >
            {analysis.length === 0 ? (
              <p className="text-muted-foreground" role="status">
                No text to analyze.
              </p>
            ) : (
              <ol className="grid gap-2">
                {analysis.map((token, index) => (
                  <li
                    key={`${token.text}-${index}`}
                    className="bg-muted/40 rounded-md p-2"
                  >
                    <span className="inline-flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      {token.contentRef ? (
                        <a
                          className="text-primary rounded-sm underline underline-offset-4 focus-visible:ring-2"
                          href={`/detail?contentRef=${encodeURIComponent(token.contentRef)}`}
                          aria-label={`View details for ${token.text}`}
                        >
                          <ruby className="font-jp-ui text-xl" lang="ja">
                            {token.text}
                            {displaySettings.furigana === 'all' ||
                            (displaySettings.furigana === 'non-n5' &&
                              token.hasNonN5Kanji)
                              ? token.reading && (
                                  <rt className="text-sm">{token.reading}</rt>
                                )
                              : null}
                          </ruby>
                        </a>
                      ) : (
                        <ruby className="font-jp-ui text-xl" lang="ja">
                          {token.text}
                          {displaySettings.furigana === 'all' ||
                          (displaySettings.furigana === 'non-n5' &&
                            token.hasNonN5Kanji)
                            ? token.reading && (
                                <rt className="text-sm">{token.reading}</rt>
                              )
                            : null}
                        </ruby>
                      )}
                      {displaySettings.romaji && token.reading && (
                        <span className="text-muted-foreground text-sm italic">
                          {readingToRomaji(token.reading)}
                        </span>
                      )}
                      {token.type === 'unknown' ? (
                        <span className="text-muted-foreground text-sm">
                          Not in the installed dictionary
                        </span>
                      ) : displaySettings.gloss === 'inline' ? (
                        <span className="text-muted-foreground text-sm">
                          {token.meanings.join('; ') || 'No English meaning'}
                        </span>
                      ) : token.meanings.length > 0 ? (
                        <>
                          <button
                            type="button"
                            className="text-primary text-sm underline underline-offset-4"
                            aria-expanded={expandedGlosses.has(index)}
                            onClick={() => toggleGloss(index)}
                          >
                            {expandedGlosses.has(index)
                              ? 'Hide gloss'
                              : 'Show gloss'}
                          </button>
                          {expandedGlosses.has(index) && (
                            <span className="text-muted-foreground text-sm">
                              {token.meanings.join('; ')}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-muted-foreground text-sm">
                          No English meaning
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
        {analysis &&
          getUnsavedAnalysisWords(analysis, savedContentRefs).length > 0 && (
            <Button
              className="w-fit"
              disabled={importing}
              onClick={() => void saveUnsavedAnalysisWords()}
            >
              {importing
                ? 'Saving…'
                : `Add ${getUnsavedAnalysisWords(analysis, savedContentRefs).length} unsaved word${getUnsavedAnalysisWords(analysis, savedContentRefs).length === 1 ? '' : 's'} to Saved`}
            </Button>
          )}
      </section>
      {loading && (
        <p className="text-muted-foreground mt-5">Preparing preview…</p>
      )}
      {error && (
        <p className="text-destructive mt-5" role="alert">
          {error}
        </p>
      )}
      {!loading && preview && preview.length === 0 && (
        <p className="text-muted-foreground mt-5" role="status">
          No importable cards were found in the shared content.
        </p>
      )}
      {preview && preview.length > 0 && (
        <section
          aria-label={
            sharedDeck
              ? 'Shared deck import preview'
              : 'Shared text import preview'
          }
          className="mt-6"
        >
          <h2 className="font-display text-xl font-semibold">
            {sharedDeck ? 'Deck preview' : 'Import preview'}
          </h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {preview.map((item) => (
              <li
                className="border-border bg-card rounded-md border p-3"
                key={`${item.contentRef ?? item.label}-${item.kind}`}
              >
                <span className="font-jp-ui text-xl">{item.label}</span>{' '}
                <span className="text-muted-foreground text-xs uppercase">
                  {item.kind}
                </span>{' '}
                <span className="text-muted-foreground text-sm">
                  {item.status === 'matched'
                    ? 'matched'
                    : item.status === 'already-in-target'
                      ? 'already in Saved'
                      : 'not found'}
                </span>
              </li>
            ))}
          </ul>
          <Button
            className="mt-5"
            disabled={
              importing || !preview.some((item) => item.status === 'matched')
            }
            onClick={() => void importMatchedDeckCards()}
          >
            {importing
              ? 'Importing…'
              : sharedDeck
                ? 'Import shared deck to Saved'
                : 'Import matched kanji to Saved'}
          </Button>
        </section>
      )}
      {message && (
        <p className="text-muted-foreground mt-5" role="status">
          {message}
        </p>
      )}
      <p className="text-muted-foreground mt-8 text-sm">
        Want to paste a CSV or KanjiForge JSON deck instead?{' '}
        <Link className="text-primary underline" href="/settings">
          Open the full import tools in Settings
        </Link>
        .
      </p>
    </main>
  )
}
