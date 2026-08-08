import { describe, expect, it } from 'vitest'
import { parsePushNotificationPayload } from './push-payload'

describe('push notification payloads', () => {
  it('keeps safe app-relative navigation and defaults malformed fields', () => {
    expect(
      parsePushNotificationPayload({
        title: 'Review now',
        body: 'Three cards are due.',
        url: '/study?source=push',
        tag: 'custom-tag',
      }),
    ).toEqual({
      title: 'Review now',
      body: 'Three cards are due.',
      url: '/study?source=push',
      tag: 'custom-tag',
    })
    expect(parsePushNotificationPayload({ url: 'https://evil.test' })).toEqual(
      expect.objectContaining({ url: '/study' }),
    )
  })
})
