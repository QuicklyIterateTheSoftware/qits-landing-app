import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { page } from 'vitest/browser';
import { client as projectsClient } from '../../../../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../../../../api/projects/client/client.gen';
import { EVENT_SOURCE } from '$core/events/domain-events';
import { provideTestPlatformOrigins } from '../../../../../../../../testing/platform-origins';
import { goldenMaster } from '../../../../../../../../testing/browser/golden-master';
import { IdeaEditPage } from './idea-edit.page';

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
 * Screenshots of an idea's edit (epic qits-888): the form filled with "a project with ideas"'
 * `getIdea` (two paragraphs), the enabling choice from that state's list.
 */
describe('IdeaEditPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'projects/:slug/ideas/detail/:ideaId/edit', component: IdeaEditPage },
        ]),
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

  it('fills the form with the idea and counts its description', async () => {
    const idea = await goldenMaster(IDEAS, 'getIdea');
    const { harness, view } = await open(`ideas/detail/${idea.id}/edit`);
    http.expectOne(`/projects/api/ideas/${idea.id}`).flush(idea);
    listRead().flush(await goldenMaster(IDEAS, 'listIdeas'));
    await answered(harness.fixture);
    await expect.element(view).toMatchTextContent('2/3 paragraphs');
    await expect.element(view).toMatchScreenshot('form');
  });
});
