import { readFileSync } from 'fs'
import { join } from 'path'
import { render, screen, within } from '@testing-library/react'
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
import { SAVE_BEHAVIOR_SETTING } from '@/features/detail/save-behavior'
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
    expect(
      screen.getByRole('link', { name: 'View details for お金' }),
    ).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/dictionary\?contentRef=word%3A\d+$/u),
    )
  })

  it('shows the detected input type while entering a dictionary query', async () => {
    const user = userEvent.setup()
    render(<DictionaryScreen />)

    await user.type(screen.getByLabelText('Dictionary search'), 'okane')

    expect(screen.getByTestId('dictionary-input-type')).toHaveTextContent(
      'Detected input: Romaji',
    )
  })

  it('keeps dictionary results visible beside the selected offline detail', async () => {
    const user = userEvent.setup()
    render(<DictionaryScreen />)

    await user.type(screen.getByLabelText('Dictionary search'), 'okane')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    const detailLink = await screen.findByRole('link', {
      name: 'View details for お金',
    })
    const detailHref = detailLink.getAttribute('href')
    expect(detailHref).toMatch(/^\/dictionary\?contentRef=word%3A\d+$/u)
    await user.click(detailLink)

    expect(
      await screen.findByTestId('dictionary-detail-pane'),
    ).toBeInTheDocument()
    expect(screen.getByText('お金')).toBeInTheDocument()
    expect(screen.getByTestId('word-detail')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: '← Back to Dictionary' }),
    ).toHaveAttribute('href', '/dictionary')
  })

  it('searches the visible form with wildcards', async () => {
    const user = userEvent.setup()
    render(<DictionaryScreen />)

    await user.type(screen.getByLabelText('Dictionary search'), 'お*')
    expect(
      screen.getByText(
        'Use * for any number of characters or ? for exactly one character.',
      ),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Search' }))

    expect(await screen.findByText('お金')).toBeInTheDocument()
  })

  it('shows the available KANJIDIC2 metadata for kanji results', async () => {
    const user = userEvent.setup()
    render(<DictionaryScreen />)

    await user.type(screen.getByLabelText('Dictionary search'), '日')
    await user.click(screen.getByRole('button', { name: 'Search' }))

    const details = await screen.findAllByTestId('kanji-details')
    expect(details.length).toBeGreaterThan(0)
    const firstDetails = within(details[0]!)
    expect(firstDetails.getByText('On readings')).toBeInTheDocument()
    expect(firstDetails.getByText('Kun readings')).toBeInTheDocument()
    expect(firstDetails.getByText('Meanings')).toBeInTheDocument()
    expect(firstDetails.getByText('Stroke count')).toBeInTheDocument()
    expect(firstDetails.getByText('School grade')).toBeInTheDocument()
    expect(firstDetails.getByText('JLPT')).toBeInTheDocument()
    expect(firstDetails.getByText('Frequency rank')).toBeInTheDocument()
    expect(firstDetails.getByText('Classical radical')).toBeInTheDocument()
    expect(
      screen.getAllByRole('link', { name: 'View details for 日' }).length,
    ).toBeGreaterThan(0)
  })

  it('searches kanji by classical radical number', async () => {
    const user = userEvent.setup()
    render(<DictionaryScreen />)

    await user.click(screen.getByRole('button', { name: 'Radical search' }))
    await user.type(screen.getByLabelText('Classical radical number'), '75')
    await user.click(screen.getByRole('button', { name: 'Search' }))

    expect(await screen.findByText('本')).toBeInTheDocument()
    expect(screen.getAllByText('Classical radical').length).toBeGreaterThan(0)
    expect(screen.getByLabelText('Classical radical number')).toHaveValue(75)
  })

  it('searches kanji by exact stroke count', async () => {
    const user = userEvent.setup()
    render(<DictionaryScreen />)

    await user.click(
      screen.getByRole('button', { name: 'Stroke-count search' }),
    )
    await user.type(screen.getByLabelText('Stroke count'), '4')
    await user.click(screen.getByRole('button', { name: 'Search' }))

    expect(await screen.findByText('日')).toBeInTheDocument()
    expect(screen.getAllByText('Stroke count').length).toBeGreaterThan(0)
    expect(screen.getByLabelText('Stroke count')).toHaveValue(4)
  })

  it('saves a dictionary result to the offline Saved deck', async () => {
    const user = userEvent.setup()
    render(<DictionaryScreen />)

    await user.type(screen.getByLabelText('Dictionary search'), '日')
    await user.click(screen.getByRole('button', { name: 'Search' }))

    const saveButtons = await screen.findAllByRole('button', {
      name: 'Save to Saved',
    })
    await user.click(saveButtons[0]!)

    expect(await screen.findByRole('button', { name: 'Saved' })).toBeDisabled()
    const runtime = getActiveUserRuntime()!
    expect(
      await createUserRepositories(runtime.database).decks.get('saved'),
    ).toMatchObject({
      name: 'Saved',
    })
    expect(
      (await createUserRepositories(runtime.database).deckMembership.list())
        .length,
    ).toBeGreaterThan(0)
    expect(
      await createUserRepositories(runtime.database).outbox.pending(),
    ).toMatchObject([{ mutType: 'deckMembership.upsert' }])
  })

  it('saves a dictionary result to an existing custom deck', async () => {
    const runtime = getActiveUserRuntime()!
    const customDeck = {
      id: 'custom-reading',
      name: 'Reading practice',
      kind: 'custom' as const,
      definitionId: null,
      updatedAt: Date.now(),
    }
    await createUserRepositories(runtime.database).decks.upsert(customDeck)

    const user = userEvent.setup()
    render(<DictionaryScreen />)

    await user.type(screen.getByLabelText('Dictionary search'), '日')
    await user.click(screen.getByRole('button', { name: 'Search' }))

    const addButtons = await screen.findAllByRole('button', {
      name: 'Add to Reading practice',
    })
    await user.click(addButtons[0]!)

    expect(
      await screen.findByRole('button', { name: 'In Reading practice' }),
    ).toBeDisabled()
    expect(
      await createUserRepositories(runtime.database).deckMembership.list(
        customDeck.id,
      ),
    ).toMatchObject([
      expect.objectContaining({
        deckId: customDeck.id,
        contentRef: 'kanji:日',
      }),
    ])
    expect(
      await createUserRepositories(runtime.database).outbox.pending(),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ mutType: 'deckMembership.upsert' }),
      ]),
    )
  })

  it('asks before saving a dictionary result when configured', async () => {
    const runtime = getActiveUserRuntime()!
    await createUserRepositories(runtime.database).settings.set({
      key: SAVE_BEHAVIOR_SETTING,
      value: 'ask',
      updatedAt: Date.now(),
    })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const user = userEvent.setup()
    render(<DictionaryScreen />)

    await user.type(screen.getByLabelText('Dictionary search'), '日')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    const saveButtons = await screen.findAllByRole('button', {
      name: 'Save to Saved',
    })
    await user.click(saveButtons[0]!)

    expect(confirm).toHaveBeenCalledWith('Save this kanji to your Saved deck?')
    await expect(
      createUserRepositories(runtime.database).deckMembership.list(),
    ).resolves.toEqual([])
    confirm.mockRestore()
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
