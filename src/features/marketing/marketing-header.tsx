import Link from 'next/link'
import { Button } from '@/ui/button'

export function MarketingHeader(): React.ReactElement {
  return (
    <header className="border-border/70 sticky top-0 z-10 border-b bg-[color-mix(in_oklab,var(--background)_88%,transparent)] backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link className="font-display text-xl font-bold" href="/">
          Kanji<span className="text-primary">Forge</span>
        </Link>
        <nav
          className="hidden items-center gap-6 sm:flex"
          aria-label="Marketing"
        >
          <a
            className="text-muted-foreground hover:text-foreground text-sm"
            href="#how-it-works"
          >
            How it works
          </a>
          <a
            className="text-muted-foreground hover:text-foreground text-sm"
            href="#licensing"
          >
            Licensing
          </a>
          <a
            className="text-muted-foreground hover:text-foreground text-sm"
            href="https://github.com/harryt04/kanji-forge"
            rel="noreferrer"
            target="_blank"
          >
            GitHub
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/sign-up">Create a free account</Link>
          </Button>
        </div>
      </div>
    </header>
  )
}
