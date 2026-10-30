import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DestroyRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { filter, Subject } from 'rxjs';
import { client as projectsClient } from '../../api/projects/client.gen';
import { provideHeyApiClient } from '../../api/projects/client/client.gen';
import { DomainEvents, type DomainEvent } from '$core/events/domain-events';
import { REFRESH_DEBOUNCE_MS } from '$core/events/refresh-on';
import { goldenMaster, projectsGoldenMasters } from '../../../testing/golden-masters';
import { IdeasStore } from './ideas.store';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const IDEAS = 'a project with ideas';
const NO_WORK = 'a project with no work';
const API = '/projects/api/ideas';

const params = (state: string, operationId: string) =>
  projectsGoldenMasters.operation(state, operationId).params;

/** `IdeasStore` on qits-projects' recorded states (epic qits-888). */
describe('IdeasStore', () => {
  let http: HttpTestingController;
  let store: InstanceType<typeof IdeasStore>;
  let events: Subject<DomainEvent>;

  beforeEach(() => {
    events = new Subject<DomainEvent>();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        {
          provide: DomainEvents,
          useValue: {
            on: (names: readonly string[]) =>
              events.pipe(filter((event) => names.includes(event.name ?? ''))),
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(IdeasStore);
  });

  afterEach(() => http.verify());

  /** The list reads: the generated client writes the query into the URL. */
  const listReads = () =>
    http.match((req) => req.method === 'GET' && req.urlWithParams.split('?')[0] === API);
  /** A read's query parameter. */
  const queryOf = (read: { request: { urlWithParams: string } }, name: string) =>
    new URL(read.request.urlWithParams, 'http://localhost').searchParams.get(name);

  async function answerList(projectId: string, archived = false) {
    const done = store.loadList(projectId, archived);
    await settle();
    const [read] = listReads();
    expect(queryOf(read, 'project')).toBe(projectId);
    expect(queryOf(read, 'archived')).toBe(archived ? 'true' : null);
    read.flush(goldenMaster(IDEAS, 'listIdeas'));
    await done;
  }

  it('reads a project’s ideas once, by its id', async () => {
    const projectId = params(IDEAS, 'getIdea')['projectId'];
    await answerList(projectId);
    expect(store.listOf(projectId)?.ideas.map((idea) => idea.title)).toEqual([
      'Faster builds',
      'Share the build cache',
    ]);
    await store.loadList(projectId);
    expect(listReads()).toHaveLength(0);
  });

  it('reads the archived ones beside the others as a list of its own', async () => {
    await answerList('p1', true);
    expect(store.listOf('p1', true)?.status).toBe('loaded');
    expect(store.listOf('p1')).toBeUndefined();
  });

  it('says a failed read failed, and reads again on the next load', async () => {
    const done = store.loadList('p1');
    await settle();
    listReads()[0].flush(null, { status: 500, statusText: 'Server Error' });
    await done;
    expect(store.listOf('p1')?.status).toBe('error');
    void store.loadList('p1');
    await settle();
    const again = listReads();
    expect(again).toHaveLength(1);
    again[0].flush(goldenMaster(IDEAS, 'listIdeas'));
    await settle();
  });

  it('reads one idea’s page: the idea, the ideas it enables, the work it inspired', async () => {
    const id = params(IDEAS, 'getIdea')['ideaId'];
    const done = store.loadIdea(id);
    await settle();
    http.expectOne(`${API}/${id}`).flush(goldenMaster(IDEAS, 'getIdea'));
    await done;
    const idea = store.ideaOf(id)?.idea;
    expect(idea?.title).toBe('Faster builds');
    expect(idea?.enables?.map((e) => e.title)).toEqual(['Share the build cache']);
    expect(idea?.inspired?.map((w) => w.archetype)).toEqual(['EPIC']);
  });

  it('creates an idea, sending only what is filled in, trimmed', async () => {
    const projectId = params(NO_WORK, 'createIdea')['projectId'];
    const done = store.create(projectId, { title: ' Faster builds ', description: '  ' });
    await settle();
    const request = http.expectOne(API);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ project: projectId, title: 'Faster builds' });
    request.flush(goldenMaster(NO_WORK, 'createIdea'), { status: 201, statusText: 'Created' });
    const outcome = await done;
    expect(outcome.ok && outcome.idea.title).toBe('Faster builds');
  });

  it('hands back the service’s message when it refuses', async () => {
    const done = store.create('p1', { title: 'Faster builds. Fewer waits. Less cost' });
    await settle();
    http
      .expectOne(API)
      .flush(goldenMaster(IDEAS, 'createIdea'), { status: 400, statusText: 'Bad Request' });
    expect(await done).toEqual({
      ok: false,
      refusal: "title has 2 '.' characters; at most one, so one title is one sentence",
    });
  });

  it('edits as a merge patch, a null clearing a field', async () => {
    const id = params(IDEAS, 'patchIdea')['enabledIdeaId'];
    const done = store.update(id, {
      title: 'Share the build cache across runners',
      enabledBy: null,
    });
    await settle();
    const request = http.expectOne(`${API}/${id}`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({
      title: 'Share the build cache across runners',
      enabledBy: null,
    });
    request.flush(goldenMaster(IDEAS, 'patchIdea'));
    expect((await done).ok).toBe(true);
  });

  it('archives with a reason, and asks nothing without one', async () => {
    expect(await store.archive('x', '  ')).toEqual({
      ok: false,
      refusal: 'Archiving needs a reason.',
    });
    const id = params(IDEAS, 'archiveIdea')['enabledIdeaId'];
    const done = store.archive(id, ' Folded into the cache epic. ');
    await settle();
    const request = http.expectOne(`${API}/${id}/archive`);
    expect(request.request.body).toEqual({ reason: 'Folded into the cache epic.' });
    request.flush(goldenMaster(IDEAS, 'archiveIdea'));
    const outcome = await done;
    expect(outcome.ok && outcome.idea.archived).toBe(true);
  });

  it('unarchives', async () => {
    const id = params(IDEAS, 'unarchiveIdea')['archivedIdeaId'];
    const done = store.unarchive(id);
    await settle();
    http.expectOne(`${API}/${id}/unarchive`).flush(goldenMaster(IDEAS, 'unarchiveIdea'));
    const outcome = await done;
    expect(outcome.ok && outcome.idea.archived).toBe(false);
  });

  it('follows the idea events about the open project only, at most once a second', async () => {
    const event = (name: string, payload: object) => ({ name, payload: JSON.stringify(payload) });
    const refreshed: (readonly DomainEvent[])[] = [];
    let open: string | undefined = 'p1';
    vi.useFakeTimers();
    try {
      store.follow(
        TestBed.inject(DestroyRef),
        () => open,
        (burst) => refreshed.push(burst),
      );
      // Another project's idea; an event that is not an idea's; two of this project's.
      events.next(event('IdeaCreated', { ideaId: 'i9', projectId: 'p9' }));
      events.next(event('EntityTransitioned', { projectId: 'p1' }));
      events.next(event('IdeaUpdated', { ideaId: 'i1', projectId: 'p1' }));
      events.next(event('IdeaArchived', { ideaId: 'i2', projectId: 'p1' }));
      vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS);
      expect(refreshed).toHaveLength(1);
      expect(refreshed[0].map((e) => e.name)).toEqual(['IdeaUpdated', 'IdeaArchived']);

      // Only another project's events; then one of this project's once no project is open.
      events.next(event('IdeaUnarchived', { ideaId: 'i9', projectId: 'p9' }));
      open = undefined;
      events.next(event('IdeaCreated', { ideaId: 'i3', projectId: 'p1' }));
      vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS);
      expect(refreshed).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
