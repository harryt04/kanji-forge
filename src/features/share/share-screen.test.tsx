import { readFileSync } from 'fs'
import { join } from 'path'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  bootstrapUserRuntime,
  clearUserRuntime,
  getActiveUserRuntime,
} from '@/auth/runtime'
import { createUserRepositories } from '@/data/repo'
import {
  ShareTargetScreen,
  getUnsavedAnalysisWords,
  readSharedDeckPayload,
  readSharedTextPayload,
} from './share-screen'

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

describe('ShareTargetScreen', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fixtureFetch())
    bootstrapUserRuntime(`share-test-${crypto.randomUUID()}`)
    window.history.replaceState(
      {},
      '',
      '/analyze?text=%E6%97%A5%E6%9C%AC%E8%AA%9E',
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    clearUserRuntime()
    window.history.replaceState({}, '', '/')
  })

  it('deduplicates only unsaved dictionary word tokens for bulk saving', () => {
    const words = getUnsavedAnalysisWords(
      [
        {
          text: 'お金',
          reading: 'おかね',
          meanings: ['money'],
          type: 'word',
          contentRef: 'word:1',
        },
        {
          text: 'お金',
          reading: 'おかね',
          meanings: ['money'],
          type: 'word',
          contentRef: 'word:1',
        },
        {
          text: '日',
          reading: 'ひ',
          meanings: ['day'],
          type: 'kanji',
          contentRef: 'kanji:日',
        },
      ],
      new Set(['word:already-saved']),
    )

    expect(words.map((token) => token.contentRef)).toEqual(['word:1'])
  })

  it('reads text, title, and URL from a GET share target payload', () => {
    expect(
      readSharedTextPayload(
        '?text=%E6%97%A5%E6%9C%AC&title=Study&url=https%3A%2F%2Fexample.com',
      ),
    ).toEqual({
      text: '日本',
      title: 'Study',
      url: 'https://example.com',
    })
  })

  it('reads and validates a content-only deck share link', () => {
    const payload = encodeURIComponent(
      JSON.stringify({
        format: 'kanjiforge-deck-share',
        version: 1,
        name: 'Travel kanji',
        kanji: ['日', '本', '日', 'english'],
      }),
    )
    expect(readSharedDeckPayload(`?deck=${payload}`)).toEqual({
      format: 'kanjiforge-deck-share',
      version: 1,
      name: 'Travel kanji',
      kanji: ['日', '本'],
    })
  })

  it('previews shared kanji against the offline dictionary', async () => {
    render(<ShareTargetScreen />)

    expect(
      await screen.findByRole('heading', { name: 'Import shared text' }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('region', { name: 'Shared text import preview' }),
    ).toHaveTextContent('日')
    expect(screen.getAllByText('matched')).toHaveLength(2)
  })

  it('analyzes pasted Japanese text with readings and meanings offline', async () => {
    window.history.replaceState({}, '', '/analyze')
    render(<ShareTargetScreen />)

    fireEvent.change(screen.getByLabelText('Japanese text'), {
      target: { value: 'お金を' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Analyze text' }))

    const results = await screen.findByLabelText('Text analysis results')
    expect(results).toHaveTextContent('お金')
    expect(results).toHaveTextContent('おかね')
    expect(results).toHaveTextContent('money')
    expect(
      screen.getByRole('link', { name: 'View details for お金' }),
    ).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/detail\?contentRef=word%3A\d+$/u),
    )
    expect(
      screen.getByRole('button', { name: 'Add 1 unsaved word to Saved' }),
    ).toBeInTheDocument()
  })

  it('bulk-saves analyzed dictionary words atomically with sync mutations', async () => {
    window.history.replaceState({}, '', '/analyze')
    render(<ShareTargetScreen />)

    fireEvent.change(screen.getByLabelText('Japanese text'), {
      target: { value: 'お金を' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Analyze text' }))
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Add 1 unsaved word to Saved',
      }),
    )

    const runtime = getActiveUserRuntime()!
    await waitFor(async () => {
      expect(
        await createUserRepositories(runtime.database).deckMembership.list(
          'saved',
        ),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            contentRef: expect.stringMatching(/^word:\d+$/u),
          }),
        ]),
      )
    })
    expect(
      (await createUserRepositories(runtime.database).outbox.pending()).filter(
        (mutation) => mutation.mutType === 'deckMembership.upsert',
      ),
    ).toHaveLength(1)
    expect(
      await screen.findByText('Added 1 word to Saved.'),
    ).toBeInTheDocument()
  })

  it('imports matched shared kanji to Saved atomically with sync mutations', async () => {
    render(<ShareTargetScreen />)
    await screen.findByRole('button', { name: 'Import matched kanji to Saved' })

    fireEvent.click(
      screen.getByRole('button', { name: 'Import matched kanji to Saved' }),
    )

    const runtime = getActiveUserRuntime()!
    await waitFor(async () => {
      expect(
        await createUserRepositories(runtime.database).deckMembership.list(),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ contentRef: 'kanji:日' }),
          expect.objectContaining({ contentRef: 'kanji:本' }),
        ]),
      )
    })
    expect(
      (await createUserRepositories(runtime.database).outbox.pending()).filter(
        (mutation) => mutation.mutType === 'deckMembership.upsert',
      ),
    ).toHaveLength(2)
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Added 2 kanji to Saved.',
    )
  })

  it('previews and imports a shared deck link', async () => {
    const payload = encodeURIComponent(
      JSON.stringify({
        format: 'kanjiforge-deck-share',
        version: 1,
        name: 'Travel kanji',
        kanji: ['日', '本'],
      }),
    )
    window.history.replaceState({}, '', `/analyze?deck=${payload}`)
    render(<ShareTargetScreen />)

    expect(
      await screen.findByRole('heading', { name: 'Import shared deck' }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('region', { name: 'Shared deck import preview' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Travel kanji/u)).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: 'Import shared deck to Saved' }),
    )

    await waitFor(async () => {
      expect(
        await createUserRepositories(
          getActiveUserRuntime()!.database,
        ).deckMembership.list(),
      ).toHaveLength(2)
    })
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Added 2 kanji from “Travel kanji” to Saved.',
    )
  })
})
