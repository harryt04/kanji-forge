import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')

const ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '../..',
)
const FONT_DIR = path.join(ROOT, 'public/fonts/japanese')
const CSS_PATH = path.join(ROOT, 'src/app/japanese-fonts.css')
const MANIFEST_PATH = path.join(FONT_DIR, 'manifest.json')
const CHUNK_SIZE = 128
const GOOGLE_FONTS_CSS = 'https://fonts.googleapis.com/css2'
const GOOGLE_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36'

const FONTS = [
  {
    id: 'noto-sans-jp',
    family: 'Noto Sans JP',
    apiFamily: 'Noto+Sans+JP',
    weights: [400],
    display: 'swap',
  },
  {
    id: 'klee-one',
    family: 'Klee One',
    apiFamily: 'Klee+One',
    weights: [600],
    display: 'block',
  },
]

const JAPANESE_OR_UI_CHAR =
  /[\u0020-\u024f\u2000-\u206f\u3000-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/u

function walk(directory) {
  const files = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...walk(filePath))
    else files.push(filePath)
  }
  return files
}

function addText(characters, text) {
  for (const character of text) {
    if (JAPANESE_OR_UI_CHAR.test(character)) characters.add(character)
  }
}

function addSourceTree(characters, directory) {
  for (const filePath of walk(path.join(ROOT, directory))) {
    if (/\.(?:json|md|ts|tsx|css)$/u.test(filePath)) {
      addText(characters, fs.readFileSync(filePath, 'utf8'))
    }
  }
}

function addSqliteForms(characters, filePath) {
  if (!fs.existsSync(filePath)) return
  const database = new Database(filePath, { readonly: true })
  try {
    for (const row of database
      .prepare("select form from forms where kind = 'kanji'")
      .iterate()) {
      addText(characters, row.form)
    }
  } finally {
    database.close()
  }
}

function addSqliteKanji(characters, filePath) {
  if (!fs.existsSync(filePath)) return
  const database = new Database(filePath, { readonly: true })
  try {
    for (const row of database.prepare('select literal from kanji').iterate()) {
      addText(characters, row.literal)
    }
  } finally {
    database.close()
  }
}

function collectCharacters() {
  const characters = new Set()
  const hotCharacters = new Set()
  addSourceTree(characters, 'src')
  addSourceTree(hotCharacters, 'src')
  addSourceTree(characters, 'packs/decks')
  addSourceTree(characters, 'packs-dev')
  addText(
    hotCharacters,
    fs.readFileSync(path.join(ROOT, 'packs-dev/decks.json'), 'utf8'),
  )
  addSqliteForms(characters, path.join(ROOT, 'packs/words-core-v1.sqlite'))
  addSqliteForms(characters, path.join(ROOT, 'packs-dev/words-core-v1.sqlite'))
  addSqliteForms(
    hotCharacters,
    path.join(ROOT, 'packs-dev/words-core-v1.sqlite'),
  )
  addSqliteKanji(characters, path.join(ROOT, 'packs/kanji-v1.sqlite'))

  // The static UI uses these even when no pack has been installed yet.
  const commonJapanese =
    'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン、。！？「」'
  addText(characters, commonJapanese)
  addText(hotCharacters, commonJapanese)

  return {
    characters: [...characters].sort(
      (left, right) => left.codePointAt(0) - right.codePointAt(0),
    ),
    hotCharacters: [...hotCharacters].sort(
      (left, right) => left.codePointAt(0) - right.codePointAt(0),
    ),
  }
}

function chunkCharacters(characters, hotCharacters) {
  const hot = new Set(hotCharacters)
  const hotList = characters.filter((character) => hot.has(character))
  const coldList = characters.filter((character) => !hot.has(character))
  const chunks = []
  for (const list of [hotList, coldList]) {
    for (let index = 0; index < list.length; index += CHUNK_SIZE) {
      chunks.push(list.slice(index, index + CHUNK_SIZE))
    }
  }
  return chunks
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': GOOGLE_USER_AGENT },
  })
  if (!response.ok) throw new Error(`GET ${url} returned ${response.status}`)
  return response.text()
}

async function fetchBinary(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': GOOGLE_USER_AGENT },
  })
  if (!response.ok) throw new Error(`GET ${url} returned ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

function parseGoogleFontCss(css) {
  const block = css.match(/@font-face\s*\{([\s\S]*?)\}/u)?.[1]
  const source = block?.match(/src:\s*url\(([^)]+)\)/u)?.[1]
  const unicodeRange = block?.match(/unicode-range:\s*([^;]+);/u)?.[1]
  if (!source || !unicodeRange)
    throw new Error(
      'Google Fonts response did not contain a WOFF2 unicode range',
    )
  if (!css.includes("format('woff2')"))
    throw new Error('Google Fonts response was not WOFF2')
  return { source, unicodeRange }
}

function cssBlock({ family, weight, display, fileName, unicodeRange }) {
  return `@font-face {
  font-family: '${family}';
  font-style: normal;
  font-weight: ${weight};
  font-display: ${display};
  src: url('/fonts/japanese/${fileName}') format('woff2');
  unicode-range: ${unicodeRange};
}
`
}

async function buildFontChunks(font, weight, chunks, manifest) {
  const results = []
  let nextIndex = 0
  const worker = async () => {
    while (nextIndex < chunks.length) {
      const index = nextIndex++
      const text = chunks[index].join('')
      const cssUrl = `${GOOGLE_FONTS_CSS}?family=${font.apiFamily}:wght@${weight}&text=${encodeURIComponent(text)}`
      const css = await fetchText(cssUrl)
      const { source, unicodeRange } = parseGoogleFontCss(css)
      const data = await fetchBinary(source)
      const fileName = `${font.id}-${weight}-${String(index).padStart(3, '0')}.woff2`
      fs.writeFileSync(path.join(FONT_DIR, fileName), data)
      results[index] = {
        fileName,
        unicodeRange,
        bytes: data.byteLength,
        sha256: crypto.createHash('sha256').update(data).digest('hex'),
      }
      process.stdout.write(`Generated ${fileName} (${data.byteLength} bytes)\n`)
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker))
  manifest.fonts.push({ family: font.family, weight, chunks: results })
}

async function main() {
  const { characters, hotCharacters } = collectCharacters()
  const chunks = chunkCharacters(characters, hotCharacters)
  fs.mkdirSync(FONT_DIR, { recursive: true })

  for (const fileName of fs.readdirSync(FONT_DIR)) {
    if (/^(?:noto-sans-jp|klee-one)-\d+-\d{3}\.woff2$/u.test(fileName)) {
      fs.unlinkSync(path.join(FONT_DIR, fileName))
    }
  }

  const manifest = {
    schemaVersion: 1,
    source: {
      provider: 'Google Fonts CSS API',
      cssEndpoint: GOOGLE_FONTS_CSS,
      userAgent: GOOGLE_USER_AGENT,
      chunkSize: CHUNK_SIZE,
      characterCount: characters.length,
      hotCharacterCount: hotCharacters.length,
      hotChunkCount: Math.ceil(hotCharacters.length / CHUNK_SIZE),
    },
    characters: characters.join(''),
    fonts: [],
  }

  for (const font of FONTS) {
    for (const weight of font.weights) {
      await buildFontChunks(font, weight, chunks, manifest)
    }
  }

  const css = `${manifest.fonts
    .flatMap((font) =>
      font.chunks.map((chunk) =>
        cssBlock({
          family: font.family,
          weight: font.weight,
          display: FONTS.find((candidate) => candidate.family === font.family)
            .display,
          fileName: chunk.fileName,
          unicodeRange: chunk.unicodeRange,
        }),
      ),
    )
    .join('\n')}`
  fs.writeFileSync(
    CSS_PATH,
    `/* Generated by scripts/fonts/build-japanese-subsets.mjs. */
:root {
  --font-jp-display: 'Klee One', sans-serif;
  --font-jp-ui: 'Noto Sans JP', sans-serif;
}

${css}`,
  )
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(
    `Generated ${characters.length} characters across ${chunks.length} unicode chunks.`,
  )
}

await main()
