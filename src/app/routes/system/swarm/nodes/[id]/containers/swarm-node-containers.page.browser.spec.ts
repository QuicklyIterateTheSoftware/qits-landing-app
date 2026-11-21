import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { page } from 'vitest/browser';
import { goldenMaster } from '../../../../../../../testing/browser/golden-master';
import {
  openRoute,
  provideAppRoute,
  type OpenedRoute,
} from '../../../../../../../testing/browser/app-route';
import { shootShellMenus } from '../../../../../../../testing/browser/shell-menus';

const SWARM = 'a single-node swarm';
const NO_CONTAINERS = 'a node running no containers';
const REMOTE_NODE = 'a swarm node this service cannot reach';
const SYSTEM = 'qits-system';

/** The node "a single-node swarm" recorded (its `nodeId`), the one qits-system runs on. */
const NODE = 'iwbwrdui2z0n62kqcjfo1erwh';

/** The recorded running container, whose log tail the state records. */
const RUNNING = 'b248472f7a8e00bba8cd036232373baed8856d90eb77b06c53f3eb0b321fdb17';

const LIST = `/system/api/nodes/${NODE}/containers?all=true`;
const LOGS = `/system/api/nodes/${NODE}/containers/${RUNNING}/logs?tail=200`;

/**
 * Screenshots of a swarm node's Containers tab (qits-2352) inside the node's page and the shell
 * (`openRoute`), with no project open. The layout's reads (`getSwarmNode`, `listSwarmNodeTasks`)
 * are answered with "a single-node swarm" (`fake-host`, `self`), the tab's own with qits-system's
 * recordings: its containers in "a single-node swarm" (one running and healthy, one exited and
 * unhealthy; `containers`, `stopped`, `all`), in "a node running no containers" (`[]`; `empty`)
 * and in "a swarm node this service cannot reach" (the 409 `NODE_REMOTE`, flushed onto this node's
 * read; `remote`); a container's last 200 lines in "a single-node swarm" (`logs`). A read still
 * open (`loading`) and a 503 (`unavailable`) are statuses only, as is the log's 404. Each skips
 * itself until the `@qits/system-golden-masters` pin records it at `?all=true`. A node that is not
 * `self` (no recording holds one) is the plain spec's.
 *
 * The tab reached from the bare node page records `switch-swarm-node-tab:containers` and carries
 * `aria-current`; nothing announces a container change, so Refresh is its only second read.
 */
describe('SwarmNodeContainersPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideAppRoute()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    await page.viewport(800, 600);
  });

  /** The outcomes the test reached, as their marks name them. */
  const reached = () => outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`);

  /** Whether the pinned golden masters record `state`'s containers read (else the reader refuses). */
  const recorded = (state: string) =>
    goldenMaster(state, 'listNodeContainers', SYSTEM).then(
      () => true,
      () => false,
    );

  /** The node's page at `url`, the layout's two reads answered; tall enough for the table. */
  async function open(url = `/system/swarm/nodes/${NODE}/containers`) {
    await page.viewport(1140, 1300);
    const opened = await openRoute(url);
    http
      .expectOne(`/system/api/swarm/nodes/${NODE}`)
      .flush(await goldenMaster(SWARM, 'getSwarmNode', SYSTEM));
    http
      .expectOne(`/system/api/swarm/nodes/${NODE}/tasks`)
      .flush(await goldenMaster(SWARM, 'listSwarmNodeTasks', SYSTEM));
    await opened.idle();
    return { opened, view: page.elementLocator(opened.page) };
  }

  /** The tab with its containers answered from `state`. */
  async function render(state = SWARM) {
    const { opened, view } = await open();
    http.expectOne(LIST).flush(await goldenMaster(state, 'listNodeContainers', SYSTEM));
    await opened.settled();
    return { opened, view };
  }

  /** The containers table's body rows, as text. */
  const rowTexts = (view: ReturnType<typeof page.elementLocator>) =>
    view
      .getByRole('table', { name: 'Containers' })
      .getByRole('row')
      .elements()
      .slice(1)
      .map((row) => row.textContent?.replace(/\s+/g, ' ').trim());

  /**
   * Lets the navigation an exit started finish, and answers every read the page it reached makes
   * from "a single-node swarm" when this spec knows it, else with a 404.
   */
  async function settleReads(opened: OpenedRoute) {
    for (let round = 0, quiet = 0; round < 20 && quiet < 2; round++) {
      await opened.idle();
      const open = http.match(() => true).filter((request) => !request.cancelled);
      for (const request of open) {
        if (request.request.urlWithParams.endsWith('/containers?all=true')) {
          request.flush(await goldenMaster(SWARM, 'listNodeContainers', SYSTEM));
        } else {
          request.flush(null, { status: 404, statusText: 'Not Found' });
        }
      }
      quiet = open.length ? 0 : quiet + 1;
    }
  }

  it('lists the running containers by default, the tab current', async (context) => {
    if (!(await recorded(SWARM))) context.skip();
    const { opened, view } = await render();
    const show = view.getByRole('group', { name: 'Show' });
    await expect
      .element(show.getByRole('button', { name: 'Running (1)' }))
      .toHaveAttribute('aria-pressed', 'true');
    await expect.element(show.getByRole('button', { name: 'Stopped (1)' })).toBeVisible();
    await expect.element(show.getByRole('button', { name: 'All (2)' })).toBeVisible();
    await expect.element(view).toMatchTextContent('1 running container, newest first.');
    const header = view.getByRole('table', { name: 'Containers' }).getByRole('row').first();
    await expect
      .element(header)
      .toMatchTextContent(/Name\s*Image\s*State\s*Health\s*Status\s*Created\s*Ports/);
    const rows = rowTexts(view);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatch(
      /dev-qits-ci\.1\.k4g0nn1ld7o272jl7fciatg6m\s*b248472f7a8e .*qits-ci:3e501b6 running\s*healthy Up 4 hours \(healthy\) 23 Aug 2026 8080\/tcp Logs/,
    );
    // No exec buttons: the terminal page and its buttons arrive with qits-2356.
    expect(view.getByRole('button', { name: /^(bash|sh)$/ }).elements()).toHaveLength(0);
    // The tab row is the layout's, outside the routed tab.
    await expect
      .element(
        page
          .elementLocator(opened.frame)
          .getByRole('navigation', { name: 'Swarm node' })
          .getByRole('link', {
            name: 'Containers',
          }),
      )
      .toHaveAttribute('aria-current', 'page');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('containers', { kind: 'DATA' });
    await shootShellMenus(opened, 'containers');
  });

  it('shows the stopped containers, and all of them, without reading again', async (context) => {
    if (!(await recorded(SWARM))) context.skip();
    const { opened, view } = await render();
    await view.getByRole('button', { name: 'Stopped (1)' }).click();
    await opened.idle();
    expect(rowTexts(view)).toHaveLength(1);
    expect(rowTexts(view)[0]).toMatch(
      /a-stopped-one\s*aa11bb22cc33 .*old:1 exited\s*— Exited \(137\) 3 days ago 20 Aug 2026 — Logs/,
    );
    await expect.element(view).toMatchTextContent('1 stopped container, newest first.');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('stopped', { kind: 'DATA' });
    await view.getByRole('button', { name: 'All (2)' }).click();
    await opened.idle();
    expect(rowTexts(view)).toHaveLength(2);
    await expect.element(view).toMatchTextContent('2 containers, newest first.');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('all', { kind: 'DATA' });
  });

  it('says the node runs no containers', async (context) => {
    if (!(await recorded(NO_CONTAINERS))) context.skip();
    const { opened, view } = await render(NO_CONTAINERS);
    await expect
      .element(view.getByRole('status'))
      .toHaveTextContent('No container is running on this node.');
    await view.getByRole('button', { name: 'All (0)' }).click();
    await opened.idle();
    await expect
      .element(view.getByRole('status'))
      .toHaveTextContent('This node runs no containers and has none stopped.');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('empty', { kind: 'NO_DATA' });
  });

  it('says only the node qits-system runs on can be read on a 409 NODE_REMOTE', async (context) => {
    if (!(await recorded(REMOTE_NODE))) context.skip();
    const { opened, view } = await open();
    http.expectOne(LIST).flush(await goldenMaster(REMOTE_NODE, 'listNodeContainers', SYSTEM), {
      status: 409,
      statusText: 'Conflict',
    });
    await opened.settled();
    await expect
      .element(view.getByRole('status'))
      .toMatchTextContent('Only the node qits-system runs on can be read; this is another node.');
    expect(view.getByRole('table', { name: 'Containers' }).elements()).toHaveLength(0);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('remote', { kind: 'NO_DATA' });
  });

  it('marks the tab as loading, then says the containers cannot be read, with Retry', async (context) => {
    if (!(await recorded(SWARM))) context.skip();
    const { opened, view } = await open();
    await expect.element(view.getByRole('img', { name: 'Loading' }).first()).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loading', { kind: 'PENDING' });
    http.expectOne(LIST).flush(null, { status: 503, statusText: 'Service Unavailable' });
    await opened.settled();
    await expect
      .element(view)
      .toMatchTextContent('The node’s containers cannot be read right now.');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('unavailable', { kind: 'ERROR' });
    await view.getByRole('button', { name: 'Retry' }).click();
    await opened.idle();
    http.expectOne(LIST).flush(await goldenMaster(SWARM, 'listNodeContainers', SYSTEM));
    await opened.settled();
    expect(rowTexts(view)).toHaveLength(1);
  });

  it('reads the containers again on Refresh', async (context) => {
    if (!(await recorded(SWARM))) context.skip();
    const { opened, view } = await render();
    await view
      .getByRole('region', { name: 'Containers' })
      .getByRole('button', { name: 'Refresh' })
      .click();
    await opened.idle();
    http.expectOne(LIST).flush(await goldenMaster(SWARM, 'listNodeContainers', SYSTEM));
    await opened.settled();
    expect(rowTexts(view)).toHaveLength(1);
  });

  it('shows a container’s last 200 lines, and closes them on a second press', async (context) => {
    if (!(await recorded(SWARM))) context.skip();
    const { opened, view } = await render();
    const logs = view.getByRole('button', {
      name: 'Logs of dev-qits-ci.1.k4g0nn1ld7o272jl7fciatg6m',
    });
    await logs.click();
    await opened.idle();
    http.expectOne(LOGS).flush(await goldenMaster(SWARM, 'getContainerLogs', SYSTEM));
    await opened.settled();
    expect(reached()).toEqual(['show-swarm-node-container-logs:opened']);
    const panel = view.getByRole('region', {
      name: 'dev-qits-ci.1.k4g0nn1ld7o272jl7fciatg6m, last 200 lines',
    });
    await expect
      .element(panel)
      .toMatchTextContent(/the first line of the log\s*the last line of the log/);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('logs', { kind: 'DATA' });
    await logs.click();
    await opened.idle();
    expect(panel.elements()).toHaveLength(0);
  });

  it('says a container is gone when its log answers 404', async (context) => {
    if (!(await recorded(SWARM))) context.skip();
    const { opened, view } = await render();
    await view
      .getByRole('button', { name: 'Logs of dev-qits-ci.1.k4g0nn1ld7o272jl7fciatg6m' })
      .click();
    await opened.idle();
    http.expectOne(LOGS).flush(null, { status: 404, statusText: 'Not Found' });
    await opened.settled();
    await expect
      .element(view.getByRole('status'))
      .toHaveTextContent('This container is gone; it was removed after the list was read.');
  });

  it('switch-swarm-node-tab containers: the bare node page opens its Containers tab', async (context) => {
    if (!(await recorded(SWARM))) context.skip();
    const { opened, view } = await open(`/system/swarm/nodes/${NODE}`);
    await opened.settled();
    // The bare node URL shows the node alone, with no redirect to a tab.
    expect(TestBed.inject(Router).url).toBe(`/system/swarm/nodes/${NODE}`);
    const tab = view
      .getByRole('navigation', { name: 'Swarm node' })
      .getByRole('link', { name: 'Containers' });
    await tab.click();
    await settleReads(opened);
    expect(reached()).toEqual(['switch-swarm-node-tab:containers']);
    expect(TestBed.inject(Router).url).toBe(`/system/swarm/nodes/${NODE}/containers`);
    await expect.element(tab).toHaveAttribute('aria-current', 'page');
  });
});
