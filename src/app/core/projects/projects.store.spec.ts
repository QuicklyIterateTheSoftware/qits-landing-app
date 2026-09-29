import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideHeyApiClient } from '../../api/projects/client/client.gen';
import { client as projectsClient } from '../../api/projects/client.gen';
import { ProjectsStore } from './projects.store';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

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

  async function loadedStore() {
    const store = TestBed.inject(ProjectsStore);
    await settle();
    http.expectOne('/projects/api/projects').flush({
      entries: [
        { project: { id: '1', name: 'qits', slug: 'qits' } },
        { project: { name: 'no id' } },
      ],
    });
    await settle();
    return store;
  }

  it('loads the list on init, keeping only projects with an id', async () => {
    const store = await loadedStore();
    expect(store.status()).toBe('loaded');
    expect(store.ids()).toEqual(['1']);
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
    http
      .expectOne('/projects/api/projects')
      .flush({ entries: [{ project: { id: '2', name: 'Other', slug: 'other' } }] });
    await done;
    expect(store.ids()).toEqual(['2']);
  });

  it('selects a known project without fetching it', async () => {
    const store = await loadedStore();
    await store.refresh('1');
    expect(store.selected()?.name).toBe('qits');
  });

  it('selects an unknown project and fetches its detail', async () => {
    const store = await loadedStore();
    const done = store.refresh('9');
    expect(store.selectedId()).toBe('9');
    expect(store.selected()).toBeUndefined();
    await settle();
    http
      .expectOne('/projects/api/projects/9')
      .flush({ project: { id: '9', name: 'Nine', slug: 'nine' } });
    await done;
    expect(store.selected()?.name).toBe('Nine');
    expect(store.ids()).toEqual(['1', '9']);
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
