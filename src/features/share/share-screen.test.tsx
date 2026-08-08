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
import { ShareTargetScreen, readSharedTextPayload } from './share-screen'

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
})
