/**
 * A stable colour for a name: the same name always gets the same colour, different names spread
 * over the hue circle. Lightness and chroma are fixed, so dark text stays readable on every one.
 * FNV-1a over the name's UTF-16 code units picks the hue.
 */
export function tagColour(name: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `oklch(85% 0.11 ${hash % 360})`;
}
