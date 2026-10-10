import { Component, computed, inject } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import type { RouterTestingHarness } from '@angular/router/testing';
import { commands, page, userEvent } from 'vitest/browser';
import { client as projectsClient } from '../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../api/projects/client/client.gen';
import { SelectedWork } from '$core/work/selected-work';
import { FINISH_DELAY_MS } from '$core/work/finish-delay';
import { LEAVE_MS } from '$ui/components/leave/leave';
import { FinishToasts } from '$patterns/work/finish-toasts/finish-toasts';
import { goldenMaster } from '../../../../testing/browser/golden-master';
import { openRecordedWork } from '../../../../testing/browser/recorded-work';
import { WorkList } from './work-list';
import type { WorkListView } from './work-list-view';

/**
 * Screenshots of a whole list, 40rem wide: the Backlog, Acceptance or the Archive of the work the
 * app builds from qits-projects' golden masters (`recorded-work.ts`), from the case's state.
 *
 * Acceptance has the finish toasts beside it, as the shell layout draws them. The toast stack is
 * `position: fixed` to the window's bottom right; the host is a containing block for it
 * (`transform`), so the toasts land at the host's bottom right, inside the shot.
 */
@Component({
  imports: [WorkList, FinishToasts],
  host: {
    '[class]':
      "view === 'acceptance' ? 'relative block w-[40rem] p-4 pb-20 [transform:translateZ(0)]' : 'block w-[40rem] p-4 pb-8'",
  },
  template: `
    <app-work-list [tree]="tree()" base="/projects/contract/work/detail" [view]="view" />
    @if (view === 'acceptance') {
      <app-finish-toasts />
    }
  `,
})
class WholeList {
  readonly view = inject(ActivatedRoute).snapshot.paramMap.get('view') as Exclude<
    WorkListView,
    'campaign'
  >;
  private readonly work = inject(SelectedWork);
  readonly tree = computed(() => this.work.graph().tree(this.view));
}

const EVERY_STATUS = 'a project with work in every status';
/** The answer to the finish's move to DONE, recorded for this write (`finish-epic`). */
const VERIFIED_EPIC = 'a verified epic';

/** The generated client builds its request after a few awaits; let them run. */
const flushMicrotasks = () => vi.advanceTimersByTimeAsync(0);

describe('WorkList (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'projects/:slug/:view/:qualifiedId', component: WholeList }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.useRealTimers();
    http.verify();
  });

  async function shown(view: WorkListView, state: string) {
    const { element, harness } = await openRecordedWork(http, view, 'all', state);
    return { element, locator: page.elementLocator(element), harness };
  }

  it('the Backlog', async () => {
    const { locator: list } = await shown('backlog', EVERY_STATUS);
    await expect.element(list).toMatchTextContent('Reported epic');
    await expect.element(list).toMatchTextContent('Reported ticket');
    await expect.element(list).toMatchScreenshot('backlog');
  });

  it('Acceptance: verified work, each item with its finish button', async () => {
    const { element, locator: list } = await shown('acceptance', EVERY_STATUS);
    await expect.element(list).toMatchTextContent('Verified epic');
    await expect.element(list).toMatchTextContent('Verified ticket');
    await expect.element(list).not.toMatchTextContent('Verifying ticket');
    await expect.element(list).not.toMatchTextContent('Done ticket');
    const host = element.getBoundingClientRect();
    for (const id of ['contract-00000001-13', 'contract-00000001-14']) {
      const button = element.querySelector(`button[aria-label="Mark ${id} done"]`) as HTMLElement;
      const box = button.getBoundingClientRect();
      expect(box.width).toBeGreaterThan(0);
      expect(box.right).toBeLessThanOrEqual(host.right);
      // Its outer part too: nothing over it, and no clipping box around it.
      const hit = document.elementFromPoint(box.right - 3, box.top + box.height / 2);
      expect(button.contains(hit), `${id}: ${hit?.outerHTML.slice(0, 200)}`).toBe(true);
    }
    await expect.element(list).toMatchScreenshot('acceptance');
  });

  it('the Archive: Done and Dropped mixed', async () => {
    const { locator: list } = await shown('archive', EVERY_STATUS);
    await expect.element(list).toMatchTextContent('Done ticket');
    await expect.element(list).toMatchTextContent('Dropped epic');
    await expect.element(list).toMatchScreenshot('archive');
  });

  it('an empty list says so', async () => {
    const { locator: list } = await shown('archive', 'an epic with features and tasks');
    await expect.element(list).toMatchTextContent('Nothing here');
    await expect.element(list).toMatchScreenshot('empty');
  });

  /** The list's top-level items, top to bottom, by qualified id. */
  function order(element: HTMLElement): string[] {
    return [...element.querySelectorAll('app-epic-list-item > *, app-ticket-list-item > *')]
      .map((item) => ({
        top: item.getBoundingClientRect().top,
        id: item
          .closest('app-epic-list-item, app-ticket-list-item')!
          .querySelector('a.font-mono, ui-id-strip')!
          .textContent!.trim(),
      }))
      .sort((a, b) => a.top - b.top)
      .map((item) => item.id);
  }

  /** Clicks the finish button of `qualifiedId` and lets it leave; timers are fake. */
  async function finish(element: HTMLElement, harness: RouterTestingHarness, qualifiedId: string) {
    await userEvent.click(
      element.querySelector(`button[aria-label="Mark ${qualifiedId} done"]`) as HTMLElement,
    );
    harness.fixture.detectChanges();
    // The item shrinks away; with transitions off, the leave ends on its fallback timer.
    await vi.advanceTimersByTimeAsync(LEAVE_MS + 150);
    harness.fixture.detectChanges();
    await commands.parkPointer();
  }

  it('finishing a verified epic: the bubble, the Undo toast, the move to DONE', async () => {
    const { element, locator, harness } = await shown('acceptance', EVERY_STATUS);
    const work = await goldenMaster(EVERY_STATUS, 'listProjectWork');
    const epic = work.entities.find(
      (e: { qualifiedId: string }) => e.qualifiedId === 'contract-00000001-13',
    );
    // The finish waits on a timer: fake from here on, so every step is exact.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await expect.element(locator).toMatchScreenshot('finish-initial');
    expect(order(element)).toEqual(['contract-00000001-13', 'contract-00000001-14']);

    await finish(element, harness, 'contract-00000001-13');
    // The ticket below the finished epic stays where the list puts it.
    expect(order(element)).toEqual(['contract-00000001-14']);
    await expect.element(locator).not.toMatchTextContent('Verified epic');
    await expect.element(locator).toMatchTextContent('contract-00000001-13 finished');
    await expect.element(locator.getByRole('button', { name: 'Undo' })).toBeVisible();
    http.expectNone(() => true);
    await expect.element(locator).toMatchScreenshot('finish-pending');

    await vi.advanceTimersByTimeAsync(FINISH_DELAY_MS);
    const sent = http.match(() => true);
    expect(sent.map((request) => `${request.request.method} ${request.request.url}`)).toEqual([
      `POST /projects/api/work/${epic.qualifiedId}/status`,
    ]);
    expect(sent[0].request.body).toEqual({ target: 'DONE' });
    sent[0].flush(await goldenMaster(VERIFIED_EPIC, 'setWorkStatus'));
    await flushMicrotasks();
    harness.fixture.detectChanges();
    await expect.element(locator).not.toMatchTextContent('finished');
    await expect.element(locator).not.toMatchTextContent('Verified epic');
    expect(order(element)).toEqual(['contract-00000001-14']);
    await expect.element(locator).toMatchScreenshot('finish-sent');
  });

  it('Undo brings the ticket back and sends nothing', async () => {
    const { element, locator, harness } = await shown('acceptance', EVERY_STATUS);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await finish(element, harness, 'contract-00000001-14');
    await userEvent.click(locator.getByRole('button', { name: 'Undo' }));
    harness.fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(FINISH_DELAY_MS);
    harness.fixture.detectChanges();
    await commands.parkPointer();
    http.expectNone(() => true);
    await expect.element(locator).toMatchTextContent('Verified ticket');
    await expect.element(locator).not.toMatchTextContent('finished');
    expect(order(element)).toEqual(['contract-00000001-13', 'contract-00000001-14']);
    await expect.element(locator).toMatchScreenshot('finish-undone');
  });
});
