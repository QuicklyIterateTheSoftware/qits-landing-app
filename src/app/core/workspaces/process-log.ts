import { isPlatformBrowser } from '@angular/common';
import { DestroyRef, inject, Injectable, PLATFORM_ID, signal, type Signal } from '@angular/core';
import { EVENT_SOURCE, type EventSourceLike } from '$core/events/domain-events';
import { PlatformOrigins } from '$core/platform/platform-origins';

/** One named stage of a technical process (`queued`, `container`, `clone`, …), and how it went. */
export interface ProcessSegment {
  readonly name: string;
  readonly lines: readonly string[];
  readonly status: 'running' | 'ok' | 'failed';
  /** A failure's classification (`remote-auth`), on a failed segment that carried one. */
  readonly hint: string | null;
  /** What the hint applies to: for `remote-auth`, the repository to sign in to. */
  readonly hintTarget: string | null;
}

/**
 * Where the whole process stands. `expired` is the stream ending without a terminal frame (the
 * process was evicted, or its id is unknown): not a failure, and not still running.
 */
export type ProcessOutcome = 'running' | 'ok' | 'failed' | 'expired';

/** The log as the frames so far built it. */
export interface ProcessLogState {
  readonly segments: readonly ProcessSegment[];
  readonly outcome: ProcessOutcome;
  /** The last frame's ordinal on this connection; -1 before the first. */
  readonly seq: number;
}

/** One frame of `/workspaces/api/technical-processes/{id}/events` (qits-workspaces' wire shape). */
export interface ProcessFrame {
  readonly segment?: string | null;
  readonly kind?: string;
  readonly seq?: number;
  readonly line?: string | null;
  readonly status?: string | null;
  readonly hint?: string | null;
  readonly hintTarget?: string | null;
}

export const EMPTY_LOG: ProcessLogState = { segments: [], outcome: 'running', seq: -1 };

/** The segment a runner-placed start waits in before its container is launched. */
export const QUEUED_SEGMENT = 'queued';

/** qits-workspaces' replayable log stream of one technical process. */
export const PROCESS_EVENTS_PATH = (processId: string) =>
  `/workspaces/api/technical-processes/${encodeURIComponent(processId)}/events`;

function withSegment(segments: readonly ProcessSegment[], name: string): ProcessSegment[] {
  return segments.some((s) => s.name === name)
    ? [...segments]
    : [...segments, { name, lines: [], status: 'running', hint: null, hintTarget: null }];
}

/**
 * The log after `frame`. The stream replays every buffered frame with fresh ordinals on each
 * (re)connect, so a frame whose `seq` is not past the last one starts the log over: the replay
 * rebuilds it. A `ping`, and a kind a newer service invents, change nothing but the ordinal.
 */
export function applyFrame(log: ProcessLogState, frame: ProcessFrame): ProcessLogState {
  const seq = typeof frame.seq === 'number' ? frame.seq : log.seq + 1;
  const base = seq <= log.seq ? EMPTY_LOG : log;
  const name = frame.segment ?? null;
  switch (frame.kind) {
    case 'segment-open':
      return name ? { ...base, seq, segments: withSegment(base.segments, name) } : { ...base, seq };
    case 'line': {
      if (!name || frame.line === null || frame.line === undefined) return { ...base, seq };
      const line = frame.line;
      const segments = withSegment(base.segments, name).map((s) =>
        s.name === name ? { ...s, lines: [...s.lines, line] } : s,
      );
      return { ...base, seq, segments };
    }
    case 'segment-settled': {
      if (!name) return { ...base, seq };
      const segments = withSegment(base.segments, name).map((s): ProcessSegment =>
        s.name === name
          ? {
              ...s,
              status: frame.status === 'failed' ? 'failed' : 'ok',
              hint: frame.hint ?? null,
              hintTarget: frame.hintTarget ?? null,
            }
          : s,
      );
      return { ...base, seq, segments };
    }
    case 'done':
      return { ...base, seq, outcome: frame.status === 'failed' ? 'failed' : 'ok' };
    default:
      return { ...base, seq };
  }
}

/** What a segment's head says: its name, or for the `queued` wait, the service's own words. */
export function segmentLabel(segment: ProcessSegment): string {
  if (segment.name !== QUEUED_SEGMENT) return segment.name;
  return segment.lines.at(-1)?.trim() || 'waiting for a runner';
}

/** A segment's status as its badge says it: `waiting` for the queue, not `running`. */
export function segmentStatusLabel(segment: ProcessSegment): string {
  if (segment.status === 'running') return segment.name === QUEUED_SEGMENT ? 'waiting' : 'running';
  return segment.status;
}

const CLOSED = 2;

/**
 * Follows one technical process's log (a container start), as qits-workspaces-frontend's Starting
 * tab did: an event source on `/workspaces/api/technical-processes/{id}/events` at qits-workspaces'
 * origin. Not a domain event, so not `DomainEvents`: the log is a payload stream of one process,
 * on the service that runs it. The source is `EVENT_SOURCE`'s, so the session (or, under `ng
 * serve`, the bearer) goes with it.
 *
 * `follow(id)` starts over on a new id and does nothing for the one it follows; the stream is
 * closed on the terminal frame, by `stop()`, and with the injector that made it. A stream the
 * browser gave up on (a 404: an unknown or evicted process) is `expired`. Never connects on the
 * server.
 */
@Injectable()
export class ProcessLog {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly open = inject(EVENT_SOURCE);
  private readonly origins = inject(PlatformOrigins);
  private readonly log = signal<ProcessLogState>(EMPTY_LOG);
  private source: EventSourceLike | undefined;
  private followed: string | undefined;

  /** The log so far. */
  readonly state: Signal<ProcessLogState> = this.log.asReadonly();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  /** Follows `processId`; a new id starts the log over. */
  follow(processId: string): void {
    if (this.followed === processId) return;
    this.stop();
    this.followed = processId;
    this.log.set(EMPTY_LOG);
    if (!this.browser) return;
    const source = this.open(`${this.origins.api('workspaces')}${PROCESS_EVENTS_PATH(processId)}`);
    source.onmessage = (message) => {
      let frame: ProcessFrame;
      try {
        frame = JSON.parse(message.data) as ProcessFrame;
      } catch {
        return;
      }
      const next = applyFrame(this.log(), frame);
      this.log.set(next);
      if (next.outcome !== 'running') this.close();
    };
    source.onerror = () => {
      if (source.readyState === CLOSED && this.log().outcome === 'running') {
        this.log.update((log) => ({ ...log, outcome: 'expired' }));
        this.close();
      }
    };
    this.source = source;
  }

  /** Stops following; what is on screen stays. */
  stop(): void {
    this.close();
    this.followed = undefined;
  }

  private close(): void {
    this.source?.close();
    this.source = undefined;
  }
}
