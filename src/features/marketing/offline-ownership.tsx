import { Reveal } from './reveal'

const CLAIMS = [
  {
    title: 'Works with no network',
    body: 'Content packs, study, writing practice, and the dictionary all run offline once installed. A network is only ever used to sync between your own devices.',
  },
  {
    title: 'No account server required',
    body: 'The hosted version needs an account so reviews can sync between devices — but the whole stack is open source and self-hostable if you’d rather run your own.',
  },
  {
    title: 'Your data is a file',
    body: 'Export a full backup, including your complete review history, as an open JSON file at any time. Nothing is locked in.',
  },
] as const

export function OfflineOwnership(): React.ReactElement {
  return (
    <section className="border-border border-t">
      <div className="mx-auto max-w-5xl px-4 py-20 sm:px-6">
        <Reveal>
          <h2 className="font-display text-3xl font-bold sm:text-4xl">
            Offline by default. Yours by design.
          </h2>
        </Reveal>
        <Reveal delayMs={80}>
          <ul className="mt-10 grid gap-8 sm:grid-cols-3" role="list">
            {CLAIMS.map((claim) => (
              <li key={claim.title}>
                <h3 className="font-semibold">{claim.title}</h3>
                <p className="text-muted-foreground mt-2 text-sm">
                  {claim.body}
                </p>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  )
}
