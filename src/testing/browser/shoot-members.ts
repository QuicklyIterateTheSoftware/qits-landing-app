import { page } from 'vitest/browser';

/**
 * The tallest element shot as one picture. A taller viewport is scaled down to fit the test
 * window, and an element taller than the viewport is cut off at its bottom.
 */
const FITS = 560;

/**
 * Screenshots of a work list's members (`app-work-list`), in order, one per member:
 * `<name>-<n>`. Each is shot with room around it, as the pattern specs' hosts leave it (`p-4
 * pb-8`): what sits on its edge, half outside (a lane's collapse button), is in the picture
 * whole. The room is a padded box laid around the member for the shot, with negative margins, so
 * nothing on the page moves. An epic board taller than the viewport is shot in parts, as the epic board's own
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
    await shootWithRoom(member, name);
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

/** Shoots `member` inside a box that leaves room around it, then puts it back as it was. */
async function shootWithRoom(member: Element, name: string): Promise<void> {
  const room = document.createElement('div');
  // A flex column as the list is, so the member is laid out as before; inline styles, as a class
  // used only here may be missing from the stylesheet.
  Object.assign(room.style, {
    display: 'flex',
    flexDirection: 'column',
    margin: '-1rem -1rem -2rem',
    padding: '1rem 1rem 2rem',
  });
  member.replaceWith(room);
  room.append(member);
  try {
    await expect.element(page.elementLocator(room)).toMatchScreenshot(name);
  } finally {
    room.replaceWith(member);
  }
}
