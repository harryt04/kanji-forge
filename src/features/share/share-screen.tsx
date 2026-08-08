'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getActiveUserRuntime } from '@/auth/runtime'
import {
  analyzeJapaneseText,
  getKanjiByLiterals,
  type TextAnalysisToken,
} from '@/data/packs'
import { createUserRepositories } from '@/data/repo'
import { Button } from '@/ui/button'
import {
  parseKanjiImportText,
  previewKanjiImport,
  type KanjiImportPreviewItem,
} from '@/features/settings/deck-import'
import {
  parseDeckSharePayload,
  type DeckSharePayload,
} from '@/features/settings/deck-share'

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

/** Reads a content-only deck payload from a copied KanjiForge share link. */
export function readSharedDeckPayload(search: string): DeckSharePayload | null {
  const raw = new URLSearchParams(search).get('deck')
  return raw ? parseDeckSharePayload(raw) : null
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
  const [preview, setPreview] = useState<
    readonly KanjiImportPreviewItem[] | null
  >(null)
  const [draftText, setDraftText] = useState('')
  const [analysis, setAnalysis] = useState<readonly TextAnalysisToken[] | null>(
    null,
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
    const literals = nextDeck?.kanji ?? parseKanjiImportText(nextPayload.text)
    if (!runtime) {
      setLoading(false)
      return
    }

    let active = true
    void (async () => {
      try {
        await runtime.database.ready
        const repositories = createUserRepositories(runtime.database)
        const [records, existing] = await Promise.all([
          getKanjiByLiterals(literals),
          repositories.deckMembership.list(),
        ])
        if (!active) return
        setSavedContentRefs(
          new Set(
            existing
              .filter((membership) => membership.deckId === 'saved')
              .map((membership) => membership.contentRef),
          ),
        )
        setPreview(
          previewKanjiImport(
            literals,
            records,
            new Set(existing.map((membership) => membership.contentRef)),
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
      setAnalysis(await analyzeJapaneseText(draftText))
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : 'Could not analyze text.',
      )
    } finally {
      setAnalyzing(false)
    }
  }

  async function importMatchedKanji(): Promise<void> {
    if (!runtime || !preview || importing) return
    const matched = preview.filter((item) => item.status === 'matched')
    if (matched.length === 0) {
      setMessage('There are no new matched kanji to add.')
      return
    }

    setImporting(true)
    setMessage(null)
    setError(null)
    try {
      await runtime.database.ready
      const repositories = createUserRepositories(runtime.database)
      const records = await getKanjiByLiterals(
        preview.map((item) => item.literal),
      )
      const existing = await repositories.deckMembership.list()
      const existingRefs = new Set(
        existing.map((membership) => membership.contentRef),
      )
      const now = Date.now()
      let sortOrder = existing.length
      let imported = 0

      for (const { literal } of matched) {
        const contentRef = `kanji:${literal}`
        if (!records.has(literal) || existingRefs.has(contentRef)) continue
        const membership = {
          deckId: 'saved' as const,
          contentRef,
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
        existingRefs.add(contentRef)
        sortOrder += 1
        imported += 1
      }

      const alreadySaved = preview.filter(
        (item) => item.status === 'already-saved',
      ).length
      const unknown = preview.filter(
        (item) => item.status === 'not-found',
      ).length
      setPreview(
        preview.map((item) =>
          item.status === 'matched'
            ? { ...item, status: 'already-saved' }
            : item,
        ),
      )
      setMessage(
        `Added ${imported} kanji${sharedDeck ? ` from “${sharedDeck.name}”` : ''} to Saved.${alreadySaved > 0 ? ` ${alreadySaved} already in Saved.` : ''}${unknown > 0 ? ` ${unknown} were not found in the installed dictionary.` : ''}`,
      )
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : 'Could not import kanji.',
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
          ? `Review “${sharedDeck.name}” and add its dictionary-backed kanji to Saved without changing study progress.`
          : 'KanjiForge found dictionary-backed kanji offline. Review the preview, then add new cards to Saved without changing study progress.'}
      </p>
      {(payload.title || payload.url) && (
        <div className="bg-muted mt-5 rounded-md p-3 text-sm">
          {payload.title && <p className="font-medium">{payload.title}</p>}
          {payload.url && (
            <p className="text-muted-foreground break-all">{payload.url}</p>
          )}
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
                    {token.contentRef ? (
                      <a
                        className="text-primary rounded-sm underline underline-offset-4 focus-visible:ring-2"
                        href={`/detail?contentRef=${encodeURIComponent(token.contentRef)}`}
                        aria-label={`View details for ${token.text}`}
                      >
                        <ruby className="font-jp-ui text-xl" lang="ja">
                          {token.text}
                          {token.reading && (
                            <rt className="text-sm">{token.reading}</rt>
                          )}
                        </ruby>
                      </a>
                    ) : (
                      <ruby className="font-jp-ui text-xl" lang="ja">
                        {token.text}
                        {token.reading && (
                          <rt className="text-sm">{token.reading}</rt>
                        )}
                      </ruby>
                    )}
                    <span className="text-muted-foreground ml-3 text-sm">
                      {token.type === 'unknown'
                        ? 'Not in the installed dictionary'
                        : token.meanings.join('; ') || 'No English meaning'}
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
          No kanji were found in the shared text.
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
                key={item.literal}
              >
                <span className="font-jp-ui text-xl">{item.literal}</span>{' '}
                <span className="text-muted-foreground text-sm">
                  {item.status === 'matched'
                    ? 'matched'
                    : item.status === 'already-saved'
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
            onClick={() => void importMatchedKanji()}
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
