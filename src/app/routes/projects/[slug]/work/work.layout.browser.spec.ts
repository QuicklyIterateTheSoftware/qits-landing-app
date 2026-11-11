import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { goldenMaster } from '../../../../../testing/browser/golden-master';
import { openRoute, provideAppRoute } from '../../../../../testing/browser/app-route';

/**
 * Screenshots of the work section's tabs inside the shell (`openRoute`), over the real tab pages
 * (In Progress, Archive), answered with qits-projects' golden masters: the project list as
 * recorded, and "a project with work in every status" (one epic and one ticket per status) for the
 * counts. The layout also loads the open workspaces, answered by `openRoute` from qits-workspaces'
 * "a project with workspaces bound to work items"; In Progress reads the active agents, answered
 * from "a project with agents bound to work items" as in its own spec. The layout follows
 * transitions through the event stream; the stream here never connects.
 */

describe('WorkLayout (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    // As wide as the tabs were, plus the sidebar.
    await page.viewport(1040, 600);
    TestBed.configureTestingModule({ providers: [provideAppRoute()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    // Back to the configured viewport, so the next spec file renders as it always does.
    await page.viewport(800, 600);
  });

  /** The section of the recorded project at `tab`, with its work requested. */
  async function shown(tab: string) {
    const opened = await openRoute((project) => `/projects/${project.slug}/work/${tab}`);
    if (tab === 'in-progress') {
      http
        .expectOne('/workspaces/api/agents?state=ACTIVE')
        .flush(
          await goldenMaster(
            'a project with agents bound to work items',
            'listAgents',
            'qits-workspaces',
          ),
        );
    }
    const work = http.expectOne(`/projects/api/projects/${opened.project.id}/work`);
    const layout = opened.frame.querySelector<HTMLElement>('app-work-layout')!;
    // A locator finds the element by what it shows when made, so make it once the page is drawn.
    return {
      opened,
      locate: () => page.elementLocator(layout),
      frame: page.elementLocator(opened.frame),
      work,
      project: opened.project,
    };
  }

  it('shows the tabs in workflow order, each with its count, no Campaigns or Milestones, and marks the current one', async () => {
    // Tall enough for the whole board below the tabs: the shell shows only what is in the viewport.
    await page.viewport(1040, 2000);
    const { opened, locate, frame, work, project } = await shown('in-progress');
    work.flush(await goldenMaster('a project with work in every status', 'listProjectWork'));
    await opened.settled();
    const element = locate();
    const tabs = element.getByRole('navigation', { name: 'Work' }).getByRole('link');
    await expect.element(tabs.nth(2)).toMatchTextContent('9');
    expect(tabs.elements().map((a) => a.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'Refinement 2',
      'Schedule 4',
      'In Progress 9',
      'Acceptance 2',
      'Archive 4',
    ]);
    expect(tabs.elements().map((a) => a.getAttribute('href'))).toEqual([
      `/projects/${project.slug}/work/refinement`,
      `/projects/${project.slug}/work/schedule`,
      `/projects/${project.slug}/work/in-progress`,
      `/projects/${project.slug}/work/acceptance`,
      `/projects/${project.slug}/work/archive`,
    ]);
    await expect.element(tabs.nth(2)).toHaveAttribute('aria-current', 'page');
    await expect.element(tabs.nth(0)).not.toHaveAttribute('aria-current');
    await expect
      .element(element.getByRole('heading', { level: 1 }))
      .toMatchTextContent('In Progress');
    await expect.element(frame).toMatchScreenshot('tabs', { kind: 'DATA' });
  });

  it('hides the counts while the work is loading', async () => {
    const { opened, locate, frame, work } = await shown('archive');
    const element = locate();
    const tabs = element.getByRole('navigation', { name: 'Work' }).getByRole('link');
    await expect.element(tabs.nth(4)).toHaveAttribute('aria-current', 'page');
    await expect.element(tabs.nth(0)).toHaveAccessibleName('Refinement');
    await expect.element(frame).toMatchScreenshot('loading', { kind: 'PENDING' });
    work.flush(null, { status: 500, statusText: 'Server Error' });
    await opened.settled();
  });
});
