import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { client as projectsClient } from '../../api/projects/client.gen';
import { provideHeyApiClient } from '../../api/projects/client/client.gen';
import { goldenMaster } from '../../../testing/golden-masters';
import { inspirable, WorkWritesStore } from './work-writes.store';
import { WorkStore } from './work.store';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const NO_WORK = 'a project with no work';
const RANKED = 'three reported tickets, one with a priority';
const PROJECT = '00000000-0000-4000-8000-000000000001';

/** `WorkWritesStore` (epic qits-888). */
describe('WorkWritesStore', () => {
  let http: HttpTestingController;
  let store: InstanceType<typeof WorkWritesStore>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(WorkWritesStore);
  });

  afterEach(() => http.verify());

  it('knows which archetypes an idea can inspire', () => {
    expect(['EPIC', 'TICKET', 'CAMPAIGN', 'FEATURE', 'TASK', undefined].map(inspirable)).toEqual([
      true,
      true,
      true,
      false,
      false,
      false,
    ]);
  });

  it('creates an epic inspired by an idea, sending no blank field and no ticket field', async () => {
    const done = store.create({
      archetype: 'EPIC',
      project: 'p1',
      title: ' Faster builds ',
      description: 'Cache the dependencies.',
      ticketType: 'BUG',
      impetus: 'ignored on an epic',
      inspiredBy: 'idea-1',
    });
    await settle();
    const request = http.expectOne('/projects/api/work');
    expect(request.request.body).toEqual({
      archetype: 'EPIC',
      project: 'p1',
      title: 'Faster builds',
      description: 'Cache the dependencies.',
      inspiredBy: 'idea-1',
    });
    request.flush(goldenMaster(NO_WORK, 'createWork'), { status: 201, statusText: 'Created' });
    const outcome = await done;
    expect(outcome.ok && outcome.value.qualifiedId).toBe('contract-00000001-1');
  });

  it('creates a ticket with its kind and impetus, and hands back a refusal’s message', async () => {
    const done = store.create({
      archetype: 'TICKET',
      project: 'p1',
      title: 'Export fails',
      description: ' ',
      ticketType: 'BUG',
      impetus: 'It answers 500.',
    });
    await settle();
    const request = http.expectOne('/projects/api/work');
    expect(request.request.body).toEqual({
      archetype: 'TICKET',
      project: 'p1',
      title: 'Export fails',
      ticketType: 'BUG',
      impetus: 'It answers 500.',
    });
    // An error answer is a status and anything: the service's 400 names the rule.
    request.flush(
      { message: 'impetus is required for a ticket' },
      { status: 400, statusText: 'Bad Request' },
    );
    expect(await done).toEqual({ ok: false, refusal: 'impetus is required for a ticket' });
  });

  it('sets and clears the inspiration as a merge patch of inspiredBy alone', async () => {
    const set = store.setInspiredBy('qits-1', 'idea-1');
    await settle();
    const first = http.expectOne('/projects/api/work/qits-1');
    expect(first.request.method).toBe('PATCH');
    expect(first.request.body).toEqual({ inspiredBy: 'idea-1' });
    // No recording holds an item with an inspiration: the answer is the recorded ticket.
    first.flush(goldenMaster(NO_WORK, 'createWork'));
    expect((await set).ok).toBe(true);

    const cleared = store.setInspiredBy('qits-1', null);
    await settle();
    const second = http.expectOne('/projects/api/work/qits-1');
    expect(second.request.body).toEqual({ inspiredBy: null });
    second.flush(null, { status: 404, statusText: 'Not Found' });
    expect(await cleared).toEqual({ ok: false, refusal: 'The service refused it (HTTP 404).' });
  });

  describe('reprioritize (qits-753)', () => {
    /** The recorded three tickets, loaded into `WorkStore`. */
    async function loaded() {
      const work = TestBed.inject(WorkStore);
      const load = work.load(PROJECT);
      await settle();
      http
        .expectOne(`/projects/api/projects/${PROJECT}/work`)
        .flush(goldenMaster(RANKED, 'listProjectWork'));
      await load;
      return work;
    }
    const priorities = (work: InstanceType<typeof WorkStore>) =>
      Object.fromEntries(
        (work.byProject()[PROJECT]?.entries ?? []).map((e) => [e.qualifiedId, e.priority]),
      );

    it('puts the item below its anchor and writes the answered priorities into the work', async () => {
      const work = await loaded();
      expect(priorities(work)).toEqual({
        'contract-00000001-1': 2,
        'contract-00000001-2': null,
        'contract-00000001-3': null,
      });
      const done = store.reprioritize(PROJECT, 'contract-00000001-3', {
        below: 'contract-00000001-1',
      });
      await settle();
      const request = http.expectOne('/projects/api/work/contract-00000001-3/priority');
      expect(request.request.method).toBe('PUT');
      expect(request.request.body).toEqual({ below: 'contract-00000001-1' });
      request.flush(goldenMaster(RANKED, 'reprioritizeWork'));
      expect((await done).ok).toBe(true);
      expect(priorities(work)).toEqual({
        'contract-00000001-1': 2,
        'contract-00000001-2': null,
        'contract-00000001-3': 1,
      });
    });

    it('sends an anchor above as such', async () => {
      const done = store.reprioritize(PROJECT, 'contract-00000001-2', {
        above: 'contract-00000001-1',
      });
      await settle();
      const request = http.expectOne('/projects/api/work/contract-00000001-2/priority');
      expect(request.request.body).toEqual({ above: 'contract-00000001-1' });
      request.flush(goldenMaster(RANKED, 'reprioritizeWork'));
      expect((await done).ok).toBe(true);
    });

    it('reads the work again after a refusal, and hands back its message', async () => {
      const work = await loaded();
      const done = store.reprioritize(PROJECT, 'contract-00000001-3', {
        above: 'contract-00000001-9',
      });
      await settle();
      http
        .expectOne('/projects/api/work/contract-00000001-3/priority')
        .flush({ message: 'not an open sibling' }, { status: 400, statusText: 'Bad Request' });
      expect(await done).toEqual({ ok: false, refusal: 'not an open sibling' });
      await settle();
      http
        .expectOne(`/projects/api/projects/${PROJECT}/work`)
        .flush(goldenMaster(RANKED, 'listProjectWork'));
      await settle();
      expect(priorities(work)['contract-00000001-3']).toBeNull();
    });
  });
});
