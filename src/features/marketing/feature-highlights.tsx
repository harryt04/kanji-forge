import { Reveal } from './reveal'

interface Highlight {
  readonly kicker: string
  readonly title: string
  readonly body: string
  readonly visual: React.ReactNode
}

function StudyCardVisual(): React.ReactElement {
  return (
    <div className="border-border bg-card flex aspect-[4/3] w-full flex-col items-center justify-center rounded-[var(--radius)] border p-8 shadow-[var(--shadow-card)]">
      <span
        className="sticky-shape l3 absolute top-6 right-6 h-4 w-4 rounded-sm"
        style={{ background: 'var(--level-3)' }}
      />
      <p className="font-jp-display text-7xl">鍛</p>
      <p className="text-muted-foreground font-jp-ui mt-3 text-lg">きたえる</p>
    </div>
  )
}

function TileWallVisual(): React.ReactElement {
  const levels = [0, 1, 2, 3, 4, 2, 1, 0, 3, 4, 1, 2, 0, 3, 2, 1, 4, 0, 2, 1]
  return (
    <div className="border-border bg-card aspect-[4/3] w-full rounded-[var(--radius)] border p-4 shadow-[var(--shadow-card)]">
      <div className="grid h-full grid-cols-5 gap-1.5">
        {levels.map((level, index) => (
          <span
            key={index}
            className={`rounded-[2px] l${level}`}
            style={{ background: `var(--level-${level})` }}
          />
        ))}
      </div>
    </div>
  )
}

function WritingVisual(): React.ReactElement {
  return (
    <div className="border-border bg-card flex aspect-[4/3] w-full items-center justify-center rounded-[var(--radius)] border p-8 shadow-[var(--shadow-card)]">
      <svg viewBox="0 0 100 100" className="text-primary h-32 w-32">
        <path
          d="M20 30 L80 30 M50 15 L50 85 M30 55 Q50 75 75 55"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <circle cx="20" cy="30" r="4" className="fill-primary" />
      </svg>
    </div>
  )
}

function DictionaryVisual(): React.ReactElement {
  return (
    <div className="border-border bg-card flex aspect-[4/3] w-full flex-col justify-center gap-2 rounded-[var(--radius)] border p-6 shadow-[var(--shadow-card)]">
      <div className="border-input bg-background flex h-11 items-center rounded-md border px-3 text-sm">
        <span className="font-jp-ui">水</span>
        <span className="bg-muted-foreground/40 ml-1 h-4 w-px animate-pulse" />
      </div>
      <div className="text-muted-foreground grid gap-1.5 text-xs">
        <p>みず — water</p>
        <p>すい — water (on&apos;yomi)</p>
      </div>
    </div>
  )
}

const HIGHLIGHTS: readonly Highlight[] = [
  {
    kicker: 'Study',
    title: 'Undo the swipe you didn’t mean.',
    body: 'A misfired grade in StickyStudy is gone for good. Here it isn’t — undo the last answer in-session, no data lost.',
    visual: <StudyCardVisual />,
  },
  {
    kicker: 'Browse',
    title: 'See the whole deck at once.',
    body: 'Zoom out to a tile wall of every card in a deck, colored by belt rank, or drop into a searchable, filterable list.',
    visual: <TileWallVisual />,
  },
  {
    kicker: 'Writing',
    title: 'Trace real stroke order, offline.',
    body: 'Practice with KanjiVG-guided stroke animations and live stroke-order checking — no network required.',
    visual: <WritingVisual />,
  },
  {
    kicker: 'Dictionary',
    title: 'Paste a sentence, get every word.',
    body: 'Search by kanji, kana, English, radical, or stroke count. Paste Japanese text and get readings and glosses for every word in it.',
    visual: <DictionaryVisual />,
  },
] as const

export function FeatureHighlights(): React.ReactElement {
  return (
    <section className="border-border border-t" aria-label="Feature highlights">
      <div className="mx-auto max-w-5xl px-4 py-20 sm:px-6">
        <div className="grid gap-16">
          {HIGHLIGHTS.map((item, index) => (
            <Reveal key={item.title}>
              <div
                className={`grid items-center gap-8 sm:grid-cols-2 sm:gap-12 ${
                  index % 2 === 1 ? 'sm:[&>*:first-child]:order-2' : ''
                }`}
              >
                <div>
                  <p className="text-primary text-sm font-semibold tracking-wide uppercase">
                    {item.kicker}
                  </p>
                  <h3 className="font-display mt-2 text-2xl font-bold">
                    {item.title}
                  </h3>
                  <p className="text-muted-foreground mt-3 text-base">
                    {item.body}
                  </p>
                </div>
                {item.visual}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
