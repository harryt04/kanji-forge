import { readFileSync } from 'fs'
import { join } from 'path'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
  })

  it('searches the offline packs from the visible form', async () => {
    const user = userEvent.setup()
    render(<DictionaryScreen />)

    await user.type(screen.getByLabelText('Dictionary search'), 'okane')
    await user.click(screen.getByRole('button', { name: 'Search' }))

    expect(await screen.findByText('お金')).toBeInTheDocument()
    expect(screen.getByText('money')).toBeInTheDocument()
  })
})
