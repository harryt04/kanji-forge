import { describe, expect, it } from 'vitest'
import {
  electricRequestHeaders,
  ElectricShapeRequestError,
  prepareElectricShapeUrl,
} from './electric.js'

describe('Electric shape proxy', () => {
  it('pins supported shapes to the authenticated user and preserves cursors', () => {
    const url = prepareElectricShapeUrl(
      'https://api.example.test/api/electric/shape?table=reviews&offset=12&live=true&where=1%3D1',
      'http://electric:3000',
      'electric-secret',
      'user-123',
    )

    expect(url.origin).toBe('http://electric:3000')
    expect(url.pathname).toBe('/v1/shape')
    expect(url.searchParams.get('table')).toBe('reviews')
    expect(url.searchParams.get('where')).toBe('user_id = $1')
    expect(url.searchParams.get('params[1]')).toBe('user-123')
    expect(url.searchParams.get('offset')).toBe('12')
    expect(url.searchParams.get('live')).toBe('true')
    expect(url.searchParams.get('secret')).toBe('electric-secret')
  })

  it('rejects unsupported tables and missing users', () => {
    expect(() =>
      prepareElectricShapeUrl(
        'https://api.example.test/api/electric/shape?table=user',
        'http://electric:3000',
        'secret',
        'user-123',
      ),
    ).toThrowError(
      new ElectricShapeRequestError('That Electric shape is not supported.'),
    )
    expect(() =>
      prepareElectricShapeUrl(
        'https://api.example.test/api/electric/shape?table=reviews',
        'http://electric:3000',
        'secret',
        ' ',
      ),
    ).toThrowError(new ElectricShapeRequestError('A user id is required.'))
  })

  it('forwards only shape response negotiation headers', () => {
    const headers = electricRequestHeaders(
      new Request('https://api.example.test/api/electric/shape', {
        headers: {
          accept: 'application/x-ndjson',
          'cache-control': 'no-cache',
          authorization: 'should-not-forward',
        },
      }),
    )

    expect(headers.get('accept')).toBe('application/x-ndjson')
    expect(headers.get('cache-control')).toBe('no-cache')
    expect(headers.get('authorization')).toBeNull()
  })
})
