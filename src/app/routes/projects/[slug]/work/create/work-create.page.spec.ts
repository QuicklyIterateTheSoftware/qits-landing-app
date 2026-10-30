import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { client as projectsClient } from '../../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../../api/projects/client/client.gen';
import { goldenMaster, projectsGoldenMasters } from '../../../../../../testing/golden-masters';
import { WorkCreatePage } from './work-create.page';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const IDEAS = 'a project with ideas';
const NO_WORK = 'a project with no work';
const ideaId = projectsGoldenMasters.operation(IDEAS, 'getIdea').params['ideaId'];

/**
 * The work create form (epic qits-888): the open project is "a project exists"' one; a create is
 * answered with "a project with no work"'s created ticket, the project's work read again after it
 * with that state's (empty) list.
 */
describe('WorkCreatePage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'projects/:slug/work/create', component: WorkCreatePage },
          { path: 'projects/:slug/work/detail/:id', children: [] },
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

  async function shown(query: string) {
    const list = goldenMaster('a project exists', 'listProjects');
    const project = list.entries[0].project;
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(`/projects/${project.slug}/work/create${query}`);
    await settle();
    http.expectOne('/projects/api/projects').flush(list);
    await navigated;
    await ticked();
    harness.fixture.detectChanges();
    const element = harness.routeNativeElement as HTMLElement;
    const field = <T extends HTMLElement>(label: string) =>
      element.querySelector<T>(`[aria-label="${label}"]`)!;
    const type = (label: string, text: string) => {
      const box = field<HTMLInputElement>(label);
      box.value = text;
      box.dispatchEvent(new Event('input'));
      harness.fixture.detectChanges();
    };
    const button = (label: string) =>
      [...element.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)!;
    return { harness, project, element, field, type, button };
  }

  it('is filled from an idea, names it, and sends it as the inspiration', async () => {
    const query = new URLSearchParams({
      archetype: 'EPIC',
      title: 'Faster builds',
      description: 'Cache the dependencies between runs.',
      inspiredBy: ideaId,
    });
    const { element, field, button, harness, project } = await shown(`?${query}`);
    http.expectOne(`/projects/api/ideas/${ideaId}`).flush(goldenMaster(IDEAS, 'getIdea'));
    await ticked();
    harness.fixture.detectChanges();
    expect(element.querySelector('[data-inspired-by] a')?.textContent?.trim()).toBe(
      'Faster builds',
    );
    expect(field<HTMLSelectElement>('Archetype').value).toBe('EPIC');
    expect(field<HTMLInputElement>('Title').value).toBe('Faster builds');
    expect(field<HTMLTextAreaElement>('Description').value).toBe(
      'Cache the dependencies between runs.',
    );
    expect(field('Impetus')).toBeNull();
    button('Create').click();
    await settle();
    const create = http.expectOne('/projects/api/work');
    expect(create.request.body).toEqual({
      archetype: 'EPIC',
      project: project.id,
      title: 'Faster builds',
      description: 'Cache the dependencies between runs.',
      inspiredBy: ideaId,
    });
    const created = goldenMaster(NO_WORK, 'createWork');
    create.flush(created, { status: 201, statusText: 'Created' });
    await ticked();
    http
      .expectOne(`/projects/api/projects/${project.id}/work`)
      .flush(goldenMaster(NO_WORK, 'listProjectWork'));
    await ticked();
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${project.slug}/work/detail/${created.qualifiedId}`,
    );
  });

  it('asks a ticket for its kind and impetus, and shows a refusal in the service’s words', async () => {
    const { element, field, type, button, harness, project } = await shown('?archetype=TICKET');
    expect(field<HTMLSelectElement>('Kind').value).toBe('IMPROVEMENT');
    type('Title', 'Export fails for an empty quarter');
    type('Impetus', 'The CSV export answers 500.');
    button('Create').click();
    await settle();
    const create = http.expectOne('/projects/api/work');
    expect(create.request.body).toEqual({
      archetype: 'TICKET',
      project: project.id,
      title: 'Export fails for an empty quarter',
      ticketType: 'IMPROVEMENT',
      impetus: 'The CSV export answers 500.',
    });
    // An error answer is a status and anything.
    create.flush({ message: 'title is taken' }, { status: 409, statusText: 'Conflict' });
    await ticked();
    harness.fixture.detectChanges();
    expect(element.querySelector('[role=alert]')?.textContent?.trim()).toBe('title is taken');
  });
});
