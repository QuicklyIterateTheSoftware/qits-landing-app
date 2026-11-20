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
const NO_TASKS = 'a swarm service with no tasks';
const NO_SUCH_SERVICE = 'no such swarm service';
const SYSTEM = 'qits-system';

/** The services each state recorded its read for (the state's `serviceId`). */
const ARTIFACTS = 'dev-qits-artifacts';
const IDLE = 'dev-qits-idle';
const MISSING = 'no-such-service';

/**
 * Screenshots of one swarm service's page (qits-2345) inside the shell (`openRoute`), with no
 * project open, its one read (`getSwarmService`) answered with qits-system's recordings: "a single-
 * node swarm" (`dev-qits-artifacts`: two env keys, a label, a network, two mounts and two tasks,
 * the second Failed and shut down with its error; `service`), "a swarm service with no tasks"
 * (`dev-qits-idle`, `0/0`; `no-tasks`) and "no such swarm service" (404; `not-found`). The last two
 * skip themselves until the `@qits/system-golden-masters` pin records them. A read still open
 * (`loading`), a 503 (`unavailable`) and a 403 (`refused`) are statuses only.
 *
 * The page's one outcome, the crumb back to the services list, is followed once; the shell's are
 * shot once (`shootShellMenus`).
 */
describe('SwarmServicePage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideAppRoute()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    await page.viewport(800, 600);
  });

  /** The service's page, its read still open; tall enough for every section. */
  async function open(id: string) {
    await page.viewport(1140, 1400);
    const opened = await openRoute(`/system/swarm/services/${id}`);
    return { opened, read: () => http.expectOne(`/system/api/swarm/services/${id}`) };
  }

  /** The page of the service `state` recorded, answered. */
  async function render(state: string, id: string) {
    const { opened, read } = await open(id);
    read().flush(await goldenMaster(state, 'getSwarmService', SYSTEM));
    await opened.settled();
    return { opened, view: page.elementLocator(opened.page) };
  }

  /** Whether the pinned golden masters record `state`'s read (else the reader refuses it). */
  const recorded = (state: string) =>
    goldenMaster(state, 'getSwarmService', SYSTEM).then(
      () => true,
      () => false,
    );

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

  it('shows a service: its facts, rollout, keys, labels, mounts, networks and tasks', async () => {
    const { opened, view } = await render(SWARM, ARTIFACTS);
    await expect.element(view.getByRole('heading', { level: 2 })).toHaveTextContent(ARTIFACTS);
    await expect
      .element(view.getByRole('list', { name: 'Environment keys' }))
      .toMatchTextContent(/QITS_ENVIRONMENT\s*QITS_RESOURCE_DB_PASSWORD/);
    await expect
      .element(view.getByRole('list', { name: 'Labels' }))
      .toMatchTextContent('qits.platform.deployments.app-name=qits-artifacts');
    await expect
      .element(view.getByRole('table', { name: 'Mounts' }))
      .toMatchTextContent('dev-qits-artifacts-store');
    await expect
      .element(view.getByRole('table', { name: 'Networks' }))
      .toMatchTextContent('10.0.1.110/24');
    const tasks = view.getByRole('table', { name: 'Tasks' });
    expect(tasks.getByRole('row').elements()).toHaveLength(3);
    await expect.element(tasks).toMatchTextContent('Failed 4 hours ago');
    await expect.element(tasks).toMatchTextContent('No such container');
    // The root sidebar's System stays current below the section.
    await expect
      .element(
        page
          .elementLocator(opened.frame)
          .getByRole('navigation', { name: 'qits' })
          .getByRole('link', { name: 'System', exact: true }),
      )
      .toHaveAttribute('aria-current', 'page');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('service', { kind: 'DATA' });
    await shootShellMenus(opened, 'service');
  });

  it('says swarm has placed no task for a service', async (context) => {
    if (!(await recorded(NO_TASKS))) context.skip();
    const { opened, view } = await render(NO_TASKS, IDLE);
    await expect
      .element(view.getByRole('status'))
      .toMatchTextContent('Swarm has placed no task for this service.');
    await expect.element(view).toMatchTextContent('This service mounts nothing.');
    expect(view.getByRole('table', { name: 'Tasks' }).elements()).toHaveLength(0);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('no-tasks', { kind: 'NO_DATA' });
  });

  it('says there is no such service', async (context) => {
    if (!(await recorded(NO_SUCH_SERVICE))) context.skip();
    const { opened, read } = await open(MISSING);
    read().flush(await goldenMaster(NO_SUCH_SERVICE, 'getSwarmService', SYSTEM), {
      status: 404,
      statusText: 'Not Found',
    });
    await opened.settled();
    const view = page.elementLocator(opened.page);
    await expect.element(view).toMatchTextContent(`No swarm service ${MISSING}.`);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('not-found', { kind: 'NO_DATA' });
  });

  it('marks the page as loading, then says the swarm cannot be read, with Retry', async () => {
    const { opened, read } = await open(ARTIFACTS);
    const view = page.elementLocator(opened.page);
    await expect.element(view.getByRole('img', { name: 'Loading' }).first()).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loading', { kind: 'PENDING' });
    read().flush(null, { status: 503, statusText: 'Service Unavailable' });
    await opened.settled();
    await expect.element(view).toMatchTextContent('The swarm cannot be read right now.');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('unavailable', { kind: 'ERROR' });
    await view.getByRole('button', { name: 'Retry' }).click();
    await opened.idle();
    read().flush(await goldenMaster(SWARM, 'getSwarmService', SYSTEM));
    await opened.settled();
    await expect.element(view.getByRole('heading', { level: 2 })).toHaveTextContent(ARTIFACTS);
  });

  it('says reading the swarm needs an admin role on a 403', async () => {
    const { opened, read } = await open(ARTIFACTS);
    read().flush(null, { status: 403, statusText: 'Forbidden' });
    await opened.settled();
    const view = page.elementLocator(opened.page);
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent('Reading the swarm needs an admin role');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('refused', { kind: 'ERROR' });
  });

  it('reads the service again on Refresh', async () => {
    const { opened, view } = await render(SWARM, ARTIFACTS);
    await view.getByRole('button', { name: 'Refresh' }).click();
    await opened.idle();
    http
      .expectOne(`/system/api/swarm/services/${ARTIFACTS}`)
      .flush(await goldenMaster(SWARM, 'getSwarmService', SYSTEM));
    await opened.settled();
  });

  it('leads back to the swarm services', async () => {
    const { opened, view } = await render(SWARM, ARTIFACTS);
    await view.getByRole('link', { name: '← Swarm services' }).click();
    await leftFor(opened);
    expect(TestBed.inject(Router).url).toBe('/system/swarm/services');
  });
});
