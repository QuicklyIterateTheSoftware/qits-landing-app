import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DestroyRef, PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { filter, Subject } from 'rxjs';
import { client as ciClient } from '../../api/ci/client.gen';
import { provideHeyApiClient } from '../../api/ci/client/client.gen';
import { DomainEvents, type DomainEvent } from '$core/events/domain-events';
import { REFRESH_DEBOUNCE_MS } from '$core/events/refresh-on';
import { BUILD_EVENTS } from './build-events';
import { CiReportsStore } from './ci-reports.store';
import { CiRunsStore } from './ci-runs.store';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

/** A `DestroyRef` a spec destroys by hand. */
class ManualDestroy implements DestroyRef {
  private readonly callbacks = new Set<() => void>();
  destroyed = false;
  onDestroy(callback: () => void): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }
  destroy(): void {
    this.destroyed = true;
    this.callbacks.forEach((callback) => callback());
  }
}

/**
 * The CI stores' staleness (qits-1270): `CiRunsStore.follow` reads a repository's runs again after
 * a build event naming that repository, `CiReportsStore.followRun` a run's reports after one
 * naming that run; nothing else does.
 */
describe('CI stores after build events', () => {
  let http: HttpTestingController;
  let events: Subject<DomainEvent>;
  let names: (readonly string[])[];

  beforeEach(() => {
    events = new Subject<DomainEvent>();
    names = [];
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(ciClient),
        {
          provide: DomainEvents,
          useValue: {
            on: (wanted: readonly string[]) => {
              names.push(wanted);
              // As the service: only the events of the names asked for.
              return events.pipe(filter((e) => wanted.includes(e.name ?? '')));
            },
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const event = (name: string, payload: object): DomainEvent => ({
    id: name,
    name,
    payload: JSON.stringify(payload),
  });

  /** Sends `sent`, lets the burst pause, and lets the reads start. */
  async function send(...sent: DomainEvent[]) {
    vi.useFakeTimers();
    sent.forEach((e) => events.next(e));
    vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS);
    vi.useRealTimers();
    await settle();
  }

  /** A read of `repoId`'s runs (`listRuns`, its query in the URL); any repository's when absent. */
  const runsOf =
    (repoId?: string) =>
    (r: { urlWithParams: string }): boolean =>
      r.urlWithParams.startsWith('/ci/api/runs?') &&
      (!repoId || r.urlWithParams.includes(`repositoryId=${repoId}&`));

  describe('CiRunsStore.follow', () => {
    async function followed(repoId: string) {
      const store = TestBed.inject(CiRunsStore);
      const destroy = new ManualDestroy();
      const loaded = store.load(repoId);
      await settle();
      http.expectOne(runsOf(repoId)).flush({ runs: [{ runId: 'old' }] });
      await loaded;
      store.follow(() => repoId, destroy);
      return { store, destroy };
    }

    it('subscribes to the build events', async () => {
      await followed('repo-1');
      expect(names).toEqual([BUILD_EVENTS]);
    });

    it('reads the repository’s runs again, once a burst naming it pauses, keeping the old ones meanwhile', async () => {
      const { store } = await followed('repo-1');
      await send(
        event('BuildStatusChanged', { runId: 'new', repoId: 'repo-1', status: 'RUNNING' }),
        event('BuildSuccessful', { runId: 'new', repoId: 'repo-1' }),
      );
      const reads = http.match(runsOf('repo-1'));
      expect(reads).toHaveLength(1);
      expect(store.byRepository()['repo-1']).toEqual({
        status: 'loaded',
        runs: [{ runId: 'old' }],
      });
      reads[0].flush({ runs: [{ runId: 'new' }, { runId: 'old' }] });
      await settle();
      expect(store.byRepository()['repo-1'].runs).toEqual([{ runId: 'new' }, { runId: 'old' }]);
    });

    it('reads nothing for another repository, or another event', async () => {
      await followed('repo-1');
      await send(
        event('BuildFailed', { runId: 'x', repoId: 'repo-2' }),
        event('ReleaseRequestChanged', { repoId: 'repo-1' }),
      );
      http.expectNone(runsOf());
    });

    it('stops with its DestroyRef', async () => {
      const { destroy } = await followed('repo-1');
      destroy.destroy();
      await send(event('BuildFailed', { runId: 'x', repoId: 'repo-1' }));
      http.expectNone(runsOf());
    });
  });

  describe('CiReportsStore.followRun', () => {
    const reportsOf = (runId: string) => `/ci/api/runs/${runId}/reports`;

    async function followed(runId: string) {
      const store = TestBed.inject(CiReportsStore);
      store.loadRun(runId);
      await settle();
      http.expectOne(reportsOf(runId)).flush({ reports: [] });
      await settle();
      store.followRun(() => runId, new ManualDestroy());
      return store;
    }

    it('reads the run’s reports again after an event naming the run', async () => {
      const store = await followed('run-1');
      await send(event('BuildSuccessful', { runId: 'run-1', repoId: 'repo-1' }));
      http.expectOne(reportsOf('run-1')).flush({ reports: [{ id: 'r1', kind: 'test-results' }] });
      await settle();
      expect(store.runs()['run-1'].value?.reports).toEqual([{ id: 'r1', kind: 'test-results' }]);
    });

    it('reads nothing after an event naming another run of the repository', async () => {
      await followed('run-1');
      await send(event('BuildStatusChanged', { runId: 'run-2', repoId: 'repo-1' }));
      http.expectNone(reportsOf('run-1'));
    });
  });
});
