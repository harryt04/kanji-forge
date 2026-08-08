import { flattenSvgPath, resamplePolyline, type StrokePoint } from './resample'

export type StrokeLeniency = 'strict' | 'normal' | 'forgiving'

export interface StrokeMatch {
  readonly accepted: boolean
  readonly startDistance: number
  readonly endDistance: number
  readonly shapeDistance: number
  readonly directionCosine: number
}

const LENIENCY_FACTOR: Record<StrokeLeniency, number> = {
  strict: 0.8,
  normal: 1,
  forgiving: 1.4,
}

function distance(a: StrokePoint, b: StrokePoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

interface Bounds {
  readonly minX: number
  readonly minY: number
  readonly width: number
  readonly height: number
}

function boundsFor(points: readonly StrokePoint[]): Bounds {
  const minX = Math.min(...points.map((point) => point.x))
  const maxX = Math.max(...points.map((point) => point.x))
  const minY = Math.min(...points.map((point) => point.y))
  const maxY = Math.max(...points.map((point) => point.y))
  return {
    minX,
    minY,
    width: maxX - minX || 1,
    height: maxY - minY || 1,
  }
}

function normalize(
  points: readonly StrokePoint[],
  bounds: Bounds,
): StrokePoint[] {
  return points.map((point) => ({
    x: (point.x - bounds.minX) / bounds.width,
    y: (point.y - bounds.minY) / bounds.height,
  }))
}

function directionCosine(
  actual: readonly StrokePoint[],
  expected: readonly StrokePoint[],
): number {
  let total = 0
  let compared = 0
  for (let index = 1; index < actual.length; index += 1) {
    const actualPoint = actual[index]!
    const previousActualPoint = actual[index - 1]!
    const expectedPoint = expected[index]!
    const previousExpectedPoint = expected[index - 1]!
    const ax = actualPoint.x - previousActualPoint.x
    const ay = actualPoint.y - previousActualPoint.y
    const ex = expectedPoint.x - previousExpectedPoint.x
    const ey = expectedPoint.y - previousExpectedPoint.y
    const actualLength = Math.hypot(ax, ay)
    const expectedLength = Math.hypot(ex, ey)
    if (actualLength === 0 || expectedLength === 0) continue
    total += (ax * ex + ay * ey) / (actualLength * expectedLength)
    compared += 1
  }
  return compared === 0 ? 1 : total / compared
}

/** Compare one user polyline with the next KanjiVG stroke. */
export function matchStroke(
  userStroke: readonly StrokePoint[],
  expectedPath: string,
  leniency: StrokeLeniency = 'normal',
): StrokeMatch {
  const expectedRaw = flattenSvgPath(expectedPath)
  if (userStroke.length < 2 || expectedRaw.length < 2) {
    return {
      accepted: false,
      startDistance: Infinity,
      endDistance: Infinity,
      shapeDistance: Infinity,
      directionCosine: -1,
    }
  }
  const expectedBounds = boundsFor(expectedRaw)
  const actual = normalize(resamplePolyline(userStroke), expectedBounds)
  const expected = normalize(resamplePolyline(expectedRaw), expectedBounds)
  const startDistance = distance(actual[0]!, expected[0]!)
  const endDistance = distance(actual.at(-1)!, expected.at(-1)!)
  const shapeDistance =
    actual.reduce(
      (total, point, index) => total + distance(point, expected[index]!),
      0,
    ) / actual.length
  const direction = directionCosine(actual, expected)
  const factor = LENIENCY_FACTOR[leniency]
  const accepted =
    startDistance < 0.22 * factor &&
    endDistance < 0.22 * factor &&
    shapeDistance < 0.14 * factor &&
    direction > 1 - 0.3 * factor
  return {
    accepted,
    startDistance,
    endDistance,
    shapeDistance,
    directionCosine: direction,
  }
}
