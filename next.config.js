import withSerwistInit from '@serwist/next'

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Not a static export: this app also serves its own API under /api/* (better-auth, the
  // write API, sync), so it ships as one Node server — a single Coolify deployable per
  // environment. See docs/ARCHITECTURE.md §2.
  images: { unoptimized: true },
  reactStrictMode: true,
  experimental: { optimizePackageImports: ['motion'] },

  // Proxies the PostHog client SDK through this app's own origin so ad blockers
  // that target posthog.com don't drop analytics requests.
  async rewrites() {
    return [
      {
        source: '/ingest/static/:path*',
        destination: 'https://us-assets.i.posthog.com/static/:path*',
      },
      {
        source: '/ingest/:path*',
        destination: 'https://us.i.posthog.com/:path*',
      },
      {
        source: '/ingest/decide',
        destination: 'https://us.i.posthog.com/decide',
      },
    ]
  },
  // Required to support PostHog's trailing-slash API requests through the rewrite above.
  skipTrailingSlashRedirect: true,
}

const withSerwist = withSerwistInit({
  swSrc: 'src/pwa/sw.ts',
  swDest: 'public/sw.js',
  // `next dev` watches `public/`, so writing the built sw.js there on every compile
  // retriggers the watcher and causes an infinite rebuild loop. The service worker is a
  // build-time artifact of the static export anyway, so it only needs to exist for real
  // builds (`next build`) — e2e/offline testing runs against that build, not `next dev`.
  disable: process.env.NODE_ENV === 'development',
})

export default withSerwist(nextConfig)
