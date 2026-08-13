import { readFileSync } from 'node:fs'

describe('development asset preparation', () => {
  it('copies the tokenizer dictionary before the dev server starts', () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { scripts?: { predev?: string } }

    expect(packageJson.scripts?.predev).toContain(
      'node scripts/copy-tokenizer-dict.mjs',
    )
  })
})
