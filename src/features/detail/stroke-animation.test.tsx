import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StrokeAnimation } from './stroke-animation'

describe('StrokeAnimation', () => {
  it('renders KanjiVG paths as outlined strokes', () => {
    render(
      <StrokeAnimation character="日" paths={['M 1 1 L 2 2', 'M 3 3 L 4 4']} />,
    )

    const paths = screen
      .getByRole('img', { name: 'Stroke order animation for 日' })
      .querySelectorAll('path')

    expect(paths).toHaveLength(2)
    for (const path of paths) {
      expect(path).toHaveAttribute('fill', 'none')
      expect(path).toHaveAttribute('stroke', 'currentColor')
      expect(path).toHaveAttribute('stroke-width', '2.5')
      expect(path).toHaveAttribute('stroke-linecap', 'round')
      expect(path).toHaveAttribute('stroke-linejoin', 'round')
    }
  })
})
