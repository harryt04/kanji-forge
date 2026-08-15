import { flattenSvgPath, resamplePolyline, type StrokePoint } from './resample'

export type StrokeLeniency = 'strict' | 'normal' | 'forgiving'

export interface StrokeMatch {
  readonly accepted: boolean
  /** Overall similarity in [0,1]. A stroke is accepted at or above the profile threshold. */
  readonly score: number
  readonly startDistance: number
  readonly endDistance: number
  readonly shapeDistance: number
  readonly directionCosine: number
}

/**
 * KanjiVG authors every glyph in a 109x109 box, and the writing surface uses the
 * same coordinates, so all distances below are in canvas units. Comparing in a
 * shared isotropic space is what keeps tolerance uniform: normalizing by a
 * single stroke's own per-axis bounding box collapses the tolerance to nothing
 * on thin strokes.
 */
export const STROKE_CANVAS = 109

const SAMPLES = 32

/** A stroke this short resamples into noisy chords, so direction is not scored. */
const SHORT_STROKE_LENGTH = 0.14 * STROKE_CANVAS

/** Minimum score to accept. The default profile is the "75% is good enough" bar. */
const ACCEPT_SCORE: Record<StrokeLeniency, number> = {
  strict: 0.84,
  normal: 0.75,
  forgiving: 0.64,
}

/** Widens or narrows every tolerance ramp and safety gate. */
const TOLERANCE_FACTOR: Record<StrokeLeniency, number> = {
  strict: 0.88,
  normal: 1,
  forgiving: 1.22,
}

/** Shortest the drawn stroke may be relative to the expected one. */
const MIN_LENGTH_RATIO: Record<StrokeLeniency, number> = {
  strict: 0.8,
  normal: 0.76,
  forgiving: 0.72,
}

/** Cosine between overall travel directions, below which the stroke went the wrong way. */
const MIN_NET_COSINE = 0.35

const CENTROID_GATE = 0.1 * STROKE_CANVAS
const START_GATE = 0.24 * STROKE_CANVAS

function distance(a: StrokePoint, b: StrokePoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high)
}

/** 1 when the distance is zero, falling linearly to 0 at the tolerance. */
function ramp(value: number, tolerance: number): number {
  return clamp(1 - value / tolerance, 0, 1)
}

function polylineLength(points: readonly StrokePoint[]): number {
  return points.reduce(
    (total, point, index) =>
      index === 0 ? 0 : total + distance(points[index - 1]!, point),
    0,
  )
}

function centroid(points: readonly StrokePoint[]): StrokePoint {
  return {
    x: points.reduce((total, point) => total + point.x, 0) / points.length,
    y: points.reduce((total, point) => total + point.y, 0) / points.length,
  }
}

/** Three-point average, so hand jitter does not inflate the measured length. */
function smooth(points: readonly StrokePoint[]): StrokePoint[] {
  return points.map((point, index) => {
    const previous = points[Math.max(0, index - 1)]!
    const next = points[Math.min(points.length - 1, index + 1)]!
    return {
      x: (previous.x + point.x + next.x) / 3,
      y: (previous.y + point.y + next.y) / 3,
    }
  })
}

function meanNearestDistance(
  from: readonly StrokePoint[],
  to: readonly StrokePoint[],
): number {
  return (
    from.reduce((total, point) => {
      let nearest = Infinity
      for (const candidate of to)
        nearest = Math.min(nearest, distance(point, candidate))
      return total + nearest
    }, 0) / from.length
  )
}

/**
 * Symmetric nearest-neighbour distance. Preferred over index-to-index distance
 * because it tolerates a user who over- or undershoots the end of the stroke.
 */
function chamferDistance(
  actual: readonly StrokePoint[],
  expected: readonly StrokePoint[],
): number {
  return (
    (meanNearestDistance(actual, expected) +
      meanNearestDistance(expected, actual)) /
    2
  )
}

/** Mean cosine between corresponding chords. */
function directionCosine(
  actual: readonly StrokePoint[],
  expected: readonly StrokePoint[],
): number {
  let total = 0
  let compared = 0
  for (let index = 1; index < actual.length; index += 1) {
    const ax = actual[index]!.x - actual[index - 1]!.x
    const ay = actual[index]!.y - actual[index - 1]!.y
    const ex = expected[index]!.x - expected[index - 1]!.x
    const ey = expected[index]!.y - expected[index - 1]!.y
    const actualLength = Math.hypot(ax, ay)
    const expectedLength = Math.hypot(ex, ey)
    if (actualLength < 1e-9 || expectedLength < 1e-9) continue
    total += (ax * ex + ay * ey) / (actualLength * expectedLength)
    compared += 1
  }
  return compared === 0 ? 1 : total / compared
}

/** Cosine between the two start-to-end vectors, which catches a reversed stroke. */
function netCosine(
  actual: readonly StrokePoint[],
  expected: readonly StrokePoint[],
): number {
  const ax = actual.at(-1)!.x - actual[0]!.x
  const ay = actual.at(-1)!.y - actual[0]!.y
  const ex = expected.at(-1)!.x - expected[0]!.x
  const ey = expected.at(-1)!.y - expected[0]!.y
  const actualLength = Math.hypot(ax, ay)
  const expectedLength = Math.hypot(ex, ey)
  if (actualLength < 1e-9 || expectedLength < 1e-9) return 1
  return (ax * ex + ay * ey) / (actualLength * expectedLength)
}

function rejected(partial: Partial<StrokeMatch> = {}): StrokeMatch {
  return {
    accepted: false,
    score: 0,
    startDistance: Infinity,
    endDistance: Infinity,
    shapeDistance: Infinity,
    directionCosine: -1,
    ...partial,
  }
}

/**
 * Compare one user polyline with the next KanjiVG stroke.
 *
 * Four weighted components produce a score in [0,1] so a stroke that is close
 * on every measure is accepted even when no single measure is perfect. A short
 * list of hard gates runs first, so no leniency setting can accept a stroke
 * drawn backwards, in the wrong place, or at the wrong size.
 */
export function matchStroke(
  userStroke: readonly StrokePoint[],
  expectedPath: string,
  leniency: StrokeLeniency = 'normal',
): StrokeMatch {
  const expectedRaw = flattenSvgPath(expectedPath)
  if (userStroke.length < 2 || expectedRaw.length < 2) return rejected()

  const expected = resamplePolyline(expectedRaw, SAMPLES)
  const actual = resamplePolyline(userStroke, SAMPLES)
  const expectedLength = polylineLength(expected)
  const actualLength = polylineLength(smooth(actual))
  if (!(expectedLength > 0) || !(actualLength > 0)) return rejected()

  const factor = TOLERANCE_FACTOR[leniency]
  const startDistance = distance(actual[0]!, expected[0]!)
  const endDistance = distance(actual.at(-1)!, expected.at(-1)!)
  const direction = directionCosine(actual, expected)
  const lengthRatio =
    Math.min(actualLength, expectedLength) /
    Math.max(actualLength, expectedLength)
  const actualCentroid = centroid(actual)
  const expectedCentroid = centroid(expected)
  const offset = distance(actualCentroid, expectedCentroid)

  // Shape is scored on the average of the raw and the centroid-aligned
  // comparison, which separates "wrong shape" from "right shape, wrong place".
  // Position is then judged on its own by the gates and the endpoint scores.
  const aligned = actual.map((point) => ({
    x: point.x - actualCentroid.x + expectedCentroid.x,
    y: point.y - actualCentroid.y + expectedCentroid.y,
  }))
  const shapeDistance =
    (chamferDistance(actual, expected) + chamferDistance(aligned, expected)) / 2

  const measured = {
    startDistance,
    endDistance,
    shapeDistance,
    directionCosine: direction,
  }

  if (lengthRatio < MIN_LENGTH_RATIO[leniency]) return rejected(measured)
  if (netCosine(actual, expected) < MIN_NET_COSINE) return rejected(measured)
  if (offset > CENTROID_GATE * factor) return rejected(measured)
  if (startDistance > START_GATE * factor) return rejected(measured)

  const endTolerance =
    clamp(0.45 * expectedLength, 0.16 * STROKE_CANVAS, 0.28 * STROKE_CANVAS) *
    factor
  const shapeTolerance =
    clamp(0.3 * expectedLength, 0.115 * STROKE_CANVAS, 0.18 * STROKE_CANVAS) *
    factor

  const startScore = ramp(startDistance, endTolerance)
  const endScore = ramp(endDistance, endTolerance)
  const shapeScore = ramp(shapeDistance, shapeTolerance)
  const lengthScore = ramp(1 - lengthRatio, 0.4)
  const directionScore = ramp(1 - direction, 1)

  const score =
    expectedLength < SHORT_STROKE_LENGTH
      ? 0.4 * startScore +
        0.26 * endScore +
        0.24 * shapeScore +
        0.1 * lengthScore
      : 0.24 * startScore +
        0.2 * endScore +
        0.3 * shapeScore +
        0.12 * lengthScore +
        0.14 * directionScore

  return { accepted: score >= ACCEPT_SCORE[leniency], score, ...measured }
}
