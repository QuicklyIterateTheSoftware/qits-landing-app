import { page } from 'vitest/browser';

/**
 * The tallest element shot as one picture. A taller viewport is scaled down to fit the test
 * window, and an element taller than the viewport is cut off at its bottom.
 */
const FITS = 560;

/**
 * Screenshots of a work list's members (`app-work-list`), in order, one per member:
 * `<name>-<n>`. An epic board taller than the viewport is shot in parts, as the epic board's own
 * screenshots do: its bar, its column headings, then each row (`<name>-<n>-bar`,
 * `<name>-<n>-columns`, `<name>-<n>-row-<m>`).
 */
export async function shootMembers(list: Element, name: string): Promise<void> {
  const members = [...list.querySelectorAll(':scope > div > *')];
  for (const [i, member] of members.entries()) await shootMember(member, `${name}-${i + 1}`);
}

async function shootMember(member: Element, name: string): Promise<void> {
  const box = boxOf(member);
  if (!box) return;
  if (box.offsetHeight <= FITS) {
    await expect.element(page.elementLocator(box)).toMatchScreenshot(name);
    return;
  }
  if (member.tagName !== 'APP-EPIC-BOARD') throw new Error(`${name} is taller than the viewport`);
  const parts: [string, Element | null][] = [
    ['bar', member.querySelector('header')],
    ['columns', member.querySelector('ui-board > div:first-child')],
    ...[...member.querySelectorAll('ui-board-row')].map((row, i): [string, Element] => [
      `row-${i + 1}`,
      row,
    ]),
  ];
  for (const [part, found] of parts) {
    if (found instanceof HTMLElement) {
      await expect.element(page.elementLocator(found)).toMatchScreenshot(`${name}-${part}`);
    }
  }
}

/** What `element` draws: itself, or, for a `display: contents` host, its first child with a box. */
function boxOf(element: Element): HTMLElement | undefined {
  if (element instanceof HTMLElement && element.offsetHeight) return element;
  for (const child of element.children) {
    const box = boxOf(child);
    if (box) return box;
  }
  return undefined;
}
