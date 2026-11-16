import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { QitsEntity, QitsEntityList, QitsField, qitsResource } from '@qits/angular';
import type { UpstreamPoolEntry } from '$core/edge/edge.consumes';
import { UPSTREAM_POOLS } from '$core/edge/edge.operations';
import { PENDING_BUMPS, type BumpEntry } from '$core/maintenance/maintenance.consumes';
import { PENDING_BUMPS_LIST } from '$core/maintenance/maintenance.operations';
import { loadState } from '$core/resources/load-state';
import { Dropdown } from '$ui/components/dropdown/dropdown';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/**
 * The domain events after which bumps may have moved: a release or an artifact that makes a bump
 * owed, a build that ends a bump's run, and a release request that changes or moves a bump's
 * release (`ReleaseRequestStateChanged` is the only event a release's READY → RELEASED →
 * FINALIZED sends for a repository with no deployment).
 */
export const BUMP_EVENTS = [
  'SoftwareRelease',
  'SCMRelease',
  'BuildSuccessful',
  'BuildFailed',
  'ReleaseRequestChanged',
  'ReleaseRequestStateChanged',
] as const;

/** How long a burst of domain events waits before the bumps are read again. */
export { REFRESH_DEBOUNCE_MS } from '$core/events/refresh-on';

/** How many of a bump's changes a row names before it says how many more there are. */
export const CHANGES_SHOWN = 3;

/** A chip's Tailwind classes, written out in full so Tailwind finds them. */
const CHIP = {
  running: 'bg-accent-soft text-accent',
  waiting: 'bg-warning-soft text-warning-strong',
  neutral: 'bg-surface-muted text-fg-soft',
} as const;

/** How a pending bump stands, in a word: its run, or, once green, its release. */
export function bumpState(bump: BumpEntry): { label: string; tone: keyof typeof CHIP } {
  if (bump.status === 'REQUESTED' || bump.status === 'RUNNING') {
    return { label: bump.status, tone: 'running' };
  }
  return { label: bump.releaseState ?? 'RELEASE OWED', tone: 'waiting' };
}

/**
 * The top bar's bumps menu (a lighthouse): the version bumps qits-maintenance has under way across
 * the platform — each one's repository, what it moves, its mode and how it stands. Always shown,
 * because bumps are the platform's, not a project's.
 *
 * The bumps are read the first time the menu opens, never before, and again on an opening after a
 * failure, and after domain events that move them ({@link BUMP_EVENTS}), at most once a second: its
 * own `qitsResource` over `PENDING_BUMPS_LIST` (qits-2146; the menu is its one reader, mounted in
 * the shell for the app's lifetime). A failed read again keeps the list shown. The button and the
 * panel are `ui-dropdown`'s; the list scrolls inside the panel. Staleness (qits-1270): the
 * resource's `refreshOn`, `BUMP_EVENTS`, any of them (bumps are the platform's, so none is
 * narrowed) → the pending bumps; nothing is read before the first opening.
 *
 * What it shows of the bumps carries the data marks (qits-2141): the list its read
 * (`qitsEntityList`), each row its bump (`qitsEntity`, by `id`), each value its field or the fields
 * it is derived from (`qitsField`); each change line its change, by the dependency's `name`.
 *
 * Below the bumps, a compact list of the edge's upstream connection pools (qits-1065): its own
 * `qitsResource` over `UPSTREAM_POOLS` (the edge's `getUpstreamPools`, on the page's own origin;
 * qits-2220, pacted with qits-edge-service), read on the first opening and again on every later
 * one. One row per pool and origin, in the edge's order (fullest first); a `stream` pool's row says
 * so beside the name. A refused or failed read (a failed re-read too) and an empty array render
 * nothing for that section: it is not something gone wrong, just nothing to show, so it carries no
 * error state of its own. Its marks are the bumps' kind: the list its read, each row its pool (by
 * `origin`), each value its field.
 */
@Component({
  selector: 'app-bumps-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Dropdown, QitsEntity, QitsEntityList, QitsField, Spinner],
  host: { class: 'inline-flex' },
  template: `
    <ui-dropdown
      label="Version bumps"
      panelLabel="Pending version bumps"
      panelId="bumps-menu"
      (opened)="opened()"
    >
      <svg
        dropdown-trigger
        viewBox="0 0 24 24"
        aria-hidden="true"
        class="size-5"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M9 22l1-11h4l1 11z" />
        <path d="M8 11h8" />
        <path d="M10 7h4v4h-4z" />
        <path d="M12 3v4" />
        <path d="M4 6l3 1.5M20 6l-3 1.5M4 11h2M20 11h-2" />
      </svg>
      <div dropdown-panel>
        <ui-spinner [state]="state()" class="min-h-16">
          <ul class="m-0 max-h-96 list-none overflow-y-auto p-0" [qitsEntityList]="bumps">
            @for (bump of pending(); track bump.id) {
              <li
                class="flex flex-col gap-1 border-b border-line-subtle px-3 py-2 last:border-b-0"
                [qitsEntity]="bump"
                entityKey="id"
              >
                <div class="flex items-baseline justify-between gap-2">
                  <span
                    class="truncate text-sm font-semibold text-fg"
                    [fieldOf]="bump"
                    qitsField="repository"
                    >{{ bump.repository }}</span
                  >
                  <span class="flex shrink-0 gap-1">
                    <span
                      class="rounded bg-surface-muted px-1.5 text-[0.6875rem] leading-4 text-fg-soft"
                      [fieldOf]="bump"
                      qitsField="mode"
                      >{{ bump.mode }}</span
                    >
                    <span
                      class="rounded px-1.5 text-[0.6875rem] leading-4 font-semibold"
                      [class]="chip(bump)"
                      [fieldOf]="bump"
                      [qitsField]="{ derived: ['status', 'releaseState'] }"
                      >{{ label(bump) }}</span
                    >
                  </span>
                </div>
                <ul class="m-0 list-none p-0">
                  @for (change of shown(bump); track $index) {
                    <li
                      class="truncate text-[0.8125rem] text-fg-soft"
                      [qitsEntity]="change"
                      entityKey="name"
                      [fieldOf]="change"
                      [qitsField]="{ derived: ['from', 'to'] }"
                    >
                      <span class="text-fg" [fieldOf]="change" qitsField="name">{{
                        change.name
                      }}</span>
                      {{ change.from }} → {{ change.to }}
                      <span
                        class="text-[0.6875rem] text-fg-muted"
                        [fieldOf]="change"
                        [qitsField]="{ derived: ['ecosystem'] }"
                        >{{ change.ecosystem?.toLowerCase() }}</span
                      >
                    </li>
                  }
                </ul>
                <span
                  class="text-[0.6875rem] text-fg-muted"
                  [class.hidden]="!more(bump)"
                  [fieldOf]="bump"
                  [qitsField]="{ derived: ['changes'] }"
                  >+{{ more(bump) }} more</span
                >
              </li>
            }
          </ul>
          <p
            class="m-0 px-3 py-4 text-center text-sm text-fg-muted"
            [class.hidden]="state() !== 'loaded' || pending().length > 0"
          >
            No pending version bumps
          </p>
        </ui-spinner>
        @if (pools().length > 0) {
          <ul
            class="m-0 list-none border-t border-line-subtle p-0"
            [qitsEntityList]="upstreamPools"
          >
            @for (pool of pools(); track pool.origin + '|' + pool.pool) {
              <li
                class="flex items-center justify-between gap-2 px-3 py-1.5 text-[0.8125rem] text-fg-soft"
                [qitsEntity]="pool"
                entityKey="origin"
              >
                <span class="truncate text-fg"
                  ><span [fieldOf]="pool" qitsField="name">{{ pool.name }}</span>
                  @if (pool.pool === 'stream') {
                    <span [fieldOf]="pool" qitsField="pool"> · stream</span>
                  }
                </span>
                <span class="shrink-0 text-fg-muted"
                  ><span [fieldOf]="pool" qitsField="open">{{ pool.open }}</span
                  >/<span [fieldOf]="pool" qitsField="max">{{ pool.max }}</span></span
                >
              </li>
            }
          </ul>
        }
      </div>
    </ui-dropdown>
  `,
})
export class BumpsMenu {
  /** Whether the menu has been opened: nothing is read before. */
  private readonly asked = signal(false);

  /**
   * The newest pending bumps, from the first opening on (in the browser only: nobody opens it on
   * the server); read again after `BUMP_EVENTS`.
   */
  protected readonly bumps = qitsResource(
    PENDING_BUMPS_LIST,
    () => (this.asked() ? { query: { limit: PENDING_BUMPS } } : undefined),
    { refreshOn: { names: BUMP_EVENTS } },
  );

  /** The pending bumps, newest first; none until read. */
  protected readonly pending = computed((): readonly BumpEntry[] =>
    this.bumps.hasValue() ? (this.bumps.value()?.bumps ?? []) : [],
  );

  protected readonly state = computed((): LoadState => loadState(this.bumps));

  /** The edge's upstream pools, from the first opening on; read again on every later opening. */
  protected readonly upstreamPools = qitsResource(UPSTREAM_POOLS, () =>
    this.asked() ? {} : undefined,
  );

  /**
   * The pools shown below the bumps; none until read, and none after a refused or failed read
   * (a failed re-read keeps the resource's value, but the section shows nothing, as for a first
   * failure): never an error of its own.
   */
  protected readonly pools = computed((): readonly UpstreamPoolEntry[] =>
    this.upstreamPools.hasValue() && !this.upstreamPools.reloadError()
      ? (this.upstreamPools.value() ?? [])
      : [],
  );

  /**
   * Each time the panel opens: the bumps (the first opening reads them, one after a failure reads
   * them again), and the pools (the first opening reads them, every later one reads them again).
   */
  protected opened(): void {
    if (!this.asked()) {
      this.asked.set(true);
      return;
    }
    if (this.bumps.status() === 'error') this.bumps.reload();
    this.upstreamPools.reload();
  }

  protected shown(bump: BumpEntry) {
    return (bump.changes ?? []).slice(0, CHANGES_SHOWN);
  }

  protected more(bump: BumpEntry): number {
    return Math.max(0, (bump.changes ?? []).length - CHANGES_SHOWN);
  }

  protected label(bump: BumpEntry): string {
    return bumpState(bump).label;
  }

  protected chip(bump: BumpEntry): string {
    return CHIP[bumpState(bump).tone];
  }
}
