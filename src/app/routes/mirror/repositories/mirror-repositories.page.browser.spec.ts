import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { page } from 'vitest/browser';
import { goldenMaster } from '../../../../testing/browser/golden-master';
import {
  openRoute,
  provideAppRoute,
  type OpenedRoute,
} from '../../../../testing/browser/app-route';
import { shootShellMenus } from '../../../../testing/browser/shell-menus';

const DEFAULT_CACHES = 'the default caches';
const NO_ROOTS = 'a mirror holding no cache roots';
const MIRROR = 'qits-mirror';
const ROOTS = '/mirror/api/repositories';

/**
 * Screenshots of the Mirror section's Caches page (qits-2471) inside the shell (`openRoute`), with
 * no project open, its one read (`listRepositories`) answered with qits-mirror's recordings: "the
 * default caches" (central, hub, npmjs, quay, redhat; `repositories`) and "a mirror holding no
 * cache roots" (`repositories: []`; `empty`, recorded from qits-mirror's qits-2471 release on,
 * skips itself on an older pin). A read still open (`loading`) and a 500 (`unavailable`: the
 * database not answering) are statuses only.
 *
 * A row's name opens the root's page (`open-mirror-repository`), whose read is answered with "the
 * default caches"' `listRepositoryPackages` (`hub`, nothing cached). The shell's outcomes are shot
 * once (`shootShellMenus`). Nothing announces a change to the roots, so Refresh is the only read
 * after the first.
 */
describe('MirrorRepositoriesPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideAppRoute()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    await page.viewport(800, 600);
  });

  /** Opens the Caches page, its read still open. */
  async function open(): Promise<OpenedRoute> {
    await page.viewport(1140, 900);
    return openRoute('/mirror/repositories');
  }

  /** Answers the read from `state`'s recording. */
  async function answer(opened: OpenedRoute, state: string) {
    http.expectOne(ROOTS).flush(await goldenMaster(state, 'listRepositories', MIRROR));
    await opened.settled();
  }

  /** The Caches page, answered from `state`. */
  async function render(state: string) {
    const opened = await open();
    await answer(opened, state);
    return { opened, view: page.elementLocator(opened.page) };
  }

  it('lists every cache root, maven and npm included, in the server’s order', async () => {
    const { opened, view } = await render(DEFAULT_CACHES);
    await expect
      .element(view.getByRole('heading', { name: 'Cached repositories', exact: true }))
      .toBeVisible();
    await expect.element(view).toMatchTextContent('5 cache roots');
    const table = view.getByRole('table', { name: 'Cache roots' });
    const rows = table.getByRole('row').elements();
    expect(rows).toHaveLength(6);
    expect(rows[0].textContent).toMatch(
      /Name\s*Type\s*Upstream\s*Evicts unused after\s*Registered/,
    );
    expect(rows[1].textContent).toMatch(
      /central\s*maven-proxy\s*https:\/\/repo1\.maven\.org\/maven2\s*90 days/,
    );
    expect(rows[2].textContent).toMatch(/hub\s*oci-mirror\s*docker\.io\s*30 days/);
    expect(rows[3].textContent).toMatch(
      /npmjs\s*npm-proxy\s*https:\/\/registry\.npmjs\.org\s*30 days/,
    );
    expect(rows[4].textContent).toContain('quay');
    expect(rows[5].textContent).toContain('redhat');
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
      .toMatchScreenshot('repositories', { kind: 'DATA' });
    await shootShellMenus(opened, 'repositories');
  });

  it('open-mirror-repository repository: a root’s name opens its page', async () => {
    const { opened, view } = await render(DEFAULT_CACHES);
    const link = view.getByRole('link', { name: 'hub', exact: true });
    await expect.element(link).toHaveAttribute('href', '/mirror/repositories/hub');
    await link.click();
    await opened.idle();
    http
      .expectOne(`${ROOTS}/hub/packages`)
      .flush(await goldenMaster(DEFAULT_CACHES, 'listRepositoryPackages', MIRROR));
    await opened.settled();
    expect(TestBed.inject(Router).url).toBe('/mirror/repositories/hub');
  });

  it('says a mirror holding no cache root holds none', async (context) => {
    // qits-mirror records the state from a later release than the pinned one: until the pin
    // reaches it (and the pact holds it), the reader refuses it and the test skips itself.
    const recorded = await goldenMaster(NO_ROOTS, 'listRepositories', MIRROR).catch(
      () => undefined,
    );
    if (!recorded) context.skip();
    const { opened, view } = await render(NO_ROOTS);
    await expect
      .element(view.getByRole('status'))
      .toMatchTextContent('This mirror holds no cache root.');
    expect(view.getByRole('table').elements()).toHaveLength(0);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('empty', { kind: 'NO_DATA' });
  });

  it('marks the page as loading, then says the caches cannot be read, with Retry', async () => {
    const opened = await open();
    const view = page.elementLocator(opened.page);
    await expect.element(view.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loading', { kind: 'PENDING' });
    http.expectOne(ROOTS).flush(null, { status: 500, statusText: 'Internal Server Error' });
    await opened.settled();
    await expect.element(view.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect.element(view).toMatchTextContent('The mirror’s caches cannot be read right now.');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('unavailable', { kind: 'ERROR' });
    await view.getByRole('button', { name: 'Retry' }).click();
    await opened.idle();
    await answer(opened, DEFAULT_CACHES);
    await expect
      .element(view.getByRole('table', { name: 'Cache roots' }))
      .toMatchTextContent('npmjs');
  });

  it('reads the roots again on Refresh', async () => {
    const { opened, view } = await render(DEFAULT_CACHES);
    await view.getByRole('button', { name: 'Refresh' }).click();
    await opened.idle();
    await answer(opened, DEFAULT_CACHES);
  });
});
