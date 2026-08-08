export const RSS_FEEDS_SETTING = 'news:rss-feeds'
export const MAX_RSS_FEEDS = 12

export interface RssFeed {
  readonly label: string
  readonly url: string
}

function cleanLabel(label: string, url: URL): string {
  const trimmed = label.trim().normalize('NFC').slice(0, 80)
  return trimmed || url.hostname
}

/** Accept only link-out URLs; KanjiForge never fetches or republishes feeds. */
export function parseRssFeed(label: string, rawUrl: string): RssFeed | null {
  try {
    const url = new URL(rawUrl.trim())
    if (
      (url.protocol !== 'https:' && url.protocol !== 'http:') ||
      url.username ||
      url.password
    )
      return null
    url.hash = ''
    return { label: cleanLabel(label, url), url: url.href }
  } catch {
    return null
  }
}

function sameUrl(left: RssFeed, right: RssFeed): boolean {
  return (
    left.url.localeCompare(right.url, undefined, {
      sensitivity: 'accent',
    }) === 0
  )
}

export function parseRssFeeds(value: string | undefined): readonly RssFeed[] {
  if (!value) return []
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    const feeds: RssFeed[] = []
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue
      const label =
        'label' in item && typeof item.label === 'string' ? item.label : ''
      const url = 'url' in item && typeof item.url === 'string' ? item.url : ''
      const feed = parseRssFeed(label, url)
      if (feed && !feeds.some((candidate) => sameUrl(candidate, feed)))
        feeds.push(feed)
      if (feeds.length === MAX_RSS_FEEDS) break
    }
    return feeds
  } catch {
    return []
  }
}

export function serializeRssFeeds(feeds: readonly RssFeed[]): string {
  return JSON.stringify(parseRssFeeds(JSON.stringify(feeds)))
}

export function addRssFeed(
  feeds: readonly RssFeed[],
  feed: RssFeed,
): readonly RssFeed[] {
  const normalized = parseRssFeed(feed.label, feed.url)
  if (!normalized) return parseRssFeeds(JSON.stringify(feeds))
  const current = parseRssFeeds(JSON.stringify(feeds))
  if (current.some((candidate) => sameUrl(candidate, normalized)))
    return current
  return [...current, normalized].slice(0, MAX_RSS_FEEDS)
}

export function removeRssFeed(
  feeds: readonly RssFeed[],
  url: string,
): readonly RssFeed[] {
  return parseRssFeeds(JSON.stringify(feeds)).filter((feed) => feed.url !== url)
}
