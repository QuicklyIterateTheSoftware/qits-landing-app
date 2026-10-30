import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { page } from 'vitest/browser';
import { client as projectsClient } from '../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../api/projects/client/client.gen';
import { EVENT_SOURCE } from '$core/events/domain-events';
import { provideTestPlatformOrigins } from '../../../../../testing/platform-origins';
import { goldenMaster } from '../../../../../testing/browser/golden-master';
import { ProjectIdeasPage } from './project-ideas.page';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

/** Runs the page's effects and lets the client build its requests. */
async function ticked() {
  for (let i = 0; i < 3; i++) {
    TestBed.tick();
    await settle();
  }
}

const IDEAS = 'a project with ideas';

/**
 * Screenshots of the Ideas page (epic qits-888), answered with qits-projects' recordings: "a
 * project with ideas"' list (a queued and a planned idea). The open project is "a project exists"'.
 */
describe('ProjectIdeasPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'projects/:slug/ideas', component: ProjectIdeasPage }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        provideTestPlatformOrigins(),
        {
          provide: EVENT_SOURCE,
          useValue: () => ({ onmessage: null, onerror: null, readyState: 0, close: () => {} }),
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    await page.viewport(800, 600);
  });

  /** The page at `path` below the recorded project ("a project exists"), its list answered. */
  async function open(path: string) {
    await page.viewport(900, 900);
    const list = await goldenMaster('a project exists', 'listProjects');
    const project = list.entries[0].project;
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(`/projects/${project.slug}/${path}`);
    await settle();
    http.expectOne('/projects/api/projects').flush(list);
    await navigated;
    await ticked();
    const element = harness.routeNativeElement as HTMLElement;
    element.style.width = '900px';
    return { harness, element, view: page.elementLocator(element) };
  }

  async function answered(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
    await ticked();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /** The list read: the generated client writes its query into the URL. */
  const listRead = () =>
    http.expectOne((req) => req.urlWithParams.startsWith('/projects/api/ideas?'));

  it('lists the ideas with their status', async () => {
    const { harness, view } = await open('ideas');
    listRead().flush(await goldenMaster(IDEAS, 'listIdeas'));
    await answered(harness.fixture);
    await expect.element(view).toMatchTextContent('Share the build cache');
    await expect.element(view).toMatchScreenshot('list');
  });

  it('marks the page as loading, then says it failed, with Retry', async () => {
    const { harness, view } = await open('ideas');
    const read = listRead();
    await expect.element(view.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect.element(view).toMatchScreenshot('loading');
    read.flush(null, { status: 500, statusText: 'Server Error' });
    await answered(harness.fixture);
    await expect.element(view.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect.element(view).toMatchScreenshot('error');
  });
});
