import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideHeyApiClient } from '../../api/projects/client/client.gen';
import { client as projectsClient } from '../../api/projects/client.gen';
import { goldenMaster } from '../../../testing/golden-masters';
import { WorkStore } from './work.store';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

/** The recorded project's id: every work state seeds its project under this frozen id. */
const ID = '00000000-0000-4000-8000-000000000001';

describe('WorkStore', () => {
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
    TestBed.inject(WorkStore);
    await settle();
    http.expectNone(`/projects/api/projects/${ID}/entities`);
  });

  it('counts a project’s refined work once, from its whole planning tree', async () => {
    const store = TestBed.inject(WorkStore);
    // 3 REFINED (an epic, two tickets), 1 REPORTED, 1 DONE: only the REFINED ones count.
    const work = goldenMaster('a project with refined work', 'listProjectEntities');
    const done = store.load(ID);
    expect(store.byProject()[ID]?.status).toBe('loading');
    await settle();
    http.expectOne(`/projects/api/projects/${ID}/entities`).flush(work);
    await done;
    expect(store.byProject()[ID]).toMatchObject({ status: 'loaded', count: 3 });
    expect(store.byProject()[ID]?.entries).toHaveLength(work.entities.length);
    await store.load(ID);
    http.expectNone(`/projects/api/projects/${ID}/entities`);
  });

  it('counts zero for a project with no work', async () => {
    const store = TestBed.inject(WorkStore);
    const done = store.load(ID);
    await settle();
    http
      .expectOne(`/projects/api/projects/${ID}/entities`)
      .flush(goldenMaster('a project with no work', 'listProjectEntities'));
    await done;
    expect(store.byProject()[ID]).toEqual({
      status: 'loaded',
      count: 0,
      entries: [],
      campaigns: {},
    });
  });

  it('reports failed work, and fetches it again on the next ask', async () => {
    const store = TestBed.inject(WorkStore);
    const done = store.load(ID);
    await settle();
    http
      .expectOne(`/projects/api/projects/${ID}/entities`)
      .flush(null, { status: 500, statusText: 'Server Error' });
    await done;
    expect(store.byProject()[ID]?.status).toBe('error');
    void store.load(ID);
    await settle();
    http.expectOne(`/projects/api/projects/${ID}/entities`);
  });
});
