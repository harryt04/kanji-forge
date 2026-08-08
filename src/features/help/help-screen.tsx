'use client'

import Link from 'next/link'
import { getActiveUserRuntime } from '@/auth/runtime'
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card'

const LEVELS = [
  ['Level 0 — white (Shiro)', 'New cards waiting for their first review.'],
  ['Level 1 — yellow (Ki)', 'A card you have started to recognize.'],
  ['Level 2 — green (Midori)', 'A card building a reliable recall interval.'],
  ['Level 3 — blue (Ao)', 'A card approaching long-term recall.'],
  [
    'Level 4 — black (Kuro)',
    'Mastered for now; mastered cards recycle for review.',
  ],
] as const

export function HelpScreen(): React.ReactElement {
  if (!getActiveUserRuntime())
    return <p className="text-muted-foreground p-6">Sign in to open Help.</p>

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6 sm:p-8">
      <header className="space-y-2">
        <p className="font-jp-ui text-muted-foreground text-sm">使い方</p>
        <h1 className="font-display text-3xl font-bold">Help</h1>
        <p className="text-muted-foreground max-w-2xl">
          A short, offline guide to studying with KanjiForge. Your progress is
          kept on this device first, so the core study loop works without a
          network connection.
        </p>
      </header>

      <nav
        className="border-border bg-card flex flex-wrap gap-x-5 gap-y-2 rounded-[var(--radius)] border p-4 shadow-[var(--shadow-card)]"
        aria-label="Help sections"
      >
        <a
          className="text-primary underline-offset-4 hover:underline"
          href="#study"
        >
          Study
        </a>
        <a
          className="text-primary underline-offset-4 hover:underline"
          href="#levels"
        >
          Levels and colors
        </a>
        <a
          className="text-primary underline-offset-4 hover:underline"
          href="#browse"
        >
          Browse and Dictionary
        </a>
        <a
          className="text-primary underline-offset-4 hover:underline"
          href="#backup"
        >
          Backup and privacy
        </a>
      </nav>

      <Card id="study">
        <CardHeader>
          <CardTitle>Study a session</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-6">
          <p>
            Open{' '}
            <Link className="text-primary underline" href="/study">
              Study
            </Link>{' '}
            to start the current deck. Tap the card, press Space, or use the
            Reveal button to see the answer.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>I don&apos;t know</strong> — grade Again and see the card
              sooner.
            </li>
            <li>
              <strong>I know</strong> — grade Good and move the card up one
              level.
            </li>
            <li>
              <strong>No problem</strong> — grade Easy and send the card to the
              mastered level.
            </li>
          </ul>
          <p>
            You can grade with the buttons, swipe left or right after reveal, or
            use the keyboard: Left arrow for Again, Right arrow for Good, Up
            arrow for Easy, and <kbd className="rounded border px-1">Space</kbd>{' '}
            to reveal. Use Undo if you need to reverse your most recent answer.
          </p>
          <p>
            Flag a card when you want to revisit it. The timer is optional and
            stays hidden until you ask to show it. Study question and answer
            fields can be changed in{' '}
            <Link className="text-primary underline" href="/settings">
              Settings
            </Link>
            .
          </p>
        </CardContent>
      </Card>

      <Card id="levels">
        <CardHeader>
          <CardTitle>Levels and colors</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4 text-sm">
            Each sticky advances through four consecutive successful answers.
            The wall of colors makes your progress visible at a glance.
          </p>
          <dl className="grid gap-3 sm:grid-cols-2">
            {LEVELS.map(([name, description]) => (
              <div key={name} className="border-border rounded-md border p-3">
                <dt className="font-semibold">{name}</dt>
                <dd className="text-muted-foreground mt-1 text-sm">
                  {description}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card id="browse">
        <CardHeader>
          <CardTitle>Browse, detail, and Dictionary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-6">
          <p>
            <Link className="text-primary underline" href="/browse">
              Browse
            </Link>{' '}
            shows the deck as a searchable list or tile wall. Filter by level,
            flag, stroke count, or JLPT level; sort by study state or kanji
            metadata. Select a card to open its offline detail page.
          </p>
          <p>
            <Link className="text-primary underline" href="/dictionary">
              Dictionary
            </Link>{' '}
            searches the installed kanji and vocabulary packs by kanji, kana,
            rōmaji, English, radical, stroke count, or wildcard. Save a result
            to the Saved deck from its result or detail page.
          </p>
          <p>
            Home summarizes progress, goals, scheduled reviews, retention, and
            flagged trouble cards. History shows the recent review activity.
          </p>
        </CardContent>
      </Card>

      <Card id="backup">
        <CardHeader>
          <CardTitle>Backup and privacy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-6">
          <p>
            KanjiForge stores study data in a database scoped to your account on
            this device. Grades are written locally before any online sync work.
            Keep regular copies with{' '}
            <Link className="text-primary underline" href="/settings">
              Settings → Backup &amp; restore
            </Link>
            ; the JSON backup includes your settings, decks, Saved membership,
            and review history.
          </p>
          <p>
            Restore is non-destructive: it merges records and does not replace
            newer local data. Backups stay on your device unless you choose
            where to store or share the downloaded file.
          </p>
          <p className="text-muted-foreground">
            KanjiForge requires an account for protected app screens, but it
            does not use anonymous study data. You can sign out from the account
            menu at any time.
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
