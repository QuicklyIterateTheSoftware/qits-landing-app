import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { client as projectsClient } from '../../api/projects/client.gen';
import { provideHeyApiClient } from '../../api/projects/client/client.gen';
import { goldenMaster } from '../../../testing/golden-masters';
import { Archetypes } from './archetypes';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const REGISTRY = '/projects/api/work/archetypes';

/** `Archetypes` on qits-projects' recorded registry ("the archetype registry"). */
describe('Archetypes', () => {
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
    const archetypes = TestBed.inject(Archetypes);
    archetypes.want();
    TestBed.tick();
    await settle();
    http.expectOne(REGISTRY).flush(goldenMaster('the archetype registry', 'listWorkArchetypes'));
    await settle();
    return archetypes;
  }

  it('requests nothing until wanted', async () => {
    TestBed.inject(Archetypes);
    TestBed.tick();
    await settle();
    http.expectNone(REGISTRY);
  });

  it('keeps each archetype’s moves in the served order, and its phases', async () => {
    const archetypes = await loaded();
    expect(archetypes.resource.status()).toBe('resolved');
    expect(archetypes.of('TICKET')?.transitions?.['REFINED']).toEqual([
      { to: 'READY_FOR_DEV', kind: 'FORWARD', gates: ['ACCEPTANCE_CRITERIA', 'PERSON_APPROVAL'] },
      { to: 'REPORTED', kind: 'BACK' },
      // A ticket tagged condition closes straight to DONE (qits-1972).
      { to: 'DONE', kind: 'CLOSE', gates: ['CONDITION_MET'] },
      { to: 'DROPPED', kind: 'DROP' },
    ]);
    expect(archetypes.of('TICKET')?.transitions?.['READY_FOR_DEV']).toEqual([
      { to: 'IMPLEMENTING', kind: 'FORWARD' },
      { to: 'IMPLEMENTED', kind: 'SKIP' },
      { to: 'REFINED', kind: 'BACK' },
      { to: 'DONE', kind: 'CLOSE', gates: ['CONDITION_MET'] },
      { to: 'DROPPED', kind: 'DROP' },
    ]);
    // Implement runs from READY_FOR_DEV; REFINED waits for a person to schedule it (qits-887).
    expect(archetypes.of('EPIC')?.phases?.['READY_FOR_DEV']?.next?.phase).toBe('implement');
    expect(archetypes.of('EPIC')?.phases?.['REFINED']?.next).toBeNull();
    expect(archetypes.of('FEATURE')?.phases).toEqual({});
    expect(archetypes.of(undefined)).toBeUndefined();
  });

  it('fetches once', async () => {
    const archetypes = await loaded();
    archetypes.want();
    TestBed.tick();
    await settle();
    http.expectNone(REGISTRY);
  });

  it('fails without an answer, and fetches again on the next want', async () => {
    const archetypes = TestBed.inject(Archetypes);
    archetypes.want();
    TestBed.tick();
    await settle();
    http.expectOne(REGISTRY).flush(null, { status: 500, statusText: 'Server Error' });
    await settle();
    expect(archetypes.resource.status()).toBe('error');
    expect(archetypes.of('EPIC')).toBeUndefined();
    archetypes.want();
    TestBed.tick();
    await settle();
    http.expectOne(REGISTRY).flush(goldenMaster('the archetype registry', 'listWorkArchetypes'));
    await settle();
    expect(archetypes.resource.status()).toBe('resolved');
    expect(archetypes.of('EPIC')).toBeDefined();
  });
});
