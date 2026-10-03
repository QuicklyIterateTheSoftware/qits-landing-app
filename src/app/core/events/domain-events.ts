import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, InjectionToken, PLATFORM_ID } from '@angular/core';
import { EMPTY, Observable, Subject, filter, share } from 'rxjs';
import { AppOrigins } from '$core/platform/app-origins';
import type { EventEntry } from './events.consumes';

/** One domain event as the live stream delivers it: the same envelope as the list's entries. */
export type DomainEvent = EventEntry;

/** The part of `EventSource` the service uses, so a spec can hand it a fake. */
export interface EventSourceLike {
  onmessage: ((event: MessageEvent<string>) => void) | null;
  onerror: ((event: Event) => void) | null;
  readonly readyState: number;
  close(): void;
}

/**
 * Opens an event source on a URL; the browser's `EventSource`, with the session cookie, which a
 * stream on qits-events' own origin needs.
 */
export const EVENT_SOURCE = new InjectionToken<(url: string) => EventSourceLike>('EVENT_SOURCE', {
  providedIn: 'root',
  factory: () => (url) => new EventSource(url, { withCredentials: true }),
});

/**
 * qits-events' Server-Sent Events route, on qits-events' origin (`AppOrigins`); `?names=` is the
 * subscription (`*` is everything).
 */
export const STREAM_PATH = '/events/api/stream';

/** The name that subscribes to every event (`?names=*`). */
export const ALL = '*';

/** How long a change of the subscribed names waits before the stream is reopened. */
export const REOPEN_DEBOUNCE_MS = 200;

/** The first and the longest wait before reconnecting a stream the browser gave up on. */
export const RECONNECT_MIN_MS = 1_000;
export const RECONNECT_MAX_MS = 30_000;

/** `EventSource.CLOSED`, without reading the global (absent on the server and in jsdom). */
const CLOSED = 2;

/**
 * The app's ONE live connection to qits-events (epic qits-112): stores and menus subscribe to the
 * domain events they care about here, instead of each opening a stream of its own.
 *
 * - `on(names)` gives the events of those names ({@link ALL}, `*`, is every event). The service
 *   keeps the union of the names every
 *   current subscriber asked for and opens one `EventSource` on `/events/api/stream?names=…`.
 * - When that union changes, the stream is reopened (debounced, so a page that subscribes three
 *   times at once reopens once). The protocol has no way to change a subscription on an open
 *   stream; reopening is how.
 * - When the last subscriber leaves, the stream is closed.
 * - The browser reconnects a dropped stream by itself. If it gives up (`CLOSED`), the service
 *   reopens it after a wait that doubles each time, from 1 to 30 seconds, and resets once a frame
 *   arrives.
 * - On the server it never connects: `on` completes empty.
 *
 * The stream is live only: events from before the connection are not replayed.
 */
@Injectable({ providedIn: 'root' })
export class DomainEvents {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly open = inject(EVENT_SOURCE);
  private readonly origins = inject(AppOrigins);

  /** Each live subscription's names. */
  private readonly subscriptions = new Map<symbol, readonly string[]>();
  private readonly events = new Subject<DomainEvent>();

  private source: EventSourceLike | undefined;
  private openNames = '';
  private reopenTimer: ReturnType<typeof setTimeout> | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private backoff = RECONNECT_MIN_MS;

  /** Every event of one of `names`, from the moment of subscribing. */
  on(names: readonly string[]): Observable<DomainEvent> {
    if (!this.browser || names.length === 0) return EMPTY;
    const wanted = new Set(names);
    const everything = wanted.has(ALL);
    return new Observable<DomainEvent>((subscriber) => {
      const key = Symbol();
      this.subscriptions.set(key, names);
      this.scheduleReopen();
      const inner = this.events
        .pipe(filter((event) => everything || wanted.has(event.name ?? '')))
        .subscribe(subscriber);
      return () => {
        inner.unsubscribe();
        this.subscriptions.delete(key);
        this.scheduleReopen();
      };
    }).pipe(share());
  }

  /** The names the stream is opened for right now, sorted and comma-separated; '' when closed. */
  get subscribedNames(): string {
    return this.openNames;
  }

  private union(): string {
    const all = new Set<string>();
    for (const names of this.subscriptions.values()) names.forEach((name) => all.add(name));
    return all.has(ALL) ? ALL : [...all].sort().join(',');
  }

  private scheduleReopen(): void {
    clearTimeout(this.reopenTimer);
    this.reopenTimer = setTimeout(() => this.reopen(), REOPEN_DEBOUNCE_MS);
  }

  private reopen(force = false): void {
    const names = this.union();
    if (!force && names === this.openNames && (this.source !== undefined) === (names !== '')) {
      return;
    }
    this.close();
    if (names === '') return;
    this.openNames = names;
    const source = this.open(
      `${this.origins.origin('events')}${STREAM_PATH}?names=${encodeURIComponent(names)}`,
    );
    source.onmessage = (message) => {
      this.backoff = RECONNECT_MIN_MS;
      const event = parse(message.data);
      if (event) this.events.next(event);
    };
    source.onerror = () => {
      if (source.readyState !== CLOSED || this.source !== source) return;
      clearTimeout(this.reconnectTimer);
      const wait = this.backoff;
      this.backoff = Math.min(this.backoff * 2, RECONNECT_MAX_MS);
      this.reconnectTimer = setTimeout(() => this.reopen(true), wait);
    };
    this.source = source;
  }

  private close(): void {
    clearTimeout(this.reconnectTimer);
    this.source?.close();
    this.source = undefined;
    this.openNames = '';
  }
}

/** A frame's JSON envelope, or undefined when it is not one. */
function parse(data: string): DomainEvent | undefined {
  try {
    const value: unknown = JSON.parse(data);
    return value && typeof value === 'object' ? (value as DomainEvent) : undefined;
  } catch {
    return undefined;
  }
}

/** The `projectId` an event's payload names, if it names one (most project-scoped events do). */
export function payloadProjectId(event: DomainEvent): string | undefined {
  if (!event.payload) return undefined;
  try {
    const payload: unknown = JSON.parse(event.payload);
    const id =
      payload && typeof payload === 'object'
        ? (payload as Record<string, unknown>)['projectId']
        : undefined;
    return typeof id === 'string' ? id : undefined;
  } catch {
    return undefined;
  }
}
