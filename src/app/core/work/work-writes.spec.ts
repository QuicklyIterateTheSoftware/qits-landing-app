import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { QitsApiError } from '@qits/angular';
import { NEVER } from 'rxjs';
import { client as projectsClient } from '../../api/projects/client.gen';
import { provideHeyApiClient } from '../../api/projects/client/client.gen';
import { goldenMaster } from '../../../testing/golden-masters';
import { DomainEvents } from '$core/events/domain-events';
import { SelectedProject } from '$core/projects/selected-project';
import { SelectedWork } from './selected-work';
import type { WorkNode } from './work-tree';
import { WorkReorders } from './work-reorder';
import {
  createWorkParams,
  inspirable,
  isRoot,
  needsParams,
  reprioritizeParams,
  workWriteRefusal,
  workWriteRunRefusal,
} from './work-writes';

/*
 * Ported from `work-writes.store.spec.ts` (qits-2146): what the create form makes of the created
 * item's answer is the create page's now, so only the requests and the refusals are tested here,
 * with the drop's write (`WorkReorders.move`, the old `reprioritize`) on a read `SelectedWork`.
 */

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const RANKED = 'three reported tickets, one with a priority';
const PROJECT = '00000000-0000-4000-8000-000000000001';

/** What the work writes send and make of a refusal (epic qits-888). */
describe('work writes', () => {
  it('knows which archetypes an idea can inspire (qits-1792: every archetype; no campaign, qits-1899)', () => {
    expect(['EPIC', 'TICKET', 'CAMPAIGN', 'FEATURE', 'TASK', undefined].map(inspirable)).toEqual([
      true,
      true,
      false,
      true,
      true,
      false,
    ]);
  });

  it('knows which archetypes the create form files as a root (a feature or a task needs a parent; no campaign, qits-1899)', () => {
    expect(['EPIC', 'TICKET', 'CAMPAIGN', 'FEATURE', 'TASK', undefined].map(isRoot)).toEqual([
      true,
      true,
      false,
      false,
      false,
      false,
    ]);
  });

  it('creates an epic inspired by an idea, sending no blank field and no ticket field', () => {
    expect(
      createWorkParams({
        archetype: 'EPIC',
        project: 'p1',
        title: ' Faster builds ',
        description: 'Cache the dependencies.',
        ticketType: 'BUG',
        impetus: 'ignored on an epic',
        inspiredBy: 'idea-1',
      }),
    ).toEqual({
      body: {
        archetype: 'EPIC',
        project: 'p1',
        title: 'Faster builds',
        description: 'Cache the dependencies.',
        inspiredBy: 'idea-1',
      },
    });
  });

  it('creates a ticket with its kind and impetus', () => {
    expect(
      createWorkParams({
        archetype: 'TICKET',
        project: 'p1',
        title: 'Export fails',
        description: ' ',
        ticketType: 'BUG',
        impetus: 'It answers 500.',
      }),
    ).toEqual({
      body: {
        archetype: 'TICKET',
        project: 'p1',
        title: 'Export fails',
        ticketType: 'BUG',
        impetus: 'It answers 500.',
      },
    });
  });

  it('writes the needs whole, as a merge patch of needs alone sent as plain JSON', () => {
    expect(needsParams('qits-2', [{ item: 'qits-1', status: 'VERIFIED' }])).toEqual({
      path: { qualifiedId: 'qits-2' },
      body: { needs: [{ item: 'qits-1', status: 'VERIFIED' }] },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(needsParams('qits-2', []).body).toEqual({ needs: [] });
  });

  it('sends a drop as the item and its anchor, above or below (qits-753)', () => {
    expect(reprioritizeParams('contract-00000001-3', { below: 'contract-00000001-1' })).toEqual({
      path: { qualifiedId: 'contract-00000001-3' },
      body: { below: 'contract-00000001-1' },
    });
    expect(reprioritizeParams('contract-00000001-2', { above: 'contract-00000001-1' })).toEqual({
      path: { qualifiedId: 'contract-00000001-2' },
      body: { above: 'contract-00000001-1' },
    });
  });

  it('hands back a refusal’s message, else the status, else unreachable', () => {
    // An error answer is a status and anything: the service's 400 names the rule.
    expect(workWriteRefusal({ message: 'impetus is required for a ticket' }, 400)).toBe(
      'impetus is required for a ticket',
    );
    expect(workWriteRefusal({ message: ' ' }, 400)).toBe('The service refused it (HTTP 400).');
    expect(workWriteRefusal(undefined, undefined)).toBe('The service is unreachable.');
    const operation = { provider: 'p', operationId: 'patchWork', method: 'PATCH' } as const;
    expect(
      workWriteRunRefusal(new QitsApiError(400, { message: 'needs closes a cycle' }, operation)),
    ).toBe('needs closes a cycle');
    expect(workWriteRunRefusal(new TypeError('Failed to fetch'))).toBe(
      'The service is unreachable.',
    );
  });
});

/** `WorkReorders.move` (qits-753) on the recorded three tickets, read into `SelectedWork`. */
describe('WorkReorders', () => {
  let http: HttpTestingController;
  const WORK = `/projects/api/projects/${PROJECT}/work`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        {
          provide: SelectedProject,
          useValue: {
            project: signal({ id: PROJECT }),
            slug: signal('qits'),
            listState: signal('loaded'),
          },
        },
        { provide: DomainEvents, useValue: { on: () => NEVER } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function loaded() {
    const work = TestBed.inject(SelectedWork);
    work.want();
    TestBed.tick();
    await settle();
    http.expectOne(WORK).flush(goldenMaster(RANKED, 'listProjectWork'));
    await settle();
    return { work, reorders: TestBed.inject(WorkReorders) };
  }

  const priorities = (work: SelectedWork) =>
    Object.fromEntries(work.loaded().map((e) => [e.qualifiedId, e.priority]));

  /** A list's drawn item for `qualifiedId`. */
  const node = (qualifiedId: string) =>
    ({
      entry: { id: qualifiedId, qualifiedId, status: 'REPORTED' },
      children: [],
      context: false,
      tasks: { verified: 0, total: 0 },
    }) as unknown as WorkNode;

  it('puts the item below its anchor and writes the answered priorities into the work', async () => {
    const { work, reorders } = await loaded();
    expect(priorities(work)).toEqual({
      'contract-00000001-1': 2,
      'contract-00000001-2': null,
      'contract-00000001-3': null,
    });
    // Dropped last, after the first ticket.
    reorders.move([node('contract-00000001-3'), node('contract-00000001-1')], { from: 0, to: 1 });
    await settle();
    const request = http.expectOne('/projects/api/work/contract-00000001-3/priority');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ below: 'contract-00000001-1' });
    request.flush(goldenMaster(RANKED, 'reprioritizeWork'));
    await settle();
    expect(reorders.refusal()).toBeUndefined();
    expect(priorities(work)).toEqual({
      'contract-00000001-1': 2,
      'contract-00000001-2': null,
      'contract-00000001-3': 1,
    });
  });

  it('sends an anchor above as such', async () => {
    const { reorders } = await loaded();
    reorders.move([node('contract-00000001-1'), node('contract-00000001-2')], { from: 1, to: 0 });
    await settle();
    const request = http.expectOne('/projects/api/work/contract-00000001-2/priority');
    expect(request.request.body).toEqual({ above: 'contract-00000001-1' });
    request.flush(goldenMaster(RANKED, 'reprioritizeWork'));
    await settle();
  });

  it('reads the work again after a refusal, and keeps its message until the next drop', async () => {
    const { work, reorders } = await loaded();
    reorders.move([node('contract-00000001-9'), node('contract-00000001-3')], { from: 1, to: 0 });
    await settle();
    http
      .expectOne('/projects/api/work/contract-00000001-3/priority')
      .flush({ message: 'not an open sibling' }, { status: 400, statusText: 'Bad Request' });
    await settle();
    expect(reorders.refusal()).toBe('not an open sibling');
    TestBed.tick();
    await settle();
    http.expectOne(WORK).flush(goldenMaster(RANKED, 'listProjectWork'));
    await settle();
    expect(priorities(work)['contract-00000001-3']).toBeNull();

    reorders.move([node('contract-00000001-1'), node('contract-00000001-2')], { from: 1, to: 0 });
    expect(reorders.refusal()).toBeUndefined();
    await settle();
    http
      .expectOne('/projects/api/work/contract-00000001-2/priority')
      .flush(goldenMaster(RANKED, 'reprioritizeWork'));
    await settle();
  });
});
