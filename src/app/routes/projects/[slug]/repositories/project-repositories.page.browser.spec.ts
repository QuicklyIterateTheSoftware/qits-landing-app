import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { commands, page } from 'vitest/browser';
import { client as projectsClient } from '../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../api/projects/client/client.gen';
import { ProjectRepositoriesPage } from './project-repositories.page';
import { goldenMaster } from '../../../../../testing/browser/golden-master';

/**
 * Screenshots of the Repositories page, answered with qits-projects' recording of "a project with
 * repositories in components": the wrapper on top, `components/billing` and `components/contract`
 * below, and every backup state. The open project is the recorded one ("a project exists"),
 * found by the URL's slug in the recorded project list.
 */

const STATE = 'a project with repositories in components';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('ProjectRepositoriesPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'projects/:slug/repositories', component: ProjectRepositoriesPage },
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
    // Back to the configured viewport, so the next spec file renders as it always does.
    await page.viewport(800, 600);
  });

  async function render() {
    // Tall enough for the whole tree: a screenshot shows only what is in the viewport.
    await page.viewport(900, 1200);
    const list = await goldenMaster('a project exists', 'listProjects');
    const project = list.entries[0].project;
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(`/projects/${project.slug}/repositories`);
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
      request: http.expectOne(`/projects/api/projects/${project.id}/repositories`),
    };
  }

  async function answered(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
    await settle();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('lays the repositories out like the wrapper, with every backup state', async () => {
    const { fixture, element, request } = await render();
    request.flush(await goldenMaster(STATE, 'listProjectRepositories'));
    await answered(fixture);
    const view = page.elementLocator(element);
    await expect.element(view.getByRole('heading', { name: 'components/' })).toBeVisible();
    await expect.element(view.getByRole('heading', { name: 'contract/' })).toBeVisible();
    await expect.element(view).toMatchTextContent('Succeeded');
    await expect.element(view).toMatchTextContent('Auth needed');
    await expect.element(view).toMatchTextContent('No twin');
    await expect.element(view).toMatchScreenshot('tree');
  });

  it('shows a card’s clone URL, backup URL and main branch when opened', async () => {
    const { fixture, element, request } = await render();
    request.flush(await goldenMaster(STATE, 'listProjectRepositories'));
    await answered(fixture);
    await page.getByRole('button', { name: 'Show more' }).first().click();
    // The pointer stays on the button after the click; its hover colour would vary the screenshot.
    await commands.parkPointer();
    await answered(fixture);
    const view = page.elementLocator(element);
    await expect.element(view).toMatchTextContent('https://githost.example.test/git/');
    await expect.element(view).toMatchScreenshot('opened');
  });

  it('marks the page as loading, then as failed to load', async () => {
    const { fixture, element, request } = await render();
    const view = page.elementLocator(element);
    await expect.element(view.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect.element(view).toMatchScreenshot('loading');
    request.flush(null, { status: 500, statusText: 'Server Error' });
    await answered(fixture);
    await expect.element(view.getByRole('img', { name: 'Failed to load' })).toBeVisible();
    await expect.element(view).toMatchScreenshot('error');
  });
});
