import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { client as maintenanceClient } from '../../../api/maintenance/client.gen';
import { provideHeyApiClient } from '../../../api/maintenance/client/client.gen';
import { EVENT_SOURCE } from '$core/events/domain-events';
import { PENDING_BUMPS } from '$core/maintenance/maintenance.consumes';
import { BumpsMenu, UPSTREAM_POOLS_URL, type UpstreamPool } from './bumps-menu';
import { goldenMaster } from '../../../../testing/browser/golden-master';
import { upstreamPoolsGoldenMaster } from '../../../../testing/browser/upstream-pools';

/**
 * Screenshots of the top bar's bumps menu, its bumps answered from qits-maintenance' golden
 * masters. The upstream pools below them (qits-1065) are a fixture from
 * `upstreamPoolsGoldenMaster` (the edge carries no pact with this app, see the ticket's
 * "Fix — edge" section), registered as a recording the way a provider's `goldenMaster(...)` is.
 */

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

/** No pools: the default for every screenshot that is not about the pools section itself. */
const NO_POOLS = upstreamPoolsGoldenMaster([]);

/** Two pools, already sorted by `open` descending, the way the edge serves them. */
const SOME_POOLS = upstreamPoolsGoldenMaster([
  {
    name: 'qits-projects',
    environment: 'dev',
    origin: 'dev-qits-projects:8080',
    open: 12,
    max: 64,
  },
  { name: 'qits-githost', environment: 'dev', origin: 'dev-qits-githost:8080', open: 3, max: 64 },
]);

describe('BumpsMenu (screenshots)', () => {
  let http: HttpTestingController;
  const LIST = `/maintenance/api/bumps/pending?limit=${PENDING_BUMPS}`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(maintenanceClient),
        // No live stream in a screenshot: the real DomainEvents, on a stream that never connects.
        {
          provide: EVENT_SOURCE,
          useValue: () => ({ onmessage: null, onerror: null, readyState: 0, close: () => {} }),
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** The menu at the right of a 400px-wide bar, room below it for the panel; nothing opened. */
  async function render() {
    const fixture = TestBed.createComponent(BumpsMenu);
    const element = fixture.nativeElement as HTMLElement;
    element.parentElement!.style.cssText =
      'display:flex; justify-content:flex-end; width:25rem; height:18rem; padding:0.5rem; align-items:flex-start';
    fixture.detectChanges();
    await settle();
    return { fixture, frame: page.elementLocator(element.parentElement!) };
  }

  /**
   * Opens the panel. `poolsBody` answers the pools request that fires alongside the bumps one;
   * it defaults to none, for every test that is not about the pools section.
   */
  async function opened(poolsBody: readonly UpstreamPool[] = NO_POOLS) {
    const rendered = await render();
    await page.getByRole('button', { name: 'Version bumps' }).click();
    rendered.fixture.detectChanges();
    await settle();
    const list = http.expectOne(LIST);
    http.expectOne(UPSTREAM_POOLS_URL).flush(poolsBody);
    return { ...rendered, list };
  }

  async function answered(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
    await settle();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('is a lighthouse, closed', async () => {
    const { frame } = await render();
    await expect.element(frame).toMatchScreenshot('closed');
  });

  it('lists the pending version bumps, and the upstream pools below them', async () => {
    const { fixture, frame, list } = await opened(SOME_POOLS);
    list.flush(await goldenMaster('pending bumps', 'listPendingBumps', 'qits-maintenance'));
    await answered(fixture);
    await expect.element(frame).toMatchScreenshot('open');
  });

  it('says so when there are none', async () => {
    const { fixture, frame, list } = await opened();
    list.flush(await goldenMaster('no pending bumps', 'listPendingBumps', 'qits-maintenance'));
    await answered(fixture);
    await expect.element(frame).toMatchScreenshot('empty');
  });

  it('shows the spinner while loading, and the error icon when the list fails', async () => {
    const { fixture, frame, list } = await opened();
    await expect.element(frame).toMatchScreenshot('loading');
    list.flush(null, { status: 500, statusText: 'Server Error' });
    await answered(fixture);
    await expect.element(frame).toMatchScreenshot('error');
  });
});
