import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  bootstrapUserRuntime,
  clearUserRuntime,
  getActiveUserRuntime,
} from '@/auth/runtime'
import { createUserRepositories } from '@/data/repo'
import { THEME_SETTING } from './theme'
import { SettingsScreen } from './settings-screen'

describe('SettingsScreen', () => {
  beforeEach(() => {
    bootstrapUserRuntime(`settings-test-${crypto.randomUUID()}`)
  })

  afterEach(() => {
    clearUserRuntime()
    document.documentElement.className = ''
  })

  it('requires an authenticated runtime', () => {
    clearUserRuntime()
    render(<SettingsScreen />)
    expect(screen.getByText('Sign in to open Settings.')).toBeInTheDocument()
  })

  it('loads and persists the selected theme offline', async () => {
    const user = userEvent.setup()
    render(<SettingsScreen />)

    expect(
      await screen.findByRole('heading', { name: 'Appearance' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: /Dark/ }))

    await waitFor(() => expect(document.documentElement).toHaveClass('dark'))
    const runtime = getActiveUserRuntime()
    expect(runtime).toBeDefined()
    await expect(
      createUserRepositories(runtime!.database).settings.get(THEME_SETTING),
    ).resolves.toMatchObject({ value: 'dark' })
  })

  it('restores a saved night preference on a later render', async () => {
    const runtime = getActiveUserRuntime()!
    await createUserRepositories(runtime.database).settings.set({
      key: THEME_SETTING,
      value: 'night',
      updatedAt: Date.now(),
    })
    render(<SettingsScreen />)

    expect(
      await screen.findByRole('radio', { name: /Night schedule/ }),
    ).toHaveAttribute('aria-checked', 'true')
  })
})
