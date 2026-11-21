import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { page } from 'vitest/browser';
import { goldenMaster } from '../../../../../testing/browser/golden-master';
import {
  openRoute,
  provideAppRoute,
  type OpenedRoute,
} from '../../../../../testing/browser/app-route';
import { shootShellMenus } from '../../../../../testing/browser/shell-menus';

const SWARM = 'a single-node swarm';
const NO_CONFIGS = 'a swarm holding no configs';
const SYSTEM = 'qits-system';
const CONFIGS = '/system/api/swarm/configs';

/**
 * Screenshots of the System section's swarm configs page (qits-2348) inside the shell
 * (`openRoute`), with no project open, its one read (`listSwarmConfigs`) answered with
 * qits-system's recordings: "a single-node swarm" (`qits-edge-vhosts`, one label; `configs`) and
 * "a swarm holding no configs" (`[]`; `empty`, which skips itself until the
 * `@qits/system-golden-masters` pin records it). A read still open (`loading`) and a 503
 * (`unavailable`: the swarm not answering) are statuses only; so is a 403, which says the role.
 *
 * A row's name opens the config's page (`open-swarm-config`, qits-2349), whose read is answered
 * with the same state's `getSwarmConfig`. The shell's outcomes are shot once (`shootShellMenus`).
 * Nothing announces a config change, so the page has no `refreshOn`: Refresh is its only second
 * read.
 */
describe('SwarmConfigsPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideAppRoute()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    await page.viewport(800, 600);
  });

  /** Opens the configs page, its read still open. */
  async function open(): Promise<OpenedRoute> {
    await page.viewport(1140, 900);
    return openRoute('/system/swarm/configs');
  }

  /** Answers the read from `state`'s recording. */
  async function answer(opened: OpenedRoute, state: string) {
    http.expectOne(CONFIGS).flush(await goldenMaster(state, 'listSwarmConfigs', SYSTEM));
    await opened.settled();
  }

  /** Answers the read with `status` and no body (an error answer is only a status). */
  async function refuse(opened: OpenedRoute, status: number, statusText: string) {
    http.expectOne(CONFIGS).flush(null, { status, statusText });
    await opened.settled();
  }

  /** The configs page, answered from `state`. */
  async function render(state: string) {
    const opened = await open();
    await answer(opened, state);
    return { opened, view: page.elementLocator(opened.page) };
  }

  it('lists the swarm’s configs with their labels and docker’s dates', async () => {
    const [config] = await goldenMaster<{ createdAt: string; updatedAt: string }[]>(
      SWARM,
      'listSwarmConfigs',
      SYSTEM,
    );
    const { opened, view } = await render(SWARM);
    await expect
      .element(view.getByRole('heading', { name: 'Swarm configs', exact: true }))
      .toBeVisible();
    await expect.element(view).toMatchTextContent('1 config');
    const table = view.getByRole('table', { name: 'Configs' });
    const rows = table.getByRole('row').elements();
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toMatch(/Name\s*ID\s*Labels\s*Created\s*Updated/);
    expect(rows[1].textContent).toMatch(
      /qits-edge-vhosts\s*ktnbjxoalbkv\s*qits\.platform\.deployments\.target=platform/,
    );
    // Created and Updated are the recording's text, as served.
    const dates = [...rows[1].querySelectorAll('td')]
      .slice(3)
      .map((cell) => cell.textContent?.trim());
    expect(dates).toEqual([config.createdAt, config.updatedAt]);
    // The root sidebar's System stays current below the section, Configs below it the page.
    const navigation = page.elementLocator(opened.frame).getByRole('navigation', { name: 'qits' });
    await expect
      .element(navigation.getByRole('link', { name: 'System', exact: true }))
      .toHaveAttribute('aria-current', 'true');
    await expect
      .element(navigation.getByRole('link', { name: 'Configs', exact: true }))
      .toHaveAttribute('aria-current', 'page');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('configs', { kind: 'DATA' });
    await shootShellMenus(opened, 'configs');
  });

  it('says the swarm holds no configs', async (context) => {
    // qits-system records the state from a later release than the pinned one: until the pin
    // reaches it (and the pact holds it), the reader refuses it and the test skips itself.
    const recorded = await goldenMaster(NO_CONFIGS, 'listSwarmConfigs', SYSTEM).catch(
      () => undefined,
    );
    if (!recorded) context.skip();
    const { opened, view } = await render(NO_CONFIGS);
    await expect
      .element(view.getByRole('status'))
      .toMatchTextContent('This swarm holds no configs.');
    expect(view.getByRole('table').elements()).toHaveLength(0);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('empty', { kind: 'NO_DATA' });
  });

  it('marks the page as loading, then says the swarm cannot be read, with Retry', async () => {
    const opened = await open();
    const view = page.elementLocator(opened.page);
    await expect.element(view.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loading', { kind: 'PENDING' });
    await refuse(opened, 503, 'Service Unavailable');
    await expect.element(view.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect.element(view).toMatchTextContent('The swarm cannot be read right now.');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('unavailable', { kind: 'ERROR' });
    await view.getByRole('button', { name: 'Retry' }).click();
    await opened.idle();
    await answer(opened, SWARM);
    await expect
      .element(view.getByRole('table', { name: 'Configs' }))
      .toMatchTextContent('qits-edge-vhosts');
  });

  it('says reading the swarm needs an admin role on a 403', async () => {
    const opened = await open();
    await refuse(opened, 403, 'Forbidden');
    const view = page.elementLocator(opened.page);
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent('Reading the swarm needs an admin role');
    expect(view.getByRole('button', { name: 'Retry' }).elements()).toHaveLength(0);
  });

  it('opens a config’s page from its name', async () => {
    const { opened, view } = await render(SWARM);
    const link = view.getByRole('link', { name: 'qits-edge-vhosts', exact: true });
    const config = 'ktnbjxoalbkvbvedmg1urrz8h';
    await expect.element(link).toHaveAttribute('href', `/system/swarm/configs/${config}`);
    await link.click();
    await opened.idle();
    http
      .expectOne(`${CONFIGS}/${config}`)
      .flush(await goldenMaster(SWARM, 'getSwarmConfig', SYSTEM));
    await opened.settled();
    expect(TestBed.inject(Router).url).toBe(`/system/swarm/configs/${config}`);
  });

  it('reads the configs again on Refresh', async () => {
    const { opened, view } = await render(SWARM);
    await view.getByRole('button', { name: 'Refresh' }).click();
    await opened.idle();
    await answer(opened, SWARM);
  });
});
