import { DestroyRef, Injector, PLATFORM_ID, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  EVENT_SOURCE,
  REOPEN_DEBOUNCE_MS,
  type DomainEvent,
  type EventSourceLike,
} from './domain-events';
import {
  injectRefreshOn,
  payloadField,
  payloadIds,
  REFRESH_DEBOUNCE_MS,
  refreshOn,
} from './refresh-on';
import { provideTestPlatformOrigins } from '../../../testing/platform-origins';

/** A stand-in for the browser's `EventSource`: records its URL, and lets a spec push frames. */
class FakeSource implements EventSourceLike {
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readyState = 1;
  constructor(readonly url: string) {}
  close(): void {
    this.readyState = 2;
  }
  push(event: Partial<DomainEvent>): void {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(event) }));
  }
}

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

describe('refreshOn', () => {
  let sources: FakeSource[];

  function injector(platform = 'browser'): Injector {
    sources = [];
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: platform },
        provideTestPlatformOrigins({}),
        {
          provide: EVENT_SOURCE,
          useValue: (url: string) => {
            const source = new FakeSource(url);
            sources.push(source);
            return source;
          },
        },
      ],
    });
    return TestBed.inject(Injector);
  }

  const live = () => sources.filter((source) => source.readyState !== 2);
  const ofProject = (projectId: string, more: object = {}) =>
    JSON.stringify({ projectId, ...more });

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reads again once a burst pauses, handed the events that concern it', () => {
    const destroy = new ManualDestroy();
    const bursts: string[][] = [];
    runInInjectionContext(injector(), () =>
      refreshOn(
        {
          names: ['ReleaseRequestChanged', 'BuildFailed'],
          when: (_, ids) => ids.projectId === 'p1',
          refresh: (events) => void bursts.push(events.map((event) => event.id ?? '')),
        },
        destroy,
      ),
    );
    vi.advanceTimersByTime(REOPEN_DEBOUNCE_MS);
    const stream = live()[0];
    stream.push({ id: '1', name: 'ReleaseRequestChanged', payload: ofProject('p1') });
    stream.push({ id: '2', name: 'BuildFailed', payload: ofProject('p2') });
    vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS - 1);
    stream.push({ id: '3', name: 'BuildFailed', payload: ofProject('p1') });
    // An event of a name it did not ask for never reaches it.
    stream.push({ id: '4', name: 'SCMRelease', payload: ofProject('p1') });
    vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS - 1);
    expect(bursts).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(bursts).toEqual([['1', '3']]);

    stream.push({ id: '5', name: 'BuildFailed', payload: ofProject('p2') });
    vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS);
    expect(bursts).toHaveLength(1);
    destroy.destroy();
  });

  it('waits as long as it is told to, and stops when its DestroyRef is destroyed', () => {
    const destroy = new ManualDestroy();
    let refreshed = 0;
    runInInjectionContext(injector(), () =>
      refreshOn(
        { names: ['SCMRelease'], debounceMs: 50, refresh: () => void refreshed++ },
        destroy,
      ),
    );
    vi.advanceTimersByTime(REOPEN_DEBOUNCE_MS);
    live()[0].push({ id: '1', name: 'SCMRelease' });
    vi.advanceTimersByTime(50);
    expect(refreshed).toBe(1);

    live()[0].push({ id: '2', name: 'SCMRelease' });
    destroy.destroy();
    vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS);
    expect(refreshed).toBe(1);
    vi.advanceTimersByTime(REOPEN_DEBOUNCE_MS);
    expect(live()).toHaveLength(0);
  });

  it('subscribes later through injectRefreshOn, with the DestroyRef it is handed', () => {
    const destroy = new ManualDestroy();
    const follow = runInInjectionContext(injector(), () => injectRefreshOn());
    let refreshed = 0;
    follow({ names: ['EntityTransitioned'], refresh: () => void refreshed++ }, destroy);
    vi.advanceTimersByTime(REOPEN_DEBOUNCE_MS);
    live()[0].push({ id: '1', name: 'EntityTransitioned' });
    vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS);
    expect(refreshed).toBe(1);
    destroy.destroy();
  });

  it('does nothing on the server', () => {
    const destroy = new ManualDestroy();
    let refreshed = 0;
    const subscription = runInInjectionContext(injector('server'), () =>
      refreshOn({ names: ['SCMRelease'], refresh: () => void refreshed++ }, destroy),
    );
    vi.advanceTimersByTime(REOPEN_DEBOUNCE_MS + REFRESH_DEBOUNCE_MS);
    expect(sources).toHaveLength(0);
    expect(refreshed).toBe(0);
    expect(subscription.closed).toBe(true);
  });
});

describe('payloadIds', () => {
  it('reads the ids a payload names, numbers as strings', () => {
    const ids = payloadIds({
      payload: JSON.stringify({
        projectId: 'p1',
        repoId: 'r1',
        releaseRequestId: 'rr1',
        runId: 'run1',
        agentId: 'a1',
        workId: 'w1',
        workspaceId: 4151,
        deploymentId: 'd1',
        runnerId: 'x1',
      }),
    });
    expect(ids).toEqual({
      projectId: 'p1',
      repositoryId: 'r1',
      releaseRequestId: 'rr1',
      runId: 'run1',
      agentId: 'a1',
      workId: 'w1',
      workspaceId: '4151',
      deploymentId: 'd1',
      runnerId: 'x1',
      workIds: ['w1'],
      projectIds: ['p1'],
    });
  });

  it("reads a repository by each of the payloads' spellings", () => {
    expect(payloadIds({ payload: '{"repositoryId":"r2"}' }).repositoryId).toBe('r2');
    expect(payloadIds({ payload: '{"repository":"r3"}' }).repositoryId).toBe('r3');
  });

  it('reads the work items and projects an EntityTransitioned names in its entities', () => {
    const ids = payloadIds({
      name: 'EntityTransitioned',
      payload: JSON.stringify({
        entities: [
          { entityId: 'e1', projectId: 'p1' },
          { entityId: 'e2', projectId: 'p1' },
        ],
      }),
    });
    expect(ids.workIds).toEqual(['e1', 'e2']);
    expect(ids.projectIds).toEqual(['p1']);
    expect(ids.projectId).toBeUndefined();
  });

  it('names nothing for a payload that is absent, not JSON, or not an object', () => {
    const none = { workIds: [], projectIds: [] };
    expect(payloadIds({})).toMatchObject(none);
    expect(payloadIds({ payload: 'not json' })).toMatchObject(none);
    expect(payloadIds({ payload: '[1]' })).toMatchObject(none);
    expect(payloadIds({ payload: '{}' }).projectId).toBeUndefined();
  });
});

describe('payloadField', () => {
  it('reads one top-level string or number, as a string', () => {
    const event = { payload: '{"state":"FINALIZED","heldRuns":0,"parents":["a"]}' };
    expect(payloadField(event, 'state')).toBe('FINALIZED');
    expect(payloadField(event, 'heldRuns')).toBe('0');
    expect(payloadField(event, 'parents')).toBeUndefined();
    expect(payloadField(event, 'absent')).toBeUndefined();
    expect(payloadField({ payload: 'not json' }, 'state')).toBeUndefined();
  });
});
