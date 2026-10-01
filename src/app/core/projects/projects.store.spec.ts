import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideHeyApiClient } from '../../api/projects/client/client.gen';
import { client as projectsClient } from '../../api/projects/client.gen';
import { goldenMaster } from '../../../testing/golden-masters';
import { ProjectsStore } from './projects.store';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

/** Every answer below is qits-projects' golden master, or one derived from it and saying how. */
const list = () => goldenMaster('a project exists', 'listProjects');
const detail = () => goldenMaster('a project exists', 'getProject');
const project = () => detail().project;

/** An id qits-projects' golden masters do not hold. */
const OTHER_ID = '00000000-0000-4000-8000-0000000000ff';

/** The list answer with its one project under another id. */
function listWithOtherId() {
  const body = list();
  return {
    ...body,
    entries: body.entries.map((e: any) => ({ project: { ...e.project, id: OTHER_ID } })),
  };
}

describe('ProjectsStore', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** The list answer, plus a copy of its project WITHOUT an id: the spec leaves `id` optional. */
  async function loadedStore(body: object = withProjectWithoutId()) {
    const store = TestBed.inject(ProjectsStore);
    await settle();
    http.expectOne('/projects/api/projects').flush(body);
    await settle();
    return store;
  }

  function withProjectWithoutId() {
    const body = list();
    const { id: _, ...withoutId } = body.entries[0].project;
    return { ...body, entries: [...body.entries, { project: withoutId }] };
  }

  it('loads the list on init, keeping only projects with an id', async () => {
    const store = await loadedStore();
    expect(store.status()).toBe('loaded');
    expect(store.ids()).toEqual([project().id]);
  });

  it('does not load twice', async () => {
    const store = await loadedStore();
    await store.load();
    http.expectNone('/projects/api/projects');
  });

  it('refreshes the list without an id', async () => {
    const store = await loadedStore();
    const done = store.refresh();
    await settle();
    http.expectOne('/projects/api/projects').flush(listWithOtherId());
    await done;
    expect(store.ids()).toEqual([OTHER_ID]);
  });

  it('selects a known project without fetching it', async () => {
    const store = await loadedStore();
    await store.refresh(project().id);
    expect(store.selected()?.name).toBe(project().name);
  });

  it('selects an unknown project and fetches its detail', async () => {
    const store = await loadedStore(listWithOtherId());
    const id = project().id;
    const done = store.refresh(id);
    expect(store.selectedId()).toBe(id);
    expect(store.selected()).toBeUndefined();
    await settle();
    http.expectOne(`/projects/api/projects/${id}`).flush(detail());
    await done;
    expect(store.selected()?.name).toBe(project().name);
    expect(store.ids()).toEqual([OTHER_ID, id]);
  });

  it('selects a project qits-projects does not know, and holds nothing for it', async () => {
    const store = await loadedStore(listWithOtherId());
    const id = project().id;
    const done = store.refresh(id);
    await settle();
    http
      .expectOne(`/projects/api/projects/${id}`)
      .flush(goldenMaster('no project with the given id', 'getProject'), {
        status: 404,
        statusText: 'Not Found',
      });
    await done;
    expect(store.selectedId()).toBe(id);
    expect(store.selected()).toBeUndefined();
    expect(store.ids()).toEqual([OTHER_ID]);
  });

  it('reports a failed list', async () => {
    const store = TestBed.inject(ProjectsStore);
    await settle();
    http
      .expectOne('/projects/api/projects')
      .flush(null, { status: 500, statusText: 'Server Error' });
    await settle();
    expect(store.status()).toBe('error');
  });
});
