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
  { textSuffix: 'ろ', readingSuffix: 'ろ' },
  { textSuffix: 'るな', readingSuffix: 'るな' },
  { textSuffix: 'られる', readingSuffix: 'られる' },
  { textSuffix: 'られます', readingSuffix: 'られます' },
  { textSuffix: 'られない', readingSuffix: 'られない' },
  { textSuffix: 'られなかった', readingSuffix: 'られなかった' },
  { textSuffix: 'られれば', readingSuffix: 'られれば' },
  { textSuffix: 'られた', readingSuffix: 'られた' },
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
    { textSuffix: 'え', readingSuffix: 'え' },
    { textSuffix: 'うな', readingSuffix: 'うな' },
    { textSuffix: 'える', readingSuffix: 'える' },
    { textSuffix: 'えます', readingSuffix: 'えます' },
    { textSuffix: 'えない', readingSuffix: 'えない' },
    { textSuffix: 'えなかった', readingSuffix: 'えなかった' },
    { textSuffix: 'えれば', readingSuffix: 'えれば' },
    { textSuffix: 'えた', readingSuffix: 'えた' },
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
    { textSuffix: 'て', readingSuffix: 'て' },
    { textSuffix: 'つな', readingSuffix: 'つな' },
    { textSuffix: 'てる', readingSuffix: 'てる' },
    { textSuffix: 'てます', readingSuffix: 'てます' },
    { textSuffix: 'てない', readingSuffix: 'てない' },
    { textSuffix: 'てなかった', readingSuffix: 'てなかった' },
    { textSuffix: 'てれば', readingSuffix: 'てれば' },
    { textSuffix: 'てた', readingSuffix: 'てた' },
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
    { textSuffix: 'れ', readingSuffix: 'れ' },
    { textSuffix: 'るな', readingSuffix: 'るな' },
    { textSuffix: 'れる', readingSuffix: 'れる' },
    { textSuffix: 'れます', readingSuffix: 'れます' },
    { textSuffix: 'れない', readingSuffix: 'れない' },
    { textSuffix: 'れなかった', readingSuffix: 'れなかった' },
    { textSuffix: 'れれば', readingSuffix: 'れれば' },
    { textSuffix: 'れた', readingSuffix: 'れた' },
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
    { textSuffix: 'け', readingSuffix: 'け' },
    { textSuffix: 'くな', readingSuffix: 'くな' },
    { textSuffix: 'ける', readingSuffix: 'ける' },
    { textSuffix: 'けます', readingSuffix: 'けます' },
    { textSuffix: 'けない', readingSuffix: 'けない' },
    { textSuffix: 'けなかった', readingSuffix: 'けなかった' },
    { textSuffix: 'ければ', readingSuffix: 'ければ' },
    { textSuffix: 'けた', readingSuffix: 'けた' },
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
    { textSuffix: 'げ', readingSuffix: 'げ' },
    { textSuffix: 'ぐな', readingSuffix: 'ぐな' },
    { textSuffix: 'げる', readingSuffix: 'げる' },
    { textSuffix: 'げます', readingSuffix: 'げます' },
    { textSuffix: 'げない', readingSuffix: 'げない' },
    { textSuffix: 'げなかった', readingSuffix: 'げなかった' },
    { textSuffix: 'げれば', readingSuffix: 'げれば' },
    { textSuffix: 'げた', readingSuffix: 'げた' },
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
    { textSuffix: 'せ', readingSuffix: 'せ' },
    { textSuffix: 'すな', readingSuffix: 'すな' },
    { textSuffix: 'せる', readingSuffix: 'せる' },
    { textSuffix: 'せます', readingSuffix: 'せます' },
    { textSuffix: 'せない', readingSuffix: 'せない' },
    { textSuffix: 'せなかった', readingSuffix: 'せなかった' },
    { textSuffix: 'せれば', readingSuffix: 'せれば' },
    { textSuffix: 'せた', readingSuffix: 'せた' },
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
    { textSuffix: 'め', readingSuffix: 'め' },
    { textSuffix: 'むな', readingSuffix: 'むな' },
    { textSuffix: 'める', readingSuffix: 'める' },
    { textSuffix: 'めます', readingSuffix: 'めます' },
    { textSuffix: 'めない', readingSuffix: 'めない' },
    { textSuffix: 'めなかった', readingSuffix: 'めなかった' },
    { textSuffix: 'めれば', readingSuffix: 'めれば' },
    { textSuffix: 'めた', readingSuffix: 'めた' },
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
    { textSuffix: 'べ', readingSuffix: 'べ' },
    { textSuffix: 'ぶな', readingSuffix: 'ぶな' },
    { textSuffix: 'べる', readingSuffix: 'べる' },
    { textSuffix: 'べます', readingSuffix: 'べます' },
    { textSuffix: 'べない', readingSuffix: 'べない' },
    { textSuffix: 'べなかった', readingSuffix: 'べなかった' },
    { textSuffix: 'べれば', readingSuffix: 'べれば' },
    { textSuffix: 'べた', readingSuffix: 'べた' },
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
    { textSuffix: 'ね', readingSuffix: 'ね' },
    { textSuffix: 'ぬな', readingSuffix: 'ぬな' },
    { textSuffix: 'ねる', readingSuffix: 'ねる' },
    { textSuffix: 'ねます', readingSuffix: 'ねます' },
    { textSuffix: 'ねない', readingSuffix: 'ねない' },
    { textSuffix: 'ねなかった', readingSuffix: 'ねなかった' },
    { textSuffix: 'ねれば', readingSuffix: 'ねれば' },
    { textSuffix: 'ねた', readingSuffix: 'ねた' },
  ],
}

const ADJECTIVE_RULES: readonly InflectionRule[] = [
  { textSuffix: 'くない', readingSuffix: 'くない' },
  { textSuffix: 'くなかった', readingSuffix: 'くなかった' },
  { textSuffix: 'かった', readingSuffix: 'かった' },
  { textSuffix: 'くて', readingSuffix: 'くて' },
  { textSuffix: 'ければ', readingSuffix: 'ければ' },
]

const PROGRESSIVE_SUFFIXES: readonly InflectionRule[] = [
  { textSuffix: 'いる', readingSuffix: 'いる' },
  { textSuffix: 'います', readingSuffix: 'います' },
  { textSuffix: 'いました', readingSuffix: 'いました' },
  { textSuffix: 'いない', readingSuffix: 'いない' },
  { textSuffix: 'いません', readingSuffix: 'いません' },
  { textSuffix: 'いませんでした', readingSuffix: 'いませんでした' },
  { textSuffix: 'いなかった', readingSuffix: 'いなかった' },
  { textSuffix: 'いた', readingSuffix: 'いた' },
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

function addProgressiveRules(
  result: InflectedSurface[],
  form: string,
  reading: string,
  textTeSuffix: string,
  readingTeSuffix: string,
): void {
  const formTe = form.slice(0, -1) + textTeSuffix
  const readingTe = reading.slice(0, -1) + readingTeSuffix
  for (const suffix of PROGRESSIVE_SUFFIXES) {
    result.push({
      text: formTe + suffix.textSuffix,
      reading: readingTe + suffix.readingSuffix,
    })
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
    addProgressiveRules(result, form, reading, 'て', 'て')
    if (GODAN_RU_EXCEPTIONS.has(form)) {
      const godanRules = GODAN_RULES['る']
      if (godanRules) {
        addRules(result, form, reading, godanRules)
        addProgressiveRules(result, form, reading, 'って', 'って')
      }
    }
  } else if (lastForm in GODAN_RULES) {
    const godanRules = GODAN_RULES[lastForm]
    if (godanRules) addRules(result, form, reading, godanRules)
    const teSuffix =
      lastForm === 'う' || lastForm === 'つ'
        ? 'って'
        : lastForm === 'く'
          ? 'いて'
          : lastForm === 'ぐ'
            ? 'いで'
            : lastForm === 'す'
              ? 'して'
              : 'んで'
    addProgressiveRules(result, form, reading, teSuffix, teSuffix)
  } else if (lastForm === 'い' && lastReading === 'い') {
    addRules(result, form, reading, ADJECTIVE_RULES)
  }
  return result
}
