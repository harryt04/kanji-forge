export interface StrokePoint {
  readonly x: number
  readonly y: number
}

function distance(a: StrokePoint, b: StrokePoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

/** Resample a polyline at evenly spaced arc-length positions. */
export function resamplePolyline(
  points: readonly StrokePoint[],
  count = 32,
): StrokePoint[] {
  if (count < 2) throw new Error('A stroke needs at least two samples.')
  if (points.length === 0) return []
  if (points.length === 1)
    return Array.from({ length: count }, () => points[0]!)

  const lengths = [0]
  for (let index = 1; index < points.length; index += 1) {
    lengths.push(
      lengths[index - 1]! + distance(points[index - 1]!, points[index]!),
    )
  }
  const total = lengths[lengths.length - 1]!
  if (total === 0) return Array.from({ length: count }, () => points[0]!)

  return Array.from({ length: count }, (_, sampleIndex) => {
    // Rounding can push the final target a hair past `total`, so clamp both the
    // target and the segment index; otherwise the walk runs off the end of
    // `lengths` and every sampled coordinate becomes NaN.
    const target = Math.min((total * sampleIndex) / (count - 1), total)
    let segment = 1
    while (segment < lengths.length - 1 && lengths[segment]! < target)
      segment += 1
    const start = points[segment - 1]!
    const end = points[Math.min(segment, points.length - 1)]!
    const span = lengths[segment]! - lengths[segment - 1]!
    const ratio = span === 0 ? 0 : (target - lengths[segment - 1]!) / span
    return {
      x: start.x + (end.x - start.x) * ratio,
      y: start.y + (end.y - start.y) * ratio,
    }
  })
}

function pointOnCubic(
  start: StrokePoint,
  control1: StrokePoint,
  control2: StrokePoint,
  end: StrokePoint,
  t: number,
): StrokePoint {
  const inverse = 1 - t
  return {
    x:
      inverse ** 3 * start.x +
      3 * inverse ** 2 * t * control1.x +
      3 * inverse * t ** 2 * control2.x +
      t ** 3 * end.x,
    y:
      inverse ** 3 * start.y +
      3 * inverse ** 2 * t * control1.y +
      3 * inverse * t ** 2 * control2.y +
      t ** 3 * end.y,
  }
}

function pointOnQuadratic(
  start: StrokePoint,
  control: StrokePoint,
  end: StrokePoint,
  t: number,
): StrokePoint {
  const inverse = 1 - t
  return {
    x: inverse ** 2 * start.x + 2 * inverse * t * control.x + t ** 2 * end.x,
    y: inverse ** 2 * start.y + 2 * inverse * t * control.y + t ** 2 * end.y,
  }
}

function reflect(point: StrokePoint, around: StrokePoint): StrokePoint {
  return { x: 2 * around.x - point.x, y: 2 * around.y - point.y }
}

/**
 * Flatten the subset of SVG path commands emitted by KanjiVG into a polyline.
 * Curves are deliberately sampled before arc-length resampling so this stays
 * usable in the pure node test environment as well as in the browser.
 */
export function flattenSvgPath(path: string): StrokePoint[] {
  const tokens =
    path.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? []
  const points: StrokePoint[] = []
  let index = 0
  let command = ''
  let current: StrokePoint = { x: 0, y: 0 }
  let subpathStart = current
  let lastCubicControl: StrokePoint | null = null
  let lastQuadraticControl: StrokePoint | null = null

  const isCommand = (token: string): boolean => /^[a-zA-Z]$/.test(token)
  const number = (): number => Number(tokens[index++])
  const nextPoint = (relative: boolean): StrokePoint => {
    const point = { x: number(), y: number() }
    return relative ? { x: current.x + point.x, y: current.y + point.y } : point
  }
  const addLine = (end: StrokePoint): void => {
    points.push(end)
    current = end
  }
  const addCubic = (
    control1: StrokePoint,
    control2: StrokePoint,
    end: StrokePoint,
  ): void => {
    for (let step = 1; step <= 20; step += 1)
      points.push(pointOnCubic(current, control1, control2, end, step / 20))
    current = end
  }
  const addQuadratic = (control: StrokePoint, end: StrokePoint): void => {
    for (let step = 1; step <= 16; step += 1)
      points.push(pointOnQuadratic(current, control, end, step / 16))
    current = end
  }

  while (index < tokens.length) {
    const token = tokens[index]!
    if (isCommand(token)) {
      command = token
      index += 1
    }
    if (!command) break
    const relative = command === command.toLowerCase()
    const normalized = command.toUpperCase()
    if (normalized === 'Z') {
      addLine(subpathStart)
      command = ''
      lastCubicControl = null
      lastQuadraticControl = null
      continue
    }
    const required = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7 }[
      normalized
    ]
    if (!required || index + required > tokens.length) break

    if (normalized === 'M') {
      const end = nextPoint(relative)
      points.push(end)
      current = end
      subpathStart = end
      command = relative ? 'l' : 'L'
    } else if (normalized === 'L') addLine(nextPoint(relative))
    else if (normalized === 'H') {
      const x = number()
      addLine({ x: relative ? current.x + x : x, y: current.y })
    } else if (normalized === 'V') {
      const y = number()
      addLine({ x: current.x, y: relative ? current.y + y : y })
    } else if (normalized === 'C') {
      const control1 = nextPoint(relative)
      const control2 = nextPoint(relative)
      const end = nextPoint(relative)
      addCubic(control1, control2, end)
      lastCubicControl = control2
    } else if (normalized === 'S') {
      const control1 = lastCubicControl
        ? reflect(lastCubicControl, current)
        : current
      const control2 = nextPoint(relative)
      const end = nextPoint(relative)
      addCubic(control1, control2, end)
      lastCubicControl = control2
    } else if (normalized === 'Q') {
      const control = nextPoint(relative)
      const end = nextPoint(relative)
      addQuadratic(control, end)
      lastQuadraticControl = control
    } else if (normalized === 'T') {
      const control: StrokePoint = lastQuadraticControl
        ? reflect(lastQuadraticControl, current)
        : current
      const end = nextPoint(relative)
      addQuadratic(control, end)
      lastQuadraticControl = control
    } else if (normalized === 'A') {
      // KanjiVG currently does not emit arcs; preserve an unknown arc as a line.
      number()
      number()
      number()
      number()
      number()
      addLine(nextPoint(relative))
    }
    if (normalized !== 'C' && normalized !== 'S') lastCubicControl = null
    if (normalized !== 'Q' && normalized !== 'T') lastQuadraticControl = null
  }
  return points
}
