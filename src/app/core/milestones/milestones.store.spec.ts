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
import { MilestonesStore } from './milestones.store';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const UNMET = 'a ticket waiting on an unmet milestone';
const MET = 'a ticket waiting on a met milestone';
const MEMBER = 'a campaign member waiting on a milestone';

const params = (state: string, operationId: string) =>
  projectsGoldenMasters.operation(state, operationId).params;

/** `MilestonesStore` on qits-projects' recorded milestone states (epic qits-615). */
describe('MilestonesStore', () => {
  let http: HttpTestingController;
  let store: InstanceType<typeof MilestonesStore>;
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
    store = TestBed.inject(MilestonesStore);
  });

  afterEach(() => http.verify());

  it('reads a project’s milestones once, every one, met or not', async () => {
    const { projectId } = params(MET, 'listProjectMilestones');
    const done = store.loadList(projectId);
    await settle();
    const read = http.expectOne(`/projects/api/projects/${projectId}/milestones`);
    expect(read.request.method).toBe('GET');
    read.flush(goldenMaster(MET, 'listProjectMilestones'));
    await done;
    const list = store.listOf(projectId);
    expect(list?.status).toBe('loaded');
    expect(list?.milestones.map((m) => [m.displayName, !!m.satisfiedAt])).toEqual([
      ['bootstrap test node', true],
      ['arm64 runner', false],
    ]);
    await store.loadList(projectId);
    http.expectNone(`/projects/api/projects/${projectId}/milestones`);
  });

  it('keeps the old list when a refresh fails, and says so when the first read fails', async () => {
    const done = store.loadList('p1');
    await settle();
    http.expectOne('/projects/api/projects/p1/milestones').flush(null, {
      status: 500,
      statusText: 'Server Error',
    });
    await done;
    expect(store.listOf('p1')?.status).toBe('error');

    const again = store.loadList('p1');
    await settle();
    http
      .expectOne('/projects/api/projects/p1/milestones')
      .flush(goldenMaster(UNMET, 'listProjectMilestones'));
    await again;
    const refresh = store.refreshList('p1');
    await settle();
    http.expectOne('/projects/api/projects/p1/milestones').flush(null, {
      status: 503,
      statusText: 'Unavailable',
    });
    await refresh;
    expect(store.listOf('p1')?.milestones).toHaveLength(2);
  });

  it('reads one milestone with its groups, criteria and what needs it', async () => {
    const { milestoneId } = params(MEMBER, 'getMilestone');
    const done = store.load(milestoneId);
    await settle();
    http
      .expectOne(`/projects/api/milestones/${milestoneId}`)
      .flush(goldenMaster(MEMBER, 'getMilestone'));
    await done;
    const milestone = store.of(milestoneId)?.milestone;
    expect(milestone?.groups?.[0]?.criteria?.[0]?.kind).toBe('APPROVAL');
    expect(milestone?.memberships?.[0]?.campaignTitle).toBe('Ship the bootstrap');
  });

  it('creates a milestone with its name trimmed and keeps the answer as its page', async () => {
    const { projectId } = params(UNMET, 'createMilestone');
    const groups = [
      { criteria: [{ kind: 'ENTITY_STATUS', predicate: { entityId: 'q-1', status: 'DONE' } }] },
    ];
    const done = store.create(projectId, '  bootstrap ticket done ', groups);
    await settle();
    const write = http.expectOne(`/projects/api/projects/${projectId}/milestones`);
    expect(write.request.method).toBe('POST');
    expect(write.request.body).toEqual({ displayName: 'bootstrap ticket done', groups });
    const answer = goldenMaster(UNMET, 'createMilestone');
    write.flush(answer, { status: 201, statusText: 'Created' });
    const outcome = await done;
    expect(outcome.ok).toBe(true);
    expect(store.of(answer.milestone.id)?.milestone?.displayName).toBe(
      answer.milestone.displayName,
    );
  });

  it('renames, restates the condition and approves, each answered with the milestone', async () => {
    const { milestoneId, criterionId } = params(UNMET, 'renameMilestone');

    const renamed = store.rename(milestoneId, 'bootstrap test node (arm64)');
    await settle();
    const rename = http.expectOne(`/projects/api/milestones/${milestoneId}`);
    expect(rename.request.method).toBe('PATCH');
    expect(rename.request.body).toEqual({ displayName: 'bootstrap test node (arm64)' });
    rename.flush(goldenMaster(UNMET, 'renameMilestone'));
    expect((await renamed).ok).toBe(true);
    expect(store.of(milestoneId)?.milestone?.displayName).toBe('bootstrap test node (arm64)');

    const groups = [{ criteria: [{ id: criterionId, kind: 'APPROVAL', predicate: {} }] }];
    const restated = store.setGroups(milestoneId, groups);
    await settle();
    const put = http.expectOne(`/projects/api/milestones/${milestoneId}/groups`);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ groups });
    put.flush(goldenMaster(UNMET, 'setMilestoneGroups'));
    expect((await restated).ok).toBe(true);
    expect(store.of(milestoneId)?.milestone?.groups).toHaveLength(2);

    const approved = store.approve(milestoneId, criterionId, ' Node 7 is up. ');
    await settle();
    const approve = http.expectOne(
      `/projects/api/milestones/${milestoneId}/criteria/${criterionId}/approve`,
    );
    expect(approve.request.body).toEqual({ note: 'Node 7 is up.' });
    approve.flush(goldenMaster(UNMET, 'approveMilestoneCriterion'));
    expect((await approved).ok).toBe(true);
    expect(store.of(milestoneId)?.milestone?.met).toBe(true);
  });

  it('sends no note when the approval has none, and shows a refusal in the service’s words', async () => {
    const approved = store.approve('m1', 'c1', '  ');
    await settle();
    const approve = http.expectOne('/projects/api/milestones/m1/criteria/c1/approve');
    expect(approve.request.body).toEqual({});
    approve.flush(
      { message: 'Only a person approves a milestone.' },
      { status: 403, statusText: 'Forbidden' },
    );
    expect(await approved).toEqual({ ok: false, refusal: 'Only a person approves a milestone.' });
  });

  it('attaches and detaches a work item’s milestone', async () => {
    const { qualifiedId, milestoneId, otherMilestoneId } = params(UNMET, 'attachWorkMilestone');
    const attached = store.attach(qualifiedId, otherMilestoneId);
    await settle();
    const put = http.expectOne(`/projects/api/work/${qualifiedId}/milestones/${otherMilestoneId}`);
    expect(put.request.method).toBe('PUT');
    put.flush(goldenMaster(UNMET, 'attachWorkMilestone'));
    const attach = await attached;
    expect(attach.ok && attach.value.milestones?.length).toBeGreaterThan(0);

    const detached = store.detach(qualifiedId, milestoneId);
    await settle();
    const del = http.expectOne(`/projects/api/work/${qualifiedId}/milestones/${milestoneId}`);
    expect(del.request.method).toBe('DELETE');
    del.flush(goldenMaster(UNMET, 'detachWorkMilestone'));
    const detach = await detached;
    expect(detach.ok && detach.value.milestones).toEqual([]);
  });

  it('states every milestone a campaign membership needs', async () => {
    const { qualifiedId, membershipId, milestoneId, otherMilestoneId } = params(
      MEMBER,
      'setWorkMemberMilestones',
    );
    const done = store.setMemberMilestones(qualifiedId, membershipId, [
      milestoneId,
      otherMilestoneId,
    ]);
    await settle();
    const put = http.expectOne(
      `/projects/api/work/${qualifiedId}/members/${membershipId}/milestones`,
    );
    expect(put.request.body).toEqual({ milestoneIds: [milestoneId, otherMilestoneId] });
    put.flush(goldenMaster(MEMBER, 'setWorkMemberMilestones'));
    const outcome = await done;
    expect(outcome.ok && outcome.value.member?.milestones?.map((m) => m.displayName)).toEqual([
      'bootstrap test node',
      'arm64 runner',
    ]);
  });

  it('follows MilestoneMet and MilestoneUnmet about the open project only', async () => {
    const event = (name: string, payload: object) => ({ name, payload: JSON.stringify(payload) });
    const refreshed: (readonly DomainEvent[])[] = [];
    vi.useFakeTimers();
    try {
      store.follow(
        TestBed.inject(DestroyRef),
        () => 'p1',
        (burst) => refreshed.push(burst),
      );
      events.next(event('MilestoneMet', { milestoneId: 'm9', projectId: 'p9' }));
      events.next(event('EntityTransitioned', { projectId: 'p1' }));
      events.next(event('MilestoneMet', { milestoneId: 'm1', projectId: 'p1' }));
      events.next(event('MilestoneUnmet', { milestoneId: 'm2', projectId: 'p1' }));
      vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS);
      expect(refreshed.map((burst) => burst.map((e) => e.name))).toEqual([
        ['MilestoneMet', 'MilestoneUnmet'],
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});
