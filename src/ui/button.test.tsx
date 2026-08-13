import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Button } from './button'

describe('Button touch targets', () => {
  it('keeps default and small buttons at the 44px minimum height', () => {
    render(
      <>
        <Button>Default</Button>
        <Button size="sm">Small</Button>
      </>,
    )

    expect(screen.getByRole('button', { name: 'Default' })).toHaveClass('h-11')
    expect(screen.getByRole('button', { name: 'Small' })).toHaveClass('h-11')
  })
})
