import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Button } from './button'

describe('Button touch targets', () => {
  it('keeps default and small buttons at a 44px minimum height', () => {
    render(
      <>
        <Button>Default</Button>
        <Button size="sm">Small</Button>
      </>,
    )

    // min-h-11 (not h-11): a button whose content wraps grows taller instead
    // of clipping its text — Settings uses Button as an option card holding
    // a full description sentence, which cannot fit on one 44px line.
    expect(screen.getByRole('button', { name: 'Default' })).toHaveClass(
      'min-h-11',
    )
    expect(screen.getByRole('button', { name: 'Small' })).toHaveClass(
      'min-h-11',
    )
  })

  it('keeps whitespace-nowrap off by default so sentence-length labels wrap', () => {
    render(<Button>A much longer label that must be free to wrap</Button>)

    expect(
      screen.getByRole('button', { name: /A much longer label/ }),
    ).not.toHaveClass('whitespace-nowrap')
  })

  it('adds whitespace-nowrap only when a caller opts in', () => {
    render(
      <Button nowrap size="sm">
        Reveal
      </Button>,
    )

    expect(screen.getByRole('button', { name: 'Reveal' })).toHaveClass(
      'whitespace-nowrap',
    )
  })
})
