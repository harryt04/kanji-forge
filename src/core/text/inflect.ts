export interface InflectedSurface {
  readonly text: string
  readonly reading: string
}

interface InflectionRule {
  readonly textSuffix: string
  readonly readingSuffix: string
}

const ICHIDAN_RULES: readonly InflectionRule[] = [
  { textSuffix: 'ます', readingSuffix: 'ます' },
  { textSuffix: 'ました', readingSuffix: 'ました' },
  { textSuffix: 'ません', readingSuffix: 'ません' },
  { textSuffix: 'ない', readingSuffix: 'ない' },
  { textSuffix: 'なかった', readingSuffix: 'なかった' },
  { textSuffix: 'て', readingSuffix: 'て' },
  { textSuffix: 'た', readingSuffix: 'た' },
  { textSuffix: 'れば', readingSuffix: 'れば' },
]

const GODAN_RULES: Readonly<Record<string, readonly InflectionRule[]>> = {
  う: [
    { textSuffix: 'います', readingSuffix: 'います' },
    { textSuffix: 'った', readingSuffix: 'った' },
    { textSuffix: 'って', readingSuffix: 'って' },
    { textSuffix: 'わない', readingSuffix: 'わない' },
    { textSuffix: 'えば', readingSuffix: 'えば' },
  ],
  つ: [
    { textSuffix: 'ちます', readingSuffix: 'ちます' },
    { textSuffix: 'った', readingSuffix: 'った' },
    { textSuffix: 'って', readingSuffix: 'って' },
    { textSuffix: 'たない', readingSuffix: 'たない' },
    { textSuffix: 'てば', readingSuffix: 'てば' },
  ],
  る: [
    { textSuffix: 'ります', readingSuffix: 'ります' },
    { textSuffix: 'りました', readingSuffix: 'りました' },
    { textSuffix: 'った', readingSuffix: 'った' },
    { textSuffix: 'って', readingSuffix: 'って' },
    { textSuffix: 'らない', readingSuffix: 'らない' },
    { textSuffix: 'れば', readingSuffix: 'れば' },
  ],
  く: [
    { textSuffix: 'きます', readingSuffix: 'きます' },
    { textSuffix: 'いた', readingSuffix: 'いた' },
    { textSuffix: 'いて', readingSuffix: 'いて' },
    { textSuffix: 'かない', readingSuffix: 'かない' },
    { textSuffix: 'けば', readingSuffix: 'けば' },
  ],
  ぐ: [
    { textSuffix: 'ぎます', readingSuffix: 'ぎます' },
    { textSuffix: 'いだ', readingSuffix: 'いだ' },
    { textSuffix: 'いで', readingSuffix: 'いで' },
    { textSuffix: 'がない', readingSuffix: 'がない' },
    { textSuffix: 'げば', readingSuffix: 'げば' },
  ],
  す: [
    { textSuffix: 'します', readingSuffix: 'します' },
    { textSuffix: 'した', readingSuffix: 'した' },
    { textSuffix: 'して', readingSuffix: 'して' },
    { textSuffix: 'さない', readingSuffix: 'さない' },
    { textSuffix: 'せば', readingSuffix: 'せば' },
  ],
  む: [
    { textSuffix: 'みます', readingSuffix: 'みます' },
    { textSuffix: 'んだ', readingSuffix: 'んだ' },
    { textSuffix: 'んで', readingSuffix: 'んで' },
    { textSuffix: 'まない', readingSuffix: 'まない' },
    { textSuffix: 'めば', readingSuffix: 'めば' },
  ],
  ぶ: [
    { textSuffix: 'びます', readingSuffix: 'びます' },
    { textSuffix: 'んだ', readingSuffix: 'んだ' },
    { textSuffix: 'んで', readingSuffix: 'んで' },
    { textSuffix: 'ばない', readingSuffix: 'ばない' },
    { textSuffix: 'べば', readingSuffix: 'べば' },
  ],
  ぬ: [
    { textSuffix: 'にます', readingSuffix: 'にます' },
    { textSuffix: 'んだ', readingSuffix: 'んだ' },
    { textSuffix: 'んで', readingSuffix: 'んで' },
    { textSuffix: 'なない', readingSuffix: 'なない' },
    { textSuffix: 'ねば', readingSuffix: 'ねば' },
  ],
}

const ADJECTIVE_RULES: readonly InflectionRule[] = [
  { textSuffix: 'くない', readingSuffix: 'くない' },
  { textSuffix: 'かった', readingSuffix: 'かった' },
  { textSuffix: 'くて', readingSuffix: 'くて' },
]

// The common godan-る exceptions are kept small and explicit so ordinary
// ichidan verbs such as 食べる do not generate impossible forms such as 食べりました.
const GODAN_RU_EXCEPTIONS = new Set([
  '帰る',
  '走る',
  '知る',
  '切る',
  '入る',
  '要る',
  '減る',
  '滑る',
  '握る',
  '参る',
  '限る',
  '焦る',
  '喋る',
])

function addRules(
  result: InflectedSurface[],
  form: string,
  reading: string,
  rules: readonly InflectionRule[],
  remove = 1,
): void {
  const formStem = form.slice(0, -remove)
  const readingStem = reading.slice(0, -remove)
  for (const rule of rules) {
    const text = formStem + rule.textSuffix
    const surfaceReading = readingStem + rule.readingSuffix
    if (text !== form && surfaceReading !== reading)
      result.push({ text, reading: surfaceReading })
  }
}

/**
 * Generates a deliberately small set of common dictionary-form inflections.
 * This is not a morphological tokenizer: it only improves offline analysis
 * when the installed dictionary already contains the lemma.
 */
export function inflectedSurfaces(
  form: string,
  reading: string,
): readonly InflectedSurface[] {
  if (!form || !reading) return []
  const result: InflectedSurface[] = []
  const lastForm = [...form].at(-1)
  const lastReading = [...reading].at(-1)
  if (!lastForm || !lastReading) return result

  if (lastForm === 'る' && lastReading === 'る') {
    addRules(result, form, reading, ICHIDAN_RULES)
    if (GODAN_RU_EXCEPTIONS.has(form)) {
      const godanRules = GODAN_RULES['る']
      if (godanRules) addRules(result, form, reading, godanRules)
    }
  } else if (lastForm in GODAN_RULES) {
    const godanRules = GODAN_RULES[lastForm]
    if (godanRules) addRules(result, form, reading, godanRules)
  } else if (lastForm === 'い' && lastReading === 'い') {
    addRules(result, form, reading, ADJECTIVE_RULES)
  }
  return result
}
