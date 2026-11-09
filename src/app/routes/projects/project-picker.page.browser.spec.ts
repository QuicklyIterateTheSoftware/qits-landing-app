import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { page } from 'vitest/browser';
import { client as githostClient } from '../../api/githost/client.gen';
import { client as projectsClient } from '../../api/projects/client.gen';
import { provideHeyApiClient } from '../../api/projects/client/client.gen';
import { ProjectPickerPage } from './project-picker.page';
import { goldenMaster } from '../../../testing/browser/golden-master';

/**
 * Screenshots of the start page in a real browser, opened through the router at `/projects`. The
 * answers are qits-projects' and qits-githost's golden masters, read on the Node side through the
 * `goldenMaster` command.
 */

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('ProjectPickerPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'projects', component: ProjectPickerPage }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        provideHeyApiClient(githostClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** The page at `/projects`, with the project list requested, not answered. */
  async function render() {
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl('/projects');
    await settle();
    const list = http.expectOne('/projects/api/projects');
    // The page is routed before the list answers.
    await navigated;
    harness.fixture.detectChanges();
    return { harness, list };
  }

  async function answered(harness: RouterTestingHarness) {
    await settle();
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
  }

  /** The routed page. */
  function view(harness: RouterTestingHarness) {
    return page.elementLocator(harness.routeNativeElement as HTMLElement);
  }

  it('shows that the projects are loading', async () => {
    const { harness, list } = await render();
    const picker = view(harness);
    await expect.element(picker.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect.element(picker).toMatchScreenshot('loading');
    list.flush(null, { status: 500, statusText: 'Server Error' });
    await answered(harness);
  });

  it('shows one card per project', async () => {
    const { harness, list } = await render();
    const recorded = await goldenMaster('two projects exist', 'listProjects');
    list.flush(recorded);
    await settle();
    TestBed.tick();
    await settle();
    const [first, second] = recorded.entries.map(
      (entry: { project: { id: string } }) => entry.project.id,
    );
    // "two projects exist" records the first project's repositories and work; the second's come
    // from the states that record a project with one repository and a project with no work.
    http
      .expectOne(`/projects/api/projects/${first}/repositories`)
      .flush(await goldenMaster('two projects exist', 'listProjectRepositories'));
    http
      .expectOne(`/projects/api/projects/${second}/repositories`)
      .flush(await goldenMaster('a project with one repository', 'listProjectRepositories'));
    http
      .expectOne(`/projects/api/projects/${first}/work`)
      .flush(await goldenMaster('two projects exist', 'listProjectWork'));
    http
      .expectOne(`/projects/api/projects/${second}/work`)
      .flush(await goldenMaster('a project with no work', 'listProjectWork'));
    // The cards stay collapsed, so no lines are requested.
    http.expectNone('/githost/api/loc');
    await answered(harness);
    const cards = view(harness).getByRole('listitem');
    await expect.element(cards.nth(0)).toMatchTextContent('qits');
    await expect.element(cards.nth(0)).toMatchTextContent('Work 2');
    await expect.element(cards.nth(0)).toMatchTextContent('Components 3');
    await expect.element(cards.nth(1)).toMatchTextContent('telemetry');
    await expect.element(cards.nth(1)).toMatchTextContent('Work 0');
    await expect.element(cards.nth(1)).toMatchTextContent('Components 2');
    await expect.element(view(harness)).toMatchScreenshot('loaded');
  });

  it('says so when there are no projects', async () => {
    const { harness, list } = await render();
    list.flush(await goldenMaster('no projects exist', 'listProjects'));
    await answered(harness);
    const picker = view(harness);
    await expect.element(picker).toMatchTextContent('There are no projects yet.');
    await expect.element(picker).toMatchScreenshot('empty');
  });

  it('marks the list as failed to load when the projects could not be loaded', async () => {
    const { harness, list } = await render();
    list.flush(null, { status: 500, statusText: 'Server Error' });
    await answered(harness);
    const picker = view(harness);
    await expect.element(picker.getByRole('img', { name: 'Failed to load' })).toBeVisible();
    await expect.element(picker).toMatchScreenshot('error');
  });
});
