import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { page } from 'vitest/browser';
import { client as projectsClient } from '../../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../../api/projects/client/client.gen';
import { EVENT_SOURCE } from '$core/events/domain-events';
import { WorkItemPage } from './work-item.page';
import { goldenMaster } from '../../../../../../testing/browser/golden-master';

/**
 * Screenshots of one work item's page and its actions, answered with qits-projects' golden masters:
 * the project list as recorded, and the work of "a project with work in every status" (one epic and
 * one ticket per status) or "an epic with features and tasks". The page follows transitions
 * through the event stream; the stream here never connects.
 */

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('WorkItemPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'projects/:slug/work/:id', component: WorkItemPage }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        {
          provide: EVENT_SOURCE,
          useValue: () => ({ onmessage: null, onerror: null, readyState: 0, close: () => {} }),
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** The page of the entity titled `title` in `state`'s recorded work. */
  async function render(state: string, title: string) {
    const list = await goldenMaster('a project exists', 'listProjects');
    const project = list.entries[0].project;
    const work = await goldenMaster(state, 'listProjectEntities');
    const entity = work.entities.find((e: { title: string }) => e.title === title);
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(`/projects/${project.slug}/work/${entity.qualifiedId}`);
    await settle();
    http.expectOne('/projects/api/projects').flush(list);
    await navigated;
    // SelectedWork's effect asks for the work once the project is known; let it run.
    TestBed.tick();
    await settle();
    TestBed.tick();
    await settle();
    http.expectOne(`/projects/api/projects/${project.id}/entities`).flush(work);
    await settle();
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
    const element = harness.routeNativeElement as HTMLElement;
    element.style.width = '760px';
    return page.elementLocator(element);
  }

  it('shows every group for a reported ticket', async () => {
    const element = await render('a project with work in every status', 'Reported ticket');
    await expect
      .element(element.getByRole('heading', { level: 1 }))
      .toHaveTextContent('Reported ticket');
    await expect.element(element.getByRole('group', { name: 'Agent' })).toBeVisible();
    await expect
      .element(element.getByRole('group', { name: 'Status' }))
      .toHaveTextContent('Mark refined');
    await expect.element(element.getByRole('group', { name: 'Plan' })).toHaveTextContent('Refine');
    await expect.element(element).toMatchScreenshot('reported-ticket');
  });

  it('drops the plan once an epic is implementing', async () => {
    const element = await render('a project with work in every status', 'Implementing epic');
    await expect.element(element.getByRole('group', { name: 'Agent' })).toBeVisible();
    await expect
      .element(element.getByRole('group', { name: 'Status' }))
      .not.toHaveTextContent('Mark refined');
    expect(element.getByRole('group', { name: 'Plan' }).elements()).toHaveLength(0);
    await expect.element(element).toMatchScreenshot('implementing-epic');
  });

  it('offers only Drop for a verified ticket', async () => {
    const element = await render('a project with work in every status', 'Verified ticket');
    expect(element.getByRole('group').elements()).toHaveLength(1);
    await expect.element(element.getByRole('group', { name: 'Status' })).toHaveTextContent('Drop');
    await expect.element(element).toMatchScreenshot('verified-ticket');
  });

  it('offers nothing for done work', async () => {
    const element = await render('a project with work in every status', 'Done epic');
    expect(element.getByRole('button').elements()).toHaveLength(0);
    await expect.element(element).toMatchScreenshot('done-epic');
  });

  it('offers Edit and Reshape for a feature of a refined epic', async () => {
    const element = await render('an epic with features and tasks', 'Open feature');
    expect(element.getByRole('group').elements()).toHaveLength(1);
    const buttons = element.getByRole('group', { name: 'Plan' }).getByRole('button');
    expect(buttons.elements().map((b) => b.textContent?.trim())).toEqual(['Edit', 'Reshape']);
    await expect.element(element).toMatchScreenshot('feature');
  });
});
