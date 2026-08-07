import { describe, expect, it } from 'vitest'
import { assertLicenseChangesAllowed } from './fetch-sources'

describe('refresh license protection', () => {
  it('refuses a changed fetched license before lock replacement without approval', () => {
    const previous = {
      sources: { sample: { id: 'sample', licenseHash: 'a'.repeat(64) } },
    }
    const candidate = {
      sources: { sample: { id: 'sample', licenseHash: 'b'.repeat(64) } },
    }
    expect(() =>
      assertLicenseChangesAllowed(previous, candidate, false),
    ).toThrow(/LICENSE CHANGE DETECTED/)
    expect(() =>
      assertLicenseChangesAllowed(previous, candidate, true),
    ).not.toThrow()
  })
})
