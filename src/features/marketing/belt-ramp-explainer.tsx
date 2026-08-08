import { Reveal } from './reveal'

const LEVELS = [
  {
    level: 0,
    kanji: '白',
    romaji: 'Shiro',
    name: 'White',
    meaning: 'Not started yet.',
  },
  {
    level: 1,
    kanji: '黄',
    romaji: 'Ki',
    name: 'Yellow',
    meaning: 'First correct answer.',
  },
  {
    level: 2,
    kanji: '緑',
    romaji: 'Midori',
    name: 'Green',
    meaning: 'Two correct answers in a row.',
  },
  {
    level: 3,
    kanji: '青',
    romaji: 'Ao',
    name: 'Blue',
    meaning: 'Three correct answers in a row.',
  },
  {
    level: 4,
    kanji: '黒',
    romaji: 'Kuro',
    name: 'Black',
    meaning: '4 correct answers to master this.',
  },
] as const

export function BeltRampExplainer(): React.ReactElement {
  return (
    <section
      id="how-it-works"
      className="border-border border-t"
      aria-labelledby="how-it-works-heading"
    >
      <div className="mx-auto max-w-4xl px-4 py-20 sm:px-6">
        <Reveal>
          <h2
            id="how-it-works-heading"
            className="font-display text-3xl font-bold sm:text-4xl"
          >
            The color is the interface.
          </h2>
          <p className="text-muted-foreground mt-4 max-w-2xl text-lg">
            Every kanji you study carries a belt rank, from white to black.
            Glance at your deck and you already know what needs work — no
            digging through menus.
          </p>
        </Reveal>

        <Reveal delayMs={80}>
          <ul className="mt-10 grid gap-3 sm:grid-cols-5" role="list">
            {LEVELS.map((item) => (
              <li
                key={item.level}
                className="border-border bg-card rounded-[var(--radius)] border p-4"
              >
                <span
                  className={`sticky-shape l${item.level} mb-3 flex aspect-square w-full items-center justify-center rounded-md text-2xl font-semibold`}
                  style={{
                    background: `var(--level-${item.level})`,
                    color: `var(--level-${item.level}-foreground)`,
                    boxShadow:
                      item.level === 0
                        ? 'inset 0 0 0 1px var(--level-0-border)'
                        : item.level === 4
                          ? 'inset 0 0 0 1px var(--level-4-border)'
                          : undefined,
                  }}
                  aria-label={`Level ${item.level}, ${item.name} (${item.romaji})`}
                >
                  {item.kanji}
                </span>
                <p className="text-sm font-semibold">
                  {item.name}
                  <span className="text-muted-foreground font-normal">
                    {' '}
                    · {item.romaji}
                  </span>
                </p>
                <p className="text-muted-foreground mt-1 text-sm">
                  {item.meaning}
                </p>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delayMs={160}>
          <p className="text-muted-foreground mt-8 max-w-2xl text-sm">
            Why white → yellow → green → blue → black instead of the usual
            red-to-green scale? It reads by brightness alone, so it stays
            legible even without color vision — the most common form of color
            blindness turns a red-to-green ramp into noise. Every tile also
            carries a folded-corner shape and an accessible level label, so
            nothing here depends on color at all.
          </p>
        </Reveal>
      </div>
    </section>
  )
}
