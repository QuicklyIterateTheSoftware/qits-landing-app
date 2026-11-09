import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { goldenMaster } from '../../../../../../testing/browser/golden-master';
import { openRoute, provideAppRoute } from '../../../../../../testing/browser/app-route';

/**
 * Screenshots of a project's In Progress page (the board) inside the shell and the work tabs
 * (`openRoute`), answered with qits-projects' golden masters: the project list as recorded, and "a
 * project with work in every status" (one epic and one ticket per status, DROPPED included) or "an
 * epic with features and tasks" for its work. The active agents are qits-workspaces' "a project
 * with agents bound to work items": its agent is on an item these projects do not hold, so no agent
 * section shows (`work-in-progress.page.spec.ts` covers them).
 */

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
    // Back to the configured viewport, so the next spec file renders as it always does.
    await page.viewport(800, 600);
  });

  /** The page of the recorded project, with its active agents answered and its work requested. */
  async function shown(answerWork = true, workState = 'a project with work in every status') {
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

  it('shows the work being worked on, and nothing before or after it', async () => {
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
    await expect.element(page.elementLocator(opened.frame)).toMatchScreenshot('board');
  });

  it('nests an epic’s features and tasks in its lane', async () => {
    const { opened, element } = await shown(true, 'an epic with features and tasks');
    await expect.element(element).toMatchTextContent('Nested epic');
    await expect.element(element).toMatchTextContent('Shipped feature');
    await expect.element(element).toMatchTextContent('Open task');
    await expect.element(page.elementLocator(opened.frame)).toMatchScreenshot('nested');
  });

  // At 390px the board's columns overflowed the page, its epics' handles off-screen (qits-1861):
  // below md the board's tree is drawn stacked instead, within the phone's width (the shell's
  // sidebar collapsed).
  it('stacks the board’s work within a phone’s width, every handle on screen', async () => {
    await page.viewport(390, 844);
    const { element } = await shown();
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

  it('shows that the work is loading', async () => {
    const { opened, work, element } = await shown(false);
    await expect.element(element.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect.element(page.elementLocator(opened.frame)).toMatchScreenshot('loading');
    work.flush(null, { status: 500, statusText: 'Server Error' });
    await opened.settled();
  });
});
