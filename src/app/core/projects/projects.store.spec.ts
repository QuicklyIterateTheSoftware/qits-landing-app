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

  it('keeps a project’s release requests and, apart, the pending ones, fetched once', async () => {
    const store = await loadedStore();
    const id = project().id;
    // Recorded: PENDING, READY, REJECTED, CONFLICTED, FAILED, RELEASED and one FINALIZED. FINALIZED
    // is done, so the six others are pending, in that order.
    const done = store.loadReleaseRequests(id);
    expect(store.releaseRequests()[id]?.status).toBe('loading');
    await settle();
    http
      .expectOne(`/projects/api/projects/${id}/release-requests`)
      .flush(
        goldenMaster(
          'a project with release requests in every state',
          'listProjectReleaseRequests',
        ),
      );
    await done;
    const kept = store.releaseRequests()[id];
    expect(kept?.status).toBe('loaded');
    expect(kept?.requests).toHaveLength(7);
    expect(kept?.pending.map((r) => r.state)).toEqual([
      'PENDING',
      'READY',
      'REJECTED',
      'CONFLICTED',
      'FAILED',
      'RELEASED',
    ]);
    await store.loadReleaseRequests(id);
    http.expectNone(`/projects/api/projects/${id}/release-requests`);
  });

  it('keeps no release requests for a project without any', async () => {
    const store = await loadedStore();
    const id = project().id;
    const done = store.loadReleaseRequests(id);
    await settle();
    http
      .expectOne(`/projects/api/projects/${id}/release-requests`)
      .flush(goldenMaster('a project with no release requests', 'listProjectReleaseRequests'));
    await done;
    expect(store.releaseRequests()[id]).toEqual({ status: 'loaded', requests: [], pending: [] });
  });

  it('reports failed release requests, and fetches them again on the next ask', async () => {
    const store = await loadedStore();
    const id = project().id;
    const done = store.loadReleaseRequests(id);
    await settle();
    http
      .expectOne(`/projects/api/projects/${id}/release-requests`)
      .flush(null, { status: 500, statusText: 'Server Error' });
    await done;
    expect(store.releaseRequests()[id]?.status).toBe('error');
    void store.loadReleaseRequests(id);
    await settle();
    http.expectOne(`/projects/api/projects/${id}/release-requests`);
  });

  it('coalesces refreshes asked for while a fetch is in flight into one follow-up fetch', async () => {
    const store = await loadedStore();
    const id = project().id;
    const url = `/projects/api/projects/${id}/release-requests`;
    const done = store.loadReleaseRequests(id);
    await settle();
    // Consumes the in-flight request, so it no longer counts towards `http`'s open requests.
    const firstRequest = http.expectOne(url);

    const refresh1 = store.refreshReleaseRequests(id);
    const refresh2 = store.refreshReleaseRequests(id);
    const refresh3 = store.refreshReleaseRequests(id);
    await settle();
    // None of the three refreshes started a second call while the first was still in flight.
    http.expectNone(url);

    firstRequest.flush(
      goldenMaster('a project with release requests in every state', 'listProjectReleaseRequests'),
    );
    await settle();
    // Exactly one follow-up fetch for the three refreshes, not three.
    http
      .expectOne(url)
      .flush(goldenMaster('a project with no release requests', 'listProjectReleaseRequests'));

    await Promise.all([done, refresh1, refresh2, refresh3]);
    expect(store.releaseRequests()[id]).toEqual({ status: 'loaded', requests: [], pending: [] });
    http.expectNone(url);
  });

  it('never has two release-request fetches in flight for the same project at once', async () => {
    const store = await loadedStore();
    const id = project().id;
    const url = `/projects/api/projects/${id}/release-requests`;
    const loadDone = store.loadReleaseRequests(id);
    const refreshDone = store.refreshReleaseRequests(id);
    await settle();
    // Only the load's fetch is in flight; the concurrent refresh shares it rather than starting
    // its own.
    const firstRequest = http.expectOne(url);
    http.expectNone(url);

    firstRequest.flush(
      goldenMaster('a project with release requests in every state', 'listProjectReleaseRequests'),
    );
    await settle();
    // The refresh that arrived while the first fetch was in flight is coalesced into one
    // follow-up, not run alongside it.
    http
      .expectOne(url)
      .flush(goldenMaster('a project with no release requests', 'listProjectReleaseRequests'));

    await Promise.all([loadDone, refreshDone]);
    expect(store.releaseRequests()[id]).toEqual({ status: 'loaded', requests: [], pending: [] });
    http.expectNone(url);
  });

  it('starts a new fetch on a refresh after the previous one has settled', async () => {
    const store = await loadedStore();
    const id = project().id;
    const url = `/projects/api/projects/${id}/release-requests`;
    const done = store.loadReleaseRequests(id);
    await settle();
    http
      .expectOne(url)
      .flush(
        goldenMaster(
          'a project with release requests in every state',
          'listProjectReleaseRequests',
        ),
      );
    await done;
    expect(store.releaseRequests()[id]?.requests).toHaveLength(7);

    const refreshDone = store.refreshReleaseRequests(id);
    await settle();
    http
      .expectOne(url)
      .flush(goldenMaster('a project with no release requests', 'listProjectReleaseRequests'));
    await refreshDone;
    expect(store.releaseRequests()[id]).toEqual({ status: 'loaded', requests: [], pending: [] });
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
