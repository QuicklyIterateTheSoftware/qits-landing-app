import { HttpTestingController, type TestRequest } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { EVENT_SOURCE, REOPEN_DEBOUNCE_MS } from '$core/events/domain-events';
import { REFRESH_DEBOUNCE_MS } from '$core/events/refresh-on';
import { goldenMaster } from '../../../../../../../testing/browser/golden-master';
import {
  openRoute,
  provideAppRoute,
  type OpenedRoute,
} from '../../../../../../../testing/browser/app-route';
import { shootShellMenus } from '../../../../../../../testing/browser/shell-menus';

const SWARM = 'a single-node swarm';
const NO_IMAGES = 'a swarm node holding no images';
const REMOTE = 'a swarm node this service cannot reach';
const SYSTEM = 'qits-system';

/** The node "a single-node swarm" recorded its reads for (its `nodeId`). */
const NODE = 'iwbwrdui2z0n62kqcjfo1erwh';
const IMAGES = `/system/api/nodes/${NODE}/images`;

/** The event stream the app opens, fed by hand. */
interface FakeStream {
  onmessage: ((message: { data: string }) => void) | null;
  onerror: (() => void) | null;
  readyState: number;
  close(): void;
}

/** Lets `ms` of real time pass (the stream's reopen and the refresh's debounce are real timers). */
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Screenshots of a swarm node's Images tab (qits-2353) inside the shell and the node's layout
 * (`openRoute`), with no project open. The layout's two reads are qits-system's "a single-node
 * swarm" (`fake-host`, the node qits-system runs on, `self`); the tab's one read
 * (`listNodeImages`) is answered with "a single-node swarm" (one image, `qits-ci:3e501b6`, three
 * containers using it, created at docker's `+0200 CEST`; `images`), "a swarm node holding no
 * images" (`[]`; `empty`) and "a swarm node this service cannot reach" (the 409 `NODE_REMOTE`;
 * `remote`), the last two skipping themselves until the `@qits/system-golden-masters` pin records
 * them. A read still open (`loading`) and a 503 (`unavailable`) are statuses only. A node that is
 * not `self` is never read: no recording holds one, so that is the plain spec's.
 *
 * The live stream (`EVENT_SOURCE`, the transport seam) is fed a `DeploymentActive` by hand, after
 * which the tab reads the images again; so does its Refresh. The shell's outcomes are shot once
 * (`shootShellMenus`); the tab row's exits are the layout spec's.
 */
describe('SwarmNodeImagesPage (screenshots)', () => {
  let http: HttpTestingController;
  let streams: FakeStream[];

  beforeEach(() => {
    streams = [];
    TestBed.configureTestingModule({
      providers: [
        provideAppRoute(),
        {
          provide: EVENT_SOURCE,
          useValue: () => {
            const stream: FakeStream = {
              onmessage: null,
              onerror: null,
              readyState: 1,
              close: () => {},
            };
            streams.push(stream);
            return stream;
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    await page.viewport(800, 600);
  });

  /** Whether the pinned golden masters record `state`'s images (else the reader refuses it). */
  const recorded = (state: string) =>
    goldenMaster(state, 'listNodeImages', SYSTEM).then(
      () => true,
      () => false,
    );

  /** The tab of the recorded node, the layout's reads answered, its own read still open. */
  async function open(): Promise<OpenedRoute> {
    await page.viewport(1140, 1100);
    const opened = await openRoute(`/system/swarm/nodes/${NODE}/images`);
    http
      .expectOne(`/system/api/swarm/nodes/${NODE}`)
      .flush(await goldenMaster(SWARM, 'getSwarmNode', SYSTEM));
    http
      .expectOne(`/system/api/swarm/nodes/${NODE}/tasks`)
      .flush(await goldenMaster(SWARM, 'listSwarmNodeTasks', SYSTEM));
    await opened.settled();
    return opened;
  }

  /** The tab's open reads. */
  const reads = (): TestRequest[] =>
    http.match((request) => request.url === IMAGES).filter((read) => !read.cancelled);

  /** Answers the tab's read from `state`'s recording. */
  async function answer(opened: OpenedRoute, state: string) {
    http.expectOne(IMAGES).flush(await goldenMaster(state, 'listNodeImages', SYSTEM));
    await opened.settled();
  }

  /** The tab, answered from `state`. */
  async function render(state: string) {
    const opened = await open();
    await answer(opened, state);
    return { opened, view: page.elementLocator(opened.page) };
  }

  it('lists the node’s images, each with its short id, date, size and use', async () => {
    const { opened, view } = await render(SWARM);
    const table = view.getByRole('table', { name: 'Images' });
    const rows = table.getByRole('row').elements();
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toMatch(/Repository\s*Tag\s*ID\s*Created\s*Size\s*In use/);
    expect(rows[0].textContent).not.toContain('Digest');
    expect(rows[1].textContent).toMatch(
      /registry\.dev\.localhost:8080\/qits\/qits-ci\s*3e501b6\s*14beaf669b73\s*18 Aug 2026 02:46:43Z\s*310 MiB\s*3/,
    );
    expect(rows[1].textContent).not.toContain('sha256:');
    await expect.element(view).toMatchTextContent('1 image, 310 MiB');
    // The tab row marks Images current; the root sidebar keeps System › Nodes current.
    const layout = page.elementLocator(opened.frame.querySelector('app-swarm-node-layout')!);
    await expect
      .element(
        layout
          .getByRole('navigation', { name: 'Swarm node' })
          .getByRole('link', { name: 'Images', exact: true }),
      )
      .toHaveAttribute('aria-current', 'page');
    const navigation = page.elementLocator(opened.frame).getByRole('navigation', { name: 'qits' });
    await expect
      .element(navigation.getByRole('link', { name: 'Nodes', exact: true }))
      .toHaveAttribute('aria-current', 'page');
    // The node's tasks are the bare node URL's, not the tab's.
    expect(layout.getByRole('heading', { name: 'Tasks' }).elements()).toHaveLength(0);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('images', { kind: 'DATA' });
    await shootShellMenus(opened, 'images');
  });

  it('says a node holding no images holds none', async (context) => {
    if (!(await recorded(NO_IMAGES))) context.skip();
    const { opened, view } = await render(NO_IMAGES);
    await expect.element(view.getByRole('status')).toMatchTextContent('This node holds no images.');
    expect(view.getByRole('table').elements()).toHaveLength(0);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('empty', { kind: 'NO_DATA' });
  });

  it('says a node qits-system does not run on cannot be read, with no Retry', async (context) => {
    if (!(await recorded(REMOTE))) context.skip();
    const opened = await open();
    http.expectOne(IMAGES).flush(await goldenMaster(REMOTE, 'listNodeImages', SYSTEM), {
      status: 409,
      statusText: 'Conflict',
    });
    await opened.settled();
    const view = page.elementLocator(opened.page);
    await expect
      .element(view.getByRole('status'))
      .toMatchTextContent('Only the node qits-system runs on can be read; this is another node.');
    expect(view.getByRole('button', { name: 'Retry' }).elements()).toHaveLength(0);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('remote', { kind: 'NO_DATA' });
  });

  it('marks the tab as loading, then says the images cannot be read, with Retry', async () => {
    const opened = await open();
    const view = page.elementLocator(opened.page);
    await expect.element(view.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loading', { kind: 'PENDING' });
    http.expectOne(IMAGES).flush(null, { status: 503, statusText: 'Service Unavailable' });
    await opened.settled();
    await expect.element(view).toMatchTextContent('The node’s images cannot be read right now.');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('unavailable', { kind: 'ERROR' });
    await view.getByRole('button', { name: 'Retry' }).click();
    await opened.idle();
    await answer(opened, SWARM);
    // A locator of the tab anew: the one above found the tab by what it said then.
    await expect
      .element(page.elementLocator(opened.page).getByRole('table', { name: 'Images' }))
      .toMatchTextContent('3e501b6');
  });

  it('reads the images again on Refresh', async () => {
    const { opened, view } = await render(SWARM);
    await view.getByRole('button', { name: 'Refresh images' }).click();
    await opened.idle();
    await answer(opened, SWARM);
  });

  it('reads the images again after a deployment went live', async () => {
    const { opened } = await render(SWARM);
    // The stream opens after `DomainEvents`' reopen debounce.
    await wait(REOPEN_DEBOUNCE_MS + 50);
    expect(streams.length).toBeGreaterThan(0);
    streams.at(-1)!.onmessage?.({
      data: JSON.stringify({
        name: 'DeploymentActive',
        payload: JSON.stringify({ applicationName: 'qits-ci', version: '2026.1120.1' }),
      }),
    });
    await opened.idle();
    expect(reads()).toHaveLength(0);
    // One read once the burst's debounce is over.
    await wait(REFRESH_DEBOUNCE_MS + 100);
    await opened.idle();
    await answer(opened, SWARM);
  });
});
