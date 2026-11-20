import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { goldenMaster } from '../../../../testing/browser/golden-master';
import {
  openRoute,
  provideAppRoute,
  type OpenedRoute,
} from '../../../../testing/browser/app-route';
import { shootShellMenus } from '../../../../testing/browser/shell-menus';

const DEFAULT_CACHES = 'the default caches';
const NO_REGISTRIES = 'a mirror fronting no registries';
const MIRROR = 'qits-mirror';
const UPSTREAMS = '/mirror/api/upstreams';

/**
 * Screenshots of the Mirror section's OCI upstreams page (qits-2357) inside the shell
 * (`openRoute`), with no project open, its one read (`listUpstreams`) answered with qits-mirror's
 * recordings: "the default caches" (docker.io, quay.io and registry.access.redhat.com; `upstreams`)
 * and "a mirror fronting no registries" (`upstreams: []`; `empty`, which skips itself until the
 * `@qits/mirror-golden-masters` pin records it). A read still open (`loading`) and a 500
 * (`unavailable`: the database not answering) are statuses only.
 *
 * The page declares no outcome of its own: the shell's are shot once (`shootShellMenus`). Nothing
 * announces a change to the upstreams, so Refresh is the only read after the first.
 */
describe('MirrorUpstreamsPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideAppRoute()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    await page.viewport(800, 600);
  });

  /** Opens the upstreams page, its read still open. */
  async function open(): Promise<OpenedRoute> {
    await page.viewport(1140, 900);
    return openRoute('/mirror/upstreams');
  }

  /** Answers the read from `state`'s recording. */
  async function answer(opened: OpenedRoute, state: string) {
    http.expectOne(UPSTREAMS).flush(await goldenMaster(state, 'listUpstreams', MIRROR));
    await opened.settled();
  }

  /** The upstreams page, answered from `state`. */
  async function render(state: string) {
    const opened = await open();
    await answer(opened, state);
    return { opened, view: page.elementLocator(opened.page) };
  }

  it('lists the registries the mirror fronts, in the server’s order', async () => {
    const { opened, view } = await render(DEFAULT_CACHES);
    await expect
      .element(view.getByRole('heading', { name: 'OCI upstreams', exact: true }))
      .toBeVisible();
    await expect.element(view).toMatchTextContent('3 mirrored registries');
    const table = view.getByRole('table', { name: 'OCI upstreams' });
    const rows = table.getByRole('row').elements();
    expect(rows).toHaveLength(4);
    expect(rows[0].textContent).toMatch(/Host\s*Namespace\s*Cached images\s*Registered/);
    expect(rows[1].textContent).toContain('docker.io');
    expect(rows[1].textContent).toContain('hub');
    expect(rows[2].textContent).toContain('quay.io');
    expect(rows[3].textContent).toContain('registry.access.redhat.com');
    await expect.element(table).toMatchTextContent('1 Jan 2026 00:00:00Z');
    // The root sidebar's Mirror stays current below the section.
    await expect
      .element(
        page
          .elementLocator(opened.frame)
          .getByRole('navigation', { name: 'qits' })
          .getByRole('link', { name: 'Mirror', exact: true }),
      )
      .toHaveAttribute('aria-current', 'page');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('upstreams', { kind: 'DATA' });
    await shootShellMenus(opened, 'upstreams');
  });

  it('says a mirror fronting no registry fronts none', async (context) => {
    // qits-mirror records the state from a later release than the pinned one: until the pin
    // reaches it (and the pact holds it), the reader refuses it and the test skips itself.
    const recorded = await goldenMaster(NO_REGISTRIES, 'listUpstreams', MIRROR).catch(
      () => undefined,
    );
    if (!recorded) context.skip();
    const { opened, view } = await render(NO_REGISTRIES);
    await expect
      .element(view.getByRole('status'))
      .toMatchTextContent('This mirror fronts no registry.');
    expect(view.getByRole('table').elements()).toHaveLength(0);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('empty', { kind: 'NO_DATA' });
  });

  it('marks the page as loading, then says the upstreams cannot be read, with Retry', async () => {
    const opened = await open();
    const view = page.elementLocator(opened.page);
    await expect.element(view.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loading', { kind: 'PENDING' });
    http.expectOne(UPSTREAMS).flush(null, { status: 500, statusText: 'Internal Server Error' });
    await opened.settled();
    await expect.element(view.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect
      .element(view)
      .toMatchTextContent('The mirror’s upstreams cannot be read right now.');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('unavailable', { kind: 'ERROR' });
    await view.getByRole('button', { name: 'Retry' }).click();
    await opened.idle();
    await answer(opened, DEFAULT_CACHES);
    await expect
      .element(view.getByRole('table', { name: 'OCI upstreams' }))
      .toMatchTextContent('quay.io');
  });

  it('reads the upstreams again on Refresh', async () => {
    const { opened, view } = await render(DEFAULT_CACHES);
    await view.getByRole('button', { name: 'Refresh' }).click();
    await opened.idle();
    await answer(opened, DEFAULT_CACHES);
  });
});
