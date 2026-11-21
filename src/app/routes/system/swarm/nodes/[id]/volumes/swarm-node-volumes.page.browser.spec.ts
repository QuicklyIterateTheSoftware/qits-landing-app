import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { page, userEvent } from 'vitest/browser';
import { goldenMaster } from '../../../../../../../testing/browser/golden-master';
import {
  openRoute,
  provideAppRoute,
  type OpenedRoute,
} from '../../../../../../../testing/browser/app-route';
import { shootShellMenus } from '../../../../../../../testing/browser/shell-menus';

const SWARM = 'a single-node swarm';
const NO_VOLUMES = 'a node holding no volumes';
const REMOTE = 'a swarm node this service cannot reach';
const SYSTEM = 'qits-system';

/** The recorded node (the state's `nodeId`), and the node the 409 was recorded for. */
const NODE = 'iwbwrdui2z0n62kqcjfo1erwh';
const OTHER = 'no-such-node';

/**
 * Screenshots of a swarm node page's Volumes tab (qits-2355) inside the shell and the node's
 * layout (`openRoute`), with no project open. The layout's two reads are qits-system's "a
 * single-node swarm" (`fake-host`, the node qits-system runs on); the tab's read is its recording
 * of the node's volumes: "a single-node swarm" (three volumes, the anonymous one hidden until "Show
 * anonymous volumes"; `volumes`, `anonymous`), "a node holding no volumes" (`empty`) and "a swarm
 * node this service cannot reach" (a 409 `NODE_REMOTE`, `remote`). Each skips itself until the
 * `@qits/system-golden-masters` pin records qits-2355's states (and the committed pact uses them).
 * A read still open (`loading`), a 503 (`unavailable`) and a 403 are statuses only. A node that is
 * not `self` (which no recording holds) reads nothing: the page's plain spec shows it.
 *
 * Its outcomes are each reached once: the layout's Volumes tab (`switch-swarm-node-tab` `volumes`)
 * and the checkbox (`toggle-anonymous-volumes` `toggled`, a stay, followed by `anonymous`).
 * Nothing announces a volume change, so the tab has no `refreshOn`: Refresh is its only second read.
 */
describe('SwarmNodeVolumesPage (screenshots)', () => {
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

  /** Whether the pinned golden masters (and the committed pact) record `state`'s read. */
  const recorded = (state: string, operationId = 'listNodeVolumes') =>
    goldenMaster(state, operationId, SYSTEM).then(
      () => true,
      () => false,
    );

  /** Whether the pin records qits-2355's volumes (its new states mark it). */
  const volumesRecorded = () => recorded(NO_VOLUMES);

  /**
   * The tab of node `id` (its `?query`), the layout's reads answered with the recorded node and
   * its tasks; the tab's own read still open. Tall enough for the node and the tab.
   */
  async function open(id = NODE, query = '') {
    await page.viewport(1140, 1200);
    const opened = await openRoute(`/system/swarm/nodes/${id}/volumes${query}`);
    http
      .expectOne(`/system/api/swarm/nodes/${id}`)
      .flush(await goldenMaster(SWARM, 'getSwarmNode', SYSTEM));
    http
      .expectOne(`/system/api/swarm/nodes/${id}/tasks`)
      .flush(await goldenMaster(SWARM, 'listSwarmNodeTasks', SYSTEM));
    await opened.settled();
    return {
      opened,
      view: page.elementLocator(opened.page),
      volumes: () => http.expectOne(`/system/api/nodes/${id}/volumes`),
    };
  }

  /** The tab of the recorded node, its read answered with `state`'s volumes. */
  async function render(state: string, query = '') {
    const shown = await open(NODE, query);
    shown.volumes().flush(await goldenMaster(state, 'listNodeVolumes', SYSTEM));
    await shown.opened.settled();
    return shown;
  }

  /** Answers every read the page left for makes with a 404 (a status only): not this spec's. */
  async function leftFor(opened: OpenedRoute) {
    for (let round = 0, quiet = 0; round < 20 && quiet < 2; round++) {
      await opened.idle();
      const open = http.match(() => true).filter((request) => !request.cancelled);
      for (const request of open) request.flush(null, { status: 404, statusText: 'Not Found' });
      quiet = open.length ? 0 : quiet + 1;
    }
  }

  it('lists the node’s volumes, the anonymous one hidden, the unused one marked', async (context) => {
    if (!(await volumesRecorded())) context.skip();
    const { opened, view } = await render(SWARM);
    await expect.element(view.getByRole('heading', { name: 'Volumes' })).toBeVisible();
    await expect.element(view).toMatchTextContent('2 volumes · 1 anonymous hidden');
    const table = view.getByRole('table', { name: 'Volumes' });
    const rows = table.getByRole('row').elements();
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toMatch(/Name\s*Driver\s*Labels\s*Mountpoint/);
    expect(rows[1].textContent).toMatch(/qits-shared-m2\s*local\s*—/);
    expect(rows[1].querySelector('ui-chip[label="unused"]')).toBeNull();
    expect(rows[2].textContent).toMatch(
      /qits-system-runner-work-ws-10207-d2616b57\s*unused\s*local\s*qits\.system\.runner=d2616b57-95a8-4e1b-865f-c10d8225ce5d\s*qits\.system\.runner\.work-key=ws-10207/,
    );
    expect(table.element().textContent).not.toContain('3f49f7508f53');
    await expect
      .element(view.getByRole('checkbox', { name: 'Show anonymous volumes' }))
      .not.toBeChecked();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('volumes', { kind: 'DATA' });
    await shootShellMenus(opened, 'volumes');
  });

  it('toggle-anonymous-volumes toggled: shows the anonymous volume, kept in the address', async (context) => {
    if (!(await volumesRecorded())) context.skip();
    const { opened, view } = await render(SWARM);
    await userEvent.click(view.getByRole('checkbox', { name: 'Show anonymous volumes' }));
    await opened.settled();
    expect(reached()).toEqual(['toggle-anonymous-volumes:toggled']);
    expect(TestBed.inject(Router).url).toBe(`/system/swarm/nodes/${NODE}/volumes?anonymous=1`);
    await expect.element(view).toMatchTextContent('3 volumes');
    const rows = view.getByRole('table', { name: 'Volumes' }).getByRole('row').elements();
    expect(rows).toHaveLength(4);
    expect(rows[3].textContent).toMatch(/3f49f7508f53\s*unused\s*anonymous\s*local\s*—/);
    expect(rows[3].querySelector('[data-name]')?.getAttribute('title')).toBe(
      '3f49f7508f534e3614ffc3bdd2c240800f208996d8ce4deb0f2dd9dd5e5e4dc0',
    );
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('anonymous', { kind: 'DATA' });
  });

  it('says a node holding no volumes holds none', async (context) => {
    if (!(await volumesRecorded())) context.skip();
    const { opened, view } = await render(NO_VOLUMES);
    await expect
      .element(view.getByRole('status'))
      .toMatchTextContent('This node holds no volumes.');
    expect(view.getByRole('table', { name: 'Volumes' }).elements()).toHaveLength(0);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('empty', { kind: 'NO_DATA' });
  });

  it('says only the node qits-system runs on can be read on a 409 NODE_REMOTE', async (context) => {
    if (!(await volumesRecorded())) context.skip();
    const { opened, view, volumes } = await open(OTHER);
    volumes().flush(await goldenMaster(REMOTE, 'listNodeVolumes', SYSTEM), {
      status: 409,
      statusText: 'Conflict',
    });
    await opened.settled();
    await expect
      .element(view.getByRole('status'))
      .toMatchTextContent('only the local node is reachable in this version');
    expect(view.getByRole('button', { name: 'Retry' }).elements()).toHaveLength(0);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('remote', { kind: 'NO_DATA' });
  });

  it('marks the tab as loading, then says the volumes cannot be read, with Retry', async (context) => {
    if (!(await recorded(SWARM, 'listSwarmNodeTasks'))) context.skip();
    const { opened, view, volumes } = await open();
    await expect.element(view.getByRole('img', { name: 'Loading' }).first()).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loading', { kind: 'PENDING' });
    volumes().flush(null, { status: 503, statusText: 'Service Unavailable' });
    await opened.settled();
    await expect.element(view).toMatchTextContent('The node’s volumes cannot be read right now.');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('unavailable', { kind: 'ERROR' });
    await view.getByRole('button', { name: 'Retry' }).click();
    await opened.idle();
    volumes().flush(null, { status: 503, statusText: 'Service Unavailable' });
    await opened.settled();
  });

  it('says reading the swarm needs an admin role on a 403', async (context) => {
    if (!(await recorded(SWARM, 'listSwarmNodeTasks'))) context.skip();
    const { opened, view, volumes } = await open();
    volumes().flush(null, { status: 403, statusText: 'Forbidden' });
    await opened.settled();
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent('Reading the swarm needs an admin role');
  });

  it('reads the volumes again on Refresh', async (context) => {
    if (!(await volumesRecorded())) context.skip();
    const { opened, view, volumes } = await render(SWARM);
    await view.getByRole('button', { name: 'Refresh' }).click();
    await opened.idle();
    volumes().flush(await goldenMaster(SWARM, 'listNodeVolumes', SYSTEM));
    await opened.settled();
    await expect.element(view).toMatchTextContent('2 volumes · 1 anonymous hidden');
  });

  it('switch-swarm-node-tab volumes: the node’s Volumes tab opens, marked current', async (context) => {
    if (!(await recorded(SWARM, 'listSwarmNodeTasks'))) context.skip();
    await page.viewport(1140, 1200);
    const opened = await openRoute(`/system/swarm/nodes/${NODE}`);
    http
      .expectOne(`/system/api/swarm/nodes/${NODE}`)
      .flush(await goldenMaster(SWARM, 'getSwarmNode', SYSTEM));
    http
      .expectOne(`/system/api/swarm/nodes/${NODE}/tasks`)
      .flush(await goldenMaster(SWARM, 'listSwarmNodeTasks', SYSTEM));
    await opened.settled();
    const tab = page
      .elementLocator(opened.frame)
      .getByRole('navigation', { name: 'Swarm node' })
      .getByRole('link', { name: 'Volumes' });
    await tab.click();
    await leftFor(opened);
    expect(reached()).toEqual(['switch-swarm-node-tab:volumes']);
    expect(TestBed.inject(Router).url).toBe(`/system/swarm/nodes/${NODE}/volumes`);
    await expect.element(tab).toHaveAttribute('aria-current', 'page');
  });
});
