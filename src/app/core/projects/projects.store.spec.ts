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
const detail = () => goldenMaster('a project exists', 'getProject');
const project = () => detail().project;

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

  /** The store: it reads nothing on its own (the projects are `SelectedProject`'s). */
  async function loadedStore() {
    const store = TestBed.inject(ProjectsStore);
    await settle();
    return store;
  }

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
});
