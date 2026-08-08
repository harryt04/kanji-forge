import { describe, expect, it } from 'vitest'
import { isIosDevice, shouldShowIosInstallGuidance } from './install-guidance'

describe('iOS install guidance', () => {
  it('recognizes iPhone, iPad, and desktop-mode iPadOS user agents', () => {
    expect(
      isIosDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X'),
    ).toBe(true)
    expect(isIosDevice('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X')).toBe(
      true,
    )
    expect(
      isIosDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5),
    ).toBe(true)
    expect(isIosDevice('Mozilla/5.0 (X11; Linux x86_64)')).toBe(false)
  })

  it('only asks non-standalone iOS browsers to install', () => {
    const iosBrowser = {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      maxTouchPoints: 5,
      standalone: false,
    }
    expect(shouldShowIosInstallGuidance(iosBrowser)).toBe(true)
    expect(
      shouldShowIosInstallGuidance({ ...iosBrowser, standalone: true }),
    ).toBe(false)
    expect(
      shouldShowIosInstallGuidance({
        ...iosBrowser,
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
      }),
    ).toBe(false)
  })
})
