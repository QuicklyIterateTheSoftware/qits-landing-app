import { tagColour } from './tag-colour';

describe('tagColour', () => {
  it('gives a name the same colour every time, at a fixed lightness and chroma per scheme', () => {
    expect(tagColour('Ordered campaign')).toBe(tagColour('Ordered campaign'));
    expect(tagColour('Ordered campaign')).toMatch(
      /^light-dark\(oklch\(85% 0\.11 \d{1,3}\), oklch\(48% 0\.1 \d{1,3}\)\)$/,
    );
  });

  it('spreads different names over the hue circle', () => {
    const names = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta'];
    const hues = names.map((n) => Number(tagColour(n).match(/oklch\(85% 0\.11 (\d+)\)/)![1]));
    // A hash, not a palette: two names may land close, but eight do not bunch up.
    expect(new Set(hues).size).toBeGreaterThanOrEqual(7);
    expect(new Set(hues.map((h) => Math.floor(h / 90))).size).toBeGreaterThanOrEqual(3);
  });
});
