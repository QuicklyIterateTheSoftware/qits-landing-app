import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { page } from 'vitest/browser';
import { goldenMaster } from '../../../../../../testing/browser/golden-master';
import {
  openRoute,
  provideAppRoute,
  type OpenedRoute,
} from '../../../../../../testing/browser/app-route';
import { shootShellMenus } from '../../../../../../testing/browser/shell-menus';

const SWARM = 'a single-node swarm';
const SYSTEM = 'qits-system';

/** The recorded config's id, as the configs list links it. */
const CONFIG = 'ktnbjxoalbkvbvedmg1urrz8h';
const MISSING = 'no-such-config';

/**
 * Screenshots of one swarm config's page (qits-2349) inside the shell (`openRoute`), with no
 * project open, its one read (`getSwarmConfig`) answered with qits-system's recording "a
 * single-node swarm" (`qits-edge-vhosts`, one label, its data one line of text; `config`). A 404
 * (`not-found`), a read still open (`loading`), a 503 (`unavailable`) and a 403 (`refused`) are
 * statuses only.
 *
 * The page's one outcome, the crumb back to the configs list, is followed once; the shell's are
 * shot once (`shootShellMenus`). Nothing announces a config change, so the page has no
 * `refreshOn`: Refresh is its only second read.
 */
describe('SwarmConfigPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideAppRoute()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    await page.viewport(800, 600);
  });

  /** The config's page, its read still open. */
  async function open(id: string) {
    await page.viewport(1140, 900);
    const opened = await openRoute(`/system/swarm/configs/${id}`);
    return { opened, config: () => http.expectOne(`/system/api/swarm/configs/${id}`) };
  }

  /** The page of the config `state` recorded, its read answered. */
  async function render(state: string, id = CONFIG) {
    const { opened, config } = await open(id);
    config().flush(await goldenMaster(state, 'getSwarmConfig', SYSTEM));
    await opened.settled();
    return { opened, view: page.elementLocator(opened.page) };
  }

  /**
   * Lets the navigation an exit started finish, and answers every read the page it left for makes
   * with a 404 (an error answer is only a status): that page is its own spec's.
   */
  async function leftFor(opened: OpenedRoute) {
    for (let round = 0, quiet = 0; round < 20 && quiet < 2; round++) {
      await opened.idle();
      const open = http.match(() => true).filter((request) => !request.cancelled);
      for (const request of open) request.flush(null, { status: 404, statusText: 'Not Found' });
      quiet = open.length ? 0 : quiet + 1;
    }
  }

  it('shows a config: its id, instants, label and data verbatim', async () => {
    const recorded = await goldenMaster<{ data: string }>(SWARM, 'getSwarmConfig', SYSTEM);
    const { opened, view } = await render(SWARM);
    await expect
      .element(view.getByRole('heading', { level: 1 }))
      .toHaveTextContent('qits-edge-vhosts');
    await expect.element(view.getByRole('definition').first()).toHaveTextContent(CONFIG);
    await expect
      .element(view)
      .toMatchTextContent(
        /Created\s*18 Aug 2026 04:31:02Z\s*Updated\s*18 Aug 2026 04:31:02Z\s*Labels\s*qits\.platform\.deployments\.target=platform/,
      );
    const data = view.getByLabelText('Config data');
    await expect.element(data).toBeVisible();
    expect(data.element().textContent).toBe(recorded.data);
    // The root sidebar's System stays current below the section, and Configs below it is the page
    // a config belongs to (its URL is within `/system/swarm/configs`).
    const navigation = page.elementLocator(opened.frame).getByRole('navigation', { name: 'qits' });
    await expect
      .element(navigation.getByRole('link', { name: 'System', exact: true }))
      .toHaveAttribute('aria-current', 'true');
    await expect
      .element(navigation.getByRole('link', { name: 'Configs', exact: true }))
      .toHaveAttribute('aria-current', 'page');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('config', { kind: 'DATA' });
    await shootShellMenus(opened, 'config');
  });

  it('says there is no such config', async () => {
    const { opened, config } = await open(MISSING);
    config().flush(null, { status: 404, statusText: 'Not Found' });
    await opened.settled();
    const view = page.elementLocator(opened.page);
    await expect.element(view).toMatchTextContent(`No swarm config ${MISSING}.`);
    expect(view.getByRole('heading', { name: 'Data' }).elements()).toHaveLength(0);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('not-found', { kind: 'NO_DATA' });
  });

  it('marks the page as loading, then says the swarm cannot be read, with Retry', async () => {
    const { opened, config } = await open(CONFIG);
    const view = page.elementLocator(opened.page);
    await expect.element(view.getByRole('img', { name: 'Loading' }).first()).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loading', { kind: 'PENDING' });
    config().flush(null, { status: 503, statusText: 'Service Unavailable' });
    await opened.settled();
    await expect.element(view).toMatchTextContent('The swarm cannot be read right now.');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('unavailable', { kind: 'ERROR' });
    await view.getByRole('button', { name: 'Retry' }).click();
    await opened.idle();
    config().flush(await goldenMaster(SWARM, 'getSwarmConfig', SYSTEM));
    await opened.settled();
    await expect
      .element(view.getByRole('heading', { level: 1 }))
      .toHaveTextContent('qits-edge-vhosts');
  });

  it('says reading the swarm needs an admin role on a 403', async () => {
    const { opened, config } = await open(CONFIG);
    config().flush(null, { status: 403, statusText: 'Forbidden' });
    await opened.settled();
    const view = page.elementLocator(opened.page);
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent('Reading the swarm needs an admin role');
    expect(view.getByRole('button', { name: 'Retry' }).elements()).toHaveLength(0);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('refused', { kind: 'ERROR' });
  });

  it('reads the config again on Refresh', async () => {
    const { opened, view } = await render(SWARM);
    await view.getByRole('button', { name: 'Refresh' }).click();
    await opened.idle();
    http
      .expectOne(`/system/api/swarm/configs/${CONFIG}`)
      .flush(await goldenMaster(SWARM, 'getSwarmConfig', SYSTEM));
    await opened.settled();
  });

  it('leads back to the swarm configs', async () => {
    const { opened, view } = await render(SWARM);
    await view.getByRole('link', { name: '← Configs' }).click();
    await leftFor(opened);
    expect(TestBed.inject(Router).url).toBe('/system/swarm/configs');
  });
});
