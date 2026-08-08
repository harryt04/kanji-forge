import { describe, expect, it } from 'vitest'
import { POST } from '@/app/api/share-target/route'

describe('POST /api/share-target', () => {
  it('redirects native URL-encoded shares to the analyzer', async () => {
    const body = new URLSearchParams({
      text: '日本語',
      title: 'Study article',
      url: 'https://example.com/article',
    })
    const response = await POST(
      new Request('https://kanjiforge.example/api/share-target', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      }),
    )

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe(
      'https://kanjiforge.example/analyze?text=%E6%97%A5%E6%9C%AC%E8%AA%9E&title=Study+article&url=https%3A%2F%2Fexample.com%2Farticle',
    )
  })

  it('still opens the analyzer when a browser sends malformed form data', async () => {
    const response = await POST(
      new Request('https://kanjiforge.example/api/share-target', {
        method: 'POST',
        body: new Uint8Array([0xff, 0xfe]),
      }),
    )

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe(
      'https://kanjiforge.example/analyze',
    )
  })
})
