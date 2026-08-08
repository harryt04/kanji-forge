import Link from 'next/link'
import { Reveal } from './reveal'
import { Button } from '@/ui/button'

const PLATFORMS = [
  {
    name: 'iOS Safari',
    steps: 'Tap Share, then “Add to Home Screen.”',
  },
  {
    name: 'Android Chrome',
    steps: 'Tap the menu, then “Install app.”',
  },
  {
    name: 'Desktop',
    steps: 'Click the install icon in the address bar.',
  },
] as const

export function InstallPwa(): React.ReactElement {
  return (
    <section className="border-border border-t">
      <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6">
        <Reveal>
          <h2 className="font-display text-3xl font-bold sm:text-4xl">
            Install it, or just use it in a tab.
          </h2>
          <p className="text-muted-foreground mx-auto mt-4 max-w-xl text-lg">
            KanjiForge works as a plain website. Installing is entirely optional
            — it just makes it feel like a native app and keeps working offline
            after your first visit.
          </p>
        </Reveal>
        <Reveal delayMs={80}>
          <ul
            className="mx-auto mt-10 grid max-w-2xl gap-4 text-left sm:grid-cols-3"
            role="list"
          >
            {PLATFORMS.map((platform) => (
              <li
                key={platform.name}
                className="border-border bg-card rounded-[var(--radius)] border p-4"
              >
                <p className="text-sm font-semibold">{platform.name}</p>
                <p className="text-muted-foreground mt-1 text-sm">
                  {platform.steps}
                </p>
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal delayMs={160}>
          <Button asChild size="lg" className="mt-10">
            <Link href="/sign-up">Create a free account</Link>
          </Button>
        </Reveal>
      </div>
    </section>
  )
}
