/**
 * A work reference's preview, shown on the route that draws the reference (ticket qits-2225).
 *
 * `app-work-ref` (`patterns/work/work-ref/`) declares two exits app-wide: the tag
 * (`open-work-ref-tag` `open`) and the id in its preview (`openFromPreview`). The preview is a
 * popover, always rendered and opened by CSS while the pointer or the focus is on the tag, so a
 * page drawing a reference holds the preview's link in its HTML and shows it on no shot. The
 * outcome check judges app-wide triggers per page route, so such a route needs one shot with a
 * preview open: `shootWorkRefPreview` focuses a reference's tag (the focus, not the pointer, so the
 * preview stays open while the shot is taken at its widths), shoots the frame and moves the focus
 * away again.
 */
import { page } from 'vitest/browser';
import type { OpenedRoute } from './app-route';

/**
 * Opens the preview of `tag` (a reference's tag link; the page's first reference unless given) and
 * screenshots `opened`'s frame with it open (`<name>-work-ref-preview`, kind `DATA`, DESKTOP).
 */
export async function shootWorkRefPreview(
  opened: OpenedRoute,
  name: string,
  tag: HTMLElement | null = opened.page.querySelector<HTMLElement>(
    'app-work-ref a[aria-describedby]',
  ),
): Promise<void> {
  if (!tag) throw new Error('shootWorkRefPreview: the page draws no work reference');
  const preview = document.getElementById(tag.getAttribute('aria-describedby') ?? '');
  tag.scrollIntoView({ block: 'center' });
  tag.focus();
  await opened.settled();
  expect(preview, 'the tag names its preview').not.toBeNull();
  await expect.element(page.elementLocator(preview!)).toBeVisible();
  await expect
    .element(page.elementLocator(opened.frame))
    .toMatchScreenshot(`${name}-work-ref-preview`, {
      kind: 'DATA',
      viewports: ['DESKTOP'],
      reason: "a preview's widths are work-ref.browser.spec.ts's",
    });
  tag.blur();
  await opened.settled();
}
