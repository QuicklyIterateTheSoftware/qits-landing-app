import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import {
  outcomes,
  QitsApiError,
  QitsEntity,
  QitsEntityList,
  QitsField,
  qitsResource,
  QitsTriggers,
  stay,
} from '@qits/angular';
import { formatInstant, formatRelativeTime } from '$core/release-requests/release-request-model';
import { loadState } from '$core/resources/load-state';
import { dockerInstant } from '$core/system/docker-date';
import {
  CONTAINER_FILTERS,
  containerCaption,
  containerCounts,
  containerHealth,
  containersFailureOf,
  containerStateTone,
  filteredContainers,
  noContainersNote,
  shortContainerId,
  type ContainerFilter,
} from '$core/system/node-container-rows';
import type { ContainerLogTail, NodeContainer } from '$core/system/node-containers.consumes';
import {
  containerLogsParams,
  NODE_CONTAINER_LIST,
  NODE_CONTAINER_LOGS,
  nodeContainersParams,
} from '$core/system/node-containers.operations';
import { OPEN_SWARM_NODE } from '$core/system/open-swarm-node';
import { Chip, type ChipTone } from '$ui/components/chip/chip';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** What the tab draws for a value a container does not have. */
const NONE = '—';

/** The container whose log panel is open: its id (the read's) and its name (the heading's). */
interface OpenLog {
  readonly id: string;
  readonly name: string;
}

/**
 * A swarm node's Containers tab (qits-2352), at `/system/swarm/nodes/<id>/containers`, the first of
 * the node page's tabs (`NODE_TABS`). It replaces qits-system-frontend's `NodeContainersTab`,
 * without its `bash`/`sh` buttons: exec and the terminal page arrive with qits-2356.
 *
 * **Load budget: 1, plus 1 per Logs press.** `NODE_CONTAINER_LIST` (`listNodeContainers`, always
 * `all=true`: `docker ps -a` on the node qits-system runs on), keyed on the layout's `:id`, in the
 * browser only, and only while the open node (`OPEN_SWARM_NODE`, no second read of the node) is
 * `self`: the service reaches only its own daemon, so another node is not read at all, and the tab
 * says "Only the node qits-system runs on can be read; this is another node." A 409 `NODE_REMOTE`
 * says the same (with the service's `message`), never a load failure.
 *
 * - The state filter (label "Show", `aria-pressed`): Running (the default), Stopped and All, each
 *   with its count from the one read; filtering is client-side and reads nothing. Running is
 *   `state === 'running'`, Stopped everything else. The caption follows the filter.
 * - The table in the server's order (newest first): name (with docker's 12-character short id, the
 *   full id as its title), image, state (a chip: running ok, restarting/paused waiting, dead failed,
 *   else neutral), health (only while running: docker keeps a dead container's last probe, which
 *   painted 89 of 90 exited containers "unhealthy"; `—` otherwise and for `none`), docker's status
 *   sentence as served, created (relative, from `dockerInstant`, the absolute instant as its title;
 *   `—` when the date does not parse), ports (`—` when none) and Logs.
 * - Logs opens one panel under the table (`NODE_CONTAINER_LOGS`, `getContainerLogs?tail=200`, by
 *   the container's id; `show-swarm-node-container-logs`): "<name>, last 200 lines", the text, and
 *   Close; Logs again on the same row closes it, another row's moves it. Truncated, empty, a 404
 *   (the container is gone) and any other failure (with Retry) each say so. Refresh leaves it open.
 *
 * States: loading; `[]` under any filter is one sentence; a 403 names the roles; a 503 or any other
 * failure says the node's containers cannot be read right now, with Retry.
 *
 * Marks (qits-2141): the rows are their read's list, each an entity by its `id`, each value its
 * field or the fields it is derived from; the log panel is the log read's entity.
 *
 * Staleness (qits-1270): no `refreshOn`. No event names a container start, stop or death
 * (qits-system publishes target events only), so the list is not followed: the tab's Refresh reads
 * it again; nothing polls.
 */
@Component({
  selector: 'app-swarm-node-containers-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Chip, LoadFailure, QitsEntity, QitsEntityList, QitsField, QitsTriggers, Spinner],
  host: { class: 'block' },
  template: `
    <section aria-labelledby="node-containers" data-containers>
      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 id="node-containers" class="m-0 text-base font-semibold">Containers</h2>
        @if (local()) {
          <button
            type="button"
            class="cursor-pointer rounded-md border border-line bg-surface px-2.5 py-1 text-sm font-semibold text-fg-soft hover:bg-surface-muted"
            (click)="refresh()"
          >
            Refresh
          </button>
        }
      </div>

      @if (remote(); as note) {
        <div
          role="status"
          class="m-0 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
          data-remote
        >
          <p class="m-0">Only the node qits-system runs on can be read; this is another node.</p>
          @if (note.message) {
            <p class="mt-1 mb-0 text-xs text-fg-muted">qits-system: {{ note.message }}</p>
          }
        </div>
      } @else if (refusal()) {
        <p
          role="alert"
          class="m-0 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
        >
          Reading the swarm needs an admin role.
        </p>
      } @else {
        <ui-load-failure
          message="The node’s containers cannot be read right now."
          [class.hidden]="state() !== 'error'"
          (retry)="containers.reload()"
        />
        <ui-spinner [state]="state()" class="min-h-24" [class.hidden]="state() === 'error'">
          <div
            class="mb-2 flex flex-wrap items-center gap-1"
            role="group"
            aria-label="Show"
            [qitsEntityList]="containers"
            data-filter
          >
            @for (option of filters; track option.filter) {
              <button
                type="button"
                class="cursor-pointer rounded-md border border-line bg-surface px-2.5 py-1 text-sm text-fg-soft hover:bg-surface-muted aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:font-semibold aria-pressed:text-fg"
                [attr.aria-pressed]="filter() === option.filter"
                (click)="filter.set(option.filter)"
              >
                {{ option.label }}
                <span [fieldOf]="answer()" [qitsField]="marks.count"
                  >({{ counts()[option.filter] }})</span
                >
              </button>
            }
          </div>

          @if (rows().length) {
            <p class="mt-0 mb-2 text-xs text-fg-muted" [qitsEntityList]="containers" data-caption>
              <span [fieldOf]="answer()" [qitsField]="marks.count">{{ caption() }}</span
              >, newest first.
            </p>
            <div class="overflow-x-auto">
              <table class="w-full border-collapse text-left text-sm" aria-label="Containers">
                <thead>
                  <tr class="border-b border-line text-xs text-fg-muted">
                    <th class="py-1.5 pr-3 font-semibold">Name</th>
                    <th class="py-1.5 pr-3 font-semibold">Image</th>
                    <th class="py-1.5 pr-3 font-semibold">State</th>
                    <th class="py-1.5 pr-3 font-semibold">Health</th>
                    <th class="py-1.5 pr-3 font-semibold">Status</th>
                    <th class="py-1.5 pr-3 font-semibold">Created</th>
                    <th class="py-1.5 pr-3 font-semibold">Ports</th>
                    <th class="py-1.5 font-semibold"><span class="sr-only">Logs</span></th>
                  </tr>
                </thead>
                <tbody [qitsEntityList]="containers">
                  @for (row of rows(); track row.id) {
                    <tr
                      class="border-b border-line-subtle align-top"
                      [qitsEntity]="row"
                      entityKey="id"
                      data-container
                    >
                      <td class="py-1.5 pr-3">
                        <span
                          class="block font-medium break-all"
                          [fieldOf]="row"
                          qitsField="name"
                          >{{ row.name }}</span
                        >
                        <span
                          class="block font-mono text-xs text-fg-muted"
                          [attr.title]="row.id"
                          [fieldOf]="row"
                          [qitsField]="marks.shortId"
                          data-short-id
                          >{{ shortId(row.id) }}</span
                        >
                      </td>
                      <td
                        class="min-w-40 py-1.5 pr-3 font-mono text-xs break-all text-fg-soft"
                        [fieldOf]="row"
                        qitsField="image"
                      >
                        {{ row.image }}
                      </td>
                      <td class="py-1.5 pr-3">
                        <ui-chip
                          [label]="row.state ?? ''"
                          [tone]="stateTone(row)"
                          [fieldOf]="row"
                          [qitsField]="marks.state"
                          data-state
                        />
                      </td>
                      <td
                        class="py-1.5 pr-3"
                        [fieldOf]="row"
                        [qitsField]="marks.health"
                        data-health
                      >
                        @if (health(row); as health) {
                          <ui-chip [label]="health.label" [tone]="health.tone" />
                        } @else {
                          <span class="text-fg-muted">{{ none }}</span>
                        }
                      </td>
                      <td class="py-1.5 pr-3 text-fg-soft" [fieldOf]="row" qitsField="status">
                        {{ row.status }}
                      </td>
                      <td
                        class="py-1.5 pr-3 whitespace-nowrap"
                        [attr.title]="createdTitle(row)"
                        [fieldOf]="row"
                        [qitsField]="marks.createdAt"
                        data-created
                      >
                        {{ created(row) }}
                      </td>
                      <td
                        class="py-1.5 pr-3 font-mono text-xs break-all text-fg-soft"
                        [fieldOf]="row"
                        [qitsField]="marks.ports"
                      >
                        {{ row.ports || none }}
                      </td>
                      <td class="py-1.5">
                        <button
                          type="button"
                          class="cursor-pointer rounded-md border border-line bg-surface px-2 py-0.5 text-xs font-semibold text-fg-soft hover:bg-surface-muted aria-expanded:bg-accent-soft aria-expanded:text-fg"
                          [attr.aria-expanded]="openLog()?.id === row.id"
                          [attr.aria-label]="'Logs of ' + row.name"
                          [qitsTriggers]="[showingLogs.opened]"
                          (click)="toggleLogs(row)"
                        >
                          Logs
                        </button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <p
              role="status"
              class="m-0 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
              [qitsEntityList]="containers"
              data-no-containers
            >
              {{ emptyNote() }}
            </p>
          }

          @if (openLog(); as open) {
            <section
              class="mt-4 rounded-md border border-line p-3"
              aria-labelledby="container-log"
              data-log
            >
              <div class="mb-2 flex items-center justify-between gap-2">
                <h3 id="container-log" class="m-0 text-sm font-semibold break-all">
                  {{ open.name }}, last {{ tail }} lines
                </h3>
                <button
                  type="button"
                  class="cursor-pointer rounded-md border border-line bg-surface px-2 py-0.5 text-xs font-semibold text-fg-soft hover:bg-surface-muted"
                  (click)="closeLogs()"
                >
                  Close
                </button>
              </div>
              @if (logGone()) {
                <p role="status" class="m-0 text-sm text-fg" data-log-gone>
                  This container is gone; it was removed after the list was read.
                </p>
              } @else {
                <ui-load-failure
                  message="The log cannot be read right now."
                  [class.hidden]="logState() !== 'error'"
                  (retry)="logs.reload()"
                />
                <ui-spinner
                  [state]="logState()"
                  class="min-h-16"
                  [class.hidden]="logState() === 'error'"
                >
                  @if (chunk(); as chunk) {
                    <div [qitsEntity]="chunk" entityKey="truncated" [entitySource]="logs">
                      @if (chunk.truncated) {
                        <p
                          class="mt-0 mb-2 text-xs text-fg-muted"
                          [fieldOf]="chunk"
                          qitsField="truncated"
                          data-truncated
                        >
                          The service cut this log short; earlier lines are not shown.
                        </p>
                      }
                      @if (chunk.text) {
                        <pre
                          class="m-0 max-h-96 overflow-auto rounded bg-surface-muted p-2 font-mono text-xs whitespace-pre-wrap break-all text-fg"
                          [fieldOf]="chunk"
                          qitsField="text"
                          >{{ chunk.text }}</pre>
                      } @else {
                        <p
                          role="status"
                          class="m-0 text-sm text-fg-muted"
                          [fieldOf]="chunk"
                          [qitsField]="marks.text"
                          data-log-empty
                        >
                          This container has written nothing to its log.
                        </p>
                      }
                    </div>
                  }
                </ui-spinner>
              }
            </section>
          }
        </ui-spinner>
      }
    </section>
  `,
})
export class SwarmNodeContainersPage {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly open = inject(OPEN_SWARM_NODE);

  /** Logs opens (or closes) a container's log tail on this tab. */
  protected readonly showingLogs = outcomes('show-swarm-node-container-logs', { opened: stay() });

  /** The open node, as the layout read it; undefined while it has not. */
  private readonly node = computed(() => this.open.node());

  /** The node is the one qits-system runs on: the only one whose containers can be read. */
  protected readonly local = computed(() => this.node()?.self === true);

  /**
   * The containers, every one of them (`all=true`), read only in the browser and only for the
   * node qits-system runs on; again on Refresh only (no event names a container change).
   */
  protected readonly containers = qitsResource(NODE_CONTAINER_LIST, () => {
    const id = this.open.nodeId();
    return this.browser && id && this.local() ? nodeContainersParams(id) : undefined;
  });

  /** The read's answer; none while it has none. */
  protected readonly answer = computed(
    (): readonly NodeContainer[] =>
      (this.containers.hasValue() ? this.containers.value() : []) ?? [],
  );

  /** The state filter; Running until another is pressed. */
  protected readonly filter = signal<ContainerFilter>('running');

  protected readonly filters = CONTAINER_FILTERS;

  /** Each filter's count, from the one read. */
  protected readonly counts = computed(() => containerCounts(this.answer()));

  /** The rows the filter lets through, in the server's order. */
  protected readonly rows = computed(() => filteredContainers(this.answer(), this.filter()));

  /** `2 running containers`, as the filter goes. */
  protected readonly caption = computed(() => containerCaption(this.filter(), this.rows().length));

  protected readonly emptyNote = computed(() => noContainersNote(this.filter()));

  /** The read's failure; undefined while it has not failed. */
  private readonly failure = computed(() =>
    this.containers.status() === 'error' ? containersFailureOf(this.containers.error()) : undefined,
  );

  /**
   * The remote-node note, with the service's message for a 409: shown for a node known not to be
   * `self` (not read at all) and for a 409 `NODE_REMOTE`.
   */
  protected readonly remote = computed((): { message?: string } | undefined => {
    const node = this.node();
    if (node && !node.self) return {};
    const failure = this.failure();
    return failure?.remote ? { message: failure.message } : undefined;
  });

  /** A 403: the viewer's roles may not read the swarm. */
  protected readonly refusal = computed(() => this.failure()?.status === 403);

  protected readonly state = computed((): LoadState => loadState(this.containers));

  /** The container whose log panel is open; none until Logs is pressed. */
  protected readonly openLog = signal<OpenLog | undefined>(undefined);

  /** The open container's last {@link tail} lines, read when its panel opens. */
  protected readonly logs = qitsResource(NODE_CONTAINER_LOGS, () => {
    const id = this.open.nodeId();
    const container = this.openLog();
    return this.browser && id && container ? containerLogsParams(id, container.id) : undefined;
  });

  /** The log read's answer; none while it has none. */
  protected readonly chunk = computed((): ContainerLogTail | undefined =>
    this.logs.hasValue() ? this.logs.value() : undefined,
  );

  /** A 404: the container was removed after the list was read. */
  protected readonly logGone = computed(() => {
    if (this.logs.status() !== 'error') return false;
    const error = this.logs.error();
    return error instanceof QitsApiError && error.status === 404;
  });

  protected readonly logState = computed((): LoadState => loadState(this.logs));

  protected readonly tail = 200;
  protected readonly marks = MARKS;
  protected readonly none = NONE;
  protected readonly shortId = shortContainerId;
  protected readonly health = containerHealth;

  /** Refresh: the containers, read again (nothing announces a change); an open log stays open. */
  protected refresh(): void {
    this.containers.reload();
  }

  /** Logs: opens `row`'s panel, or closes it when it is the one open. */
  protected toggleLogs(row: NodeContainer): void {
    const id = row.id ?? '';
    if (!id) return;
    if (this.openLog()?.id === id) {
      this.openLog.set(undefined);
    } else {
      this.openLog.set({ id, name: row.name || shortContainerId(id) });
    }
    this.showingLogs.opened.reach();
  }

  protected closeLogs(): void {
    this.openLog.set(undefined);
  }

  protected stateTone(row: NodeContainer): ChipTone {
    return containerStateTone(row.state);
  }

  /** How long ago the container was created; {@link NONE} when docker's date does not parse. */
  protected created(row: NodeContainer): string {
    const instant = dockerInstant(row.createdAt);
    return instant ? formatRelativeTime(instant) : NONE;
  }

  /** The absolute instant, as the Created cell's title; none when the date does not parse. */
  protected createdTitle(row: NodeContainer): string | null {
    const instant = dockerInstant(row.createdAt);
    return instant ? formatInstant(instant) : null;
  }
}

/** The data marks of what the tab derives (each a class constant, as the rule reads). */
const MARKS = {
  count: { derived: [] },
  shortId: { derived: ['id'] },
  state: { derived: ['state'] },
  health: { derived: ['health', 'state'] },
  createdAt: { derived: ['createdAt'] },
  ports: { derived: ['ports'] },
  text: { derived: ['text'] },
} as const;
