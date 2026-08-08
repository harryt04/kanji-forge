import { render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PwaRegistration } from './index'

describe('PwaRegistration', () => {
  const originalServiceWorker = Object.getOwnPropertyDescriptor(
    navigator,
    'serviceWorker',
  )

  afterEach(() => {
    if (originalServiceWorker) {
      Object.defineProperty(navigator, 'serviceWorker', originalServiceWorker)
    } else {
      Reflect.deleteProperty(navigator, 'serviceWorker')
    }
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    const register = vi.fn().mockResolvedValue({} as ServiceWorkerRegistration)
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register },
    })
  })

  it('registers the build-generated worker after mounting', async () => {
    const register = vi.mocked(navigator.serviceWorker.register)

    render(<PwaRegistration />)

    await waitFor(() => expect(register).toHaveBeenCalledWith('/sw.js'))
  })

  it('does not surface registration failures to the app', async () => {
    const register = vi.mocked(navigator.serviceWorker.register)
    register.mockRejectedValueOnce(new Error('service workers unavailable'))

    expect(() => render(<PwaRegistration />)).not.toThrow()
    await waitFor(() => expect(register).toHaveBeenCalledTimes(1))
  })
})
