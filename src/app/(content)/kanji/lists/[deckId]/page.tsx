import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getDeck, getKanjiDecks, parseContentRef } from '@/lib/seo/decks'
import { getKanji } from '@/lib/seo/kanji-pack'
import { breadcrumbListJsonLd, deckItemListJsonLd } from '@/lib/seo/json-ld'

export const revalidate = false

export function generateStaticParams(): { deckId: string }[] {
  return getKanjiDecks().map((deck) => ({ deckId: deck.id }))
}

export function generateMetadata({
  params,
}: {
  params: { deckId: string }
}): Metadata {
  const deck = getDeck(params.deckId)
  if (!deck) return {}
  return {
    title: `${deck.name} — ${deck.contentRefs.length} kanji | KanjiForge`,
    description: deck.description,
    alternates: { canonical: `/kanji/lists/${deck.id}` },
  }
}

export default function DeckPage({
  params,
}: {
  params: { deckId: string }
}): React.ReactElement {
  const deck = getDeck(params.deckId)
  if (!deck) notFound()

  const rows = deck.contentRefs
    .map((ref) => {
      const { type, key } = parseContentRef(ref)
      if (type !== 'kanji') return null
      const kanji = getKanji(key)
      return kanji ? { literal: key, kanji } : null
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)

  const jsonLd = [
    breadcrumbListJsonLd([
      { name: 'Home', path: '/' },
      { name: 'Kanji', path: '/kanji' },
      { name: 'Lists', path: '/kanji/lists' },
      { name: deck.name, path: `/kanji/lists/${deck.id}` },
    ]),
    deckItemListJsonLd({
      deckName: deck.name,
      items: rows.map((row) => ({
        literal: row.literal,
        path: `/kanji/${encodeURIComponent(row.literal)}`,
      })),
    }),
  ]

  return (
    <main className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
      {jsonLd.map((entry, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(entry) }}
        />
      ))}
      <nav aria-label="Breadcrumb" className="text-muted-foreground text-sm">
        <Link href="/kanji" className="hover:text-foreground">
          Kanji
        </Link>{' '}
        /{' '}
        <Link href="/kanji/lists" className="hover:text-foreground">
          Lists
        </Link>{' '}
        / {deck.name}
      </nav>
      <h1 className="font-display mt-2 text-4xl font-bold sm:text-5xl">
        {deck.name}
      </h1>
      <p className="text-muted-foreground mt-4 max-w-2xl text-lg">
        {deck.description}
      </p>

      <div className="border-border mt-10 overflow-x-auto rounded-[var(--radius)] border">
        <table className="w-full text-left text-sm">
          <thead className="bg-secondary text-secondary-foreground">
            <tr>
              <th className="px-4 py-3 font-semibold">Kanji</th>
              <th className="px-4 py-3 font-semibold">Meanings</th>
              <th className="px-4 py-3 font-semibold">Readings</th>
              <th className="px-4 py-3 font-semibold">Strokes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.literal} className="border-border border-t">
                <td className="px-4 py-3">
                  <Link
                    href={`/kanji/${encodeURIComponent(row.literal)}`}
                    className="font-jp-display hover:text-primary text-2xl"
                  >
                    {row.literal}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  {row.kanji.meanings.slice(0, 4).join(', ')}
                </td>
                <td className="text-muted-foreground px-4 py-3">
                  {[...row.kanji.onReadings, ...row.kanji.kunReadings]
                    .slice(0, 4)
                    .join('、 ')}
                </td>
                <td className="text-muted-foreground px-4 py-3">
                  {row.kanji.strokeCount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-muted-foreground mt-8 text-sm">
        Want to study this list with spaced repetition?{' '}
        <Link href="/sign-up" className="text-primary underline">
          Create a free KanjiForge account
        </Link>
        .
      </p>
    </main>
  )
}
