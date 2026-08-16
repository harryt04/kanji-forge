import Link from 'next/link'
import { Button } from '@/ui/button'
import { MarketingTileWall } from './marketing-tile-wall'

export function Hero(): React.ReactElement {
  return (
    <section className="relative overflow-hidden">
      <MarketingTileWall />
      <div
        className="marketing-hero-copy relative mx-auto flex max-w-3xl flex-col items-center rounded-2xl px-4 py-8 text-center sm:px-8 sm:py-10"
        data-testid="marketing-hero-copy"
      >
        <h1
          className="font-display text-4xl leading-[1.05] font-bold text-balance sm:text-6xl"
          data-testid="marketing-hero-heading"
        >
          Your whole deck,
          <br />
          as a wall of color.
        </h1>
        <h2 className="text-muted-foreground mt-3 max-w-xl text-base font-normal sm:text-lg">
          A free, open-source, offline-first kanji study app.
        </h2>
        <p
          className="text-foreground mt-6 max-w-xl text-lg text-balance"
          data-testid="marketing-hero-subhead"
        >
          Study JLPT, jōyō, and Kanken kanji with spaced repetition and
          stroke-order practice — the StickyStudy mechanic, open and yours.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/sign-up">Create a free account</Link>
          </Button>
          <Button asChild size="lg" variant="ghost">
            <a
              href="https://github.com/harryt04/kanji-forge"
              rel="noreferrer"
              target="_blank"
            >
              View source on GitHub
            </a>
          </Button>
        </div>
        <p className="text-muted-foreground mt-4 text-sm">
          No payment. Your reviews stay on your device; see our{' '}
          <Link href="/privacy" className="underline">
            privacy policy
          </Link>
          .
        </p>
        <p className="text-muted-foreground mt-6 text-sm">
          <Link href="/kanji" className="hover:text-foreground underline">
            Browse the kanji reference
          </Link>
          {' · '}
          <Link href="/kanji/lists" className="hover:text-foreground underline">
            JLPT &amp; jōyō lists
          </Link>
          {' · '}
          <Link href="/about" className="hover:text-foreground underline">
            About
          </Link>
        </p>
      </div>
    </section>
  )
}
