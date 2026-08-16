import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms — KanjiForge',
  description:
    'KanjiForge terms of use: free, MIT-licensed application code, CC BY-SA content packs, provided as-is with no warranty.',
  alternates: { canonical: '/terms' },
}

export default function TermsPage(): React.ReactElement {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <h1 className="font-display text-4xl font-bold sm:text-5xl">Terms</h1>
      <p className="text-muted-foreground mt-4 text-lg">
        KanjiForge is provided free of charge, with no subscription and no
        paywalled content.
      </p>

      <div className="mt-10 grid gap-8">
        <section>
          <h2 className="font-semibold">License</h2>
          <p className="text-muted-foreground mt-2">
            The application and pipeline code are MIT licensed. Content
            packs and derived datasets (kanji, dictionary, stroke order,
            example sentences, and deck definitions) are CC BY-SA. See{' '}
            <a href="/open-source" className="text-primary underline">
              Open Source
            </a>{' '}
            for the full breakdown and source links.
          </p>
        </section>

        <section>
          <h2 className="font-semibold">No warranty</h2>
          <p className="text-muted-foreground mt-2">
            KanjiForge is provided &quot;as is,&quot; without warranty of any kind. In
            particular, JLPT level assignments are unofficial community
            estimates, not an authoritative source — see the licensing terms
            in the repository for the full disclaimer.
          </p>
        </section>

        <section>
          <h2 className="font-semibold">Accounts</h2>
          <p className="text-muted-foreground mt-2">
            An account is optional and only needed for cross-device sync and
            reminders. You may delete your account at any time from
            Settings; see{' '}
            <a href="/privacy" className="text-primary underline">
              Privacy
            </a>{' '}
            for what that removes.
          </p>
        </section>

        <section>
          <h2 className="font-semibold">Changes</h2>
          <p className="text-muted-foreground mt-2">
            Since KanjiForge is open source, changes to the application are
            visible in the public commit history rather than announced here.
          </p>
        </section>
      </div>
    </main>
  )
}
