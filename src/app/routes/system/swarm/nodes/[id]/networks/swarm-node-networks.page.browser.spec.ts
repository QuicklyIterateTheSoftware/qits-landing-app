import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { page } from 'vitest/browser';
import { goldenMaster } from '../../../../../../../testing/browser/golden-master';
import { openRoute, provideAppRoute } from '../../../../../../../testing/browser/app-route';

const SWARM = 'a single-node swarm';
const NO_NETWORKS = 'a node listing no networks';
const REMOTE = 'a swarm node this service cannot reach';
const SYSTEM = 'qits-system';

/** The node "a single-node swarm" recorded its page for (its `nodeId`). */
const NODE = 'iwbwrdui2z0n62kqcjfo1erwh';
const NETWORKS = `/system/api/nodes/${NODE}/networks`;

/**
 * Screenshots of a swarm node's Networks tab (qits-2354) inside the node layout and the shell
 * (`openRoute`), with no project open. The layout's two reads (`getSwarmNode`,
 * `listSwarmNodeTasks`) are answered with "a single-node swarm" (`fake-host`, the node qits-system
 * runs on, `self`); the tab's one read (`listNodeNetworks`) with qits-system's recordings: "a
 * single-node swarm" (its networks; `networks`), "a node listing no networks" (`[]`; `empty`) and
 * "a swarm node this service cannot reach" (409 `NODE_REMOTE`; `remote`). The last two skip
 * themselves until the `@qits/system-golden-masters` pin records them. A read still open
 * (`loading`) and a 503 (`unavailable`) are statuses only.
 *
 * The tab's link in the layout's row is current on the tab, and pressing it from the bare node
 * records `switch-swarm-node-tab:networks`. Nothing announces a network change, so the tab has no
 * `refreshOn`: its own Refresh is its only second read.
 */
describe('SwarmNodeNetworksPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideAppRoute()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    await page.viewport(800, 600);
  });

  /** Whether the pinned golden masters record `operationId` in `state` (else the reader refuses). */
  const recorded = (state: string, operationId = 'listNodeNetworks') =>
    goldenMaster(state, operationId, SYSTEM).then(
      () => true,
      () => false,
    );

  /** Whether the pin records the node's page the tab sits in. */
  const nodeRecorded = () => recorded(SWARM, 'listSwarmNodeTasks');

  /** Opens `url`, answering the layout's reads with the recorded node; the tab's read still open. */
  async function open(url = `/system/swarm/nodes/${NODE}/networks`) {
    await page.viewport(1140, 1100);
    const opened = await openRoute(url);
    http
      .expectOne(`/system/api/swarm/nodes/${NODE}`)
      .flush(await goldenMaster(SWARM, 'getSwarmNode', SYSTEM));
    http
      .expectOne(`/system/api/swarm/nodes/${NODE}/tasks`)
      .flush(await goldenMaster(SWARM, 'listSwarmNodeTasks', SYSTEM));
    await opened.settled();
    // The routed page is the innermost outlet's: the tab on its URL, the layout on the bare node's.
    // The layout's header and tab row are the node page's (`node`), around the tab.
    return {
      opened,
      view: page.elementLocator(opened.page),
      node: page.elementLocator(opened.page.closest('app-swarm-node-layout') ?? opened.page),
    };
  }

  /** The tab, its read answered from `state`. */
  async function render(state: string) {
    const { opened, view, node } = await open();
    http.expectOne(NETWORKS).flush(await goldenMaster(state, 'listNodeNetworks', SYSTEM));
    await opened.settled();
    return { opened, view, node };
  }

  /** The outcomes the test reached, as their marks name them. */
  const reached = () => outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`);

  it('lists the node’s networks, the tab current', async (context) => {
    if (!(await nodeRecorded())) context.skip();
    const { opened, view, node } = await render(SWARM);
    const recordedRows = await goldenMaster(SWARM, 'listNodeNetworks', SYSTEM);
    await expect.element(node.getByRole('heading', { level: 1 })).toHaveTextContent('fake-host');
    await expect
      .element(
        node
          .getByRole('navigation', { name: 'Swarm node' })
          .getByRole('link', { name: 'Networks' }),
      )
      .toHaveAttribute('aria-current', 'page');
    // The tab shows in the Tasks section's place.
    expect(node.getByRole('heading', { name: 'Tasks' }).elements()).toHaveLength(0);
    const rows = view.getByRole('table', { name: 'Networks' }).getByRole('row').elements();
    expect(rows).toHaveLength(recordedRows.length + 1);
    expect(rows[0].textContent).toMatch(/Name\s*ID\s*Driver\s*Scope\s*Labels\s*Created/);
    expect(rows[1].textContent).toMatch(
      /qits-net\s*mulnl3uqqi0h\s*overlay\s*swarm\s*—\s*18 Aug 2026 02:13:24Z/,
    );
    await expect
      .element(view)
      .toMatchTextContent(`${recordedRows.length} network${recordedRows.length === 1 ? '' : 's'}`);
    // From the pin that records the runner's lease bridge on: internal, labelled.
    if (recordedRows.length > 1) {
      expect(rows[2].textContent).toMatch(
        /qits-system-runner-leases-d2616b57\s*internal\s*c8c43a515890\s*bridge\s*local\s*qits\.system\.runner=d2616b57-95a8-4e1b-865f-c10d8225ce5d\s*15 Aug 2026 06:44:01Z/,
      );
    }
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('networks', { kind: 'DATA' });
  });

  it('says a node listing no networks lists none', async (context) => {
    if (!(await nodeRecorded()) || !(await recorded(NO_NETWORKS))) context.skip();
    const { opened, view } = await render(NO_NETWORKS);
    await expect
      .element(view.getByRole('status'))
      .toMatchTextContent(
        'This node lists no networks; a running docker daemon always has bridge, host and none.',
      );
    expect(view.getByRole('table', { name: 'Networks' }).elements()).toHaveLength(0);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('empty', { kind: 'NO_DATA' });
  });

  it('says another node cannot be read on a 409, never a failure', async (context) => {
    if (!(await nodeRecorded()) || !(await recorded(REMOTE))) context.skip();
    const { opened, view } = await open();
    http.expectOne(NETWORKS).flush(await goldenMaster(REMOTE, 'listNodeNetworks', SYSTEM), {
      status: 409,
      statusText: 'Conflict',
    });
    await opened.settled();
    await expect
      .element(view.getByRole('status'))
      .toMatchTextContent(
        /Only the node qits-system runs on can be read; this is another node\.\s*only the local node is reachable in this version/,
      );
    expect(view.getByRole('button', { name: 'Retry' }).elements()).toHaveLength(0);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('remote', { kind: 'NO_DATA' });
  });

  it('marks the tab as loading, then says the networks cannot be read, with Retry', async (context) => {
    if (!(await nodeRecorded())) context.skip();
    const { opened, view } = await open();
    await expect.element(view.getByRole('img', { name: 'Loading' }).first()).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loading', { kind: 'PENDING' });
    http.expectOne(NETWORKS).flush(null, { status: 503, statusText: 'Service Unavailable' });
    await opened.settled();
    await expect.element(view).toMatchTextContent('The node’s networks cannot be read right now.');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('unavailable', { kind: 'ERROR' });
    await view.getByRole('button', { name: 'Retry' }).click();
    await opened.idle();
    http.expectOne(NETWORKS).flush(await goldenMaster(SWARM, 'listNodeNetworks', SYSTEM));
    await opened.settled();
    await expect.element(view.getByRole('table', { name: 'Networks' })).toBeVisible();
  });

  it('reads the networks again on Refresh', async (context) => {
    if (!(await nodeRecorded())) context.skip();
    const { opened, view } = await render(SWARM);
    await view
      .getByRole('region', { name: 'Networks' })
      .getByRole('button', { name: 'Refresh' })
      .click();
    await opened.idle();
    http.expectOne(NETWORKS).flush(await goldenMaster(SWARM, 'listNodeNetworks', SYSTEM));
    await opened.settled();
  });

  it('switch-swarm-node-tab networks: the bare node’s Networks tab opens it', async (context) => {
    if (!(await nodeRecorded())) context.skip();
    const { opened, node } = await open(`/system/swarm/nodes/${NODE}`);
    const tab = node
      .getByRole('navigation', { name: 'Swarm node' })
      .getByRole('link', { name: 'Networks' });
    await expect.element(tab).not.toHaveAttribute('aria-current');
    await tab.click();
    await opened.idle();
    http.expectOne(NETWORKS).flush(await goldenMaster(SWARM, 'listNodeNetworks', SYSTEM));
    await opened.settled();
    expect(reached()).toEqual(['switch-swarm-node-tab:networks']);
    expect(TestBed.inject(Router).url).toBe(`/system/swarm/nodes/${NODE}/networks`);
    await expect.element(tab).toHaveAttribute('aria-current', 'page');
  });
});
