import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { client as projectsClient } from '../../api/projects/client.gen';
import { provideHeyApiClient } from '../../api/projects/client/client.gen';
import { goldenMaster } from '../../../testing/golden-masters';
import { ArchetypesStore } from './archetypes.store';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const REGISTRY = '/projects/api/work/archetypes';

/** `ArchetypesStore` on qits-projects' recorded registry ("the archetype registry"). */
describe('ArchetypesStore', () => {
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

  async function loaded() {
    const store = TestBed.inject(ArchetypesStore);
    const load = store.load();
    await settle();
    http.expectOne(REGISTRY).flush(goldenMaster('the archetype registry', 'listWorkArchetypes'));
    await load;
    return store;
  }

  it('keeps each archetype’s moves in the served order, and its phases', async () => {
    const store = await loaded();
    expect(store.status()).toBe('loaded');
    expect(store.of('TICKET')?.transitions?.['REFINED']).toEqual([
      { to: 'READY_FOR_DEV', kind: 'FORWARD', gates: ['ACCEPTANCE_CRITERIA', 'PERSON_APPROVAL'] },
      { to: 'REPORTED', kind: 'BACK' },
      { to: 'DROPPED', kind: 'DROP' },
    ]);
    expect(store.of('TICKET')?.transitions?.['READY_FOR_DEV']).toEqual([
      { to: 'IMPLEMENTING', kind: 'FORWARD' },
      { to: 'IMPLEMENTED', kind: 'SKIP' },
      { to: 'REFINED', kind: 'BACK' },
      { to: 'DROPPED', kind: 'DROP' },
    ]);
    // Implement runs from READY_FOR_DEV; REFINED waits for a person to schedule it (qits-887).
    expect(store.of('EPIC')?.phases?.['READY_FOR_DEV']?.next?.phase).toBe('implement');
    expect(store.of('EPIC')?.phases?.['REFINED']?.next).toBeNull();
    expect(store.of('FEATURE')?.phases).toEqual({});
    expect(store.of(undefined)).toBeUndefined();
  });

  it('fetches once', async () => {
    const store = await loaded();
    await store.load();
    await settle();
    http.expectNone(REGISTRY);
  });

  it('fails without an answer, and fetches again on the next load', async () => {
    const store = TestBed.inject(ArchetypesStore);
    const load = store.load();
    await settle();
    http.expectOne(REGISTRY).flush(null, { status: 500, statusText: 'Server Error' });
    await load;
    expect(store.status()).toBe('error');
    expect(store.of('EPIC')).toBeUndefined();
    const again = store.load();
    await settle();
    http.expectOne(REGISTRY).flush(goldenMaster('the archetype registry', 'listWorkArchetypes'));
    await again;
    expect(store.status()).toBe('loaded');
  });
});
