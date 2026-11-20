import { HttpTestingController, type TestRequest } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { EVENT_SOURCE, REOPEN_DEBOUNCE_MS } from '$core/events/domain-events';
import { REFRESH_DEBOUNCE_MS } from '$core/events/refresh-on';
import { goldenMaster } from '../../../../../testing/browser/golden-master';
import {
  openRoute,
  provideAppRoute,
  type OpenedRoute,
} from '../../../../../testing/browser/app-route';
import { shootShellMenus } from '../../../../../testing/browser/shell-menus';

const SWARM = 'a single-node swarm';
const EMPTY_SWARM = 'a swarm running no services';
const SYSTEM = 'qits-system';
const SERVICES = '/system/api/swarm/services';

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
 * Screenshots of the System section's swarm services page (qits-2344) inside the shell
 * (`openRoute`), with no project open, its one read (`listSwarmServices`) answered with
 * qits-system's recordings: "a single-node swarm" (`dev-qits-artifacts` and `dev-qits-ci`, both
 * replicated `1/1`; `services`) and "a swarm running no services" (`[]`; `empty`, which skips itself
 * until the `@qits/system-golden-masters` pin records it). A read still open (`loading`) and a 503
 * (`unavailable`: the swarm not answering) are statuses only; so is a 403, which says the role.
 *
 * The page declares no outcome of its own: the shell's are shot once (`shootShellMenus`). The live
 * stream (`EVENT_SOURCE`, the transport seam) is fed a `DeploymentActive` by hand, after which the
 * page reads the services again.
 */
describe('SwarmServicesPage (screenshots)', () => {
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

  /** Opens the services page, its read still open. */
  async function open(): Promise<OpenedRoute> {
    await page.viewport(1140, 900);
    return openRoute('/system/swarm/services');
  }

  /** The page's open reads. */
  const reads = (): TestRequest[] =>
    http.match((request) => request.url === SERVICES).filter((read) => !read.cancelled);

  /** Answers the read from `state`'s recording. */
  async function answer(opened: OpenedRoute, state: string) {
    http.expectOne(SERVICES).flush(await goldenMaster(state, 'listSwarmServices', SYSTEM));
    await opened.settled();
  }

  /** Answers the read with `status` and no body (an error answer is only a status). */
  async function refuse(opened: OpenedRoute, status: number, statusText: string) {
    http.expectOne(SERVICES).flush(null, { status, statusText });
    await opened.settled();
  }

  /** The services page, answered from `state`. */
  async function render(state: string) {
    const opened = await open();
    await answer(opened, state);
    return { opened, view: page.elementLocator(opened.page) };
  }

  it('lists the swarm’s services, each with its state', async () => {
    const { opened, view } = await render(SWARM);
    await expect
      .element(view.getByRole('heading', { name: 'Swarm services', exact: true }))
      .toBeVisible();
    await expect.element(view).toMatchTextContent('2 services');
    const table = view.getByRole('table', { name: 'Services' });
    const rows = table.getByRole('row').elements();
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toMatch(/Name\s*State\s*Mode\s*Replicas\s*Image\s*Ports/);
    expect(rows[0].textContent).not.toContain('Updated');
    expect(rows[1].textContent).toContain('dev-qits-artifacts');
    expect(rows[2].textContent).toContain('dev-qits-ci');
    expect(table.getByText('Running', { exact: true }).elements()).toHaveLength(2);
    await expect
      .element(table)
      .toMatchTextContent('registry.dev.localhost:8080/qits/qits-artifacts:09920e6');
    // The root sidebar's System stays current below the section, Services below it the page
    // (qits-2346).
    const navigation = page.elementLocator(opened.frame).getByRole('navigation', { name: 'qits' });
    await expect
      .element(navigation.getByRole('link', { name: 'System', exact: true }))
      .toHaveAttribute('aria-current', 'true');
    await expect
      .element(navigation.getByRole('link', { name: 'Services', exact: true }))
      .toHaveAttribute('aria-current', 'page');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('services', { kind: 'DATA' });
    await shootShellMenus(opened, 'services');
  });

  it('says an empty swarm runs no services', async (context) => {
    // qits-system records the state from a later release than the pinned one: until the pin
    // reaches it (and the pact holds it), the reader refuses it and the test skips itself.
    const recorded = await goldenMaster(EMPTY_SWARM, 'listSwarmServices', SYSTEM).catch(
      () => undefined,
    );
    if (!recorded) context.skip();
    const { opened, view } = await render(EMPTY_SWARM);
    await expect
      .element(view.getByRole('status'))
      .toMatchTextContent('This swarm is running no services.');
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
      .element(view.getByRole('table', { name: 'Services' }))
      .toMatchTextContent('dev-qits-ci');
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

  it('reads the services again on Refresh', async () => {
    const { opened, view } = await render(SWARM);
    await view.getByRole('button', { name: 'Refresh' }).click();
    await opened.idle();
    await answer(opened, SWARM);
  });

  it('reads the services again after a deployment went live', async () => {
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
