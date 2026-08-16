import type { Metadata } from 'next'
import Link from 'next/link'
import { getKanjiDecks, getKanjiDeckCategories } from '@/lib/seo/decks'
import { breadcrumbListJsonLd } from '@/lib/seo/json-ld'

export const metadata: Metadata = {
  title: 'Kanji lists — JLPT, jōyō, school grade, and Kanken | KanjiForge',
  description:
    'Every kanji list KanjiForge ships: JLPT N5–N1, jōyō (2010 and 1981), school grades 1–9, and Kanji Kentei levels 10 through 1.',
  alternates: { canonical: '/kanji/lists' },
}

const CATEGORY_LABELS: Record<string, string> = {
  jlpt: 'JLPT',
  joyo: 'Jōyō (official school kanji)',
  school: 'School grade',
  kanken: 'Kanji Kentei (Kanken)',
  frequency: 'Frequency',
  kana: 'Kana',
}

export default function KanjiListsPage(): React.ReactElement {
  const decks = getKanjiDecks()
  const categories = getKanjiDeckCategories()

  const jsonLd = breadcrumbListJsonLd([
    { name: 'Home', path: '/' },
    { name: 'Kanji', path: '/kanji' },
    { name: 'Lists', path: '/kanji/lists' },
  ])

  return (
    <main className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <nav aria-label="Breadcrumb" className="text-muted-foreground text-sm">
        <Link href="/kanji" className="hover:text-foreground">
          Kanji
        </Link>{' '}
        / Lists
      </nav>
      <h1 className="font-display mt-2 text-4xl font-bold sm:text-5xl">
        Kanji lists
      </h1>
      <p className="text-muted-foreground mt-4 max-w-2xl text-lg">
        {decks.length} kanji lists, grouped by the study curriculum they come
        from.
      </p>

      <div className="mt-10 grid gap-10">
        {categories.map((category) => {
          const categoryDecks = decks.filter(
            (deck) => deck.category === category,
          )
          if (categoryDecks.length === 0) return null
          return (
            <section key={category}>
              <h2 className="font-display text-xl font-bold">
                {CATEGORY_LABELS[category] ?? category}
              </h2>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {categoryDecks.map((deck) => (
                  <li key={deck.id}>
                    <Link
                      href={`/kanji/lists/${deck.id}`}
                      className="border-border bg-card hover:border-primary flex items-center justify-between rounded-[var(--radius)] border px-4 py-3 text-sm transition-colors"
                    >
                      <span className="font-medium">{deck.name}</span>
                      <span className="text-muted-foreground text-xs">
                        {deck.contentRefs.length.toLocaleString()} kanji
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </main>
  )
}
