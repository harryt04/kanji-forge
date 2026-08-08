'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getActiveUserRuntime } from '@/auth/runtime'
import { getKanjiByLiterals } from '@/data/packs'
import { createUserRepositories } from '@/data/repo'
import { Button } from '@/ui/button'
import {
  parseKanjiImportText,
  previewKanjiImport,
  type KanjiImportPreviewItem,
} from '@/features/settings/deck-import'

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

export function ShareTargetScreen(): React.ReactElement {
  const runtime = getActiveUserRuntime()
  const [payload, setPayload] = useState<SharedTextPayload>({
    text: '',
    title: null,
    url: null,
  })
  const [preview, setPreview] = useState<
    readonly KanjiImportPreviewItem[] | null
  >(null)
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const nextPayload = readSharedTextPayload(window.location.search)
    setPayload(nextPayload)
    const literals = parseKanjiImportText(nextPayload.text)
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
              : 'Could not prepare the shared text.',
          )
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [runtime])

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
        `Added ${imported} kanji to Saved.${alreadySaved > 0 ? ` ${alreadySaved} already in Saved.` : ''}${unknown > 0 ? ` ${unknown} were not found in the installed dictionary.` : ''}`,
      )
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : 'Could not import kanji.',
      )
    } finally {
      setImporting(false)
    }
  }

  if (!payload.text && !payload.title && !payload.url)
    return (
      <main className="mx-auto min-h-screen max-w-3xl p-5 sm:p-8">
        <h1 className="font-display text-3xl font-bold">Import shared text</h1>
        <p className="text-muted-foreground mt-3">
          No shared text was provided. Share Japanese text from another app to
          preview its kanji here.
        </p>
        <Link
          className="text-primary mt-5 inline-block underline"
          href="/settings"
        >
          Open Settings
        </Link>
      </main>
    )

  return (
    <main className="mx-auto min-h-screen max-w-3xl p-5 sm:p-8">
      <p className="font-jp-ui text-muted-foreground text-sm">共有された文章</p>
      <h1 className="font-display mt-2 text-3xl font-bold">
        Import shared text
      </h1>
      <p className="text-muted-foreground mt-3">
        KanjiForge found dictionary-backed kanji offline. Review the preview,
        then add new cards to Saved without changing study progress.
      </p>
      {(payload.title || payload.url) && (
        <div className="bg-muted mt-5 rounded-md p-3 text-sm">
          {payload.title && <p className="font-medium">{payload.title}</p>}
          {payload.url && (
            <p className="text-muted-foreground break-all">{payload.url}</p>
          )}
        </div>
      )}
      <blockquote className="border-primary bg-card mt-5 max-h-48 overflow-auto rounded-md border-l-4 p-4 text-lg whitespace-pre-wrap">
        {payload.text || 'No text field was included.'}
      </blockquote>
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
        <section aria-label="Shared text import preview" className="mt-6">
          <h2 className="font-display text-xl font-semibold">Import preview</h2>
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
            {importing ? 'Importing…' : 'Import matched kanji to Saved'}
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
