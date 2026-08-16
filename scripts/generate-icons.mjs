// Rasterizes assets/icon.svg into every icon file the manifest and root
// layout reference. Runs from prebuild/predev so a fresh clone always has
// working icons instead of the 404s the app shipped with previously.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..')
const sourceSvg = path.join(root, 'assets', 'icon.svg')
const publicDir = path.join(root, 'public')

if (!existsSync(sourceSvg)) {
  throw new Error(`Expected icon source at ${sourceSvg}.`)
}

mkdirSync(publicDir, { recursive: true })

const svgBuffer = readFileSync(sourceSvg)

// Maskable icons need the glyph inset to Android's ~80% safe zone so it
// isn't clipped when the OS applies a circular/rounded mask.
const MASKABLE_PADDING_RATIO = 0.1

async function writePng(destination, size, { maskablePadding = false } = {}) {
  const image = maskablePadding
    ? sharp(svgBuffer)
        .resize(Math.round(size * (1 - MASKABLE_PADDING_RATIO * 2)))
        .extend({
          top: Math.round(size * MASKABLE_PADDING_RATIO),
          bottom: Math.round(size * MASKABLE_PADDING_RATIO),
          left: Math.round(size * MASKABLE_PADDING_RATIO),
          right: Math.round(size * MASKABLE_PADDING_RATIO),
          background: '#e8e4dc',
        })
    : sharp(svgBuffer).resize(size, size)

  await image.png().toFile(path.join(publicDir, destination))
  console.info(`Generated ${destination} (${size}x${size})`)
}

async function main() {
  await writePng('icon-192.png', 192)
  await writePng('icon-512.png', 512)
  await writePng('icon-512-maskable.png', 512, { maskablePadding: true })

  // iOS does not composite alpha on the apple-touch-icon; the source SVG
  // already paints an opaque background so no extra flattening is needed.
  await writePng('apple-touch-icon.png', 180)

  await sharp(svgBuffer)
    .resize(630, 630)
    .extend({
      top: 0,
      bottom: 0,
      left: 285,
      right: 285,
      background: '#e8e4dc',
    })
    .png()
    .toFile(path.join(publicDir, 'og-fallback.png'))
  console.info('Generated og-fallback.png (1200x630)')

  const faviconSizes = [16, 32, 48]
  const faviconBuffers = await Promise.all(
    faviconSizes.map((size) =>
      sharp(svgBuffer).resize(size, size).png().toBuffer(),
    ),
  )
  // sharp does not emit .ico directly; the 48x48 PNG is a broadly-supported
  // stand-in that every modern browser renders as a favicon.
  writeFileSync(path.join(publicDir, 'favicon.ico'), faviconBuffers[2])
  console.info('Generated favicon.ico (48x48 PNG payload)')

  const iconSvg = readFileSync(sourceSvg)
  writeFileSync(path.join(publicDir, 'icon.svg'), iconSvg)
  console.info('Copied icon.svg')
}

await main()
