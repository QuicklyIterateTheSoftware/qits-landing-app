import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { IN_PROGRESS_VIEW_KEY } from '$core/work/in-progress-view';
import { goldenMaster } from '../../../../../../testing/browser/golden-master';
import { openRoute, provideAppRoute } from '../../../../../../testing/browser/app-route';
import { shootShellMenus } from '../../../../../../testing/browser/shell-menus';

/**
 * Screenshots of a project's In Progress page inside the shell and the work tabs (`openRoute`), in
 * each of its views (qits-2051): the epic boards (the default) and the one inline board, which a
 * test picks by storing it in `localStorage` before the page opens, as the gear would have. The
 * answers are qits-projects' golden masters: the project list as recorded, and for its work "a
 * project with work in every status" (one epic and one ticket per status, DROPPED included; five
 * epics on the board, the started one with a feature and a task, and four tickets), "an implementing
 * epic with features in mixed statuses" (a VERIFIED feature among them) or "a project with no
 * work". The active agents are qits-workspaces' "a project with agents bound to work items": its
 * agent is on an item these projects do not hold, so no agent section shows
 * (`work-in-progress.page.spec.ts` covers them).
 */

const EVERY_STATUS = 'a project with work in every status';
const MIXED = 'an implementing epic with features in mixed statuses';

describe('WorkInProgressPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    // As wide as the page was, plus the sidebar.
    await page.viewport(1040, 900);
    TestBed.configureTestingModule({ providers: [provideAppRoute()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    localStorage.removeItem(IN_PROGRESS_VIEW_KEY);
    // Back to the configured viewport, so the next spec file renders as it always does.
    await page.viewport(800, 600);
  });

  /** The page of the recorded project, with its active agents answered and its work requested. */
  async function shown(answerWork = true, workState = EVERY_STATUS) {
    const opened = await openRoute((project) => `/projects/${project.slug}/work/in-progress`);
    http
      .expectOne('/workspaces/api/agents?state=ACTIVE')
      .flush(
        await goldenMaster(
          'a project with agents bound to work items',
          'listAgents',
          'qits-workspaces',
        ),
      );
    const work = http.expectOne(`/projects/api/projects/${opened.project.id}/work`);
    if (answerWork) {
      work.flush(await goldenMaster(workState, 'listProjectWork'));
    }
    await opened.settled();
    return { opened, work, element: page.elementLocator(opened.page) };
  }

  /** The inline view, stored before the page opens. */
  const inline = () => localStorage.setItem(IN_PROGRESS_VIEW_KEY, 'inline');

  /** The epic boards drawn, by their epic's title. */
  const epicBoards = (root: Element) =>
    [...root.querySelectorAll('app-epic-board > article')].map((a) => a.getAttribute('aria-label'));

  it('draws each epic on the board with its own epic board, then one board for the tickets', async () => {
    // Tall enough for every board: the shell shows only what is in the viewport.
    await page.viewport(1040, 3400);
    const { opened, element } = await shown();
    await expect.element(element).toMatchTextContent('Started feature');
    const root = element.element();
    expect(epicBoards(root)).toEqual([
      'Ready for dev epic',
      'Implementing epic',
      'Implemented epic',
      'Verifying epic',
      'Started epic',
    ]);
    const boards = root.querySelectorAll<HTMLElement>('app-kanban-board');
    expect(boards).toHaveLength(1);
    const rest = page.elementLocator(boards[0]);
    await expect.element(rest).toMatchTextContent('Ready for dev ticket');
    await expect.element(rest).toMatchTextContent('Verifying ticket');
    await expect.element(rest).not.toMatchTextContent('Implementing epic');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('epic-boards-data', { kind: 'DATA' });
    await shootShellMenus(opened, 'epic-boards-data');
  });

  it('shows a verified feature in its epic board’s Verified column', async () => {
    await page.viewport(1040, 1400);
    const { opened, element } = await shown(true, MIXED);
    await expect.element(element).toMatchTextContent('Verified feature');
    const root = element.element();
    expect(epicBoards(root)).toEqual(['Epic with mixed features']);
    // Only the epic was on the board: no board for the rest.
    expect(root.querySelector('app-kanban-board')).toBeNull();
    const verified = [...root.querySelectorAll('ui-board-row')].find((row) =>
      row.textContent?.includes('Verified feature'),
    )!;
    await expect.element(page.elementLocator(verified)).toMatchTextContent('Verified task');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('epic-boards-mixed-data', { kind: 'DATA' });
  });

  it('shows the work being worked on inline, and nothing before or after it', async () => {
    inline();
    // Tall enough for the whole board: the shell shows only what is in the viewport.
    await page.viewport(1040, 2000);
    const { opened, element } = await shown();
    const { project } = opened;
    await expect
      .element(element.getByRole('heading', { level: 1 }))
      .toMatchTextContent('In Progress');
    await expect.element(element).toMatchTextContent('Ready for dev ticket');
    await expect.element(element).toMatchTextContent('Implementing epic');
    await expect.element(element).toMatchTextContent('Implemented epic');
    await expect.element(element).toMatchTextContent('Verifying ticket');
    await expect.element(element).not.toMatchTextContent('Reported ticket');
    // Refined work waits on the Schedule tab.
    await expect.element(element).not.toMatchTextContent('Refined ticket');
    await expect.element(element).not.toMatchTextContent('Verified ticket');
    await expect.element(element).not.toMatchTextContent('Done ticket');
    // Every card leads to its item's page, below work/detail. The Workspace links are left out:
    // they lead to the agents; so are the shell's and the tabs' links.
    const hrefs = [...element.element().querySelectorAll('a[href]')]
      .filter((a) => a.closest('app-work-in-progress-page') && !a.closest('app-workspace-link'))
      .map((a) => a.getAttribute('href'));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) expect(href).toMatch(`/projects/${project.slug}/work/detail/`);
    expect(epicBoards(element.element())).toEqual([]);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('inline-data', { kind: 'DATA' });
  });

  it('nests an epic’s features and tasks in its lane inline, its verified feature off the board', async () => {
    inline();
    await page.viewport(1040, 900);
    const { opened, element } = await shown(true, MIXED);
    await expect.element(element).toMatchTextContent('Epic with mixed features');
    await expect.element(element).toMatchTextContent('Implementing task');
    await expect.element(element).not.toMatchTextContent('Verified feature');
    expect(epicBoards(element.element())).toEqual([]);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('inline-mixed-data', { kind: 'DATA' });
  });

  it('opens the view settings from the gear on the In Progress tab', async () => {
    const { opened, element } = await shown();
    await expect.element(element).toMatchTextContent('Started feature');
    const frame = page.elementLocator(opened.frame);
    const tabs = frame.getByRole('navigation', { name: 'Work' });
    const gear = tabs.getByRole('button', { name: 'In Progress view settings' });
    await gear.click();
    const panel = tabs.getByRole('region', { name: 'In Progress view' });
    await expect.element(panel).toBeVisible();
    await expect.element(panel.getByRole('radio', { name: 'Epic boards' })).toBeChecked();
    await expect.element(panel.getByRole('radio', { name: 'Inline' })).not.toBeChecked();
    // The row's gear: below md the row is the phone bar, whose gear the work layout's spec shows.
    await expect.element(frame).toMatchScreenshot('view-settings-data', {
      kind: 'DATA',
      viewports: ['TABLET', 'DESKTOP'],
      reason: 'the row and its gear show from md up only (qits-2077)',
    });
    // Choosing applies at once, and is kept for the next visit.
    await panel.getByRole('radio', { name: 'Inline' }).click();
    await expect.poll(() => epicBoards(element.element())).toEqual([]);
    expect(localStorage.getItem(IN_PROGRESS_VIEW_KEY)).toBe('inline');
  });

  it('says that nothing is in progress', async () => {
    const { opened, element } = await shown(true, 'a project with no work');
    const root = element.element();
    expect(epicBoards(root)).toEqual([]);
    // No epic board: the board's empty columns say it.
    expect(root.querySelectorAll('app-kanban-board')).toHaveLength(1);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('no-data', { kind: 'NO_DATA' });
  });

  it('says that the work could not be read', async () => {
    const { opened, work, element } = await shown(false);
    work.flush(null, { status: 500, statusText: 'Server Error' });
    await opened.settled();
    await expect.element(element.getByRole('img', { name: 'Failed to load' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('error', { kind: 'ERROR' });
  });

  // At 390px the board's columns overflowed the page, its epics' handles off-screen (qits-1861):
  // below md the board's tree is drawn stacked instead, within the phone's width (the shell's
  // sidebar collapsed).
  it('stacks the board’s work inline within a phone’s width, every handle on screen', async () => {
    inline();
    await page.viewport(390, 844);
    const { opened, element } = await shown();
    const root = element.element();
    const board = root.querySelector<HTMLElement>('app-kanban-board')!;
    expect(board.getBoundingClientRect().width).toBe(0);
    const stacked = root.querySelector<HTMLElement>('.md\\:hidden > app-work-list')!;
    expect(stacked.getBoundingClientRect().width).toBeGreaterThan(0);
    await expect.element(page.elementLocator(stacked)).toMatchTextContent('Implementing ticket');
    await expect.element(page.elementLocator(stacked)).toMatchTextContent('Started task');
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
    // The top-level epics and tickets carry a handle, as on the board; an epic's features and
    // tasks none.
    const handles = [...root.querySelectorAll<HTMLElement>('ui-drag-handle > button')].filter(
      (handle) => handle.getBoundingClientRect().width > 0,
    );
    expect(handles.length).toBeGreaterThan(0);
    for (const handle of handles) {
      expect(stacked.contains(handle)).toBe(true);
      expect(handle.closest('app-feature-list-row')).toBeNull();
      const box = handle.getBoundingClientRect();
      const label = handle.getAttribute('aria-label');
      expect(box.left, `${label}`).toBeGreaterThanOrEqual(0);
      expect(box.right, `${label}`).toBeLessThanOrEqual(window.innerWidth);
    }
  });

  it('stacks the epic boards’ epics first on a phone, then the rest', async () => {
    await page.viewport(390, 844);
    const { opened, element } = await shown();
    const root = element.element();
    for (const board of root.querySelectorAll<HTMLElement>('app-epic-board, app-kanban-board')) {
      expect(board.getBoundingClientRect().width).toBe(0);
    }
    const stacked = root.querySelector<HTMLElement>('.md\\:hidden > app-work-list')!;
    const text = stacked.textContent ?? '';
    expect(text.indexOf('Started task')).toBeGreaterThan(-1);
    expect(text.indexOf('Ready for dev ticket')).toBeGreaterThan(text.indexOf('Started epic'));
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  });

  it('shows that the work is loading', async () => {
    const { opened, work, element } = await shown(false);
    await expect.element(element.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loading', { kind: 'PENDING' });
    work.flush(null, { status: 500, statusText: 'Server Error' });
    await opened.settled();
  });
});
