import { readFileSync } from 'fs'
import { join } from 'path'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  bootstrapUserRuntime,
  clearUserRuntime,
  getActiveUserRuntime,
} from '@/auth/runtime'
import { createUserRepositories } from '@/data/repo'
import {
  DICTIONARY_HISTORY_SETTING,
  DICTIONARY_PINNED_SETTING,
} from './search-history'
import { DictionaryScreen } from './dictionary-screen'

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

describe('DictionaryScreen', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fixtureFetch())
    bootstrapUserRuntime(`dictionary-test-${crypto.randomUUID()}`)
  })

  afterEach(() => {
    clearUserRuntime()
  })

  it('searches the offline packs from the visible form', async () => {
    const user = userEvent.setup()
    render(<DictionaryScreen />)

    await user.type(screen.getByLabelText('Dictionary search'), 'okane')
    await user.click(screen.getByRole('button', { name: 'Search' }))

    expect(await screen.findByText('お金')).toBeInTheDocument()
    expect(screen.getByText('money')).toBeInTheDocument()
  })

  it('persists recent searches and supports pinning and reusing them', async () => {
    const user = userEvent.setup()
    render(<DictionaryScreen />)

    await user.type(screen.getByLabelText('Dictionary search'), 'okane')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    expect(await screen.findByText('Recent searches')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Pin search okane' }))
    expect(await screen.findByText('Pinned searches')).toBeInTheDocument()

    const runtime = getActiveUserRuntime()
    expect(runtime).toBeDefined()
    const settings = createUserRepositories(runtime!.database).settings
    await expect(
      settings.get(DICTIONARY_HISTORY_SETTING),
    ).resolves.toMatchObject({ value: '["okane"]' })
    await expect(
      settings.get(DICTIONARY_PINNED_SETTING),
    ).resolves.toMatchObject({ value: '["okane"]' })

    await user.click(screen.getAllByRole('button', { name: 'okane' })[0]!)
    expect(screen.getByLabelText('Dictionary search')).toHaveValue('okane')

    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.queryByText('Recent searches')).not.toBeInTheDocument()
    expect(screen.getByText('Pinned searches')).toBeInTheDocument()
  })
})
