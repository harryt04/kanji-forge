export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
).replace(/\/$/u, '')

// Only the canonical production origin should be indexed. Any other host
// (beta, preview deploys, localhost) gets a blanket `Disallow` in robots.ts so
// it never competes with production for the same content.
export const IS_PRODUCTION_HOST = SITE_URL === 'https://kanjiforge.app'
