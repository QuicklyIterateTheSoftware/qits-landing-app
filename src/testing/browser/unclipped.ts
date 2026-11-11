/**
 * Asserts that `panel` is drawn whole: its box inside the window, and what the window shows at each
 * of its four corners (`inset` pixels in) is the panel itself, not a scroll container that cuts it
 * off or something over it (qits-2081).
 */
export function expectUnclipped(panel: Element, inset = 3): void {
  const box = panel.getBoundingClientRect();
  const { clientWidth, clientHeight } = document.documentElement;
  expect(box.width).toBeGreaterThan(0);
  expect(box.height).toBeGreaterThan(0);
  expect(box.left).toBeGreaterThanOrEqual(0);
  expect(box.top).toBeGreaterThanOrEqual(0);
  expect(box.right).toBeLessThanOrEqual(clientWidth);
  expect(box.bottom).toBeLessThanOrEqual(clientHeight);
  const corners = [
    [box.left + inset, box.top + inset],
    [box.right - inset, box.top + inset],
    [box.left + inset, box.bottom - inset],
    [box.right - inset, box.bottom - inset],
  ];
  for (const [x, y] of corners) {
    const hit = document.elementFromPoint(x, y);
    expect(hit && panel.contains(hit), `the panel is what shows at (${x}, ${y})`).toBe(true);
  }
}
