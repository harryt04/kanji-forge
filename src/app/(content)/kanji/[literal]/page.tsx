import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getKanji } from '@/lib/seo/kanji-pack'
import { getDeckMembership } from '@/lib/seo/decks'
import { getSimilarKanji } from '@/lib/seo/similar-kanji'
import { getKanjiStrokes } from '@/lib/seo/strokes'
import { getCuratedLiterals, isCuratedLiteral } from '@/lib/seo/curated-literals'
import { breadcrumbListJsonLd, definedTermJsonLd } from '@/lib/seo/json-ld'

export const dynamicParams = true
export const revalidate = false

export function generateStaticParams(): { literal: string }[] {
  return getCuratedLiterals().map((literal) => ({ literal }))
}

export function generateMetadata({
  params,
}: {
  params: { literal: string }
}): Metadata {
  const literal = decodeURIComponent(params.literal)
  const kanji = getKanji(literal)
  if (!kanji) return {}

  const primaryMeaning = kanji.meanings[0] ?? ''
  const title = `${literal} — ${primaryMeaning || 'kanji meaning'} | KanjiForge`
  const description = `${literal}: ${kanji.meanings.join(', ')}. Readings: ${[
    ...kanji.onReadings,
    ...kanji.kunReadings,
  ].join('、 ')}. ${kanji.strokeCount} strokes.`

  return {
    title,
    description,
    alternates: { canonical: `/kanji/${encodeURIComponent(literal)}` },
    robots: isCuratedLiteral(literal)
      ? undefined
      : { index: false, follow: true },
    openGraph: {
      title,
      description,
      images: [`/kanji/${encodeURIComponent(literal)}/opengraph-image`],
    },
  }
}

function StrokeOrderSvg({
  paths,
}: {
  paths: readonly string[]
}): React.ReactElement {
  return (
    <svg
      viewBox="0 0 109 109"
      className="h-40 w-40 sm:h-56 sm:w-56"
      role="img"
      aria-label="Stroke order diagram"
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {paths.map((d, index) => (
          <path key={index} d={d} />
        ))}
      </g>
    </svg>
  )
}

export default function KanjiPage({
  params,
}: {
  params: { literal: string }
}): React.ReactElement {
  const literal = decodeURIComponent(params.literal)
  const kanji = getKanji(literal)
  if (!kanji) notFound()

  const decks = getDeckMembership(literal)
  const similar = getSimilarKanji(literal).slice(0, 8)
  const strokes = getKanjiStrokes(literal)
  const primaryMeaning = kanji.meanings[0] ?? ''

  const jsonLd = [
    breadcrumbListJsonLd([
      { name: 'Home', path: '/' },
      { name: 'Kanji', path: '/kanji' },
      { name: literal, path: `/kanji/${encodeURIComponent(literal)}` },
    ]),
    definedTermJsonLd({
      literal,
      meanings: kanji.meanings,
      path: `/kanji/${encodeURIComponent(literal)}`,
    }),
  ]

  return (
    <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
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
        / {literal}
      </nav>

      <div className="mt-4 flex items-center gap-6 sm:gap-10">
        {strokes ? (
          <div className="text-muted-foreground shrink-0">
            <StrokeOrderSvg paths={strokes} />
          </div>
        ) : (
          <p className="font-jp-display shrink-0 text-8xl sm:text-9xl">
            {literal}
          </p>
        )}
        <div>
          <h1 className="font-display text-3xl font-bold sm:text-4xl">
            {literal}
            {primaryMeaning ? (
              <span className="text-muted-foreground font-normal">
                {' '}
                — {primaryMeaning}
              </span>
            ) : null}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {kanji.strokeCount} strokes
            {kanji.grade ? ` · Grade ${kanji.grade}` : ''}
            {kanji.freq ? ` · Frequency rank #${kanji.freq}` : ''}
          </p>
        </div>
      </div>

      <section className="mt-10 grid gap-6 sm:grid-cols-2">
        <div>
          <h2 className="text-sm font-semibold tracking-wide uppercase">
            Meanings
          </h2>
          <p className="mt-2">{kanji.meanings.join(', ') || '—'}</p>
        </div>
        <div>
          <h2 className="text-sm font-semibold tracking-wide uppercase">
            Radical
          </h2>
          <p className="mt-2">
            {kanji.radicalClassical ?? kanji.radicalNelson ?? '—'}
          </p>
        </div>
        <div>
          <h2 className="text-sm font-semibold tracking-wide uppercase">
            On&apos;yomi
          </h2>
          <p className="font-jp-ui mt-2">
            {kanji.onReadings.join('、 ') || '—'}
          </p>
        </div>
        <div>
          <h2 className="text-sm font-semibold tracking-wide uppercase">
            Kun&apos;yomi
          </h2>
          <p className="font-jp-ui mt-2">
            {kanji.kunReadings.join('、 ') || '—'}
          </p>
        </div>
        {kanji.nanori.length > 0 ? (
          <div>
            <h2 className="text-sm font-semibold tracking-wide uppercase">
              Nanori (name readings)
            </h2>
            <p className="font-jp-ui mt-2">{kanji.nanori.join('、 ')}</p>
          </div>
        ) : null}
      </section>

      {decks.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-sm font-semibold tracking-wide uppercase">
            Appears in
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {decks.map((deck) => (
              <li key={deck.id}>
                <Link
                  href={`/kanji/lists/${deck.id}`}
                  className="border-border bg-card hover:border-primary rounded-full border px-3 py-1 text-xs"
                >
                  {deck.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {similar.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-sm font-semibold tracking-wide uppercase">
            Similar-looking kanji
          </h2>
          <ul className="mt-3 flex flex-wrap gap-3">
            {similar.map((candidate) => (
              <li key={candidate}>
                <Link
                  href={`/kanji/${encodeURIComponent(candidate)}`}
                  className="font-jp-display border-border bg-card hover:border-primary flex h-12 w-12 items-center justify-center rounded-[var(--radius)] border text-xl"
                >
                  {candidate}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="border-border mt-12 rounded-[var(--radius)] border p-6">
        <p className="font-medium">
          Study {literal} with spaced repetition, offline.
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          KanjiForge is free and open source — sign up to add this kanji to a
          deck and track it with the belt-rank SRS.
        </p>
        <Link
          href={`/detail?contentRef=${encodeURIComponent(`kanji:${literal}`)}`}
          className="bg-primary text-primary-foreground mt-4 inline-flex h-11 items-center justify-center rounded-md px-4 text-sm font-medium"
        >
          Open in KanjiForge
        </Link>
      </section>

      <p className="text-muted-foreground mt-8 text-xs">
        Kanji data from KANJIDIC2 (Electronic Dictionary Research and
        Development Group), CC BY-SA 4.0. Stroke order from KanjiVG, CC BY-SA
        3.0.
      </p>
    </main>
  )
}
