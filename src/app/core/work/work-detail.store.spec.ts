import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { client as projectsClient } from '../../api/projects/client.gen';
import { provideHeyApiClient } from '../../api/projects/client/client.gen';
import { goldenMaster, projectsGoldenMasters } from '../../../testing/golden-masters';
import { provideTestPlatformOrigins } from '../../../testing/platform-origins';
import { WorkDetailStore } from './work-detail.store';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const EPIC = 'an epic in detail';
const BUG = 'a bug ticket in detail';
const TASK = 'a task in detail';

/** `WorkDetailStore` on qits-projects' recorded detail states. */
describe('WorkDetailStore', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        provideTestPlatformOrigins({ projects: 'https://projects.test' }),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const params = (state: string) => projectsGoldenMasters.operation(state, 'getWork').params;

  /** Starts `load` for `state`'s item and answers the item and its comments. */
  async function started(state: string) {
    const store = TestBed.inject(WorkDetailStore);
    const ref = params(state)['qualifiedId'];
    const load = store.load(ref);
    await settle();
    http.expectOne(`/projects/api/work/${ref}`).flush(goldenMaster(state, 'getWork'));
    http
      .expectOne(`/projects/api/work/${ref}/comments`)
      .flush(goldenMaster(state, 'listWorkComments'));
    await settle();
    return { store, ref, load };
  }

  it('reads an epic, its comments, its dossier pages and its figures', async () => {
    const { store, ref, load } = await started(EPIC);
    const epicId = params(EPIC)['epicId'];
    http
      .expectOne(`/projects/api/work/${ref}/dossier`)
      .flush(goldenMaster(EPIC, 'listWorkDossier'));
    http
      .expectOne(`/projects/api/work/${ref}/dossier-assets`)
      .flush(goldenMaster(EPIC, 'listWorkDossierAssets'));
    await load;
    const detail = store.of(ref)!;
    expect(detail.status).toBe('loaded');
    expect(detail.entity?.description).toContain('## Why');
    expect(detail.comments.map((c) => c.author)).toEqual([
      'dana.weber',
      'qits-agent',
      'dana.weber',
    ]);
    expect(detail.pages.map((p) => p.title)).toEqual(['Scope', 'Data flow', 'Rollout']);
    const asset = params(EPIC)['figureAssetId'];
    // The pages name the figure by its stored address; the browser loads it from the `/work` door.
    const url = `/epics/${epicId}/dossier-assets/${asset}/content`;
    expect(detail.figures).toEqual({
      [url]: `https://projects.test/projects/api/work/${ref}/dossier-assets/${asset}/content`,
    });
  });

  it('reads a ticket’s dossier pages, and no figures', async () => {
    const { store, ref, load } = await started(BUG);
    http.expectOne(`/projects/api/work/${ref}/dossier`).flush(goldenMaster(BUG, 'listWorkDossier'));
    await load;
    const detail = store.of(ref)!;
    expect(detail.entity?.blocked).toBe(true);
    expect(detail.pages.map((p) => p.title)).toEqual(['Reproduction', 'Affected invoices']);
    expect(detail.figures).toEqual({});
  });

  it('reads no dossier for a task, and reads once', async () => {
    const { store, ref, load } = await started(TASK);
    await load;
    expect(store.of(ref)?.status).toBe('loaded');
    expect(store.of(ref)?.pages).toEqual([]);
    await store.load(ref);
    await settle();
    http.expectNone(`/projects/api/work/${ref}`);
  });

  it('fails when a read fails, and reads again on the next load', async () => {
    const store = TestBed.inject(WorkDetailStore);
    const ref = params(TASK)['qualifiedId'];
    const load = store.load(ref);
    await settle();
    http
      .expectOne(`/projects/api/work/${ref}`)
      .flush(null, { status: 404, statusText: 'Not Found' });
    http
      .expectOne(`/projects/api/work/${ref}/comments`)
      .flush(goldenMaster(TASK, 'listWorkComments'));
    await load;
    expect(store.of(ref)?.status).toBe('error');
    void store.load(ref);
    await settle();
    http.expectOne(`/projects/api/work/${ref}`).flush(goldenMaster(TASK, 'getWork'));
    http
      .expectOne(`/projects/api/work/${ref}/comments`)
      .flush(goldenMaster(TASK, 'listWorkComments'));
    await settle();
    expect(store.of(ref)?.status).toBe('loaded');
  });

  describe('loadCriteria', () => {
    const IMPROVEMENT = 'an improvement ticket in detail';

    it('reads an item’s acceptance criteria once', async () => {
      const store = TestBed.inject(WorkDetailStore);
      const ref = params(IMPROVEMENT)['qualifiedId'];
      const load = store.loadCriteria(ref);
      expect(store.criteriaOf(ref)).toEqual({ status: 'loading', items: [] });
      await settle();
      const recorded = goldenMaster(IMPROVEMENT, 'getWork');
      http.expectOne(`/projects/api/work/${ref}`).flush(recorded);
      await load;
      expect(store.criteriaOf(ref)).toEqual({
        status: 'loaded',
        items: recorded.acceptanceCriteria,
      });
      expect(recorded.acceptanceCriteria.length).toBeGreaterThan(0);
      await store.loadCriteria(ref);
      await settle();
      http.expectNone(`/projects/api/work/${ref}`);
    });

    it('fails when the read fails, and reads again on the next call', async () => {
      const store = TestBed.inject(WorkDetailStore);
      const ref = params(EPIC)['qualifiedId'];
      const load = store.loadCriteria(ref);
      await settle();
      http
        .expectOne(`/projects/api/work/${ref}`)
        .flush(null, { status: 404, statusText: 'Not Found' });
      await load;
      expect(store.criteriaOf(ref)).toEqual({ status: 'error', items: [] });
      void store.loadCriteria(ref);
      await settle();
      http.expectOne(`/projects/api/work/${ref}`).flush(goldenMaster(EPIC, 'getWork'));
      await settle();
      expect(store.criteriaOf(ref)?.status).toBe('loaded');
    });
  });

  describe('comments', () => {
    const COMMENTED = 'a ticket with a comment';

    /** A loaded bug ticket; the writes are answered with "a ticket with a comment"'s recordings. */
    async function loaded() {
      const { store, ref, load } = await started(BUG);
      http
        .expectOne(`/projects/api/work/${ref}/dossier`)
        .flush(goldenMaster(BUG, 'listWorkDossier'));
      await load;
      return { store, ref };
    }

    it('adds a comment: only the trimmed body travels, and the answer goes last in the thread', async () => {
      const { store, ref } = await loaded();
      const before = store.of(ref)!.comments.length;
      const adding = store.addComment(ref, '  Seen it too.  ');
      await settle();
      const request = http.expectOne(`/projects/api/work/${ref}/comments`);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({ body: 'Seen it too.' });
      const answer = goldenMaster(COMMENTED, 'addWorkComment');
      request.flush(answer);
      expect(await adding).toEqual({});
      const comments = store.of(ref)!.comments;
      expect(comments.length).toBe(before + 1);
      expect(comments.at(-1)?.id).toBe(answer.comment.id);
      expect(comments.at(-1)?.body).toBe(answer.comment.body);
    });

    it('edits a comment in its place, as a merge patch sent as plain JSON', async () => {
      const { store, ref } = await loaded();
      const first = store.of(ref)!.comments[0];
      const editing = store.editComment(ref, first.id!, 'Better words.');
      await settle();
      const request = http.expectOne(`/projects/api/work/${ref}/comments/${first.id}`);
      expect(request.request.method).toBe('PATCH');
      expect(request.request.body).toEqual({ body: 'Better words.' });
      expect(request.request.headers.get('Content-Type')).toBe('application/json');
      // The recording's answer, under this thread's first comment id, so it replaces that one.
      const recorded = goldenMaster(COMMENTED, 'editWorkComment');
      request.flush({ comment: { ...recorded.comment, id: first.id } });
      expect(await editing).toEqual({});
      const comments = store.of(ref)!.comments;
      expect(comments[0].body).toBe(recorded.comment.body);
      expect(comments.filter((c) => c.id === first.id).length).toBe(1);
    });

    it('says a refusal plainly and leaves the thread as it was', async () => {
      const { store, ref } = await loaded();
      const before = store.of(ref)!.comments;
      const adding = store.addComment(ref, 'Not mine to say.');
      await settle();
      http
        .expectOne(`/projects/api/work/${ref}/comments`)
        .flush({ message: 'Not your project' }, { status: 403, statusText: 'Forbidden' });
      expect(await adding).toEqual({ refusal: '403 Not your project' });
      expect(store.of(ref)!.comments).toBe(before);
    });

    it('sends nothing for a blank body', async () => {
      const { store, ref } = await loaded();
      expect((await store.addComment(ref, '   ')).refusal).toBeTruthy();
      http.expectNone(`/projects/api/work/${ref}/comments`);
    });
  });
});
