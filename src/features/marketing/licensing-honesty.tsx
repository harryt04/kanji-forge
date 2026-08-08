import { Reveal } from './reveal'

const SOURCES = [
  { source: 'App code', license: 'MIT' },
  {
    source: 'KANJIDIC2, JMdict, JMnedict, KRADFILE/RADKFILE',
    license: 'CC BY-SA 4.0',
  },
  { source: 'KanjiVG (stroke order)', license: 'CC BY-SA 3.0' },
  { source: 'Tatoeba example sentences', license: 'CC BY 2.0 FR' },
] as const

const GAPS = [
  'No human-recorded audio for most words — device text-to-speech is used and always labeled as synthesized, with optional community audio packs.',
  'JLPT level lists are community estimates, same as most Japanese study tools — we just say so.',
  'No built-in news feed, since most sources aren’t redistributable — the text analyzer covers pasting in anything you find elsewhere.',
] as const

export function LicensingHonesty(): React.ReactElement {
  return (
    <section
      id="licensing"
      className="border-border border-t"
      aria-labelledby="licensing-heading"
    >
      <div className="mx-auto max-w-4xl px-4 py-20 sm:px-6">
        <Reveal>
          <h2
            id="licensing-heading"
            className="font-display text-3xl font-bold sm:text-4xl"
          >
            Open, and honest about the gaps.
          </h2>
          <p className="text-muted-foreground mt-4 max-w-2xl text-lg">
            Every byte KanjiForge ships has a documented, open license. Here’s
            exactly what that means, and where it falls short of a closed-source
            alternative built on scraped or licensed data.
          </p>
        </Reveal>

        <Reveal delayMs={80}>
          <div className="border-border mt-10 overflow-hidden rounded-[var(--radius)] border">
            <table className="w-full text-left text-sm">
              <thead className="bg-secondary text-secondary-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Source</th>
                  <th className="px-4 py-3 font-semibold">License</th>
                </tr>
              </thead>
              <tbody>
                {SOURCES.map((row) => (
                  <tr key={row.source} className="border-border border-t">
                    <td className="px-4 py-3">{row.source}</td>
                    <td className="text-muted-foreground px-4 py-3">
                      {row.license}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>

        <Reveal delayMs={160}>
          <h3 className="mt-10 font-semibold">
            Where KanjiForge will be worse
          </h3>
          <ul className="text-muted-foreground mt-3 grid list-disc gap-2 pl-5 text-sm">
            {GAPS.map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  )
}
