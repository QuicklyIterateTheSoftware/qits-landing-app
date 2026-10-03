import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ALL,
  DomainEvents,
  EVENT_SOURCE,
  payloadProjectId,
  RECONNECT_MIN_MS,
  REOPEN_DEBOUNCE_MS,
  type DomainEvent,
  type EventSourceLike,
} from './domain-events';
import { AppOrigins } from '$core/platform/app-origins';

/** A stand-in for the browser's `EventSource`: records its URL, and lets a spec push frames. */
class FakeSource implements EventSourceLike {
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readyState = 1;
  closed = false;
  constructor(readonly url: string) {}
  close(): void {
    this.closed = true;
    this.readyState = 2;
  }
  push(event: Partial<DomainEvent>): void {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(event) }));
  }
  fail(): void {
    this.readyState = 2;
    this.onerror?.(new Event('error'));
  }
}

describe('DomainEvents', () => {
  let sources: FakeSource[];

  function service(platform = 'browser', eventsOrigin = ''): DomainEvents {
    sources = [];
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: platform },
        { provide: AppOrigins, useValue: { origin: () => eventsOrigin } },
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
    return TestBed.inject(DomainEvents);
  }

  /** The streams still open: neither closed by the service nor given up by the browser. */
  const live = () => sources.filter((source) => source.readyState !== 2);
  const names = (source: FakeSource) =>
    decodeURIComponent(new URL(source.url, 'http://x').searchParams.get('names') ?? '');

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('opens one stream for the union of the names its subscribers want, after a pause', () => {
    const events = service();
    const a = events.on(['BuildFailed', 'SCMRelease']).subscribe();
    const b = events.on(['BuildFailed', 'DeploymentActive']).subscribe();
    expect(sources).toHaveLength(0);
    vi.advanceTimersByTime(REOPEN_DEBOUNCE_MS);
    expect(live()).toHaveLength(1);
    expect(live()[0].url.startsWith('/events/api/stream?names=')).toBe(true);
    expect(names(live()[0])).toBe('BuildFailed,DeploymentActive,SCMRelease');
    a.unsubscribe();
    b.unsubscribe();
  });

  it("opens the stream on qits-events' own origin when the navigation names one", () => {
    const events = service('browser', 'https://events.qits.example');
    const subscription = events.on([ALL]).subscribe();
    vi.advanceTimersByTime(REOPEN_DEBOUNCE_MS);
    expect(live()[0].url).toBe('https://events.qits.example/events/api/stream?names=*');
    subscription.unsubscribe();
  });

  it('reopens when the union changes, and closes when nobody listens', () => {
    const events = service();
    const a = events.on(['BuildFailed']).subscribe();
    vi.advanceTimersByTime(REOPEN_DEBOUNCE_MS);
    const first = live()[0];

    const b = events.on(['SCMRelease']).subscribe();
    vi.advanceTimersByTime(REOPEN_DEBOUNCE_MS);
    expect(first.closed).toBe(true);
    expect(names(live()[0])).toBe('BuildFailed,SCMRelease');

    b.unsubscribe();
    vi.advanceTimersByTime(REOPEN_DEBOUNCE_MS);
    expect(names(live()[0])).toBe('BuildFailed');

    a.unsubscribe();
    vi.advanceTimersByTime(REOPEN_DEBOUNCE_MS);
    expect(live()).toHaveLength(0);
  });

  it('hands each subscriber only the names it asked for', () => {
    const events = service();
    const builds: string[] = [];
    const releases: string[] = [];
    const a = events.on(['BuildFailed']).subscribe((event) => builds.push(event.id ?? ''));
    const b = events.on(['SCMRelease']).subscribe((event) => releases.push(event.id ?? ''));
    vi.advanceTimersByTime(REOPEN_DEBOUNCE_MS);
    live()[0].push({ id: '1', name: 'BuildFailed' });
    live()[0].push({ id: '2', name: 'SCMRelease' });
    live()[0].onmessage?.(new MessageEvent('message', { data: 'not json' }));
    expect(builds).toEqual(['1']);
    expect(releases).toEqual(['2']);
    a.unsubscribe();
    b.unsubscribe();
  });

  it('subscribes to everything when one subscriber wants every event', () => {
    const events = service();
    const seen: string[] = [];
    const a = events.on(['BuildFailed']).subscribe();
    const b = events.on([ALL]).subscribe((event) => seen.push(event.name ?? ''));
    vi.advanceTimersByTime(REOPEN_DEBOUNCE_MS);
    expect(names(live()[0])).toBe('*');
    live()[0].push({ id: '1', name: 'ProjectChanged' });
    expect(seen).toEqual(['ProjectChanged']);
    a.unsubscribe();
    b.unsubscribe();
  });

  it('reopens a stream the browser gave up on, waiting longer each time', () => {
    const events = service();
    const a = events.on(['BuildFailed']).subscribe();
    vi.advanceTimersByTime(REOPEN_DEBOUNCE_MS);
    live()[0].fail();
    expect(live()).toHaveLength(0);
    vi.advanceTimersByTime(RECONNECT_MIN_MS);
    expect(live()).toHaveLength(1);
    live()[0].fail();
    vi.advanceTimersByTime(RECONNECT_MIN_MS);
    expect(live()).toHaveLength(0);
    vi.advanceTimersByTime(RECONNECT_MIN_MS);
    expect(live()).toHaveLength(1);
    a.unsubscribe();
  });

  it('never connects on the server', () => {
    const events = service('server');
    let completed = false;
    events.on(['BuildFailed']).subscribe({ complete: () => (completed = true) });
    vi.advanceTimersByTime(REOPEN_DEBOUNCE_MS);
    expect(sources).toHaveLength(0);
    expect(completed).toBe(true);
  });

  it('reads the project an event names from its payload', () => {
    expect(payloadProjectId({ payload: '{"projectId":"p1","repoName":"r"}' })).toBe('p1');
    expect(payloadProjectId({ payload: '{"applicationName":"qits-ci"}' })).toBeUndefined();
    expect(payloadProjectId({ payload: 'not json' })).toBeUndefined();
    expect(payloadProjectId({})).toBeUndefined();
  });
});
