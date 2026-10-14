import { isPlatformBrowser } from '@angular/common';
import { DestroyRef, inject, Injectable, PLATFORM_ID, signal, type Signal } from '@angular/core';
import { EVENT_SOURCE, type EventSourceLike } from '$core/events/domain-events';
import { PlatformOrigins } from '$core/platform/platform-origins';

/**
 * The topics of a slot's hint channel the agent's Chat tab reads (`WorkspaceChangeHint.Topic`,
 * lowercased, `_` to `-`): the container's commands changed (a harness started or ended), and a
 * prompt draft was written (this tab's own save, or another device's).
 */
export const HINT_TOPICS = ['commands', 'prompt-draft'] as const;

/** One of {@link HINT_TOPICS}. */
export type HintTopic = (typeof HINT_TOPICS)[number];

/** qits-workspaces' hint channel of one slot. */
export const WORKSPACE_HINTS_PATH = (workspaceRowId: number) =>
  `/workspaces/api/workspaces/${encodeURIComponent(workspaceRowId)}/events`;

/**
 * One slot's hint channel, as qits-workspaces-frontend's `WorkspaceEvents` read it (epic
 * qits-1230): an event source on `/workspaces/api/workspaces/{id}/events` at qits-workspaces'
 * origin, whose every frame is a topic name and nothing else (`ping` every ~25 s holds it open).
 * Not a domain event: a payload-free invalidation hint, so a reader reads `hints(topic)` in an
 * effect and fetches again when the number moves. A topic this build does not know is ignored.
 *
 * The service offers no replay, so after the stream errored the next frame moves every counter:
 * whatever the gap missed is read again. The source is `EVENT_SOURCE`'s, so the session (or, under
 * `ng serve`, the bearer) goes with it. Provided by the page that watches; closed with it; never
 * connects on the server.
 */
@Injectable()
export class WorkspaceHints {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly open = inject(EVENT_SOURCE);
  private readonly origins = inject(PlatformOrigins);
  private readonly counters = new Map(HINT_TOPICS.map((topic) => [topic, signal(0)] as const));
  private source: EventSourceLike | undefined;
  private watched: number | undefined;
  private stale = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.close());
  }

  /** How often `topic` was hinted. Only its movement means anything. */
  hints(topic: HintTopic): Signal<number> {
    return this.counters.get(topic)!.asReadonly();
  }

  /** Watch the slot `workspaceRowId`; another id moves the stream, 0 closes it. */
  watch(workspaceRowId: number): void {
    if (this.watched === workspaceRowId) return;
    this.close();
    this.watched = workspaceRowId;
    if (!this.browser || workspaceRowId <= 0) return;
    const source = this.open(
      `${this.origins.api('workspaces')}${WORKSPACE_HINTS_PATH(workspaceRowId)}`,
    );
    source.onmessage = (message) => this.hinted(String(message.data ?? '').trim());
    source.onerror = () => {
      this.stale = true;
    };
    this.source = source;
  }

  private hinted(topic: string): void {
    if (this.stale) {
      this.stale = false;
      for (const counter of this.counters.values()) counter.update((n) => n + 1);
      return;
    }
    this.counters.get(topic as HintTopic)?.update((n) => n + 1);
  }

  private close(): void {
    this.source?.close();
    this.source = undefined;
    this.watched = undefined;
    this.stale = false;
  }
}
