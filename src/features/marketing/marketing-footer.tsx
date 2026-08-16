import Link from 'next/link'

export function MarketingFooter(): React.ReactElement {
  return (
    <footer className="border-border border-t">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-8 sm:flex-row sm:justify-between">
          <div>
            <p className="font-display text-lg font-bold">
              Kanji<span className="text-primary">Forge</span>
            </p>
            <p className="font-jp-ui text-muted-foreground mt-1 text-sm">
              漢字を鍛える
            </p>
          </div>
          <nav
            className="grid grid-cols-2 gap-x-10 gap-y-3 text-sm sm:flex sm:gap-10"
            aria-label="Footer"
          >
            <Link
              className="text-muted-foreground hover:text-foreground"
              href="/kanji"
            >
              Kanji reference
            </Link>
            <a
              className="text-muted-foreground hover:text-foreground"
              href="https://github.com/harryt04/kanji-forge"
              rel="noreferrer"
              target="_blank"
            >
              GitHub
            </a>
            <Link
              className="text-muted-foreground hover:text-foreground"
              href="/open-source"
            >
              Licensing
            </Link>
            <Link
              className="text-muted-foreground hover:text-foreground"
              href="/about"
            >
              About
            </Link>
            <Link
              className="text-muted-foreground hover:text-foreground"
              href="/privacy"
            >
              Privacy
            </Link>
            <Link
              className="text-muted-foreground hover:text-foreground"
              href="/terms"
            >
              Terms
            </Link>
            <Link
              className="text-muted-foreground hover:text-foreground"
              href="/sign-in"
            >
              Sign in
            </Link>
            <Link
              className="text-muted-foreground hover:text-foreground"
              href="/sign-up"
            >
              Create account
            </Link>
          </nav>
        </div>
        <p className="text-muted-foreground mt-8 text-xs">
          MIT-licensed code. Content packs are CC BY-SA — see Licensing above.
          Nothing you study is sent anywhere unless you turn on optional sync.
        </p>
      </div>
    </footer>
  )
}
