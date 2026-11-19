import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { QITS_DOMAIN_EVENTS } from '@qits/angular';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { page, userEvent } from 'vitest/browser';
import { client as edgeClient } from '../../../api/edge/client.gen';
import { client as maintenanceClient } from '../../../api/maintenance/client.gen';
import { provideHeyApiClient } from '../../../api/maintenance/client/client.gen';
import { client as projectsClient } from '../../../api/projects/client.gen';
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
 *
 * With a project open (qits-projects' "a project exists"), each row's repository links the bump's
 * page in that project (`open-menu-bump`, qits-2332), followed once to a stub of the page.
 */

/** The open project's page and a bump's page under the menu; they render nothing. */
@Component({ selector: 'app-test-page', template: `` })
class TestPage {}

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
        provideRouter([
          { path: 'projects/:slug', component: TestPage },
          { path: 'projects/:slug/maintenance/bumps/:bumpId', component: TestPage },
        ]),
        provideHeyApiClient(maintenanceClient),
        provideHeyApiClient(edgeClient),
        provideHeyApiClient(projectsClient),
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

  it('open-menu-bump bump: links each bump to its page in the open project', async () => {
    const list = await goldenMaster('a project exists', 'listProjects');
    const { slug } = list.entries[0].project;
    await TestBed.inject(Router).navigateByUrl(`/projects/${slug}`);
    const { fixture, frame, list: bumps } = await opened();
    bumps.flush(await goldenMaster('pending bumps', 'listPendingBumps', 'qits-maintenance'));
    // In the browser `SelectedProject` reads the project list on its own; answer it as recorded.
    for (const read of http.match('/projects/api/projects')) read.flush(list);
    await answered(fixture);
    const panel = page.getByRole('region', { name: 'Pending version bumps' });
    const first = panel.getByRole('link').first();
    await expect.element(first).toHaveAttribute('data-qits-outcome', 'open-menu-bump:bump');
    await expect.element(frame).toMatchScreenshot('open-in-project', { kind: 'DATA' });
    const href = first.element().getAttribute('href');
    expect(href).toMatch(new RegExp(`^/projects/${slug}/maintenance/bumps/`));
    await userEvent.click(first);
    await answered(fixture);
    expect(TestBed.inject(Router).url).toBe(href);
    expect(outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`)).toEqual([
      'open-menu-bump:bump',
    ]);
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
