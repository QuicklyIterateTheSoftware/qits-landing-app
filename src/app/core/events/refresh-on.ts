import { assertInInjectionContext, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { buffer, connect, debounceTime, filter, type Subscription } from 'rxjs';
import { DomainEvents, type DomainEvent } from './domain-events';

/** How long a burst of domain events waits before a subscriber reads again: at most once a second. */
export const REFRESH_DEBOUNCE_MS = 1_000;

/**
 * The ids an event's payload names, read once per event so a subscriber can narrow by them. Each is
 * a string (a number, such as a slot's row id, is read as its string), absent when the payload does
 * not name it. qits-events' payloads spell some ids two ways; each field says which it reads.
 */
export interface PayloadIds {
  /** `projectId`. */
  readonly projectId?: string;
  /** `repoId`, else `repositoryId` (qits-workspaces), else `repository` (`SCMRelease`, `SoftwareRelease`). */
  readonly repositoryId?: string;
  /** `releaseRequestId`. */
  readonly releaseRequestId?: string;
  /** `runId`: a CI run. */
  readonly runId?: string;
  /** `workId`: a work item, as qits-workspaces names it. */
  readonly workId?: string;
  /** `agentId`. */
  readonly agentId?: string;
  /** `workspaceId`: a workspace slot's row id. */
  readonly workspaceId?: string;
  /** `deploymentId`. */
  readonly deploymentId?: string;
  /** `runnerId`. */
  readonly runnerId?: string;
  /**
   * Every work item the event names: `workId`, and each of `entities[].entityId`
   * (`EntityTransitioned` moves several at once and names them only there).
   */
  readonly workIds: readonly string[];
  /** Every project the event names: `projectId`, and each of `entities[].projectId`. */
  readonly projectIds: readonly string[];
}

/** An event's payload as an object; undefined when it has none, or it is not a JSON object. */
export function payloadOf(event: DomainEvent): Readonly<Record<string, unknown>> | undefined {
  if (!event.payload) return undefined;
  try {
    const payload: unknown = JSON.parse(event.payload);
    return payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/** A string or a number, as a string; undefined for anything else. */
const idOf = (value: unknown): string | undefined =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;

/** One top-level field of an event's payload: a string or a number, as a string; else undefined. */
export function payloadField(event: DomainEvent, key: string): string | undefined {
  return idOf(payloadOf(event)?.[key]);
}

/** The ids `event`'s payload names ({@link PayloadIds}); none when it names none, or is not JSON. */
export function payloadIds(event: DomainEvent): PayloadIds {
  return idsOf(payloadOf(event) ?? {});
}

function idsOf(payload: Readonly<Record<string, unknown>>): PayloadIds {
  const entities = Array.isArray(payload['entities'])
    ? payload['entities'].filter(
        (entity): entity is Record<string, unknown> => !!entity && typeof entity === 'object',
      )
    : [];
  const all = (top: unknown, key: string) => {
    const ids = [idOf(top), ...entities.map((entity) => idOf(entity[key]))];
    return [...new Set(ids.filter((id): id is string => id !== undefined))];
  };
  return {
    projectId: idOf(payload['projectId']),
    repositoryId:
      idOf(payload['repoId']) ?? idOf(payload['repositoryId']) ?? idOf(payload['repository']),
    releaseRequestId: idOf(payload['releaseRequestId']),
    runId: idOf(payload['runId']),
    workId: idOf(payload['workId']),
    agentId: idOf(payload['agentId']),
    workspaceId: idOf(payload['workspaceId']),
    deploymentId: idOf(payload['deploymentId']),
    runnerId: idOf(payload['runnerId']),
    workIds: all(payload['workId'], 'entityId'),
    projectIds: all(payload['projectId'], 'projectId'),
  };
}

/** What a subscriber reads again after, and when: one {@link refreshOn} subscription. */
export interface RefreshOnOptions {
  /** The event names that can change what the subscriber holds; narrow, never `*` for staleness. */
  readonly names: readonly string[];
  /**
   * Whether this event is about what the subscriber holds, by its payload ids (the open project,
   * a request, a slot…). Read when the event arrives, so it can read the current scope. Every
   * event of `names` counts when absent.
   */
  readonly when?: (event: DomainEvent, ids: PayloadIds) => boolean;
  /** How long a burst waits after its last event before `refresh` runs; {@link REFRESH_DEBOUNCE_MS}. */
  readonly debounceMs?: number;
  /**
   * Reads again. Handed the burst's events (those `when` let through, oldest first), so it can
   * read one row again when every event names one, and the whole list when one may move the list.
   */
  readonly refresh: (events: readonly DomainEvent[]) => void | Promise<void>;
}

/** {@link refreshOn}, bound to the `DomainEvents` of the injection context it was made in. */
export type RefreshOn = (options: RefreshOnOptions, destroy: DestroyRef) => Subscription;

/**
 * How a store or a page stays current (qits-1270): it reads again after the domain events that
 * can change what it holds, through the app's one stream (`DomainEvents`), never by polling.
 *
 * - Subscribes to `options.names` through `DomainEvents.on`.
 * - Keeps the events `options.when` lets through, handing it each event's {@link payloadIds}.
 * - Waits for a burst to pause (`options.debounceMs`, a second by default: one release sends
 *   several events) and runs `options.refresh` once, with the burst's events.
 * - Stops when `destroy` is destroyed (the injection context's `DestroyRef` when not given).
 * - On the server it does nothing: `DomainEvents.on` completes empty there.
 *
 * In a component or a service, call it from the constructor (an injection context). In a
 * signalStore method that a page calls later, use {@link injectRefreshOn} in `withMethods` and
 * hand it the page's `DestroyRef`.
 */
export function refreshOn(options: RefreshOnOptions, destroy?: DestroyRef): Subscription {
  if (!destroy) assertInInjectionContext(refreshOn);
  return subscribe(inject(DomainEvents), options, destroy ?? inject(DestroyRef));
}

/**
 * {@link refreshOn} for later: called in an injection context (a signalStore's `withMethods`, a
 * service's field), it gives a function that subscribes whenever it is called, until the
 * `DestroyRef` it is handed is destroyed.
 */
export function injectRefreshOn(): RefreshOn {
  assertInInjectionContext(injectRefreshOn);
  const events = inject(DomainEvents);
  return (options, destroy) => subscribe(events, options, destroy);
}

function subscribe(
  events: DomainEvents,
  { names, when, debounceMs = REFRESH_DEBOUNCE_MS, refresh }: RefreshOnOptions,
  destroy: DestroyRef,
): Subscription {
  return events
    .on(names)
    .pipe(
      filter((event) => !when || when(event, payloadIds(event))),
      // Collects the burst until it pauses, so `refresh` sees every event it answers.
      connect((burst) => burst.pipe(buffer(burst.pipe(debounceTime(debounceMs))))),
      filter((burst) => burst.length > 0),
      takeUntilDestroyed(destroy),
    )
    .subscribe((burst) => void refresh(burst));
}
