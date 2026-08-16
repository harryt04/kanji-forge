import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy — KanjiForge',
  description:
    'KanjiForge runs no client-side analytics or tracking. Study data stays on your device by default; account sync is opt-in.',
  alternates: { canonical: '/privacy' },
}

export default function PrivacyPage(): React.ReactElement {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <h1 className="font-display text-4xl font-bold sm:text-5xl">Privacy</h1>
      <p className="text-muted-foreground mt-4 text-lg">
        KanjiForge is built to work entirely offline, and its data practices
        follow from that.
      </p>

      <div className="mt-10 grid gap-8">
        <section>
          <h2 className="font-semibold">No client-side tracking</h2>
          <p className="text-muted-foreground mt-2">
            KanjiForge runs no analytics, advertising, or third-party
            tracking scripts. Nothing about how you use the app is collected
            or sent anywhere.
          </p>
        </section>

        <section>
          <h2 className="font-semibold">Your study data</h2>
          <p className="text-muted-foreground mt-2">
            Decks, review history, and settings are stored locally in your
            browser by default and never leave your device. If you create a
            free account and turn on sync, that data is sent to KanjiForge&apos;s
            server so it can follow you across devices — and only that data,
            scoped to your account.
          </p>
        </section>

        <section>
          <h2 className="font-semibold">Account and authentication</h2>
          <p className="text-muted-foreground mt-2">
            Creating an account stores an email address, a hashed password
            (or OAuth identity), and a session cookie used to keep you signed
            in. This is used solely to authenticate you and is not shared
            with third parties.
          </p>
        </section>

        <section>
          <h2 className="font-semibold">Optional push notifications</h2>
          <p className="text-muted-foreground mt-2">
            If you opt into study reminders, your browser&apos;s push subscription
            endpoint is stored so KanjiForge&apos;s server can deliver
            reminders. You can revoke this at any time in Settings.
          </p>
        </section>

        <section>
          <h2 className="font-semibold">Data deletion</h2>
          <p className="text-muted-foreground mt-2">
            Deleting your account removes your synced data from the server.
            Locally stored data can be cleared at any time by clearing your
            browser&apos;s site data for KanjiForge.
          </p>
        </section>

        <section>
          <h2 className="font-semibold">Open source</h2>
          <p className="text-muted-foreground mt-2">
            KanjiForge&apos;s code is public — you don&apos;t have to take these claims
            on faith. See{' '}
            <a
              href="https://github.com/harryt04/kanji-forge"
              rel="noreferrer"
              target="_blank"
              className="text-primary underline"
            >
              the repository
            </a>{' '}
            for exactly how data is handled.
          </p>
        </section>
      </div>
    </main>
  )
}
