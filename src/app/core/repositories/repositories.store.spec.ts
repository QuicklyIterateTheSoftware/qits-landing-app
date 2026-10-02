import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideHeyApiClient } from '../../api/projects/client/client.gen';
import { client as projectsClient } from '../../api/projects/client.gen';
import { goldenMaster } from '../../../testing/golden-masters';
import { RepositoriesStore } from './repositories.store';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

/** The recorded project's id: every state seeds its project under this frozen id. */
const ID = '00000000-0000-4000-8000-000000000001';
const STATE = 'a project with repositories in components';

describe('RepositoriesStore', () => {
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

  it('requests nothing until asked to load', async () => {
    TestBed.inject(RepositoriesStore);
    await settle();
    http.expectNone(`/projects/api/projects/${ID}/repositories`);
  });

  it('loads a project’s repositories and its wrapper view once', async () => {
    const store = TestBed.inject(RepositoriesStore);
    const answer = goldenMaster(STATE, 'listProjectRepositories');
    const done = store.load(ID);
    expect(store.byProject()[ID]?.status).toBe('loading');
    await settle();
    http.expectOne(`/projects/api/projects/${ID}/repositories`).flush(answer);
    await done;
    expect(store.byProject()[ID]).toEqual({
      status: 'loaded',
      entries: answer.entries,
      wrapper: answer.wrapper,
    });
    await store.load(ID);
    http.expectNone(`/projects/api/projects/${ID}/repositories`);
  });

  it('reports a failed answer, and fetches again on the next ask', async () => {
    const store = TestBed.inject(RepositoriesStore);
    const done = store.load(ID);
    await settle();
    http
      .expectOne(`/projects/api/projects/${ID}/repositories`)
      .flush(null, { status: 500, statusText: 'Server Error' });
    await done;
    expect(store.byProject()[ID]).toEqual({ status: 'error', entries: [] });
    void store.load(ID);
    await settle();
    http.expectOne(`/projects/api/projects/${ID}/repositories`);
  });
});
