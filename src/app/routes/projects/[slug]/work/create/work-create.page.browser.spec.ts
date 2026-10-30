import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { page } from 'vitest/browser';
import { client as projectsClient } from '../../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../../api/projects/client/client.gen';
import { EVENT_SOURCE } from '$core/events/domain-events';
import { provideTestPlatformOrigins } from '../../../../../../testing/platform-origins';
import { goldenMaster } from '../../../../../../testing/browser/golden-master';
import { WorkCreatePage } from './work-create.page';

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
 * Screenshots of the work create form (epic qits-888), opened from "a project with ideas"' idea
 * (its `getIdea`) as Create epic and Create ticket open it.
 */
describe('WorkCreatePage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'projects/:slug/work/create', component: WorkCreatePage }]),
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

  it.each(['EPIC', 'TICKET'])('is filled from an idea as a new %s', async (archetype) => {
    const idea = await goldenMaster(IDEAS, 'getIdea');
    const query = new URLSearchParams({
      archetype,
      title: idea.title,
      description: idea.description,
      inspiredBy: idea.id,
    });
    const { harness, view } = await open(`work/create?${query}`);
    http.expectOne(`/projects/api/ideas/${idea.id}`).flush(idea);
    await answered(harness.fixture);
    await expect.element(view).toMatchTextContent('Inspired by');
    await expect.element(view).toMatchScreenshot(`from-idea-${archetype.toLowerCase()}`);
  });
});
