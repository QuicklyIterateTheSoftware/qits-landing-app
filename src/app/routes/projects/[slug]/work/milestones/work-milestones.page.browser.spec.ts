import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { page } from 'vitest/browser';
import { client as projectsClient } from '../../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../../api/projects/client/client.gen';
import { goldenMaster } from '../../../../../../testing/browser/golden-master';
import { WorkMilestonesPage } from './work-milestones.page';

/**
 * Screenshots of the Milestones page (epic qits-615). The open project is the recorded one ("a
 * project exists"), found by the URL's slug in the recorded project list, as on the other project
 * pages.
 *
 * `listProjectMilestones` is answered from qits-projects' golden master only in the test below that
 * is skipped and says why: `@qits/projects-golden-masters` does not carry the milestone states yet
 * (see `milestones.store.pact.spec.ts`), and the guard refuses a body the committed pact does not
 * use. Loading and a failed read need no recording.
 */

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('WorkMilestonesPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'projects/:slug/work/milestones', component: WorkMilestonesPage }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    await page.viewport(800, 600);
  });

  async function render() {
    await page.viewport(900, 800);
    const list = await goldenMaster('a project exists', 'listProjects');
    const project = list.entries[0].project;
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(`/projects/${project.slug}/work/milestones`);
    await settle();
    http.expectOne('/projects/api/projects').flush(list);
    await navigated;
    harness.fixture.detectChanges();
    await settle();
    TestBed.tick();
    await settle();
    const element = harness.routeNativeElement as HTMLElement;
    element.style.width = '900px';
    return {
      fixture: harness.fixture,
      element,
      request: http.expectOne(`/projects/api/projects/${project.id}/milestones`),
    };
  }

  async function answered(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
    await settle();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  // Skipped: "a ticket waiting on a met milestone" is committed on qits-projects-service's
  // `epic/qits-615` branch but not released, so `@qits/projects-golden-masters` does not carry it
  // and the committed pact does not use it. Unskip once the pin carries it (the pact spec's
  // interaction for it then runs, and the pact holds it).
  it.skip('lists a met and an unmet milestone, with their dates and what needs them', async () => {
    const { fixture, element, request } = await render();
    request.flush(
      await goldenMaster('a ticket waiting on a met milestone', 'listProjectMilestones'),
    );
    await answered(fixture);
    const view = page.elementLocator(element);
    await expect.element(view).toMatchTextContent('bootstrap test node');
    await expect.element(view).toMatchTextContent('met since 2026-01-01 00:00 UTC');
    await expect.element(view).toMatchTextContent('1 item needs it');
    await expect.element(view).toMatchScreenshot('loaded');
  });

  it('marks the page as loading, then says it failed, with Retry', async () => {
    const { fixture, element, request } = await render();
    const view = page.elementLocator(element);
    await expect.element(view.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect.element(view).toMatchScreenshot('loading');
    request.flush(null, { status: 500, statusText: 'Server Error' });
    await answered(fixture);
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent('The milestones could not be read.');
    await expect.element(view.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect.element(view).toMatchScreenshot('error');
  });

  it('opens the new milestone form with one approval criterion', async () => {
    const { fixture, element, request } = await render();
    request.flush(null, { status: 500, statusText: 'Server Error' });
    await answered(fixture);
    const view = page.elementLocator(element);
    await view.getByRole('button', { name: 'New milestone' }).click();
    fixture.detectChanges();
    await expect.element(view.getByRole('form', { name: 'New milestone' })).toBeVisible();
    await expect.element(view).toMatchTextContent('Name the milestone.');
    await expect.element(view.getByRole('button', { name: 'Create' })).toBeDisabled();
    await expect.element(view).toMatchScreenshot('new');
  });
});
