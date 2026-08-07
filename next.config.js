import withSerwistInit from '@serwist/next'

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  reactStrictMode: true,
  experimental: { optimizePackageImports: ['motion'] },
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
