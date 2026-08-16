import { readFileSync } from 'fs'
import { join } from 'path'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hasWritingPractice, StudyWritingPanel } from './study-writing-panel'

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

beforeEach(() => {
  vi.stubGlobal('fetch', fixtureFetch())
})

afterEach(() => {
  cleanup()
})

describe('StudyWritingPanel', () => {
  it('renders one canvas for a single-kanji card without a chip row', async () => {
    render(
      <StudyWritingPanel
        contentRef="kanji:日"
        literal="日"
        validationEnabled={false}
        leniency="normal"
      />,
    )

    expect(
      await screen.findByRole('application', {
        name: 'Writing canvas for 日',
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('radiogroup', { name: 'Kanji to practice writing' }),
    ).not.toBeInTheDocument()
  })

  it('renders nothing for a kana-only word', () => {
    const { container } = render(
      <StudyWritingPanel
        contentRef="word:1"
        literal="おかね"
        validationEnabled={false}
        leniency="normal"
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('offers a chip per kanji in a compound word, defaulting to the first', async () => {
    const user = userEvent.setup()
    render(
      <StudyWritingPanel
        contentRef="word:2"
        literal="大人"
        validationEnabled={false}
        leniency="normal"
      />,
    )

    const group = screen.getByRole('radiogroup', {
      name: 'Kanji to practice writing',
    })
    const first = screen.getByRole('radio', { name: 'Practice writing 大' })
    const second = screen.getByRole('radio', { name: 'Practice writing 人' })
    expect(group).toContainElement(first)
    expect(first).toHaveAttribute('aria-checked', 'true')
    expect(second).toHaveAttribute('aria-checked', 'false')
    expect(
      await screen.findByRole('application', {
        name: 'Writing canvas for 大',
      }),
    ).toBeInTheDocument()

    await user.click(second)

    expect(second).toHaveAttribute('aria-checked', 'true')
    await waitFor(() =>
      expect(
        screen.getByRole('application', { name: 'Writing canvas for 人' }),
      ).toBeInTheDocument(),
    )
  })

  it('resets the selected kanji when the card changes', async () => {
    const { rerender } = render(
      <StudyWritingPanel
        contentRef="word:2"
        literal="大人"
        validationEnabled={false}
        leniency="normal"
      />,
    )

    const user = userEvent.setup()
    await user.click(screen.getByRole('radio', { name: 'Practice writing 人' }))
    await waitFor(() =>
      expect(
        screen.getByRole('radio', { name: 'Practice writing 人' }),
      ).toHaveAttribute('aria-checked', 'true'),
    )

    rerender(
      <StudyWritingPanel
        contentRef="word:3"
        literal="中年"
        validationEnabled={false}
        leniency="normal"
      />,
    )

    await waitFor(() =>
      expect(
        screen.getByRole('radio', { name: 'Practice writing 中' }),
      ).toHaveAttribute('aria-checked', 'true'),
    )
  })
})

describe('hasWritingPractice', () => {
  it('is true when the literal contains at least one kanji', () => {
    expect(hasWritingPractice('日')).toBe(true)
    expect(hasWritingPractice('大人')).toBe(true)
  })

  it('is false for kana-only literals', () => {
    expect(hasWritingPractice('おかね')).toBe(false)
  })
})
