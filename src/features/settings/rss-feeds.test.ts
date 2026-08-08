import { describe, expect, it } from 'vitest'
import {
  addRssFeed,
  JAPANESE_WIKINEWS_FEED,
  MAX_RSS_FEEDS,
  parseRssFeed,
  parseRssFeeds,
  removeRssFeed,
  serializeRssFeeds,
} from './rss-feeds'

describe('RSS feed links', () => {
  it('normalizes safe HTTP URLs and derives a label when omitted', () => {
    expect(parseRssFeed(' ', ' https://example.test/news#latest ')).toEqual({
      label: 'example.test',
      url: 'https://example.test/news',
    })
    expect(parseRssFeed('Private', 'https://user:pass@example.test/feed')).toBe(
      null,
    )
    expect(parseRssFeed('Unsafe', 'javascript:alert(1)')).toBe(null)
  })

  it('cleans malformed persisted data, deduplicates, and caps the list', () => {
    const feeds = Array.from({ length: MAX_RSS_FEEDS + 2 }, (_, index) => ({
      label: `Feed ${index}`,
      url: `https://example.test/${index}`,
    }))
    const parsed = parseRssFeeds(
      JSON.stringify([
        feeds[0],
        feeds[0],
        ...feeds.slice(1),
        { label: 'bad', url: 'javascript:nope' },
      ]),
    )
    expect(parsed).toHaveLength(MAX_RSS_FEEDS)
    expect(parsed[0]).toEqual(feeds[0])
    expect(parseRssFeeds('not-json')).toEqual([])
    expect(JSON.parse(serializeRssFeeds(parsed))).toEqual(parsed)
  })

  it('adds unique sources and removes them by canonical URL', () => {
    const first = parseRssFeed('A', 'https://example.test/a')!
    const second = parseRssFeed('B', 'https://example.test/b')!
    const withFirst = addRssFeed([], first)
    expect(addRssFeed(withFirst, { label: 'A again', url: first.url })).toEqual(
      withFirst,
    )
    expect(removeRssFeed([...withFirst, second], first.url)).toEqual([second])
  })

  it('provides a safe Japanese Wikinews preset with explicit attribution', () => {
    expect(
      parseRssFeed(JAPANESE_WIKINEWS_FEED.label, JAPANESE_WIKINEWS_FEED.url),
    ).toEqual(JAPANESE_WIKINEWS_FEED)
    expect(addRssFeed([], JAPANESE_WIKINEWS_FEED)).toEqual([
      JAPANESE_WIKINEWS_FEED,
    ])
  })
})
