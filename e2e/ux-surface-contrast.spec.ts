import { expect, test } from './fixtures'

type Rgba = { r: number; g: number; b: number; a: number }

test.describe('surface contrast', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`${theme} card surface is distinct from the page background`, async ({
      page,
    }) => {
      await page.addInitScript((selectedTheme) => {
        window.localStorage.setItem('kanjiforge-theme', selectedTheme)
      }, theme)
      await page.goto('/')

      const measurement = await page.evaluate(() => {
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
        const contrastRatio = (first: Rgba, second: Rgba): number => {
          const firstLuminance = luminance(first)
          const secondLuminance = luminance(second)
          return (
            (Math.max(firstLuminance, secondLuminance) + 0.05) /
            (Math.min(firstLuminance, secondLuminance) + 0.05)
          )
        }
        const root = getComputedStyle(document.documentElement)
        const background = readColor(root.getPropertyValue('--background'))
        const card = readColor(root.getPropertyValue('--card'))
        const level4Border = root.getPropertyValue('--level-4-border')
        const borderAlpha = readColor(level4Border).a

        return {
          cardBackgroundContrast: contrastRatio(card, background),
          level4BorderAlpha: borderAlpha,
          background: root.getPropertyValue('--background').trim(),
          card: root.getPropertyValue('--card').trim(),
          level4Border: level4Border.trim(),
        }
      })

      expect(
        measurement.cardBackgroundContrast,
        `${theme} --card vs --background (${measurement.card} / ${measurement.background})`,
      ).toBeGreaterThanOrEqual(1.2)

      if (theme === 'dark') {
        // Canvas quantizes the CSS alpha to 8-bit color channels, so 0.35
        // resolves to approximately 0.349 in the rendered measurement.
        expect(
          measurement.level4BorderAlpha,
          `dark --level-4-border (${measurement.level4Border})`,
        ).toBeGreaterThanOrEqual(0.34)
      }
    })
  }
})
