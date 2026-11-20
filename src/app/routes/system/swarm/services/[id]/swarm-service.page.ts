import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, PLATFORM_ID } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import {
  exit,
  outcomes,
  QitsApiError,
  QitsEntity,
  QitsExit,
  QitsField,
  qitsResource,
} from '@qits/angular';
import { formatInstant } from '$core/release-requests/release-request-model';
import { isMissing } from '$core/resources/resource-family';
import { loadState } from '$core/resources/load-state';
import {
  asksForTasks,
  concernsSwarmService,
  runsOtherImage,
  shortSwarmId,
} from '$core/system/swarm-service';
import type { SwarmServiceDetail, SwarmServiceTask } from '$core/system/swarm-service.consumes';
import { SWARM_SERVICE } from '$core/system/swarm-service.operations';
import { DEPLOYMENT_EVENTS } from '$core/updates/app-updates';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import type { Action } from '$ui/components/action-button/action';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** What the page draws for a value the service does not have. */
const NONE = '—';

/** A service's labels as `key=value`, sorted by key. */
export function labelPairs(labels: Readonly<Record<string, string>> | undefined): string[] {
  return Object.entries(labels ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`);
}

/** A healthcheck command joined as docker prints it; {@link NONE} when the service has none. */
export function healthcheckLine(healthcheck: readonly string[] | undefined): string {
  return healthcheck?.length ? healthcheck.join(' ') : NONE;
}

/**
 * One service of the swarm (qits-2345), at `/system/swarm/services/<id>`, where `<id>` is the
 * service's name or id (docker takes either; the services list links the name). It replaces
 * qits-system-frontend's `swarm/services/:id`.
 *
 * **Load budget: 1.** `SWARM_SERVICE` (`getSwarmService`, `docker service inspect` and the
 * service's tasks on the manager) is the whole page. The read is made in the browser only (the
 * server render has no session).
 *
 * - "← Swarm services" back to the list (`leave-swarm-service`); the service's name (its id when
 *   it has none) with its full id in monospace beneath.
 * - Facts: mode, replicas (as served), image, published ports ("—" when none), created, updated.
 * - Rollout: update order, parallelism, failure action, restart condition, the healthcheck command.
 * - Environment: the variables' keys only (qits-system never serves a value), and the labels as
 *   `key=value`.
 * - Mounts: type, source, target, read-only; none is one sentence.
 * - Networks: the network's id (short, the whole id in the cell's title) and the VIP address.
 * - Tasks, in the served order, shut-down ones included (the last rollout's history, as the
 *   caption says): slot, node hostname (plain text: the door never names the node's id), state,
 *   desired state, the error (red only when there is one) and the image only where it is not the
 *   service's. No Updated column: the door answers a task's `updatedAt` null. No task is a
 *   sentence of its own: a scheduling problem only when the service asks for replicas
 *   (`asksForTasks`), and expected when it is scaled to 0.
 *
 * States: loading; a 404 is "No swarm service <id>."; a 403 says reading the swarm needs an admin
 * role; a 503 (the swarm not answering) says the swarm cannot be read right now, with Retry; any
 * other failure, with Retry.
 *
 * Marks (qits-2141): the service is an entity by its `id`, each value its field or the fields it
 * is derived from; each task an entity by its `id`, each mount by its `target`, each network by
 * its `networkId`.
 *
 * Staleness (qits-1270): the resource's `refreshOn`, `DEPLOYMENT_EVENTS` (`DeploymentActive`,
 * `DeploymentFailed`, which a swarm rollback sends too) of the application the service's
 * `qits.platform.deployments.app-name` label names (`concernsSwarmService`; every deployment while
 * it has no such label or none is shown) → the service, debounced 1 s. qits-system sends no event
 * of its own for a service, so a change outside a deployment (docker by hand, a scale, a task
 * dying) is not followed: Refresh reads it again. Nothing polls.
 */
@Component({
  selector: 'app-swarm-service-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LoadFailure, PageLayoutComponent, QitsEntity, QitsExit, QitsField, Spinner],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout title="Swarm service" [actions]="actions">
        <p class="mt-0 mb-2 text-sm">
          <a
            class="font-semibold text-accent no-underline hover:underline"
            [qitsExit]="leaving.back"
            [exitCurrent]="null"
            data-back
            >← Swarm services</a
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
            No swarm service {{ id() }}.
          </p>
        } @else {
          <ui-load-failure
            [message]="failureMessage()"
            [class.hidden]="state() !== 'error'"
            (retry)="read.reload()"
          />
          <ui-spinner [state]="state()" class="min-h-48" [class.hidden]="state() === 'error'">
            @if (shown(); as service) {
              <article [qitsEntity]="service" entityKey="id" data-service>
                <header class="mb-4">
                  <h2
                    class="m-0 text-lg font-semibold break-all text-fg"
                    [fieldOf]="service"
                    [qitsField]="marks.name"
                  >
                    {{ service.name || service.id }}
                  </h2>
                  <p
                    class="mt-1 mb-0 font-mono text-xs break-all text-fg-muted"
                    [fieldOf]="service"
                    qitsField="id"
                    data-id
                  >
                    {{ service.id }}
                  </p>
                </header>

                <section aria-labelledby="service-facts" class="mb-6">
                  <h3 id="service-facts" class="mt-0 mb-2 text-base font-semibold">Facts</h3>
                  <dl
                    class="m-0 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm"
                    aria-label="Facts"
                  >
                    <dt class="text-fg-muted">Mode</dt>
                    <dd class="m-0" [fieldOf]="service" qitsField="mode">{{ service.mode }}</dd>
                    <dt class="text-fg-muted">Replicas</dt>
                    <dd class="m-0 font-mono tabular-nums" [fieldOf]="service" qitsField="replicas">
                      {{ service.replicas }}
                    </dd>
                    <dt class="text-fg-muted">Image</dt>
                    <dd
                      class="m-0 font-mono text-xs break-all"
                      [fieldOf]="service"
                      qitsField="image"
                    >
                      {{ service.image }}
                    </dd>
                    <dt class="text-fg-muted">Ports</dt>
                    <dd
                      class="m-0 font-mono text-xs break-all"
                      [fieldOf]="service"
                      [qitsField]="marks.ports"
                      data-ports
                    >
                      {{ service.ports || none }}
                    </dd>
                    <dt class="text-fg-muted">Created</dt>
                    <dd class="m-0" [fieldOf]="service" [qitsField]="marks.createdAt">
                      {{ instant(service.createdAt) }}
                    </dd>
                    <dt class="text-fg-muted">Updated</dt>
                    <dd class="m-0" [fieldOf]="service" [qitsField]="marks.updatedAt">
                      {{ instant(service.updatedAt) }}
                    </dd>
                  </dl>
                </section>

                <section aria-labelledby="service-rollout" class="mb-6">
                  <h3 id="service-rollout" class="mt-0 mb-2 text-base font-semibold">Rollout</h3>
                  <dl
                    class="m-0 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm"
                    aria-label="Rollout"
                  >
                    <dt class="text-fg-muted">Update order</dt>
                    <dd class="m-0" [fieldOf]="service" qitsField="updateOrder">
                      {{ service.updateOrder }}
                    </dd>
                    <dt class="text-fg-muted">Parallelism</dt>
                    <dd class="m-0 tabular-nums" [fieldOf]="service" qitsField="updateParallelism">
                      {{ service.updateParallelism }}
                    </dd>
                    <dt class="text-fg-muted">Failure action</dt>
                    <dd class="m-0" [fieldOf]="service" qitsField="updateFailureAction">
                      {{ service.updateFailureAction }}
                    </dd>
                    <dt class="text-fg-muted">Restart condition</dt>
                    <dd class="m-0" [fieldOf]="service" qitsField="restartCondition">
                      {{ service.restartCondition }}
                    </dd>
                    <dt class="text-fg-muted">Healthcheck</dt>
                    <dd
                      class="m-0 font-mono text-xs break-all"
                      [fieldOf]="service"
                      [qitsField]="marks.healthcheck"
                      data-healthcheck
                    >
                      {{ healthcheck(service.healthcheck) }}
                    </dd>
                  </dl>
                </section>

                <section aria-labelledby="service-environment" class="mb-6">
                  <h3 id="service-environment" class="mt-0 mb-1 text-base font-semibold">
                    Environment
                  </h3>
                  <p class="mt-0 mb-2 text-xs text-fg-muted">
                    Keys only: qits-system never serves a variable’s value, so none is ever shown.
                  </p>
                  <ul
                    class="m-0 mb-4 flex list-none flex-wrap gap-1.5 p-0"
                    aria-label="Environment keys"
                    [fieldOf]="service"
                    qitsField="envKeys"
                    data-env-keys
                  >
                    @for (key of service.envKeys ?? []; track key) {
                      <li
                        class="rounded bg-surface-muted px-1.5 font-mono text-xs leading-5 text-fg-soft"
                      >
                        {{ key }}
                      </li>
                    } @empty {
                      <li class="text-sm text-fg-muted">No environment variables.</li>
                    }
                  </ul>
                  <h4 class="mt-0 mb-2 text-sm font-semibold">Labels</h4>
                  <ul
                    class="m-0 flex list-none flex-wrap gap-1.5 p-0"
                    aria-label="Labels"
                    [fieldOf]="service"
                    [qitsField]="marks.labels"
                    data-labels
                  >
                    @for (label of labels(service.labels); track label) {
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

                <section aria-labelledby="service-mounts" class="mb-6">
                  <h3 id="service-mounts" class="mt-0 mb-2 text-base font-semibold">Mounts</h3>
                  @if ((service.mounts ?? []).length) {
                    <div class="overflow-x-auto">
                      <table class="w-full border-collapse text-left text-sm" aria-label="Mounts">
                        <thead>
                          <tr class="border-b border-line text-xs text-fg-muted">
                            <th class="py-1.5 pr-3 font-semibold">Type</th>
                            <th class="py-1.5 pr-3 font-semibold">Source</th>
                            <th class="py-1.5 pr-3 font-semibold">Target</th>
                            <th class="py-1.5 font-semibold">Read-only</th>
                          </tr>
                        </thead>
                        <tbody>
                          @for (mount of service.mounts; track $index) {
                            <tr
                              class="border-b border-line-subtle align-top"
                              [qitsEntity]="mount"
                              entityKey="target"
                            >
                              <td class="py-1.5 pr-3" [fieldOf]="mount" qitsField="type">
                                {{ mount.type }}
                              </td>
                              <td
                                class="py-1.5 pr-3 font-mono text-xs break-all"
                                [fieldOf]="mount"
                                qitsField="source"
                              >
                                {{ mount.source }}
                              </td>
                              <td
                                class="py-1.5 pr-3 font-mono text-xs break-all"
                                [fieldOf]="mount"
                                qitsField="target"
                              >
                                {{ mount.target }}
                              </td>
                              <td class="py-1.5" [fieldOf]="mount" [qitsField]="marks.readOnly">
                                {{ mount.readOnly ? 'yes' : 'no' }}
                              </td>
                            </tr>
                          }
                        </tbody>
                      </table>
                    </div>
                  } @else {
                    <p
                      class="m-0 text-sm text-fg-muted"
                      [fieldOf]="service"
                      [qitsField]="marks.noMounts"
                      data-no-mounts
                    >
                      This service mounts nothing.
                    </p>
                  }
                </section>

                <section aria-labelledby="service-networks" class="mb-6">
                  <h3 id="service-networks" class="mt-0 mb-2 text-base font-semibold">Networks</h3>
                  @if ((service.networks ?? []).length) {
                    <div class="overflow-x-auto">
                      <table class="w-full border-collapse text-left text-sm" aria-label="Networks">
                        <thead>
                          <tr class="border-b border-line text-xs text-fg-muted">
                            <th class="py-1.5 pr-3 font-semibold">Network</th>
                            <th class="py-1.5 font-semibold">VIP address</th>
                          </tr>
                        </thead>
                        <tbody>
                          @for (network of service.networks; track $index) {
                            <tr
                              class="border-b border-line-subtle align-top"
                              [qitsEntity]="network"
                              entityKey="networkId"
                            >
                              <td
                                class="py-1.5 pr-3 font-mono text-xs"
                                [title]="network.networkId ?? ''"
                                [fieldOf]="network"
                                [qitsField]="marks.networkId"
                              >
                                {{ short(network.networkId) }}
                              </td>
                              <td
                                class="py-1.5 font-mono text-xs"
                                [fieldOf]="network"
                                qitsField="address"
                              >
                                {{ network.address }}
                              </td>
                            </tr>
                          }
                        </tbody>
                      </table>
                    </div>
                  } @else {
                    <p class="m-0 text-sm text-fg-muted" [fieldOf]="service" qitsField="networks">
                      This service is attached to no network.
                    </p>
                  }
                </section>

                <section aria-labelledby="service-tasks">
                  <h3 id="service-tasks" class="mt-0 mb-1 text-base font-semibold">Tasks</h3>
                  @if ((service.tasks ?? []).length) {
                    <p class="mt-0 mb-2 text-xs text-fg-muted">
                      In the order the swarm lists them. The shut-down ones are the last rollout’s
                      history, kept beside the tasks running now.
                    </p>
                    <div class="overflow-x-auto">
                      <table class="w-full border-collapse text-left text-sm" aria-label="Tasks">
                        <thead>
                          <tr class="border-b border-line text-xs text-fg-muted">
                            <th class="py-1.5 pr-3 font-semibold">Slot</th>
                            <th class="py-1.5 pr-3 font-semibold">Node</th>
                            <th class="py-1.5 pr-3 font-semibold">State</th>
                            <th class="py-1.5 pr-3 font-semibold">Desired</th>
                            <th class="py-1.5 font-semibold" [class.pr-3]="otherImages(service)">
                              Error
                            </th>
                            @if (otherImages(service)) {
                              <th class="py-1.5 font-semibold" data-image-column>Image</th>
                            }
                          </tr>
                        </thead>
                        <tbody>
                          @for (task of service.tasks; track task.id) {
                            <tr
                              class="border-b border-line-subtle align-top"
                              [qitsEntity]="task"
                              entityKey="id"
                            >
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
                                qitsField="nodeHostname"
                              >
                                {{ task.nodeHostname }}
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
                                class="min-w-48 py-1.5 font-mono text-xs break-all"
                                [class.pr-3]="otherImages(service)"
                                [class.text-danger]="!!task.error"
                                [class.text-fg-muted]="!task.error"
                                [fieldOf]="task"
                                [qitsField]="marks.error"
                                data-error
                              >
                                {{ task.error || none }}
                              </td>
                              @if (otherImages(service)) {
                                <td
                                  class="min-w-48 py-1.5 font-mono text-xs break-all text-fg-soft"
                                  [fieldOf]="task"
                                  [qitsField]="marks.image"
                                >
                                  {{ imageOf(task, service) }}
                                </td>
                              }
                            </tr>
                          }
                        </tbody>
                      </table>
                    </div>
                    @if (!otherImages(service)) {
                      <p class="mt-2 mb-0 text-xs text-fg-muted">
                        Every task runs the service’s image.
                      </p>
                    }
                  } @else {
                    <p
                      role="status"
                      class="m-0 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
                      [fieldOf]="service"
                      [qitsField]="marks.noTasks"
                      data-no-tasks
                    >
                      @if (owed(service)) {
                        Swarm has placed no task for this service. It asks for
                        {{ service.replicas }} replicas, so that is a scheduling problem, not an
                        empty list.
                      } @else {
                        Swarm has placed no task for this service, and it asks for none.
                      }
                    </p>
                  }
                </section>
              </article>
            }
          </ui-spinner>
        }
      </app-page-layout>
    </div>
  `,
})
export class SwarmServicePage {
  private readonly route = inject(ActivatedRoute);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** "← Swarm services": the list of the swarm's services. */
  protected readonly leaving = outcomes('leave-swarm-service', {
    back: exit('system/swarm/services'),
  });

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  /** The service the address names: its name or its id. */
  protected readonly id = computed(() => this.params().get('id') ?? '');

  /** The service, read again after a deployment of its application went live or failed. */
  protected readonly read = qitsResource(
    SWARM_SERVICE,
    () => {
      const id = this.id();
      return this.browser && id ? { path: { id } } : undefined;
    },
    {
      refreshOn: {
        names: DEPLOYMENT_EVENTS,
        when: (event) => concernsSwarmService(event, this.shown()),
        debounceMs: 1_000,
      },
    },
  );

  /** The service as the page shows it; none while the read has none. */
  protected readonly shown = computed((): SwarmServiceDetail | undefined =>
    this.read.hasValue() ? this.read.value() : undefined,
  );

  /** No such service: a 404. */
  protected readonly missing = computed(() => isMissing(this.read));

  /** The read's failure status (403, 503, …); undefined while it has not failed. */
  private readonly failure = computed((): number | undefined => {
    if (this.read.status() !== 'error') return undefined;
    const error = this.read.error();
    return error instanceof QitsApiError ? error.status : undefined;
  });

  /** A 403: the viewer's roles may not read the swarm. */
  protected readonly refusal = computed(() => this.failure() === 403);

  /** A 503 is the swarm itself not answering; anything else is the read failing. */
  protected readonly failureMessage = computed(() =>
    this.failure() === 503
      ? 'The swarm cannot be read right now.'
      : 'This swarm service could not be read.',
  );

  protected readonly state = computed((): LoadState => loadState(this.read));

  /** Refresh: the service, read again (a change outside a deployment sends no event). */
  protected readonly actions: readonly Action[] = [
    { label: 'Refresh', variant: 'muted', callback: () => this.read.reload() },
  ];

  protected readonly marks = MARKS;
  protected readonly none = NONE;
  protected readonly instant = formatInstant;
  protected readonly short = shortSwarmId;
  protected readonly labels = labelPairs;
  protected readonly healthcheck = healthcheckLine;

  /** Whether any task runs another image than the service's: only then is the column drawn. */
  protected owed(service: SwarmServiceDetail): boolean {
    return asksForTasks(service);
  }

  protected otherImages(service: SwarmServiceDetail): boolean {
    return (service.tasks ?? []).some((task) => runsOtherImage(task, service));
  }

  /** A task's image where it is not the service's; {@link NONE} where it is. */
  protected imageOf(task: SwarmServiceTask, service: SwarmServiceDetail): string {
    return runsOtherImage(task, service) ? (task.image ?? NONE) : NONE;
  }
}

/** The data marks of what the page derives (each a class constant, as the rule reads). */
const MARKS = {
  name: { derived: ['name', 'id'] },
  ports: { derived: ['ports'] },
  createdAt: { derived: ['createdAt'] },
  updatedAt: { derived: ['updatedAt'] },
  healthcheck: { derived: ['healthcheck'] },
  labels: { derived: ['labels'] },
  readOnly: { derived: ['readOnly'] },
  noMounts: { derived: ['mounts'] },
  networkId: { derived: ['networkId'] },
  noTasks: { derived: ['tasks'] },
  slot: { derived: ['slot'] },
  error: { derived: ['error'] },
  image: { derived: ['image'] },
} as const;
