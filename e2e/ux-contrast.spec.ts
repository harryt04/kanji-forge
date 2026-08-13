import { expect, test } from './fixtures'

type Rgba = { r: number; g: number; b: number; a: number }

test.describe('marketing hero contrast', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`${theme} theme keeps hero text readable over every ramp tile`, async ({
      page,
    }) => {
      await page.addInitScript((selectedTheme) => {
        window.localStorage.setItem('kanjiforge-theme', selectedTheme)
      }, theme)
      await page.goto('/')

      const measurements = await page.evaluate(() => {
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Canvas 2D context unavailable')

        const readColor = (value: string): Rgba => {
          context.clearRect(0, 0, 1, 1)
          context.fillStyle = value
          context.fillRect(0, 0, 1, 1)
          const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data
          return { r, g, b, a: a / 255 }
        }
        const composite = (foreground: Rgba, background: Rgba): Rgba => {
          const alpha = foreground.a + background.a * (1 - foreground.a)
          if (alpha === 0) return { r: 0, g: 0, b: 0, a: 0 }
          return {
            r:
              (foreground.r * foreground.a +
                background.r * background.a * (1 - foreground.a)) /
              alpha,
            g:
              (foreground.g * foreground.a +
                background.g * background.a * (1 - foreground.a)) /
              alpha,
            b:
              (foreground.b * foreground.a +
                background.b * background.a * (1 - foreground.a)) /
              alpha,
            a: alpha,
          }
        }
        const contrastRatio = (foreground: Rgba, background: Rgba): number => {
          const channel = (value: number): number => {
            const srgb = value / 255
            return srgb <= 0.03928
              ? srgb / 12.92
              : ((srgb + 0.055) / 1.055) ** 2.4
          }
          const luminance = (color: Rgba): number =>
            0.2126 * channel(color.r) +
            0.7152 * channel(color.g) +
            0.0722 * channel(color.b)
          const foregroundLuminance = luminance(foreground)
          const backgroundLuminance = luminance(background)
          const lighter = Math.max(foregroundLuminance, backgroundLuminance)
          const darker = Math.min(foregroundLuminance, backgroundLuminance)
          return (lighter + 0.05) / (darker + 0.05)
        }

        const root = getComputedStyle(document.documentElement)
        const panel = readColor(
          getComputedStyle(
            document.querySelector('[data-testid="marketing-hero-copy"]')!,
          ).backgroundColor,
        )
        const heading = readColor(
          getComputedStyle(
            document.querySelector('[data-testid="marketing-hero-heading"]')!,
          ).color,
        )
        const subhead = readColor(
          getComputedStyle(
            document.querySelector('[data-testid="marketing-hero-subhead"]')!,
          ).color,
        )
        const ramp = [0, 1, 2, 3, 4].map((level) =>
          readColor(root.getPropertyValue(`--level-${level}`)),
        )

        return ramp.map((tile, level) => ({
          level,
          heading: contrastRatio(heading, composite(panel, tile)),
          subhead: contrastRatio(subhead, composite(panel, tile)),
          panel,
        }))
      })

      for (const measurement of measurements) {
        expect(
          measurement.heading,
          `${theme} level ${measurement.level} H1 contrast`,
        ).toBeGreaterThanOrEqual(3)
        expect(
          measurement.subhead,
          `${theme} level ${measurement.level} subhead contrast`,
        ).toBeGreaterThanOrEqual(4.5)
      }
    })
  }
})
