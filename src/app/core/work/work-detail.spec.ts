import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QitsApiError } from '@qits/angular';
import { client as projectsClient } from '../../api/projects/client.gen';
import { provideHeyApiClient } from '../../api/projects/client/client.gen';
import { goldenMaster, projectsGoldenMasters } from '../../../testing/golden-masters';
import {
  commentRefusal,
  commentRunRefusal,
  detailState,
  editCommentParams,
  figuresOf,
  withComment,
} from './work-detail';
import type { WorkThread } from './work-detail.consumes';
import { WorkCriteriaReads } from './work-criteria';

/*
 * Ported from `work-detail.store.spec.ts` (qits-2146): the item, thread and dossier reads are the
 * work item page's own resources now, and a comment's trimming and its blank-body guard are
 * `app-work-comments`', so what is left here is how the body's state, the figures, a written comment
 * and a refusal are made out of those reads, and `WorkCriteriaReads` (the old `loadCriteria`).
 */

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const EPIC = 'an epic in detail';
const BUG = 'a bug ticket in detail';
const TASK = 'a task in detail';
const COMMENTED = 'a ticket with a comment';

const params = (state: string) => projectsGoldenMasters.operation(state, 'getWork').params;

describe('work detail', () => {
  it('maps an epic’s figures from the address its pages name to the `/work` content door', () => {
    const ref = params(EPIC)['qualifiedId'];
    const epicId = params(EPIC)['epicId'];
    const asset = params(EPIC)['figureAssetId'];
    const assets = goldenMaster(EPIC, 'listWorkDossierAssets').assets;
    // The pages name the figure by its stored address; the browser loads it from the `/work` door.
    const url = `/epics/${epicId}/dossier-assets/${asset}/content`;
    expect(figuresOf('https://projects.test', ref, assets)).toEqual({
      [url]: `https://projects.test/projects/api/work/${ref}/dossier-assets/${asset}/content`,
    });
    expect(figuresOf('https://projects.test', ref, [])).toEqual({});
  });

  describe('detailState', () => {
    /** A read in `status`, holding `value` when given. */
    const read = (status: string, value?: { archetype?: string }) => ({
      status: () => status,
      hasValue: () => value !== undefined,
      value: () => value,
    });
    const loading = read('loading');
    const loaded = read('resolved', {});
    const failed = read('error');

    it('waits for an epic’s dossier pages and its figures', () => {
      const epic = read('resolved', { archetype: 'EPIC' });
      expect(detailState(epic, loaded, loaded, loaded)).toBe('loaded');
      expect(detailState(epic, loaded, loaded, loading)).toBe('loading');
      expect(detailState(epic, loaded, loading, loaded)).toBe('loading');
    });

    it('waits for a ticket’s dossier pages, and no figures', () => {
      const ticket = read('resolved', { archetype: 'TICKET' });
      expect(detailState(ticket, loaded, loaded, loading)).toBe('loaded');
      expect(detailState(ticket, loaded, loading, loaded)).toBe('loading');
    });

    it('reads no dossier for a task', () => {
      const task = read('resolved', { archetype: 'TASK' });
      expect(detailState(task, loaded, loading, loading)).toBe('loaded');
      expect(detailState(task, loading, loaded, loaded)).toBe('loading');
    });

    it('fails when any read it waits for fails', () => {
      expect(detailState(failed, loaded, loaded, loaded)).toBe('error');
      const epic = read('resolved', { archetype: 'EPIC' });
      expect(detailState(epic, failed, loaded, loaded)).toBe('error');
      expect(detailState(epic, loaded, loaded, failed)).toBe('error');
      // A task waits for no figures, so their failure is not its.
      const task = read('resolved', { archetype: 'TASK' });
      expect(detailState(task, loaded, failed, failed)).toBe('loaded');
    });
  });

  describe('comments', () => {
    /** The bug ticket's recorded thread. */
    const thread = (): WorkThread => goldenMaster(BUG, 'listWorkComments');

    it('puts an added comment last in the thread', () => {
      const before = thread();
      const answer = goldenMaster(COMMENTED, 'addWorkComment');
      const after = withComment(before, answer.comment)!;
      expect(after.entries).toHaveLength((before.entries ?? []).length + 1);
      expect(after.entries?.at(-1)?.comment?.id).toBe(answer.comment.id);
      expect(after.entries?.at(-1)?.comment?.body).toBe(answer.comment.body);
    });

    it('puts an edited comment in its place', () => {
      const before = thread();
      const first = before.entries![0].comment!;
      // The recording's answer, under this thread's first comment id, so it replaces that one.
      const recorded = goldenMaster(COMMENTED, 'editWorkComment');
      const after = withComment(before, { ...recorded.comment, id: first.id })!;
      expect(after.entries?.[0]?.comment?.body).toBe(recorded.comment.body);
      expect(after.entries?.filter((e) => e.comment?.id === first.id)).toHaveLength(1);
      expect(after.entries).toHaveLength(before.entries!.length);
    });

    it('leaves a thread not read yet as it is', () => {
      const answer = goldenMaster(COMMENTED, 'addWorkComment');
      expect(withComment(undefined, answer.comment)).toBeUndefined();
    });

    it('edits a comment as a merge patch of the body, sent as plain JSON', () => {
      expect(editCommentParams('qits-1', 'c-1', 'Better words.')).toEqual({
        path: { qualifiedId: 'qits-1', commentId: 'c-1' },
        body: { body: 'Better words.' },
        headers: { 'Content-Type': 'application/json' },
      });
    });

    it('says a refusal plainly', () => {
      expect(commentRefusal({ message: 'Not your project' }, 403)).toBe('403 Not your project');
      expect(commentRefusal(null, 500)).toBe('500');
      expect(commentRefusal(undefined, undefined)).toBe('the service is unreachable');
      const operation = { provider: 'p', operationId: 'addWorkComment', method: 'POST' } as const;
      expect(
        commentRunRefusal(new QitsApiError(403, { message: 'Not your project' }, operation)),
      ).toBe('403 Not your project');
      expect(commentRunRefusal(new TypeError('Failed to fetch'))).toBe(
        'the service is unreachable',
      );
    });
  });
});

/** `WorkCriteriaReads` (the old `WorkDetailStore.loadCriteria`) on qits-projects' recordings. */
describe('WorkCriteriaReads', () => {
  const IMPROVEMENT = 'an improvement ticket in detail';
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

  it('reads an item’s acceptance criteria once', async () => {
    const criteria = TestBed.inject(WorkCriteriaReads);
    const ref = params(IMPROVEMENT)['qualifiedId'];
    expect(criteria.of(ref)).toBeUndefined();
    criteria.read(ref);
    expect(criteria.of(ref)).toEqual({ status: 'loading', items: [] });
    TestBed.tick();
    await settle();
    const recorded = goldenMaster(IMPROVEMENT, 'getWork');
    http.expectOne(`/projects/api/work/${ref}`).flush(recorded);
    await settle();
    expect(criteria.of(ref)).toEqual({ status: 'loaded', items: recorded.acceptanceCriteria });
    expect(recorded.acceptanceCriteria.length).toBeGreaterThan(0);
    criteria.read(ref);
    TestBed.tick();
    await settle();
    http.expectNone(`/projects/api/work/${ref}`);
  });

  it('fails when the read fails, and reads again on the next call', async () => {
    const criteria = TestBed.inject(WorkCriteriaReads);
    const ref = params(EPIC)['qualifiedId'];
    criteria.read(ref);
    TestBed.tick();
    await settle();
    // A 404, as the store's spec answered: a failed read is read again on the next call, a missing
    // item's too (`WorkCriteriaReads` asks `ResourceFamily` to retry it).
    http
      .expectOne(`/projects/api/work/${ref}`)
      .flush(null, { status: 404, statusText: 'Not Found' });
    await settle();
    expect(criteria.of(ref)).toEqual({ status: 'error', items: [] });
    criteria.read(ref);
    TestBed.tick();
    await settle();
    http.expectOne(`/projects/api/work/${ref}`).flush(goldenMaster(EPIC, 'getWork'));
    await settle();
    expect(criteria.of(ref)?.status).toBe('loaded');
  });
});
