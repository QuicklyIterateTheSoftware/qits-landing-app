import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QITS_DOMAIN_EVENTS } from '@qits/angular';
import { page } from 'vitest/browser';
import { client as edgeClient } from '../../../api/edge/client.gen';
import { client as maintenanceClient } from '../../../api/maintenance/client.gen';
import { provideHeyApiClient } from '../../../api/maintenance/client/client.gen';
import { DomainEvents, EVENT_SOURCE } from '$core/events/domain-events';
import { PENDING_BUMPS } from '$core/maintenance/maintenance.consumes';
import { BumpsMenu } from './bumps-menu';
import { goldenMaster } from '../../../../testing/browser/golden-master';
import { noPools, UPSTREAM_POOLS_PATH } from '../../../../testing/browser/upstream-pools';

/**
 * Screenshots of the top bar's bumps menu, its bumps answered from qits-maintenance's golden
 * masters and the upstream pools below them (qits-1065) from the edge's (`an open upstream pool`,
 * qits-2220). A screenshot that is not about the pools refuses their read (`noPools`), which shows
 * nothing, as an empty answer would.
 */

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('BumpsMenu (screenshots)', () => {
  let http: HttpTestingController;
  const LIST = `/maintenance/api/bumps/pending?limit=${PENDING_BUMPS}`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(maintenanceClient),
        provideHeyApiClient(edgeClient),
        // No live stream in a screenshot: the real DomainEvents, on a stream that never connects.
        {
          provide: EVENT_SOURCE,
          useValue: () => ({ onmessage: null, onerror: null, readyState: 0, close: () => {} }),
        },
        // The bumps' resource follows that stream, as `app.config.ts` provides it (qits-2146).
        { provide: QITS_DOMAIN_EVENTS, useExisting: DomainEvents },
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
   * Opens the panel. `withPools` answers the pools request that fires alongside the bumps one with
   * the edge's recording; without it the read is refused, for every test not about the pools.
   */
  async function opened(withPools = false) {
    const rendered = await render();
    await page.getByRole('button', { name: 'Version bumps' }).click();
    rendered.fixture.detectChanges();
    await settle();
    const list = http.expectOne(LIST);
    const pools = http.expectOne(UPSTREAM_POOLS_PATH);
    if (withPools) {
      pools.flush(await goldenMaster('an open upstream pool', 'getUpstreamPools', 'qits-edge'));
    } else noPools(pools);
    return { ...rendered, list };
  }

  async function answered(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
    await settle();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('is a lighthouse, closed', async () => {
    const { frame } = await render();
    await expect.element(frame).toMatchScreenshot('closed', { kind: 'DATA' });
  });

  it('lists the pending version bumps, and the upstream pools below them', async () => {
    const { fixture, frame, list } = await opened(true);
    list.flush(await goldenMaster('pending bumps', 'listPendingBumps', 'qits-maintenance'));
    await answered(fixture);
    await expect.element(frame).toMatchScreenshot('open', { kind: 'DATA' });
  });

  it('says so when there are none', async () => {
    const { fixture, frame, list } = await opened();
    list.flush(await goldenMaster('no pending bumps', 'listPendingBumps', 'qits-maintenance'));
    await answered(fixture);
    await expect.element(frame).toMatchScreenshot('empty', { kind: 'NO_DATA' });
  });

  it('shows the spinner while loading, and the error icon when the list fails', async () => {
    const { fixture, frame, list } = await opened();
    await expect.element(frame).toMatchScreenshot('loading', { kind: 'PENDING' });
    list.flush(null, { status: 500, statusText: 'Server Error' });
    await answered(fixture);
    await expect.element(frame).toMatchScreenshot('error', { kind: 'ERROR' });
  });
});
