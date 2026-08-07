import { describe, expect, it } from 'vitest';
import { eligibleComponent, pixelDice, rasterizeGlyph, similarityScore, TRIVIAL_COMPONENTS } from './build-similar-pack';

describe('similar-kanji raster scoring', () => {
  it('rasterizes pinned common-font glyphs deterministically without a DOM or canvas', async () => {
    const first = await rasterizeGlyph('未');
    const second = await rasterizeGlyph('未');
    expect([...first]).toEqual([...second]);
    expect(pixelDice(first, second)).toBe(1);
    expect(pixelDice(first, await rasterizeGlyph('末'))).toBeLessThan(1);
  });

  it('excludes elementary single-stroke KanjiVG components from candidate eligibility', () => {
    for (const component of ['一', '丨', '丿', '丶', '乙', '亅']) expect(TRIVIAL_COMPONENTS.has(component) && eligibleComponent(component)).toBe(false);
    expect(eligibleComponent('木')).toBe(true);
  });

  it('weights shared eligible components, stroke/radical identity, and pixels as documented', async () => {
    const pixels = await rasterizeGlyph('木');
    expect(similarityScore({ components: ['木'], stroke_count: 5, radical_classical: 75, pixels }, { components: ['木'], stroke_count: 5, radical_classical: 75, pixels })).toBe(1);
  });
});
