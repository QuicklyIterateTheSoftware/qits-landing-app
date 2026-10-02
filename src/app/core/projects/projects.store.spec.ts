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

  it('loads a project’s repositories once', async () => {
    const store = await loadedStore();
    const id = project().id;
    const repositories = goldenMaster('a project with 3 repositories', 'listProjectRepositories');
    const done = store.loadRepositories(id);
    expect(store.repositories()[id]?.status).toBe('loading');
    await settle();
    http.expectOne(`/projects/api/projects/${id}/repositories`).flush(repositories);
    await done;
    expect(store.repositories()[id]).toEqual({ status: 'loaded', entries: repositories.entries });
    await store.loadRepositories(id);
    http.expectNone(`/projects/api/projects/${id}/repositories`);
  });

  it('reports failed repositories, and fetches them again on the next ask', async () => {
    const store = await loadedStore();
    const id = project().id;
    const done = store.loadRepositories(id);
    await settle();
    http
      .expectOne(`/projects/api/projects/${id}/repositories`)
      .flush(null, { status: 500, statusText: 'Server Error' });
    await done;
    expect(store.repositories()[id]?.status).toBe('error');
    void store.loadRepositories(id);
    await settle();
    http.expectOne(`/projects/api/projects/${id}/repositories`);
  });

  it('counts a project’s refined work once, from its whole planning tree', async () => {
    const store = await loadedStore();
    const id = project().id;
    // 3 REFINED (an epic, two tickets), 1 REPORTED, 1 DONE: only the REFINED ones count.
    const work = goldenMaster('a project with refined work', 'listProjectEntities');
    const done = store.loadWork(id);
    expect(store.work()[id]?.status).toBe('loading');
    await settle();
    http.expectOne(`/projects/api/projects/${id}/entities`).flush(work);
    await done;
    expect(store.work()[id]).toMatchObject({ status: 'loaded', count: 3 });
    expect(store.work()[id]?.entries).toHaveLength(work.entities.length);
    await store.loadWork(id);
    http.expectNone(`/projects/api/projects/${id}/entities`);
  });

  it('counts zero for a project with no work', async () => {
    const store = await loadedStore();
    const id = project().id;
    const done = store.loadWork(id);
    await settle();
    http
      .expectOne(`/projects/api/projects/${id}/entities`)
      .flush(goldenMaster('a project with no work', 'listProjectEntities'));
    await done;
    expect(store.work()[id]).toMatchObject({ status: 'loaded', count: 0 });
  });

  it('reports failed work, and fetches it again on the next ask', async () => {
    const store = await loadedStore();
    const id = project().id;
    const done = store.loadWork(id);
    await settle();
    http
      .expectOne(`/projects/api/projects/${id}/entities`)
      .flush(null, { status: 500, statusText: 'Server Error' });
    await done;
    expect(store.work()[id]?.status).toBe('error');
    void store.loadWork(id);
    await settle();
    http.expectOne(`/projects/api/projects/${id}/entities`);
  });

  it('has a session unless the list answers 401', async () => {
    const store = await loadedStore();
    const answered = store.hasSession();
    await settle();
    http.expectOne('/projects/api/projects').flush(list());
    expect(await answered).toBe(true);
    const refused = store.hasSession();
    await settle();
    http
      .expectOne('/projects/api/projects')
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    expect(await refused).toBe(false);
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
