import Link from 'next/link'
import { Button } from '@/ui/button'
import { MarketingTileWall } from './marketing-tile-wall'

export function Hero(): React.ReactElement {
  return (
    <section className="relative overflow-hidden">
      <MarketingTileWall />
      <div className="relative mx-auto flex max-w-3xl flex-col items-center px-4 py-24 text-center sm:px-6 sm:py-32">
        <h1 className="font-display text-4xl leading-[1.05] font-bold text-balance sm:text-6xl">
          Your whole deck,
          <br />
          as a wall of color.
        </h1>
        <p className="text-muted-foreground mt-6 max-w-xl text-lg text-balance">
          A free, offline-first way to study kanji — the StickyStudy mechanic,
          open and yours.
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
          No payment, no tracking. Your reviews stay on your device.
        </p>
      </div>
    </section>
  )
}
