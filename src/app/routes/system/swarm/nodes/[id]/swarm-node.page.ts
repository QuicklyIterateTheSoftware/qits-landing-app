import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, PLATFORM_ID } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import {
  exit,
  outcomes,
  QitsApiError,
  QitsEntity,
  QitsEntityList,
  QitsExit,
  QitsField,
  qitsResource,
} from '@qits/angular';
import { formatBytes, plural } from '$core/artifacts/artifact-listings';
import { valueMarks } from '$core/marks/value-marks';
import { formatInstant } from '$core/release-requests/release-request-model';
import { isMissing } from '$core/resources/resource-family';
import { loadState } from '$core/resources/load-state';
import type { SwarmNodeDetail, SwarmNodeTask } from '$core/system/swarm.consumes';
import { SWARM_NODE, SWARM_NODE_TASKS } from '$core/system/swarm.operations';
import { swarmNodeAvailabilityTone, swarmNodeStatusTone } from '$core/system/swarm-node-tones';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import type { Action } from '$ui/components/action-button/action';
import { Chip, type ChipTone } from '$ui/components/chip/chip';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** What the page draws for a value the node does not have. */
const NONE = '—';

/** A node's labels as `key=value`, sorted by key. */
export function nodeLabelPairs(labels: Readonly<Record<string, string>> | undefined): string[] {
  return Object.entries(labels ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`);
}

/** A node's CPUs as docker counts them: `8`, never `8.0`; {@link NONE} when unknown. */
export function cpuCount(cpus: number | undefined): string {
  return cpus === undefined || cpus === null || !Number.isFinite(cpus) ? NONE : String(cpus);
}

/** A node's memory in binary units (`15.3 GiB`); {@link NONE} when unknown. */
export function memorySize(bytes: number | undefined): string {
  return bytes === undefined || bytes === null ? NONE : formatBytes(bytes);
}

/**
 * One node of the swarm (qits-2347), at `/system/swarm/nodes/<id>`, where `<id>` is the node's id
 * (the nodes list links it). It replaces qits-system-frontend's `swarm/nodes/:id`, without its four
 * resource tabs (containers, images, networks, volumes), which come as this page's child routes
 * later (qits-2352…qits-2355).
 *
 * **Load budget: 2, nothing per row.** `SWARM_NODE` (`getSwarmNode`, `docker node inspect` on the
 * manager) and `SWARM_NODE_TASKS` (`listSwarmNodeTasks`, `docker node ps`), in parallel, both by
 * the address's id. The reads are made in the browser only (the server render has no session).
 *
 * - Title: the hostname; "← Nodes" back to the list (`leave-swarm-node`); the full id in monospace,
 *   "this node" (neutral) on the node qits-system runs on (`self`).
 * - Status and availability on chips toned as the list's (`swarmNodeStatusTone`,
 *   `swarmNodeAvailabilityTone`; the detail speaks the list's words), the manager status ("—" for
 *   a worker).
 * - Facts: role, engine, OS, architecture, CPUs (`8`, not `8.0`), memory (binary units), address
 *   ("—" when none), joined (`createdAt`). No `updatedAt`.
 * - Labels as `key=value`, sorted by key; none is "No labels.".
 * - Tasks in the served order (newest first per slot), shut-down ones kept as history (the caption
 *   says so): name, slot ("—" when none), state (docker's phrase), desired state, the error (red
 *   only when there is one) and the image. None is "Swarm runs no task on this node.".
 *
 * States: loading; a 404 is "No swarm node <id>." and nothing else; a 403 says reading the swarm
 * needs an admin role; a 503 (the swarm not answering) says the swarm cannot be read right now,
 * with Retry; any other failure, with Retry. The tasks read fails on its own: its failure (with
 * Retry) stands in the Tasks section, the node's facts stay.
 *
 * Marks (qits-2141): the node is an entity by its `id`, each value its field or the fields it is
 * derived from; the tasks are their read's list, each task an entity by its `id`.
 *
 * Staleness (qits-1270): no `refreshOn`. No event names a node change (a drain, a label, a node
 * going Down) or a task moving: qits-system sends none for the swarm's nodes or tasks. Refresh
 * reads both again. Nothing polls.
 */
@Component({
  selector: 'app-swarm-node-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Chip,
    LoadFailure,
    PageLayoutComponent,
    QitsEntity,
    QitsEntityList,
    QitsExit,
    QitsField,
    Spinner,
  ],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout [title]="title()" [titleMarks]="titleMarks()" [actions]="actions">
        <p class="mt-0 mb-2 text-sm">
          <a
            class="font-semibold text-accent no-underline hover:underline"
            [qitsExit]="leaving.back"
            [exitCurrent]="null"
            data-back
            >← Nodes</a
          >
        </p>

        @if (refusal()) {
          <p
            role="alert"
            class="m-0 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
          >
            Reading the swarm needs an admin role: qits:admin, qits:admin-agent, qits:desk-admin,
            qits:system or qits:agent.
          </p>
        } @else if (missing()) {
          <p class="m-0 px-3 py-8 text-center text-sm text-fg-muted" data-missing>
            No swarm node {{ id() }}.
          </p>
        } @else {
          <ui-load-failure
            [message]="failureMessage()"
            [class.hidden]="state() !== 'error'"
            (retry)="node.reload()"
          />
          <ui-spinner [state]="state()" class="min-h-48" [class.hidden]="state() === 'error'">
            @if (shown(); as node) {
              <article [qitsEntity]="node" entityKey="id" data-node>
                <header class="mb-4">
                  <p class="mt-0 mb-2 font-mono text-xs break-all text-fg-muted">
                    <span [fieldOf]="node" qitsField="id" data-id>{{ node.id }}</span>
                    @if (node.self) {
                      <!-- A space, so the line reads "<id> this node". -->
                      &ngsp;<ui-chip
                        class="ml-1 font-sans"
                        label="this node"
                        tone="neutral"
                        [fieldOf]="node"
                        qitsField="self"
                      />
                    }
                  </p>
                  <dl
                    class="m-0 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"
                    aria-label="Status"
                  >
                    <div class="flex items-center gap-1.5">
                      <dt class="text-fg-muted">Status</dt>
                      <dd class="m-0">
                        <ui-chip
                          [label]="node.status ?? ''"
                          [tone]="statusTone(node)"
                          [fieldOf]="node"
                          [qitsField]="marks.status"
                          data-status
                        />
                      </dd>
                    </div>
                    <div class="flex items-center gap-1.5">
                      <dt class="text-fg-muted">Availability</dt>
                      <dd class="m-0">
                        <ui-chip
                          [label]="node.availability ?? ''"
                          [tone]="availabilityTone(node)"
                          [fieldOf]="node"
                          [qitsField]="marks.availability"
                          data-availability
                        />
                      </dd>
                    </div>
                    <div class="flex items-center gap-1.5">
                      <dt class="text-fg-muted">Manager</dt>
                      <dd
                        class="m-0 text-fg"
                        [fieldOf]="node"
                        [qitsField]="marks.managerStatus"
                        data-manager
                      >
                        {{ node.managerStatus || none }}
                      </dd>
                    </div>
                  </dl>
                </header>

                <section aria-labelledby="node-facts" class="mb-6">
                  <h2 id="node-facts" class="mt-0 mb-2 text-base font-semibold">Facts</h2>
                  <dl
                    class="m-0 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm"
                    aria-label="Facts"
                  >
                    <dt class="text-fg-muted">Role</dt>
                    <dd class="m-0" [fieldOf]="node" qitsField="role">{{ node.role }}</dd>
                    <dt class="text-fg-muted">Engine</dt>
                    <dd
                      class="m-0 font-mono text-xs"
                      [fieldOf]="node"
                      [qitsField]="marks.engineVersion"
                    >
                      {{ node.engineVersion || none }}
                    </dd>
                    <dt class="text-fg-muted">OS</dt>
                    <dd class="m-0" [fieldOf]="node" [qitsField]="marks.os">
                      {{ node.os || none }}
                    </dd>
                    <dt class="text-fg-muted">Architecture</dt>
                    <dd class="m-0" [fieldOf]="node" [qitsField]="marks.architecture">
                      {{ node.architecture || none }}
                    </dd>
                    <dt class="text-fg-muted">CPUs</dt>
                    <dd
                      class="m-0 tabular-nums"
                      [fieldOf]="node"
                      [qitsField]="marks.cpus"
                      data-cpus
                    >
                      {{ cpus(node.cpus) }}
                    </dd>
                    <dt class="text-fg-muted">Memory</dt>
                    <dd
                      class="m-0 tabular-nums"
                      [fieldOf]="node"
                      [qitsField]="marks.memoryBytes"
                      data-memory
                    >
                      {{ memory(node.memoryBytes) }}
                    </dd>
                    <dt class="text-fg-muted">Address</dt>
                    <dd
                      class="m-0 font-mono text-xs"
                      [fieldOf]="node"
                      [qitsField]="marks.address"
                      data-address
                    >
                      {{ node.address || none }}
                    </dd>
                    <dt class="text-fg-muted">Joined</dt>
                    <dd class="m-0" [fieldOf]="node" [qitsField]="marks.createdAt">
                      {{ instant(node.createdAt) }}
                    </dd>
                  </dl>
                </section>

                <section aria-labelledby="node-labels" class="mb-6">
                  <h2 id="node-labels" class="mt-0 mb-2 text-base font-semibold">Labels</h2>
                  <ul
                    class="m-0 flex list-none flex-wrap gap-1.5 p-0"
                    aria-label="Labels"
                    [fieldOf]="node"
                    [qitsField]="marks.labels"
                    data-labels
                  >
                    @for (label of labels(node.labels); track label) {
                      <li
                        class="rounded bg-surface-muted px-1.5 font-mono text-xs leading-5 break-all text-fg-soft"
                      >
                        {{ label }}
                      </li>
                    } @empty {
                      <li class="text-sm text-fg-muted">No labels.</li>
                    }
                  </ul>
                </section>
              </article>

              <section aria-labelledby="node-tasks" data-tasks>
                <h2 id="node-tasks" class="mt-0 mb-1 text-base font-semibold">Tasks</h2>
                <ui-load-failure
                  [message]="tasksFailureMessage()"
                  [class.hidden]="tasksState() !== 'error'"
                  (retry)="tasks.reload()"
                />
                <ui-spinner
                  [state]="tasksState()"
                  class="min-h-24"
                  [class.hidden]="tasksState() === 'error'"
                >
                  @if (taskRows().length) {
                    <p
                      class="mt-0 mb-2 text-xs text-fg-muted"
                      [qitsEntityList]="tasks"
                      data-caption
                    >
                      <span [fieldOf]="tasksAnswer()" [qitsField]="marks.count">{{
                        taskCount()
                      }}</span>
                      in the order the swarm lists them, newest first per slot. The shut-down ones
                      are history, kept beside the tasks running now.
                    </p>
                    <div class="overflow-x-auto">
                      <table class="w-full border-collapse text-left text-sm" aria-label="Tasks">
                        <thead>
                          <tr class="border-b border-line text-xs text-fg-muted">
                            <th class="py-1.5 pr-3 font-semibold">Name</th>
                            <th class="py-1.5 pr-3 font-semibold">Slot</th>
                            <th class="py-1.5 pr-3 font-semibold">State</th>
                            <th class="py-1.5 pr-3 font-semibold">Desired</th>
                            <th class="py-1.5 pr-3 font-semibold">Error</th>
                            <th class="py-1.5 font-semibold">Image</th>
                          </tr>
                        </thead>
                        <tbody [qitsEntityList]="tasks">
                          @for (task of taskRows(); track task.id) {
                            <tr
                              class="border-b border-line-subtle align-top"
                              [qitsEntity]="task"
                              entityKey="id"
                            >
                              <td
                                class="py-1.5 pr-3 font-medium whitespace-nowrap"
                                [fieldOf]="task"
                                qitsField="name"
                              >
                                {{ task.name }}
                              </td>
                              <td
                                class="py-1.5 pr-3 tabular-nums"
                                [fieldOf]="task"
                                [qitsField]="marks.slot"
                              >
                                {{ task.slot ?? none }}
                              </td>
                              <td
                                class="py-1.5 pr-3 whitespace-nowrap"
                                [fieldOf]="task"
                                qitsField="state"
                              >
                                {{ task.state }}
                              </td>
                              <td
                                class="py-1.5 pr-3 whitespace-nowrap text-fg-soft"
                                [fieldOf]="task"
                                qitsField="desiredState"
                              >
                                {{ task.desiredState }}
                              </td>
                              <td
                                class="min-w-48 py-1.5 pr-3 font-mono text-xs break-all"
                                [class.text-danger]="!!task.error"
                                [class.text-fg-muted]="!task.error"
                                [fieldOf]="task"
                                [qitsField]="marks.error"
                                data-error
                              >
                                {{ task.error || none }}
                              </td>
                              <td
                                class="min-w-48 py-1.5 font-mono text-xs break-all text-fg-soft"
                                [fieldOf]="task"
                                qitsField="image"
                              >
                                {{ task.image }}
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
                      [qitsEntityList]="tasks"
                      data-no-tasks
                    >
                      Swarm runs no task on this node.
                    </p>
                  }
                </ui-spinner>
              </section>
            }
          </ui-spinner>
        }
      </app-page-layout>
    </div>
  `,
})
export class SwarmNodePage {
  private readonly route = inject(ActivatedRoute);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** "← Nodes": the list of the swarm's nodes. */
  protected readonly leaving = outcomes('leave-swarm-node', {
    back: exit('system/swarm/nodes'),
  });

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  /** The node the address names, by its id. */
  protected readonly id = computed(() => this.params().get('id') ?? '');

  /** The read's params: the address's node, in the browser only. */
  private readonly addressed = () => {
    const id = this.id();
    return this.browser && id ? { path: { id } } : undefined;
  };

  /** The node; read again on Refresh only (no event names a node change). */
  protected readonly node = qitsResource(SWARM_NODE, this.addressed);

  /** The tasks swarm placed on the node; read again on Refresh only (no event names a task move). */
  protected readonly tasks = qitsResource(SWARM_NODE_TASKS, this.addressed);

  /** The node as the page shows it; none while the read has none. */
  protected readonly shown = computed((): SwarmNodeDetail | undefined =>
    this.node.hasValue() ? this.node.value() : undefined,
  );

  /** The page's heading: the node's hostname once read. */
  protected readonly title = computed(() => this.shown()?.hostname || 'Swarm node');

  protected readonly titleMarks = computed(() => {
    const node = this.shown();
    return node?.hostname ? valueMarks(SWARM_NODE, node, 'id', 'hostname') : undefined;
  });

  /** No such node: a 404. */
  protected readonly missing = computed(() => isMissing(this.node));

  /** The node read's failure status (403, 503, …); undefined while it has not failed. */
  private readonly failure = computed((): number | undefined => failureOf(this.node));

  /** A 403: the viewer's roles may not read the swarm. */
  protected readonly refusal = computed(() => this.failure() === 403);

  /** A 503 is the swarm itself not answering; anything else is the read failing. */
  protected readonly failureMessage = computed(() =>
    this.failure() === 503
      ? 'The swarm cannot be read right now.'
      : 'This swarm node could not be read.',
  );

  protected readonly state = computed((): LoadState => loadState(this.node));

  /** The tasks read's answer; none while it has none. */
  protected readonly tasksAnswer = computed(
    (): readonly SwarmNodeTask[] => (this.tasks.hasValue() ? this.tasks.value() : []) ?? [],
  );

  /** The tasks, in the server's order. */
  protected readonly taskRows = computed((): readonly SwarmNodeTask[] => this.tasksAnswer());

  /** `2 tasks`. */
  protected readonly taskCount = computed(() => plural(this.taskRows().length, 'task'));

  protected readonly tasksState = computed((): LoadState => loadState(this.tasks));

  /** The tasks read failing on its own; the node's facts stay. */
  protected readonly tasksFailureMessage = computed(() =>
    failureOf(this.tasks) === 503
      ? 'The swarm cannot be read right now.'
      : 'This node’s tasks could not be read.',
  );

  /** Refresh: the node and its tasks, read again (nothing announces a change to either). */
  protected readonly actions: readonly Action[] = [
    {
      label: 'Refresh',
      variant: 'muted',
      callback: () => {
        this.node.reload();
        this.tasks.reload();
      },
    },
  ];

  protected readonly marks = MARKS;
  protected readonly none = NONE;
  protected readonly instant = formatInstant;
  protected readonly labels = nodeLabelPairs;
  protected readonly cpus = cpuCount;
  protected readonly memory = memorySize;

  protected statusTone(node: SwarmNodeDetail): ChipTone {
    return swarmNodeStatusTone(node.status);
  }

  protected availabilityTone(node: SwarmNodeDetail): ChipTone {
    return swarmNodeAvailabilityTone(node.availability);
  }
}

/** A read's failure status (403, 404, 503, …); undefined while it has not failed. */
function failureOf(read: { status(): string; error(): unknown }): number | undefined {
  if (read.status() !== 'error') return undefined;
  const error = read.error();
  return error instanceof QitsApiError ? error.status : undefined;
}

/** The data marks of what the page derives (each a class constant, as the rule reads). */
const MARKS = {
  status: { derived: ['status'] },
  availability: { derived: ['availability'] },
  managerStatus: { derived: ['managerStatus'] },
  engineVersion: { derived: ['engineVersion'] },
  os: { derived: ['os'] },
  architecture: { derived: ['architecture'] },
  cpus: { derived: ['cpus'] },
  memoryBytes: { derived: ['memoryBytes'] },
  address: { derived: ['address'] },
  createdAt: { derived: ['createdAt'] },
  labels: { derived: ['labels'] },
  count: { derived: [] },
  slot: { derived: ['slot'] },
  error: { derived: ['error'] },
} as const;
