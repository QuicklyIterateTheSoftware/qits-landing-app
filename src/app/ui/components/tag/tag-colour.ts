/**
 * A stable colour for a name: the same name always gets the same colour, different names spread
 * over the hue circle. Lightness and chroma are fixed per scheme, so the fixed text colour
 * (`text-fg`) stays WCAG AA (4.5:1) readable on every hue in both light and dark: `oklch(85% 0.11
 * H)` against light `--color-fg` (`#111827`), `oklch(48% 0.1 H)` against dark `--color-fg`
 * (charcoal-brown-50, `oklch(96.36% 0.003 106.45)`) — verified across all 360 hues (minimum
 * contrast 10.25:1 light, 5.44:1 dark). `light-dark()` follows `color-scheme` on `:root`, set by
 * `data-theme`/`prefers-color-scheme` the same way the theme tokens do. FNV-1a over the name's
 * UTF-16 code units picks the hue.
 */
export function tagColour(name: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const hue = hash % 360;
  return `light-dark(oklch(85% 0.11 ${hue}), oklch(48% 0.1 ${hue}))`;
}
