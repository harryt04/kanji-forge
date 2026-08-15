/**
 * Bulk accuracy harness for the writing-page stroke matcher.
 *
 * Replays synthetic traces of every stroke in the KanjiVG packs and reports how
 * often each leniency profile accepts a genuine attempt and how often it accepts
 * a wrong one. Run it after touching `src/core/stroke/match.ts`:
 *
 *   npx tsx scripts/stroke-match-benchmark.ts
 *   npx tsx scripts/stroke-match-benchmark.ts --stride 1   # whole pack, slower
 */
import fs from 'node:fs'
import path from 'node:path'
import { matchStroke, STROKE_CANVAS } from '../src/core/stroke/match'
import {
  flattenSvgPath,
  resamplePolyline,
  type StrokePoint,
} from '../src/core/stroke/resample'
import type { StrokeLeniency } from '../src/core/stroke/match'

const PACK_DIR = path.join(process.cwd(), 'packs', 'strokes')
const PROFILES: readonly StrokeLeniency[] = ['strict', 'normal', 'forgiving']

const strideArg = process.argv.indexOf('--stride')
const STRIDE = strideArg === -1 ? 9 : Number(process.argv[strideArg + 1])

interface Entry {
  readonly character: string
  readonly path: string
  readonly index: number
  readonly paths: readonly string[]
}

function loadEntries(): Entry[] {
  const entries: Entry[] = []
  for (const file of fs.readdirSync(PACK_DIR)) {
    if (!file.startsWith('strokes-') || !file.endsWith('.json')) continue
    const pack = JSON.parse(
      fs.readFileSync(path.join(PACK_DIR, file), 'utf8'),
    ) as Record<string, { character: string; paths: string[] }>
    for (const record of Object.values(pack))
      record.paths.forEach((strokePath, index) =>
        entries.push({
          character: record.character,
          path: strokePath,
          index,
          paths: record.paths,
        }),
      )
  }
  return entries
}

/** Deterministic PRNG so runs are comparable across commits. */
function createRandom(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

/**
 * A plausible human trace: a small whole-stroke offset, a smooth low-frequency
 * wobble, and a little per-sample noise. `amplitude` is in canvas units.
 */
function simulateTrace(
  strokePath: string,
  amplitude: number,
  random: () => number,
): StrokePoint[] {
  const signed = (): number => random() * 2 - 1
  const reference = resamplePolyline(flattenSvgPath(strokePath), 24)
  const offsetX = amplitude * signed() * 0.8
  const offsetY = amplitude * signed() * 0.8
  const phaseX = signed() * Math.PI
  const phaseY = signed() * Math.PI
  const frequencyX = 1.5 + random() * 2
  const frequencyY = 2 + random() * 3
  return reference.map((point, index) => {
    const t = index / (reference.length - 1)
    return {
      x:
        point.x +
        offsetX +
        amplitude * 0.7 * Math.sin(frequencyX * Math.PI * t + phaseX) +
        amplitude * 0.25 * signed(),
      y:
        point.y +
        offsetY +
        amplitude * 0.7 * Math.sin(frequencyY * Math.PI * t + phaseY) +
        amplitude * 0.25 * signed(),
    }
  })
}

/** Largest deviation from the straight line joining the stroke's endpoints. */
function chordDeviation(strokePath: string): number {
  const points = resamplePolyline(flattenSvgPath(strokePath), 24)
  const first = points[0]!
  const last = points.at(-1)!
  const span = Math.hypot(last.x - first.x, last.y - first.y) || 1
  return Math.max(
    ...points.map(
      (point) =>
        Math.abs(
          (last.x - first.x) * (first.y - point.y) -
            (first.x - point.x) * (last.y - first.y),
        ) / span,
    ),
  )
}

function straightLine(strokePath: string): StrokePoint[] {
  const points = resamplePolyline(flattenSvgPath(strokePath), 24)
  const first = points[0]!
  const last = points.at(-1)!
  return Array.from({ length: 24 }, (_, index) => ({
    x: first.x + ((last.x - first.x) * index) / 23,
    y: first.y + ((last.y - first.y) * index) / 23,
  }))
}

function formatRow(label: string, rates: readonly string[]): string {
  return `${label.padEnd(34)}${rates.map((rate) => rate.padStart(11)).join('')}`
}

function percent(accepted: number, total: number): string {
  return total === 0 ? '—' : `${((accepted / total) * 100).toFixed(1)}%`
}

function main(): void {
  const entries = loadEntries().filter((_, index) => index % STRIDE === 0)
  console.log(
    `Stroke matcher benchmark — ${entries.length} strokes (stride ${STRIDE}), canvas ${STROKE_CANVAS}\n`,
  )
  console.log(
    formatRow('TRUE ACCEPT (traced correctly)', PROFILES as readonly string[]),
  )

  const qualities: readonly [string, number][] = [
    ['near-perfect (1u wobble)', 1],
    ['good (2.5u)', 2.5],
    ['decent (4u)', 4],
    ['sloppy (6u)', 6],
    ['very sloppy (9u)', 9],
    ['barely related (13u)', 13],
  ]
  for (const [label, amplitude] of qualities) {
    const rates = PROFILES.map((profile) => {
      const random = createRandom(7)
      let accepted = 0
      for (const entry of entries)
        if (
          matchStroke(
            simulateTrace(entry.path, amplitude, random),
            entry.path,
            profile,
          ).accepted
        )
          accepted += 1
      return percent(accepted, entries.length)
    })
    console.log(formatRow(label, rates))
  }

  console.log(
    `\n${formatRow('FALSE ACCEPT (must reject)', PROFILES as readonly string[])}`,
  )
  const wrongInputs: readonly [
    string,
    (entry: Entry) => StrokePoint[] | null,
  ][] = [
    [
      'reversed stroke',
      (entry) =>
        [...resamplePolyline(flattenSvgPath(entry.path), 24)].reverse(),
    ],
    [
      'different stroke, same kanji',
      (entry) =>
        entry.paths.length < 2
          ? null
          : resamplePolyline(
              flattenSvgPath(
                entry.paths[(entry.index + 1) % entry.paths.length]!,
              ),
              24,
            ),
    ],
    [
      'shifted 15u right',
      (entry) =>
        resamplePolyline(flattenSvgPath(entry.path), 24).map((point) => ({
          x: point.x + 15,
          y: point.y,
        })),
    ],
    [
      'half-length stub',
      (entry) => resamplePolyline(flattenSvgPath(entry.path), 24).slice(0, 12),
    ],
    [
      '150% overshoot',
      (entry) => {
        const points = resamplePolyline(flattenSvgPath(entry.path), 24)
        const first = points[0]!
        return points.map((point) => ({
          x: first.x + (point.x - first.x) * 1.5,
          y: first.y + (point.y - first.y) * 1.5,
        }))
      },
    ],
    [
      'straight line vs curved stroke',
      (entry) =>
        chordDeviation(entry.path) < 12 ? null : straightLine(entry.path),
    ],
  ]
  for (const [label, build] of wrongInputs) {
    const rates = PROFILES.map((profile) => {
      let accepted = 0
      let considered = 0
      for (const entry of entries) {
        const wrong = build(entry)
        if (!wrong) continue
        considered += 1
        if (matchStroke(wrong, entry.path, profile).accepted) accepted += 1
      }
      return percent(accepted, considered)
    })
    console.log(formatRow(label, rates))
  }
}

main()
