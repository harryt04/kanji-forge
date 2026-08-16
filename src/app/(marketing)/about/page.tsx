import type { Metadata } from 'next'
import Link from 'next/link'
import { faqPageJsonLd } from '@/lib/seo/json-ld'

export const metadata: Metadata = {
  title: 'About KanjiForge — free, open-source kanji study app',
  description:
    'KanjiForge is a free, open-source, offline-first web app for studying Japanese kanji. No ads, no subscription, no account required to browse.',
  alternates: { canonical: '/about' },
}

const FAQ = [
  {
    question: 'Is KanjiForge really free?',
    answer:
      'Yes. KanjiForge has no subscription, no paywalled decks, and no ads. The application code is MIT licensed and the content packs are CC BY-SA — see the Open Source page for details.',
  },
  {
    question: 'Do I need an account to use it?',
    answer:
      'No. Studying works entirely offline in the browser without an account. Creating a free account adds optional sync across devices.',
  },
  {
    question: 'What makes KanjiForge different from Anki or WaniKani?',
    answer:
      'It is open source (unlike WaniKani), offline-first with no setup required (unlike a bare Anki deck), and uses a level-and-color spaced-repetition system — StickyStudy — designed to make a deck’s progress legible at a glance.',
  },
  {
    question: 'What kanji lists does it cover?',
    answer:
      'JLPT N5 through N1, jōyō kanji (2010 and 1981 lists), Japanese school grades 1–9, and Kanji Kentei (Kanken) levels 10 through 1 — browsable at /kanji/lists without an account.',
  },
  {
    question: 'Does it track me?',
    answer:
      'KanjiForge uses PostHog for anonymous product analytics — page views and interaction events, not what you study. Your kanji, decks, and review history stay on your device unless you opt into account sync. See the Privacy page for details.',
  },
] as const

export default function AboutPage(): React.ReactElement {
  const jsonLd = faqPageJsonLd(FAQ)

  return (
    <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <h1 className="font-display text-4xl font-bold sm:text-5xl">
        About KanjiForge
      </h1>
      <p className="text-muted-foreground mt-4 text-lg">
        KanjiForge is a free, open-source, offline-first web app for studying
        Japanese kanji and vocabulary. It uses spaced repetition — every card
        moves through belt-like color levels as you answer it, so a deck&apos;s
        progress is easy to read at a glance.
      </p>
      <p className="text-muted-foreground mt-4 text-lg">
        It&apos;s built for independent learners who want offline study with
        optional account sync, not a subscription. The application code is MIT
        licensed; the kanji and dictionary data are CC BY-SA. See{' '}
        <Link href="/open-source" className="text-primary underline">
          Open Source
        </Link>{' '}
        for the full breakdown, or browse the{' '}
        <Link href="/kanji" className="text-primary underline">
          kanji reference
        </Link>{' '}
        without creating an account.
      </p>

      <h2 className="font-display mt-12 text-2xl font-bold">
        Frequently asked questions
      </h2>
      <dl className="mt-6 grid gap-6">
        {FAQ.map((entry) => (
          <div key={entry.question}>
            <dt className="font-semibold">{entry.question}</dt>
            <dd className="text-muted-foreground mt-1">{entry.answer}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-12">
        <Link
          href="/sign-up"
          className="bg-primary text-primary-foreground inline-flex h-11 items-center justify-center rounded-md px-4 text-sm font-medium"
        >
          Create a free account
        </Link>
      </div>
    </main>
  )
}
