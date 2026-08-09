import { describe, expect, it } from 'vitest'
import {
  MAX_ANALYZER_HISTORY,
  parseAnalyzerHistory,
  recordAnalyzerText,
  serializeAnalyzerHistory,
} from './analyzer-history'

describe('analyzer history', () => {
  it('normalizes, deduplicates, and limits stored text', () => {
    const history = parseAnalyzerHistory(
      JSON.stringify([
        ' 日本語 ',
        '日本語',
        null,
        ...Array.from({ length: 12 }, (_, index) => `text ${index}`),
      ]),
    )

    expect(history).toHaveLength(MAX_ANALYZER_HISTORY)
    expect(history[0]).toBe('日本語')
    expect(history).toEqual([
      '日本語',
      'text 0',
      'text 1',
      'text 2',
      'text 3',
      'text 4',
      'text 5',
      'text 6',
      'text 7',
      'text 8',
    ])
  })

  it('records a new analysis first and moves repeats to the front', () => {
    expect(recordAnalyzerText(['日本語', 'お金'], ' 日本語 ')).toEqual([
      '日本語',
      'お金',
    ])
    expect(recordAnalyzerText(['日本語'], ' お金 ')).toEqual(['お金', '日本語'])
    expect(recordAnalyzerText(['日本語'], '   ')).toEqual(['日本語'])
  })

  it('serializes only the normalized bounded form', () => {
    expect(serializeAnalyzerHistory([' 日本語 ', '日本語'])).toBe('["日本語"]')
    expect(parseAnalyzerHistory('not-json')).toEqual([])
  })
})
