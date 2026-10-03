import { Component, computed, inject } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HIGHLIGHT_FADES } from '$ui/components/highlight/highlight';
import { page } from 'vitest/browser';
import { client as projectsClient } from '../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../api/projects/client/client.gen';
import { SelectedWork } from '$core/work/selected-work';
import { openRecordedWork } from '../../../../testing/browser/recorded-work';
import { KanbanBoard } from './kanban-board';

/**
 * Screenshots of the whole Work board, 48rem wide. The work is what the app builds from
 * qits-projects' golden masters (`recorded-work.ts`), from the case's state. (Finishing is in
 * the Acceptance list: `work-list.browser.spec.ts`.)
 */
@Component({
  imports: [KanbanBoard],
  host: { class: 'block w-[48rem] p-4' },
  template: `<app-kanban-board [tree]="tree()" base="/projects/contract/work" />`,
})
class WholeBoard {
  private readonly work = inject(SelectedWork);
  readonly tree = computed(() => this.work.graph().tree('board'));
}

const EVERY_STATUS = 'a project with work in every status';
const NESTED = 'an epic with features and tasks';

describe('KanbanBoard (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    // Tall enough for the whole board: a screenshot shows only the viewport.
    await page.viewport(800, 1200);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'projects/:slug/:view/:qualifiedId', component: WholeBoard }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        // The selection highlight stays at full strength for its screenshot.
        { provide: HIGHLIGHT_FADES, useValue: false },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    // Back to the configured viewport, so the next spec file renders as it always does.
    await page.viewport(800, 600);
  });

  async function shown(state: string) {
    const { element, harness } = await openRecordedWork(http, 'board', 'all', state);
    return { element, locator: page.elementLocator(element), harness };
  }

  it('a board with work in every status: Refined, Implementing, Implemented, Verifying', async () => {
    const { element, locator } = await shown(EVERY_STATUS);
    // The column headers, left to right, each with its count: an epic and a ticket per status,
    // plus a second implementing epic with its started feature and task.
    const headers = [...element.querySelectorAll('ui-board > div:first-child > div')]
      .map((h) => h.textContent?.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    expect(headers).toEqual(['Refined 2', 'Implementing 5', 'Implemented 2', 'Verifying 2']);
    for (const title of [
      'Refined epic',
      'Refined ticket',
      'Implementing epic',
      'Implementing ticket',
      'Implemented epic',
      'Implemented ticket',
      'Verifying epic',
      'Verifying ticket',
      // An implementing epic with a started feature and task, both in Implementing.
      'Started epic',
      'Started feature',
      'Started task',
    ]) {
      await expect.element(locator).toHaveTextContent(title);
    }
    // Nor Backlog, Acceptance nor Archive work on the board.
    await expect.element(locator).not.toHaveTextContent('Reported ticket');
    await expect.element(locator).not.toHaveTextContent('Verified ticket');
    await expect.element(locator).not.toHaveTextContent('Done ticket');
    await expect.element(locator).toMatchScreenshot('every-status');
  });

  it('a board with an epic’s features and tasks', async () => {
    const { locator } = await shown(NESTED);
    await expect.element(locator).toHaveTextContent('Open task');
    await expect.element(locator).toMatchScreenshot('nested');
  });

  /** Changes the text selection and waits for the browser's `selectionchange`. */
  async function select(change: (selection: Selection) => void) {
    const changed = new Promise((resolve) =>
      document.addEventListener('selectionchange', resolve, { once: true }),
    );
    change(document.getSelection()!);
    await changed;
  }

  it('highlights the card the text selection is in', async () => {
    const { element, locator } = await shown(EVERY_STATUS);
    const title = [...element.querySelectorAll('ui-board-card a')].find(
      (link) => link.textContent?.trim() === 'Implemented ticket',
    )!;
    const range = document.createRange();
    range.selectNodeContents(title);
    await select((selection) => selection.addRange(range));
    const card = title.closest('ui-board-card')!;
    expect(card.classList.contains('outline-ocean-deep-600')).toBe(true);
    // No selection colour in the shot; the highlight stays until it fades.
    await select((selection) => selection.removeAllRanges());
    expect(card.classList.contains('outline-ocean-deep-600')).toBe(true);
    await expect.element(locator).toMatchScreenshot('selection-highlight');
  });
});
