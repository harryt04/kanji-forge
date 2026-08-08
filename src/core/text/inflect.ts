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
  { textSuffix: 'ませんでした', readingSuffix: 'ませんでした' },
  { textSuffix: 'ない', readingSuffix: 'ない' },
  { textSuffix: 'なかった', readingSuffix: 'なかった' },
  { textSuffix: 'て', readingSuffix: 'て' },
  { textSuffix: 'た', readingSuffix: 'た' },
  { textSuffix: 'れば', readingSuffix: 'れば' },
]

const GODAN_RULES: Readonly<Record<string, readonly InflectionRule[]>> = {
  う: [
    { textSuffix: 'います', readingSuffix: 'います' },
    { textSuffix: 'いました', readingSuffix: 'いました' },
    { textSuffix: 'いません', readingSuffix: 'いません' },
    { textSuffix: 'いませんでした', readingSuffix: 'いませんでした' },
    { textSuffix: 'った', readingSuffix: 'った' },
    { textSuffix: 'って', readingSuffix: 'って' },
    { textSuffix: 'わない', readingSuffix: 'わない' },
    { textSuffix: 'わなかった', readingSuffix: 'わなかった' },
    { textSuffix: 'えば', readingSuffix: 'えば' },
    { textSuffix: 'おう', readingSuffix: 'おう' },
  ],
  つ: [
    { textSuffix: 'ちます', readingSuffix: 'ちます' },
    { textSuffix: 'ちました', readingSuffix: 'ちました' },
    { textSuffix: 'ちません', readingSuffix: 'ちません' },
    { textSuffix: 'ちませんでした', readingSuffix: 'ちませんでした' },
    { textSuffix: 'った', readingSuffix: 'った' },
    { textSuffix: 'って', readingSuffix: 'って' },
    { textSuffix: 'たない', readingSuffix: 'たない' },
    { textSuffix: 'たなかった', readingSuffix: 'たなかった' },
    { textSuffix: 'てば', readingSuffix: 'てば' },
    { textSuffix: 'とう', readingSuffix: 'とう' },
  ],
  る: [
    { textSuffix: 'ります', readingSuffix: 'ります' },
    { textSuffix: 'りました', readingSuffix: 'りました' },
    { textSuffix: 'りません', readingSuffix: 'りません' },
    { textSuffix: 'りませんでした', readingSuffix: 'りませんでした' },
    { textSuffix: 'った', readingSuffix: 'った' },
    { textSuffix: 'って', readingSuffix: 'って' },
    { textSuffix: 'らない', readingSuffix: 'らない' },
    { textSuffix: 'らなかった', readingSuffix: 'らなかった' },
    { textSuffix: 'れば', readingSuffix: 'れば' },
    { textSuffix: 'ろう', readingSuffix: 'ろう' },
  ],
  く: [
    { textSuffix: 'きます', readingSuffix: 'きます' },
    { textSuffix: 'きました', readingSuffix: 'きました' },
    { textSuffix: 'きません', readingSuffix: 'きません' },
    { textSuffix: 'きませんでした', readingSuffix: 'きませんでした' },
    { textSuffix: 'いた', readingSuffix: 'いた' },
    { textSuffix: 'いて', readingSuffix: 'いて' },
    { textSuffix: 'かない', readingSuffix: 'かない' },
    { textSuffix: 'かなかった', readingSuffix: 'かなかった' },
    { textSuffix: 'けば', readingSuffix: 'けば' },
    { textSuffix: 'こう', readingSuffix: 'こう' },
  ],
  ぐ: [
    { textSuffix: 'ぎます', readingSuffix: 'ぎます' },
    { textSuffix: 'ぎました', readingSuffix: 'ぎました' },
    { textSuffix: 'ぎません', readingSuffix: 'ぎません' },
    { textSuffix: 'ぎませんでした', readingSuffix: 'ぎませんでした' },
    { textSuffix: 'いだ', readingSuffix: 'いだ' },
    { textSuffix: 'いで', readingSuffix: 'いで' },
    { textSuffix: 'がない', readingSuffix: 'がない' },
    { textSuffix: 'がなかった', readingSuffix: 'がなかった' },
    { textSuffix: 'げば', readingSuffix: 'げば' },
    { textSuffix: 'ごう', readingSuffix: 'ごう' },
  ],
  す: [
    { textSuffix: 'します', readingSuffix: 'します' },
    { textSuffix: 'しました', readingSuffix: 'しました' },
    { textSuffix: 'しません', readingSuffix: 'しません' },
    { textSuffix: 'しませんでした', readingSuffix: 'しませんでした' },
    { textSuffix: 'した', readingSuffix: 'した' },
    { textSuffix: 'して', readingSuffix: 'して' },
    { textSuffix: 'さない', readingSuffix: 'さない' },
    { textSuffix: 'さなかった', readingSuffix: 'さなかった' },
    { textSuffix: 'せば', readingSuffix: 'せば' },
    { textSuffix: 'そう', readingSuffix: 'そう' },
  ],
  む: [
    { textSuffix: 'みます', readingSuffix: 'みます' },
    { textSuffix: 'みました', readingSuffix: 'みました' },
    { textSuffix: 'みません', readingSuffix: 'みません' },
    { textSuffix: 'みませんでした', readingSuffix: 'みませんでした' },
    { textSuffix: 'んだ', readingSuffix: 'んだ' },
    { textSuffix: 'んで', readingSuffix: 'んで' },
    { textSuffix: 'まない', readingSuffix: 'まない' },
    { textSuffix: 'まなかった', readingSuffix: 'まなかった' },
    { textSuffix: 'めば', readingSuffix: 'めば' },
    { textSuffix: 'もう', readingSuffix: 'もう' },
  ],
  ぶ: [
    { textSuffix: 'びます', readingSuffix: 'びます' },
    { textSuffix: 'びました', readingSuffix: 'びました' },
    { textSuffix: 'びません', readingSuffix: 'びません' },
    { textSuffix: 'びませんでした', readingSuffix: 'びませんでした' },
    { textSuffix: 'んだ', readingSuffix: 'んだ' },
    { textSuffix: 'んで', readingSuffix: 'んで' },
    { textSuffix: 'ばない', readingSuffix: 'ばない' },
    { textSuffix: 'ばなかった', readingSuffix: 'ばなかった' },
    { textSuffix: 'べば', readingSuffix: 'べば' },
    { textSuffix: 'ぼう', readingSuffix: 'ぼう' },
  ],
  ぬ: [
    { textSuffix: 'にます', readingSuffix: 'にます' },
    { textSuffix: 'にました', readingSuffix: 'にました' },
    { textSuffix: 'にません', readingSuffix: 'にません' },
    { textSuffix: 'にませんでした', readingSuffix: 'にませんでした' },
    { textSuffix: 'んだ', readingSuffix: 'んだ' },
    { textSuffix: 'んで', readingSuffix: 'んで' },
    { textSuffix: 'なない', readingSuffix: 'なない' },
    { textSuffix: 'ななかった', readingSuffix: 'ななかった' },
    { textSuffix: 'ねば', readingSuffix: 'ねば' },
    { textSuffix: 'のう', readingSuffix: 'のう' },
  ],
}

const ADJECTIVE_RULES: readonly InflectionRule[] = [
  { textSuffix: 'くない', readingSuffix: 'くない' },
  { textSuffix: 'くなかった', readingSuffix: 'くなかった' },
  { textSuffix: 'かった', readingSuffix: 'かった' },
  { textSuffix: 'くて', readingSuffix: 'くて' },
  { textSuffix: 'ければ', readingSuffix: 'ければ' },
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
