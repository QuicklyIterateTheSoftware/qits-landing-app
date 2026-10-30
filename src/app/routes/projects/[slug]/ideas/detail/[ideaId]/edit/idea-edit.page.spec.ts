import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { client as projectsClient } from '../../../../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../../../../api/projects/client/client.gen';
import {
  goldenMaster,
  projectsGoldenMasters,
} from '../../../../../../../../testing/golden-masters';
import { IdeaEditPage, ideaPatchOf } from './idea-edit.page';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const IDEAS = 'a project with ideas';
const API = '/projects/api/ideas';
const ideaId = projectsGoldenMasters.operation(IDEAS, 'getIdea').params['ideaId'];

describe('ideaPatchOf', () => {
  const before = { title: 'Faster builds', description: 'Cache it.', enabledBy: 'i1' };

  it('sends only what changed, trimmed', () => {
    expect(ideaPatchOf(before, { ...before, title: ' Faster builds ' })).toEqual({});
    expect(ideaPatchOf(before, { ...before, title: 'Quicker builds ' })).toEqual({
      title: 'Quicker builds',
    });
  });

  it('clears a blank description or enabling idea with null', () => {
    expect(ideaPatchOf(before, { ...before, description: '  ', enabledBy: '' })).toEqual({
      description: null,
      enabledBy: null,
    });
  });
});

/** An idea's edit (epic qits-888) on "a project with ideas"' recordings. */
describe('IdeaEditPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'projects/:slug/ideas/detail/:ideaId/edit', component: IdeaEditPage },
          { path: 'projects/:slug/ideas/detail/:ideaId', children: [] },
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
    const navigated = harness.navigateByUrl(
      `/projects/${project.slug}/ideas/detail/${ideaId}/edit`,
    );
    await settle();
    http.expectOne('/projects/api/projects').flush(list);
    await navigated;
    await ticked();
    http.expectOne(`${API}/${ideaId}`).flush(goldenMaster(IDEAS, 'getIdea'));
    http
      .expectOne((req) => req.urlWithParams.startsWith(`${API}?`))
      .flush(goldenMaster(IDEAS, 'listIdeas'));
    await ticked();
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
    const element = harness.routeNativeElement as HTMLElement;
    const button = (label: string) =>
      [...element.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)!;
    return { harness, project, element, button };
  }

  it('fills the form with the idea, offering the other ideas, and saves what changed', async () => {
    const { element, button, harness, project } = await shown();
    const title = element.querySelector<HTMLInputElement>('[aria-label=Title]')!;
    expect(title.value).toBe('Faster builds');
    expect(element.querySelector('[data-paragraphs]')?.textContent?.trim()).toBe('2/3 paragraphs');
    const options = [...element.querySelectorAll('select[aria-label="Enabled by"] option')];
    expect(options.map((o) => o.textContent?.trim())).toEqual(['No idea', 'Share the build cache']);
    title.value = 'Faster builds for everyone';
    title.dispatchEvent(new Event('input'));
    harness.fixture.detectChanges();
    button('Save').click();
    await settle();
    const patch = http.expectOne(`${API}/${ideaId}`);
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ title: 'Faster builds for everyone' });
    patch.flush(goldenMaster(IDEAS, 'patchIdea'));
    await ticked();
    http.expectOne(`${API}/${ideaId}`).flush(goldenMaster(IDEAS, 'getIdea'));
    await ticked();
    expect(TestBed.inject(Router).url).toBe(`/projects/${project.slug}/ideas/detail/${ideaId}`);
  });

  it('shows a refused edit in the service’s words', async () => {
    const { element, button, harness } = await shown();
    const description = element.querySelector<HTMLTextAreaElement>('[aria-label=Description]')!;
    description.value = 'One.\n\nTwo.\n\nThree.\n\nFour.';
    description.dispatchEvent(new Event('input'));
    harness.fixture.detectChanges();
    button('Save').click();
    await settle();
    const patch = http.expectOne(`${API}/${ideaId}`);
    expect(patch.request.body).toEqual({ description: 'One.\n\nTwo.\n\nThree.\n\nFour.' });
    patch.flush(
      {
        message:
          'description has 4 paragraphs; at most 3 (a paragraph is a block separated by a blank line)',
      },
      { status: 400, statusText: 'Bad Request' },
    );
    await ticked();
    harness.fixture.detectChanges();
    expect(element.querySelector('[role=alert]')?.textContent).toContain(
      'description has 4 paragraphs',
    );
  });
});
