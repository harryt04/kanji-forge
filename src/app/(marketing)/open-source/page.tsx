import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Open source & licensing — KanjiForge',
  description:
    'KanjiForge application code is MIT licensed. Content packs (KANJIDIC2, JMdict, KanjiVG, Tatoeba) are CC BY-SA. Full attribution and source links.',
  alternates: { canonical: '/open-source' },
}

const SOURCES = [
  { source: 'App code', license: 'MIT' },
  {
    source: 'KANJIDIC2, JMdict, JMnedict, KRADFILE/RADKFILE',
    license: 'CC BY-SA 4.0',
  },
  { source: 'KanjiVG (stroke order)', license: 'CC BY-SA 3.0' },
  { source: 'Tatoeba example sentences', license: 'CC BY 2.0 FR' },
] as const

export default function OpenSourcePage(): React.ReactElement {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="font-display text-4xl font-bold sm:text-5xl">
        Open source
      </h1>
      <p className="text-muted-foreground mt-4 text-lg">
        KanjiForge&apos;s application and pipeline code is MIT licensed. The
        generated content packs — kanji, dictionary, stroke order, and example
        sentences — are CC BY-SA unless noted otherwise below. Every byte
        shipped has a documented, open license.
      </p>

      <div className="border-border mt-10 overflow-hidden rounded-[var(--radius)] border">
        <table className="w-full text-left text-sm">
          <thead className="bg-secondary text-secondary-foreground">
            <tr>
              <th className="px-4 py-3 font-semibold">Source</th>
              <th className="px-4 py-3 font-semibold">License</th>
            </tr>
          </thead>
          <tbody>
            {SOURCES.map((row) => (
              <tr key={row.source} className="border-border border-t">
                <td className="px-4 py-3">{row.source}</td>
                <td className="text-muted-foreground px-4 py-3">
                  {row.license}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="font-display mt-12 text-2xl font-bold">
        Source and attribution
      </h2>
      <p className="text-muted-foreground mt-4">
        The repository, issue tracker, and full commit history are on GitHub.
        Complete per-source attribution — including pinned versions and source
        hashes for every data pack — is in the repository&apos;s{' '}
        <code className="bg-muted rounded px-1 py-0.5 text-sm">
          ATTRIBUTION.md
        </code>
        .
      </p>
      <ul className="mt-4 grid gap-2 text-sm">
        <li>
          <a
            href="https://github.com/harryt04/kanji-forge"
            rel="noreferrer"
            target="_blank"
            className="text-primary underline"
          >
            github.com/harryt04/kanji-forge
          </a>
        </li>
        <li>
          <a
            href="https://github.com/harryt04/kanji-forge/blob/master/LICENSE"
            rel="noreferrer"
            target="_blank"
            className="text-primary underline"
          >
            LICENSE (application code, MIT)
          </a>
        </li>
        <li>
          <a
            href="https://github.com/harryt04/kanji-forge/blob/master/LICENSE-DATA"
            rel="noreferrer"
            target="_blank"
            className="text-primary underline"
          >
            LICENSE-DATA (content packs, CC BY-SA 4.0)
          </a>
        </li>
        <li>
          <a
            href="https://github.com/harryt04/kanji-forge/blob/master/ATTRIBUTION.md"
            rel="noreferrer"
            target="_blank"
            className="text-primary underline"
          >
            ATTRIBUTION.md (full per-source breakdown)
          </a>
        </li>
      </ul>

      <p className="text-muted-foreground mt-12 text-sm">
        Questions about reusing the code or data?{' '}
        <Link href="/about" className="text-primary underline">
          See the FAQ
        </Link>{' '}
        or open an issue on GitHub.
      </p>
    </main>
  )
}
