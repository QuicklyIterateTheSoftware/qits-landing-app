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
const NO_TASKS = 'a swarm node running no tasks';
const NO_SUCH_NODE = 'no such swarm node';
const SYSTEM = 'qits-system';

/** The node each state recorded its reads for (the state's `nodeId`). */
const NODE = 'iwbwrdui2z0n62kqcjfo1erwh';
const MISSING = 'no-such-node';

/**
 * Screenshots of one swarm node's page (qits-2347) inside the shell (`openRoute`), with no project
 * open, its two reads (`getSwarmNode`, `listSwarmNodeTasks`) answered with qits-system's
 * recordings: "a single-node swarm" (`fake-host`, Ready, Active, the Leader qits-system runs on,
 * two labels and two tasks, the second Failed and shut down with its error; `node`), "a swarm node
 * running no tasks" (the same node, its tasks `[]`; `no-tasks`) and "no such swarm node" (both
 * 404s; `not-found`). Each skips itself until the `@qits/system-golden-masters` pin records it. A
 * read still open (`loading`), a 503 (`unavailable`) and a 403 (`refused`) are statuses only.
 *
 * The page's one outcome, the crumb back to the nodes list, is followed once; the shell's are shot
 * once (`shootShellMenus`). Nothing announces a node change, so the page has no `refreshOn`:
 * Refresh is its only second read of each.
 */
describe('SwarmNodePage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideAppRoute()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    await page.viewport(800, 600);
  });

  /** The node's page, its two reads still open; tall enough for every section. */
  async function open(id: string) {
    await page.viewport(1140, 1100);
    const opened = await openRoute(`/system/swarm/nodes/${id}`);
    return {
      opened,
      node: () => http.expectOne(`/system/api/swarm/nodes/${id}`),
      tasks: () => http.expectOne(`/system/api/swarm/nodes/${id}/tasks`),
    };
  }

  /** The page of the node `state` recorded, both reads answered. */
  async function render(state: string, id = NODE) {
    const { opened, node, tasks } = await open(id);
    node().flush(await goldenMaster(state, 'getSwarmNode', SYSTEM));
    tasks().flush(await goldenMaster(state, 'listSwarmNodeTasks', SYSTEM));
    await opened.settled();
    return { opened, view: page.elementLocator(opened.page) };
  }

  /** Whether the pinned golden masters record `state`'s node page (else the reader refuses it). */
  const recorded = (state: string, operationId = 'listSwarmNodeTasks') =>
    goldenMaster(state, operationId, SYSTEM).then(
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

  it('shows a node: its status, facts, labels and tasks, marked as this node', async (context) => {
    if (!(await recorded(SWARM))) context.skip();
    const { opened, view } = await render(SWARM);
    await expect.element(view.getByRole('heading', { level: 1 })).toHaveTextContent('fake-host');
    await expect.element(view).toMatchTextContent(`${NODE} this node`);
    await expect
      .element(view)
      .toMatchTextContent(/Status\s*Ready\s*Availability\s*Active\s*Manager\s*Leader/);
    await expect
      .element(view)
      .toMatchTextContent(
        /Role\s*manager\s*Engine\s*29\.7\.2\s*OS\s*linux\s*Architecture\s*x86_64\s*CPUs\s*24\s*Memory\s*31\.2 GiB\s*Address\s*192\.168\.152\.4\s*Joined/,
      );
    await expect
      .element(view.getByRole('list', { name: 'Labels' }))
      .toMatchTextContent(/qits\.edge=true\s*zone=fsn1/);
    const tasks = view.getByRole('table', { name: 'Tasks' });
    const rows = tasks.getByRole('row').elements();
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toMatch(/Name\s*Slot\s*State\s*Desired\s*Error\s*Image/);
    expect(rows[2].textContent).toMatch(
      /dev-qits-artifacts\.1\s*1\s*Failed 5 hours ago\s*Shutdown\s*task: non-zero exit \(1\)/,
    );
    await expect.element(view).toMatchTextContent('2 tasks');
    // The root sidebar's System stays current below the section, and Nodes below it is the page a
    // node belongs to (its URL is within `/system/swarm/nodes`).
    const navigation = page.elementLocator(opened.frame).getByRole('navigation', { name: 'qits' });
    await expect
      .element(navigation.getByRole('link', { name: 'System', exact: true }))
      .toHaveAttribute('aria-current', 'true');
    await expect
      .element(navigation.getByRole('link', { name: 'Nodes', exact: true }))
      .toHaveAttribute('aria-current', 'page');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('node', { kind: 'DATA' });
    await shootShellMenus(opened, 'node');
  });

  it('says swarm runs no task on a node', async (context) => {
    if (!(await recorded(NO_TASKS))) context.skip();
    const { opened, view } = await render(NO_TASKS);
    await expect.element(view.getByRole('heading', { level: 1 })).toHaveTextContent('fake-host');
    await expect
      .element(view.getByRole('status'))
      .toMatchTextContent('Swarm runs no task on this node.');
    expect(view.getByRole('table', { name: 'Tasks' }).elements()).toHaveLength(0);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('no-tasks', { kind: 'NO_DATA' });
  });

  it('says there is no such node, and shows no tasks', async (context) => {
    if (!(await recorded(NO_SUCH_NODE, 'getSwarmNode'))) context.skip();
    const { opened, node, tasks } = await open(MISSING);
    node().flush(await goldenMaster(NO_SUCH_NODE, 'getSwarmNode', SYSTEM), {
      status: 404,
      statusText: 'Not Found',
    });
    tasks().flush(null, { status: 404, statusText: 'Not Found' });
    await opened.settled();
    const view = page.elementLocator(opened.page);
    await expect.element(view).toMatchTextContent(`No swarm node ${MISSING}.`);
    expect(view.getByRole('heading', { name: 'Tasks' }).elements()).toHaveLength(0);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('not-found', { kind: 'NO_DATA' });
  });

  it('marks the page as loading, then says the swarm cannot be read, with Retry', async (context) => {
    if (!(await recorded(SWARM))) context.skip();
    const { opened, node, tasks } = await open(NODE);
    const view = page.elementLocator(opened.page);
    await expect.element(view.getByRole('img', { name: 'Loading' }).first()).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loading', { kind: 'PENDING' });
    node().flush(null, { status: 503, statusText: 'Service Unavailable' });
    tasks().flush(null, { status: 503, statusText: 'Service Unavailable' });
    await opened.settled();
    await expect.element(view).toMatchTextContent('The swarm cannot be read right now.');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('unavailable', { kind: 'ERROR' });
    await view.getByRole('button', { name: 'Retry' }).click();
    await opened.idle();
    node().flush(await goldenMaster(SWARM, 'getSwarmNode', SYSTEM));
    await opened.settled();
    await expect.element(view.getByRole('heading', { level: 1 })).toHaveTextContent('fake-host');
  });

  it('says reading the swarm needs an admin role on a 403', async () => {
    const { opened, node, tasks } = await open(NODE);
    node().flush(null, { status: 403, statusText: 'Forbidden' });
    tasks().flush(null, { status: 403, statusText: 'Forbidden' });
    await opened.settled();
    const view = page.elementLocator(opened.page);
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent('Reading the swarm needs an admin role');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('refused', { kind: 'ERROR' });
  });

  it('reads the node and its tasks again on Refresh', async (context) => {
    if (!(await recorded(SWARM))) context.skip();
    const { opened, view } = await render(SWARM);
    await view.getByRole('button', { name: 'Refresh' }).click();
    await opened.idle();
    http
      .expectOne(`/system/api/swarm/nodes/${NODE}`)
      .flush(await goldenMaster(SWARM, 'getSwarmNode', SYSTEM));
    http
      .expectOne(`/system/api/swarm/nodes/${NODE}/tasks`)
      .flush(await goldenMaster(SWARM, 'listSwarmNodeTasks', SYSTEM));
    await opened.settled();
  });

  it('leads back to the swarm nodes', async (context) => {
    if (!(await recorded(SWARM))) context.skip();
    const { opened, view } = await render(SWARM);
    await view.getByRole('link', { name: '← Nodes' }).click();
    await leftFor(opened);
    expect(TestBed.inject(Router).url).toBe('/system/swarm/nodes');
  });
});
