import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { bootstrapUserRuntime, clearUserRuntime } from '@/auth/runtime'
import { HelpScreen } from './help-screen'

describe('HelpScreen', () => {
  beforeEach(() => {
    bootstrapUserRuntime(`help-test-${crypto.randomUUID()}`)
  })

  afterEach(() => {
    clearUserRuntime()
  })

  it('shows the bundled offline help sections and useful links', () => {
    render(<HelpScreen />)

    expect(screen.getByRole('heading', { name: 'Help' })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Study a session' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Levels and colors' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Browse, detail, and Dictionary' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Backup and privacy' }),
    ).toBeInTheDocument()
    expect(
      screen
        .getAllByRole('link', { name: 'Study' })
        .find((link) => link.getAttribute('href') === '/study'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Settings → Backup & restore' }),
    ).toHaveAttribute('href', '/settings')
    expect(
      screen.getByRole('navigation', { name: 'Help sections' }),
    ).toBeInTheDocument()
  })

  it('requires an authenticated runtime when rendered outside the app shell', () => {
    clearUserRuntime()
    render(<HelpScreen />)

    expect(screen.getByText('Sign in to open Help.')).toBeInTheDocument()
  })
})
