/**
 * The shell's own triggers, shown on the route that renders them (ticket qits-2225).
 *
 * The outcome check (`qits-angular screenshots --check --enforce-outcomes`) judges the shell's
 * declared exits per page route: each one a route's frozen HTML holds (the agents menu's "All
 * agents", an agent's row, a wait's request, the lightning menu's requests) must be listed in the
 * `triggers` of one of that route's own screenshots, and a trigger is listed only when it is
 * topmost at the centre of its box. A page spec's shots show the shell with its menus closed
 * (`openRoute`), so the menus' links are in the HTML and on no shot. `shootShellMenus` adds the
 * missing shots, one per top-bar menu whose panel holds a declared exit: it opens the menu from
 * its button, as a person does, answers what the opening reads, takes the shot and closes it.
 *
 * Call it at the end of a test that opened its page through `openRoute`, after the page has
 * settled and every read the spec answers was answered, so `freeze.route` is the page's route and
 * the menus show the data that test's frame reads gave them (`FrameReads`). An opening reads
 * again: the agents menu its agents (answered as the frame's read, in the spec's `reads.agents`
 * state, through `settled()`), and the lightning menu its runner slots and the active runs, which
 * no frame read answers; those are refused (403, an error answer is only a status, so no
 * recording and nothing in the route ledger): the slot line stays hidden and no run chip shows.
 *
 * Menus are mutually exclusive (a click outside one closes it), so each gets its own shot, named
 * `<name>-menu-<button label>`. Only DESKTOP: a dropdown is the same panel at every width but a
 * phone's sheet, and that sheet is `shell.layout.browser.spec.ts`'s.
 */
import { page, userEvent } from 'vitest/browser';
import type { ScreenshotKind } from '@qits/angular/testing/browser';
import type { OpenedRoute } from './app-route';

/** The reads a menu makes on opening that no frame read answers: refused. */
const REFUSED_ON_OPENING = [
  (url: string) => url === '/system/api/targets',
  (url: string) => url === '/ci/api/runs/active',
];

/** A top-bar menu: its button, and the panel the button controls. */
interface ShellMenu {
  readonly button: HTMLButtonElement;
  readonly panel: HTMLElement;
  readonly label: string;
}

/**
 * The top bar's dropdowns a person can open (the button is drawn: the trail's "…" is not on a wide
 * screen) whose panel holds a declared exit (`data-qits-outcome`).
 */
function menusWithTriggers(frame: HTMLElement): ShellMenu[] {
  const header = frame.querySelector('header');
  if (!header) throw new Error('shootShellMenus: the shell has no top bar');
  return [...header.querySelectorAll<HTMLButtonElement>('ui-dropdown > button[aria-controls]')]
    .map((button) => ({
      button,
      panel: document.getElementById(button.getAttribute('aria-controls')!) as HTMLElement,
      label: button.getAttribute('aria-label') ?? button.textContent?.trim() ?? '',
    }))
    .filter(
      ({ button, panel }) =>
        button.getClientRects().length > 0 && panel?.querySelector('[data-qits-outcome]'),
    );
}

/** A label as a screenshot name's part: `Release requests` → `release-requests`. */
const slug = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * Opens each top-bar menu of `opened`'s frame whose panel holds a declared exit, one at a time,
 * and screenshots the frame with it open (`<name>-menu-<label>`, DESKTOP), the page in the state
 * `kind` says (`DATA` unless given: the menus show the frame's data, the page its own).
 *
 * `answer` answers what the page itself reads again meanwhile (a page that reads on a timer, the
 * agent chat's transcript): it is called before each shot and once after the last.
 */
export async function shootShellMenus(
  opened: OpenedRoute,
  name: string,
  kind: ScreenshotKind = 'DATA',
  answer: () => Promise<void> = async () => {},
): Promise<void> {
  for (const { button, panel, label } of menusWithTriggers(opened.frame)) {
    await userEvent.click(button);
    // The opening's own reads: refuse those no frame read answers, then let the frame answer its.
    await opened.idle();
    for (const request of opened.http.match((req) =>
      REFUSED_ON_OPENING.some((matches) => matches(req.urlWithParams)),
    )) {
      request.flush(null, { status: 403, statusText: 'Forbidden' });
    }
    await answer();
    await opened.settled();
    expect(button.getAttribute('aria-expanded'), `the ${label} menu is open`).toBe('true');
    expect(panel.classList.contains('hidden')).toBe(false);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot(`${name}-menu-${slug(label)}`, {
        kind,
        viewports: ['DESKTOP'],
        reason: "an open menu's phone sheet is shell.layout.browser.spec.ts's",
      });
    await userEvent.keyboard('{Escape}');
    await opened.settled();
  }
  await answer();
}
