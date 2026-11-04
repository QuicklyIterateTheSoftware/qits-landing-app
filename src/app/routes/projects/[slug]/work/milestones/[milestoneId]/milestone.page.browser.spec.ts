import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { page } from 'vitest/browser';
import { client as projectsClient } from '../../../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../../../api/projects/client/client.gen';
import { goldenMaster } from '../../../../../../../testing/browser/golden-master';
import { MilestonePage } from './milestone.page';

/**
 * Screenshots of a milestone's page (epic qits-615). The open project is the recorded one ("a
 * project exists"), its work "a project with no work".
 *
 * `getMilestone` is answered from qits-projects' golden master only in the tests below. Loading and
 * a failed read need no recording.
 */

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

/** The milestone id of the recorded states ("a ticket waiting on …"). */
const MILESTONE = '00000000-0000-4000-8000-000000000002';

describe('MilestonePage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'projects/:slug/work/milestones/:milestoneId', component: MilestonePage },
        ]),
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
    await page.viewport(900, 1000);
    const list = await goldenMaster('a project exists', 'listProjects');
    const project = list.entries[0].project;
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(
      `/projects/${project.slug}/work/milestones/${MILESTONE}`,
    );
    await settle();
    http.expectOne('/projects/api/projects').flush(list);
    await navigated;
    harness.fixture.detectChanges();
    await settle();
    TestBed.tick();
    await settle();
    http
      .expectOne(`/projects/api/projects/${project.id}/work`)
      .flush(await goldenMaster('a project with no work', 'listProjectWork'));
    const element = harness.routeNativeElement as HTMLElement;
    element.style.width = '900px';
    return {
      fixture: harness.fixture,
      element,
      request: http.expectOne(`/projects/api/milestones/${MILESTONE}`),
    };
  }

  async function answered(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
    await settle();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('shows an unmet milestone, its approval criterion with Approve, and what needs it', async () => {
    const { fixture, element, request } = await render();
    request.flush(await goldenMaster('a ticket waiting on an unmet milestone', 'getMilestone'));
    await answered(fixture);
    const view = page.elementLocator(element);
    await expect.element(view).toMatchTextContent('not met');
    await expect.element(view).toMatchTextContent('A person approves');
    await expect.element(view.getByRole('button', { name: 'Approve' })).toBeVisible();
    await expect.element(view).toMatchTextContent('Bootstrap a fresh node');
    await expect.element(view).toMatchScreenshot('unmet');
  });

  it('shows a met milestone with its approval and the dates of each level', async () => {
    const { fixture, element, request } = await render();
    request.flush(await goldenMaster('a ticket waiting on a met milestone', 'getMilestone'));
    await answered(fixture);
    const view = page.elementLocator(element);
    await expect.element(view).toMatchTextContent('met since 2026-01-01 00:00 UTC');
    await expect.element(view).toMatchTextContent('Approved by dev: Node 7 is up.');
    await expect.element(view).toMatchScreenshot('met');
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
      .toMatchTextContent('This milestone could not be read.');
    await expect.element(view).toMatchScreenshot('error');
  });
});
