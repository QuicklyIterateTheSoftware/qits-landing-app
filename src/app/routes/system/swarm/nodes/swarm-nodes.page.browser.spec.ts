import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { goldenMaster } from '../../../../../testing/browser/golden-master';
import {
  openRoute,
  provideAppRoute,
  type OpenedRoute,
} from '../../../../../testing/browser/app-route';
import { shootShellMenus } from '../../../../../testing/browser/shell-menus';

const SWARM = 'a single-node swarm';
const NO_NODES = 'a swarm listing no nodes';
const SYSTEM = 'qits-system';
const NODES = '/system/api/swarm/nodes';

/**
 * Screenshots of the System section's swarm nodes page (qits-2346) inside the shell
 * (`openRoute`), with no project open, its one read (`listSwarmNodes`) answered with qits-system's
 * recordings: "a single-node swarm" (`fake-host`, the manager and Leader qits-system runs on;
 * `nodes`) and "a swarm listing no nodes" (`[]`; `empty`, which skips itself until the
 * `@qits/system-golden-masters` pin records it). A read still open (`loading`) and a 503
 * (`unavailable`: the swarm not answering) are statuses only; so is a 403, which says the role.
 *
 * The page declares no outcome of its own: the shell's are shot once (`shootShellMenus`). Nothing
 * announces a node change, so the page has no `refreshOn`: Refresh is its only second read.
 */
describe('SwarmNodesPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideAppRoute()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    await page.viewport(800, 600);
  });

  /** Opens the nodes page, its read still open. */
  async function open(): Promise<OpenedRoute> {
    await page.viewport(1140, 900);
    return openRoute('/system/swarm/nodes');
  }

  /** Answers the read from `state`'s recording. */
  async function answer(opened: OpenedRoute, state: string) {
    http.expectOne(NODES).flush(await goldenMaster(state, 'listSwarmNodes', SYSTEM));
    await opened.settled();
  }

  /** Answers the read with `status` and no body (an error answer is only a status). */
  async function refuse(opened: OpenedRoute, status: number, statusText: string) {
    http.expectOne(NODES).flush(null, { status, statusText });
    await opened.settled();
  }

  /** The nodes page, answered from `state`. */
  async function render(state: string) {
    const opened = await open();
    await answer(opened, state);
    return { opened, view: page.elementLocator(opened.page) };
  }

  it('lists the swarm’s nodes, the one qits-system runs on marked', async () => {
    const { opened, view } = await render(SWARM);
    await expect
      .element(view.getByRole('heading', { name: 'Swarm nodes', exact: true }))
      .toBeVisible();
    await expect.element(view).toMatchTextContent('1 node');
    const table = view.getByRole('table', { name: 'Nodes' });
    const rows = table.getByRole('row').elements();
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toMatch(
      /Hostname\s*ID\s*Role\s*Status\s*Availability\s*Manager\s*Engine/,
    );
    expect(rows[0].textContent).not.toContain('Address');
    expect(rows[1].textContent).toMatch(
      /fake-host\s*this node\s*iwbwrdui2z0n\s*manager\s*Ready\s*Active\s*Leader\s*29\.7\.2/,
    );
    // The root sidebar's System stays current below the section, Nodes below it the page.
    const navigation = page.elementLocator(opened.frame).getByRole('navigation', { name: 'qits' });
    await expect
      .element(navigation.getByRole('link', { name: 'System', exact: true }))
      .toHaveAttribute('aria-current', 'true');
    await expect
      .element(navigation.getByRole('link', { name: 'Nodes', exact: true }))
      .toHaveAttribute('aria-current', 'page');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('nodes', { kind: 'DATA' });
    await shootShellMenus(opened, 'nodes');
  });

  it('says the swarm manager lists no nodes', async (context) => {
    // qits-system records the state from a later release than the pinned one: until the pin
    // reaches it (and the pact holds it), the reader refuses it and the test skips itself.
    const recorded = await goldenMaster(NO_NODES, 'listSwarmNodes', SYSTEM).catch(() => undefined);
    if (!recorded) context.skip();
    const { opened, view } = await render(NO_NODES);
    await expect
      .element(view.getByRole('status'))
      .toMatchTextContent('The swarm manager lists no nodes.');
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
      .element(view.getByRole('table', { name: 'Nodes' }))
      .toMatchTextContent('fake-host');
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

  it('reads the nodes again on Refresh', async () => {
    const { opened, view } = await render(SWARM);
    await view.getByRole('button', { name: 'Refresh' }).click();
    await opened.idle();
    await answer(opened, SWARM);
  });
});
