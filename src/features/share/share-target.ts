export interface SharedTextPayload {
  readonly text: string
  readonly title: string | null
  readonly url: string | null
}

export const SHARE_TARGET_TEXT_LIMIT = 100_000
export const SHARE_TARGET_TITLE_LIMIT = 200
export const SHARE_TARGET_URL_LIMIT = 2_048

function readFormString(
  formData: FormData,
  key: string,
  limit: number,
): string | null {
  const value = formData.get(key)
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized ? normalized.slice(0, limit) : null
}

/** Converts a native share-sheet form submission into the analyzer payload. */
export function readSharedFormDataPayload(
  formData: FormData,
): SharedTextPayload {
  return {
    text: readFormString(formData, 'text', SHARE_TARGET_TEXT_LIMIT) ?? '',
    title: readFormString(formData, 'title', SHARE_TARGET_TITLE_LIMIT),
    url: readFormString(formData, 'url', SHARE_TARGET_URL_LIMIT),
  }
}

/** Builds the app-relative analyzer URL used after a POST share submission. */
export function shareTargetLocation(
  requestUrl: string,
  payload: SharedTextPayload,
): URL {
  const location = new URL('/analyze', requestUrl)
  if (payload.text) location.searchParams.set('text', payload.text)
  if (payload.title) location.searchParams.set('title', payload.title)
  if (payload.url) location.searchParams.set('url', payload.url)
  return location
}
