import type { Metadata } from 'next'
import Link from 'next/link'
import { getKanjiDecks, getKanjiDeckCategories } from '@/lib/seo/decks'
import { getCuratedLiterals } from '@/lib/seo/curated-literals'

export const metadata: Metadata = {
  title: 'Kanji reference — meanings, readings, and stroke order | KanjiForge',
  description:
    'A free reference for Japanese kanji: meanings, on’yomi and kun’yomi readings, stroke order, and which JLPT, jōyō, and Kanken lists each character belongs to.',
  alternates: { canonical: '/kanji' },
}

const CATEGORY_LABELS: Record<string, string> = {
  jlpt: 'JLPT',
  joyo: 'Jōyō (official school kanji)',
  school: 'School grade',
  kanken: 'Kanji Kentei (Kanken)',
  frequency: 'Frequency',
  kana: 'Kana',
}

export default function KanjiHubPage(): React.ReactElement {
  const decks = getKanjiDecks()
  const categories = getKanjiDeckCategories()
  const curatedCount = getCuratedLiterals().length

  return (
    <main className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
      <h1 className="font-display text-4xl font-bold sm:text-5xl">
        Kanji reference
      </h1>
      <p className="text-muted-foreground mt-4 max-w-2xl text-lg">
        Meanings, readings, and stroke order for {curatedCount.toLocaleString()}{' '}
        kanji, organized into the JLPT, jōyō, school-grade, and Kanken lists
        learners actually study from. Free to browse, no account required.
      </p>

      <div className="mt-12 grid gap-10">
        {categories.map((category) => {
          const categoryDecks = decks.filter(
            (deck) => deck.category === category,
          )
          if (categoryDecks.length === 0) return null
          return (
            <section key={category} aria-labelledby={`category-${category}`}>
              <h2
                id={`category-${category}`}
                className="font-display text-xl font-bold"
              >
                {CATEGORY_LABELS[category] ?? category}
              </h2>
              <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {categoryDecks.map((deck) => (
                  <li key={deck.id}>
                    <Link
                      href={`/kanji/lists/${deck.id}`}
                      className="border-border bg-card hover:border-primary block rounded-[var(--radius)] border px-4 py-3 text-sm transition-colors"
                    >
                      <span className="font-medium">{deck.name}</span>
                      <span className="text-muted-foreground block text-xs">
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

      <p className="text-muted-foreground mt-12 text-sm">
        Prefer to study these inside a spaced-repetition deck?{' '}
        <Link href="/sign-up" className="text-primary underline">
          Create a free KanjiForge account
        </Link>
        .
      </p>
    </main>
  )
}
