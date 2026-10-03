import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { page } from 'vitest/browser';
import { client as projectsClient } from '../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../api/projects/client/client.gen';
import { client as workspacesClient } from '../../../../api/workspaces/client.gen';
import { EVENT_SOURCE } from '$core/events/domain-events';
import { WorkLayout } from './work.layout';
import { goldenMaster } from '../../../../../testing/browser/golden-master';

/** A page with fixed text, so the screenshots show the tabs and nothing that loads below them. */
@Component({ selector: 'app-test-page', template: `<p class="px-6">Page content</p>` })
class TestPage {}

/**
 * Screenshots of the work section's tabs, answered with qits-projects' golden masters: the project
 * list as recorded, and "a project with work in every status" (one epic and one ticket per status)
 * for the counts. The layout also loads the open workspaces, answered from qits-workspaces' "a
 * project with workspaces bound to work items". The layout follows transitions through the event
 * stream; the stream here never connects.
 */

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('WorkLayout (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'projects/:slug/work',
            component: WorkLayout,
            children: [
              { path: 'campaigns', component: TestPage },
              { path: 'refinement', component: TestPage },
              { path: 'in-progress', component: TestPage },
              { path: 'acceptance', component: TestPage },
              { path: 'archive', component: TestPage },
            ],
          },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        provideHeyApiClient(workspacesClient),
        {
          provide: EVENT_SOURCE,
          useValue: () => ({ onmessage: null, onerror: null, readyState: 0, close: () => {} }),
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** The section of the recorded project at `tab`, with the list answered and its work requested. */
  async function shown(tab: string) {
    const list = await goldenMaster('a project exists', 'listProjects');
    const project = list.entries[0].project;
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(`/projects/${project.slug}/work/${tab}`);
    await settle();
    http.expectOne('/projects/api/projects').flush(list);
    await navigated;
    http
      .expectOne('/workspaces/api/work/workspaces')
      .flush(
        await goldenMaster(
          'a project with workspaces bound to work items',
          'listOpenWorkspaces',
          'qits-workspaces',
        ),
      );
    // SelectedWork's effect asks for the work once the project is known; let it run.
    TestBed.tick();
    await settle();
    TestBed.tick();
    await settle();
    const work = http.expectOne(`/projects/api/projects/${project.id}/entities`);
    const element = harness.routeNativeElement as HTMLElement;
    element.style.width = '760px';
    const answered = async () => {
      await settle();
      await harness.fixture.whenStable();
      harness.fixture.detectChanges();
    };
    // A locator finds the element by what it shows when made, so make it once the page is drawn.
    return { locate: () => page.elementLocator(element), work, answered, project };
  }

  it('shows Campaigns, then the tabs in workflow order, each with its count, and marks the current one', async () => {
    const { locate, work, answered, project } = await shown('in-progress');
    work.flush(await goldenMaster('a project with work in every status', 'listProjectEntities'));
    await answered();
    const element = locate();
    const tabs = element.getByRole('navigation', { name: 'Work' }).getByRole('link');
    await expect.element(tabs.nth(2)).toHaveTextContent('9');
    expect(tabs.elements().map((a) => a.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'Campaigns 0',
      'Refinement 2',
      'In Progress 9',
      'Acceptance 2',
      'Archive 4',
    ]);
    expect(tabs.elements().map((a) => a.getAttribute('href'))).toEqual([
      `/projects/${project.slug}/work/campaigns`,
      `/projects/${project.slug}/work/refinement`,
      `/projects/${project.slug}/work/in-progress`,
      `/projects/${project.slug}/work/acceptance`,
      `/projects/${project.slug}/work/archive`,
    ]);
    await expect.element(tabs.nth(2)).toHaveAttribute('aria-current', 'page');
    await expect.element(tabs.nth(0)).not.toHaveAttribute('aria-current');
    await expect.element(element).toHaveTextContent('Page content');
    await expect.element(element).toMatchScreenshot('tabs');
  });

  it('hides the counts while the work is loading', async () => {
    const { locate, work } = await shown('archive');
    const element = locate();
    const tabs = element.getByRole('navigation', { name: 'Work' }).getByRole('link');
    await expect.element(tabs.nth(4)).toHaveAttribute('aria-current', 'page');
    await expect.element(tabs.nth(0)).toHaveAccessibleName('Campaigns');
    await expect.element(element).toMatchScreenshot('loading');
    work.flush(null, { status: 500, statusText: 'Server Error' });
    await settle();
  });
});
