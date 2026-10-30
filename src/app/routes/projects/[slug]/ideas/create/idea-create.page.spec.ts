import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { client as projectsClient } from '../../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../../api/projects/client/client.gen';
import { goldenMaster } from '../../../../../../testing/golden-masters';
import { IdeaCreatePage } from './idea-create.page';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const IDEAS = 'a project with ideas';
const NO_WORK = 'a project with no work';
const API = '/projects/api/ideas';

/**
 * The new idea page (epic qits-888): the open project is "a project exists"' one, its ideas "a
 * project with ideas"' list; a create is answered with "a project with no work"'s created idea, a
 * refusal with "a project with ideas"' recorded 400.
 */
describe('IdeaCreatePage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'projects/:slug/ideas/create', component: IdeaCreatePage },
          { path: 'projects/:slug/ideas/detail/:ideaId', children: [] },
          { path: 'projects/:slug/ideas', children: [] },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function ticked() {
    for (let i = 0; i < 3; i++) {
      TestBed.tick();
      await settle();
    }
  }

  async function shown() {
    const list = goldenMaster('a project exists', 'listProjects');
    const project = list.entries[0].project;
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(`/projects/${project.slug}/ideas/create`);
    await settle();
    http.expectOne('/projects/api/projects').flush(list);
    await navigated;
    await ticked();
    http
      .expectOne((req) => req.urlWithParams.startsWith(`${API}?`))
      .flush(goldenMaster(IDEAS, 'listIdeas'));
    await ticked();
    await harness.fixture.whenStable();
    const element = harness.routeNativeElement as HTMLElement;
    const type = (label: string, text: string) => {
      const box = element.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;
      box.value = text;
      box.dispatchEvent(new Event('input'));
      harness.fixture.detectChanges();
    };
    const button = (label: string) =>
      [...element.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)!;
    return { harness, project, element, type, button };
  }

  it('offers the project’s ideas as the enabling one, and goes to the new idea', async () => {
    const { element, type, button, project } = await shown();
    const options = [...element.querySelectorAll('select[aria-label="Enabled by"] option')];
    expect(options.map((o) => o.textContent?.trim())).toEqual([
      'No idea',
      'Faster builds',
      'Share the build cache',
    ]);
    type('Title', 'Faster builds');
    type('Description', 'Cache the dependencies between runs.');
    button('Create').click();
    await settle();
    const create = http.expectOne(API);
    expect(create.request.body).toEqual({
      project: project.id,
      title: 'Faster builds',
      description: 'Cache the dependencies between runs.',
    });
    const created = goldenMaster(NO_WORK, 'createIdea');
    create.flush(created, { status: 201, statusText: 'Created' });
    await ticked();
    expect(TestBed.inject(Router).url).toBe(`/projects/${project.slug}/ideas/detail/${created.id}`);
  });

  it('shows the service’s 400 message and keeps what was typed', async () => {
    const { element, type, button, harness } = await shown();
    type('Title', 'Faster builds. Fewer waits. Less cost');
    button('Create').click();
    await settle();
    http
      .expectOne(API)
      .flush(goldenMaster(IDEAS, 'createIdea'), { status: 400, statusText: 'Bad Request' });
    await ticked();
    harness.fixture.detectChanges();
    expect(element.querySelector('[role=alert]')?.textContent?.trim()).toBe(
      "title has 2 '.' characters; at most one, so one title is one sentence",
    );
    expect(element.querySelector<HTMLInputElement>('[aria-label=Title]')!.value).toBe(
      'Faster builds. Fewer waits. Less cost',
    );
  });
});
