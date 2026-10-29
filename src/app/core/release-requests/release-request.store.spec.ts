import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { client as projectsClient } from '../../api/projects/client.gen';
import { provideHeyApiClient } from '../../api/projects/client/client.gen';
import { goldenMaster, projectsGoldenMasters } from '../../../testing/golden-masters';
import type { ReleaseRequest } from './release-request.consumes';
import { ReleaseRequestStore } from './release-request.store';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

/**
 * qits-projects' soft-feature-freeze state (epic qits-1580): rr-1, frozen with `main` and three
 * branches, and rr-2 queued behind it with `main` and one branch of its own.
 */
const FROZEN = 'a frozen release request with a queued next request';
const { params } = projectsGoldenMasters.operation(FROZEN, 'getProjectReleaseRequest');
const PROJECT = params['projectId'];
const REPO = params['repositoryId'];
const ACTIVE = params['requestId'];
const QUEUED = params['queuedRequestQualifiedId'];

const active: ReleaseRequest & { qualifiedId?: string } = goldenMaster(
  FROZEN,
  'getReleaseRequest',
).request;
const queued: ReleaseRequest & { qualifiedId?: string } = goldenMaster(
  FROZEN,
  'getProjectReleaseRequest',
).request;

const MOVED = 'ticket/contract-12';
const REASON = 'It conflicts with ticket/contract-11.';

/**
 * The move's answer (qits-1665), derived from the two recorded requests because the pinned
 * `@qits/projects-golden-masters` holds no recording of `moveReleaseRequestSource` yet: rr-1
 * without `ticket/contract-12`, back to PENDING, and rr-2 with it, both listing the move. This is
 * what qits-projects records for the same state from the release that adds the door.
 */
function moveAnswer() {
  const move = {
    branch: MOVED,
    fromQualifiedId: active.qualifiedId,
    toQualifiedId: queued.qualifiedId,
    movedBy: 'dev',
    reason: REASON,
    movedAt: '2026-01-01T00:00:00Z',
  };
  const carried = (active.sources ?? []).find((source) => source.name === MOVED)!;
  return {
    from: {
      ...active,
      state: 'PENDING',
      sources: (active.sources ?? []).filter((source) => source.name !== MOVED),
      sourceMoves: [move],
    },
    to: { ...queued, sources: [...(queued.sources ?? []), carried], sourceMoves: [move] },
  };
}

describe('ReleaseRequestStore.moveSource (qits-1665)', () => {
  let http: HttpTestingController;
  let store: InstanceType<typeof ReleaseRequestStore>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'server' },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(ReleaseRequestStore);
  });

  afterEach(() => http.verify());

  /** Answers every read that follows a request (its fold's commits and verdicts) with nothing. */
  async function drain(): Promise<void> {
    for (let round = 0; round < 5; round++) {
      await settle();
      for (const read of http.match(() => true)) {
        read.flush(read.request.url.endsWith('/builds') ? { builds: [] } : { commits: [] });
      }
    }
  }

  /** Both requests on show: rr-2 as its project answers it, rr-1 by its uuid. */
  async function shown(): Promise<void> {
    const second = store.load(PROJECT, QUEUED);
    await settle();
    http.expectOne(`/projects/api/projects/${PROJECT}/release-requests/${QUEUED}`).flush({
      request: queued,
    });
    const first = store.load(PROJECT, ACTIVE);
    await settle();
    // rr-1 is recorded through its repository's door only; the project's door answers the same
    // request in the same shape, so the page's read of it by its uuid is answered with that.
    http
      .expectOne(`/projects/api/projects/${PROJECT}/release-requests/${ACTIVE}`)
      .flush({ request: active });
    await drain();
    await Promise.all([first, second]);
  }

  it('sends the branch and the trimmed reason, and puts both requests in place', async () => {
    await shown();
    const done = store.moveSource(REPO, ACTIVE, MOVED, `  ${REASON}  `);
    await settle();
    const call = http.expectOne(
      `/projects/api/repositories/${REPO}/release-requests/${ACTIVE}/sources/move`,
    );
    expect(call.request.method).toBe('POST');
    expect(call.request.body).toEqual({ branch: MOVED, reason: REASON });
    call.flush(moveAnswer());
    await drain();
    const outcome = await done;

    expect(outcome.from?.sources?.map((source) => source.name)).not.toContain(MOVED);
    expect(outcome.to?.sources?.map((source) => source.name)).toContain(MOVED);
    const names = (ref: string) =>
      store.of(ref)?.request.value?.sources?.map((source) => source.name);
    expect(names(ACTIVE)).not.toContain(MOVED);
    expect(names(QUEUED)).toContain(MOVED);
    expect(store.of(QUEUED)?.request.value?.sourceMoves?.[0]).toMatchObject({
      branch: MOVED,
      fromQualifiedId: active.qualifiedId,
      toQualifiedId: queued.qualifiedId,
      reason: REASON,
    });
  });

  it('hands a refusal back with the service’s message, and changes nothing', async () => {
    await shown();
    const done = store.moveSource(REPO, ACTIVE, MOVED, REASON);
    await settle();
    const message = 'Release request contract-service-rr-1 is queued: nothing moves out of it';
    http
      .expectOne(`/projects/api/repositories/${REPO}/release-requests/${ACTIVE}/sources/move`)
      .flush({ message }, { status: 409, statusText: 'Conflict' });
    expect(await done).toEqual({ status: 409, message });
    expect(store.of(ACTIVE)?.request.value?.sources?.map((source) => source.name)).toContain(MOVED);
  });
});
