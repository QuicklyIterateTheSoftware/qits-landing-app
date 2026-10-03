import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { client as maintenanceClient } from '../../../api/maintenance/client.gen';
import { provideHeyApiClient } from '../../../api/maintenance/client/client.gen';
import { EVENT_SOURCE } from '$core/events/domain-events';
import { PENDING_BUMPS } from '$core/maintenance/maintenance.consumes';
import { BumpsMenu } from './bumps-menu';
import { goldenMaster } from '../../../../testing/browser/golden-master';

/** Screenshots of the top bar's bumps menu, its answers qits-maintenance' golden masters. */

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

  async function opened() {
    const rendered = await render();
    await page.getByRole('button', { name: 'Version bumps' }).click();
    rendered.fixture.detectChanges();
    await settle();
    return { ...rendered, list: http.expectOne(LIST) };
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

  it('lists the pending version bumps', async () => {
    const { fixture, frame, list } = await opened();
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
