import { Component, computed, inject } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { RouterTestingHarness } from '@angular/router/testing';
import { commands, page, userEvent } from 'vitest/browser';
import { client as projectsClient } from '../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../api/projects/client/client.gen';
import { SelectedWork } from '$core/work/selected-work';
import { FINISH_DELAY_MS } from '$core/work/work.store';
import { LEAVE_MS } from '$ui/components/leave/leave';
import { FinishToasts } from '$patterns/work/finish-toasts/finish-toasts';
import { goldenMaster } from '../../../../testing/browser/golden-master';
import { openRecordedWork } from '../../../../testing/browser/recorded-work';
import { KanbanBoard } from './kanban-board';

/**
 * Screenshots of the whole Work board, 48rem wide, with the finish toasts beside it as the shell
 * layout draws them. The work is what the app builds from qits-projects' golden masters
 * (`recorded-work.ts`), from the case's state.
 *
 * The toast stack is `position: fixed` to the window's bottom right. The host is a containing
 * block for it (`transform`), so the toasts land at the host's bottom right, inside the shot.
 */
@Component({
  imports: [KanbanBoard, FinishToasts],
  host: { class: 'relative block w-[48rem] p-4 pb-20 [transform:translateZ(0)]' },
  template: `
    <app-kanban-board [tree]="tree()" base="/projects/contract/work" />
    <app-finish-toasts />
  `,
})
class WholeBoard {
  private readonly work = inject(SelectedWork);
  readonly tree = computed(() => this.work.graph().tree('board'));
}

const EVERY_STATUS = 'a project with work in every status';
const NESTED = 'an epic with features and tasks';
/** The answer to the finish's move to DONE, recorded for this write (`finish-epic`). */
const VERIFIED_EPIC = 'a verified epic';

/** The generated client builds its request after a few awaits; let them run. */
const flushMicrotasks = () => vi.advanceTimersByTimeAsync(0);

describe('KanbanBoard (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    // Tall enough for the board and the toast below it: a screenshot shows only the viewport.
    await page.viewport(800, 1200);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'projects/:slug/:view/:qualifiedId', component: WholeBoard }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    vi.useRealTimers();
    http.verify();
    // Back to the configured viewport, so the next spec file renders as it always does.
    await page.viewport(800, 600);
  });

  async function shown(state: string) {
    const { element, harness } = await openRecordedWork(http, 'board', 'all', state);
    return { element, locator: page.elementLocator(element), harness };
  }

  it('a board with work in every status', async () => {
    const { locator } = await shown(EVERY_STATUS);
    await expect.element(locator).toHaveTextContent('Refined epic');
    await expect.element(locator).toHaveTextContent('Verified ticket');
    // Nor Backlog nor Archive work on the board.
    await expect.element(locator).not.toHaveTextContent('Reported ticket');
    await expect.element(locator).not.toHaveTextContent('Done ticket');
    await expect.element(locator).toMatchScreenshot('every-status');
  });

  it('a board with an epic’s features and tasks', async () => {
    const { locator } = await shown(NESTED);
    await expect.element(locator).toHaveTextContent('Open task');
    await expect.element(locator).toMatchScreenshot('nested');
  });

  it('the finish buttons in the right column show whole and take a click', async () => {
    const { element } = await shown(EVERY_STATUS);
    const host = element.getBoundingClientRect();
    for (const id of ['contract-00000001-7', 'contract-00000001-8']) {
      const button = element.querySelector(`button[aria-label="Mark ${id} done"]`) as HTMLElement;
      const box = button.getBoundingClientRect();
      expect(box.width).toBeGreaterThan(0);
      expect(box.right).toBeLessThanOrEqual(host.right);
      // Its outer part too: nothing over it, and no clipping box around it.
      const hit = document.elementFromPoint(box.right - 3, box.top + box.height / 2);
      expect(button.contains(hit), `${id}: ${hit?.outerHTML.slice(0, 200)}`).toBe(true);
    }
  });

  /** The board's top-level items, top to bottom, by qualified id. */
  function order(element: HTMLElement): string[] {
    return [...element.querySelectorAll('app-epic-card > *, app-ticket-card > *')]
      .map((item) => ({
        top: item.getBoundingClientRect().top,
        id: item
          .closest('app-epic-card, app-ticket-card')!
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

  /** Where the top-level item `qualifiedId` is, counted from the top. */
  const topOf = (element: HTMLElement, qualifiedId: string) => order(element).indexOf(qualifiedId);

  it('finishing a verified epic: the bubble, the Undo toast, the move to DONE', async () => {
    const { element, locator, harness } = await shown(EVERY_STATUS);
    const work = await goldenMaster(EVERY_STATUS, 'listProjectEntities');
    const epic = work.entities.find(
      (e: { qualifiedId: string }) => e.qualifiedId === 'contract-00000001-7',
    );
    // The finish waits on a timer: fake from here on, so every step is exact.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await expect.element(locator).toMatchScreenshot('finish-initial');
    const before = order(element);
    const after = before.filter((id) => id !== 'contract-00000001-7');
    // The ticket below the finished epic is below the implemented epic, and stays there.
    expect(topOf(element, 'contract-00000001-8')).toBeGreaterThan(
      topOf(element, 'contract-00000001-5'),
    );

    await finish(element, harness, 'contract-00000001-7');
    expect(order(element)).toEqual(after);
    await expect.element(locator).not.toHaveTextContent('Verified epic');
    await expect.element(locator).toHaveTextContent('contract-00000001-7 finished');
    await expect.element(locator.getByRole('button', { name: 'Undo' })).toBeVisible();
    http.expectNone(() => true);
    await expect.element(locator).toMatchScreenshot('finish-pending');

    await vi.advanceTimersByTimeAsync(FINISH_DELAY_MS);
    const sent = http.match(() => true);
    expect(sent.map((request) => `${request.request.method} ${request.request.url}`)).toEqual([
      `POST /projects/api/epics/${epic.id}/transition`,
    ]);
    expect(sent[0].request.body).toEqual({ target: 'DONE' });
    sent[0].flush(await goldenMaster(VERIFIED_EPIC, 'transitionEpic'));
    await flushMicrotasks();
    harness.fixture.detectChanges();
    await expect.element(locator).not.toHaveTextContent('finished');
    await expect.element(locator).not.toHaveTextContent('Verified epic');
    expect(order(element)).toEqual(after);
    await expect.element(locator).toMatchScreenshot('finish-sent');
  });

  it('Undo brings the ticket back and sends nothing', async () => {
    const { element, locator, harness } = await shown(EVERY_STATUS);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await finish(element, harness, 'contract-00000001-8');
    await userEvent.click(locator.getByRole('button', { name: 'Undo' }));
    harness.fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(FINISH_DELAY_MS);
    harness.fixture.detectChanges();
    await commands.parkPointer();
    http.expectNone(() => true);
    await expect.element(locator).toHaveTextContent('Verified ticket');
    await expect.element(locator).not.toHaveTextContent('finished');
    await expect.element(locator).toMatchScreenshot('finish-undone');
  });
});
