import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, PLATFORM_ID } from '@angular/core';
import { QitsApiError, QitsEntity, QitsEntityList, QitsField, qitsResource } from '@qits/angular';
import { plural } from '$core/artifacts/artifact-listings';
import { loadState } from '$core/resources/load-state';
import type { SwarmService } from '$core/system/swarm.consumes';
import { SWARM_SERVICE_LIST } from '$core/system/swarm.operations';
import { swarmServiceState, type SwarmServiceState } from '$core/system/swarm-service-state';
import { DEPLOYMENT_EVENTS } from '$core/updates/app-updates';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import type { Action } from '$ui/components/action-button/action';
import { Chip } from '$ui/components/chip/chip';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/**
 * The System section's first page (qits-2344), at `/system/swarm/services`: the services of the one
 * swarm qits-system runs on, each with a state. It replaces qits-system-frontend's `swarm/services`,
 * without its always-empty Updated column (the list door answers `updatedAt: null` for every row).
 *
 * **Load budget: 1, nothing per row.** `SWARM_SERVICE_LIST` (`listSwarmServices`, `docker service
 * ls` on the manager) is the table, in the server's order. The read is made in the browser only
 * (the server render has no session).
 *
 * - Header: "Swarm services", Refresh, and "N services".
 * - Rows: name (plain text: a service's own page is qits-2345's), state, mode, replicas, image and
 *   published ports ("—" when none).
 * - State is derived from `replicas` alone (`swarmServiceState`): Running, Degraded, Down, Stopped,
 *   or "—" where it does not read as `running/desired` (a `global` service).
 *
 * States: loading; an empty swarm is one sentence; a 403 says the swarm needs an admin role; a 503
 * (the swarm is inactive, docker's socket missing or timing out: qits-system never answers that as
 * an empty list) says the swarm cannot be read right now, with Retry; any other failure, with Retry.
 *
 * Marks (qits-2141): the table is the services' read, each row a service by its `id`; the state is
 * derived from `replicas`, the ports cell from `ports`, the count from the whole answer.
 *
 * Staleness (qits-1270): the resource's `refreshOn`, `DEPLOYMENT_EVENTS` (`DeploymentActive`,
 * `DeploymentFailed`, which a swarm rollback sends too) → the whole list, debounced 1 s: a service
 * changes when something deploys. qits-system sends no event of its own for a service, so a
 * service changed outside a deployment (docker by hand, a scale, a task dying) is not followed:
 * Refresh reads the list again. Nothing polls.
 */
@Component({
  selector: 'app-swarm-services-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Chip, LoadFailure, PageLayoutComponent, QitsEntity, QitsEntityList, QitsField, Spinner],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout title="Swarm services" [actions]="actions">
        @if (state() === 'loaded') {
          <p class="mt-0 mb-4 text-sm text-fg-soft" [qitsEntityList]="services" data-lede>
            <span [fieldOf]="answer()" [qitsField]="marks.count">{{ caption() }}</span>
          </p>
        }

        @if (refused()) {
          <p
            role="alert"
            class="m-0 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
          >
            Reading the swarm needs an admin role: qits:admin, qits:admin-agent, qits:desk-admin,
            qits:system or qits:agent.
          </p>
        } @else {
          <ui-load-failure
            [message]="failureMessage()"
            [class.hidden]="state() !== 'error'"
            (retry)="services.reload()"
          />
          <ui-spinner [state]="state()" class="min-h-32" [class.hidden]="state() === 'error'">
            @if (rows().length === 0) {
              <p
                role="status"
                class="m-0 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
              >
                This swarm is running no services.
              </p>
            } @else {
              <div class="overflow-x-auto">
                <table class="w-full border-collapse text-left text-sm" aria-label="Services">
                  <thead>
                    <tr class="border-b border-line text-xs text-fg-muted">
                      <th class="py-1.5 pr-3 font-semibold">Name</th>
                      <th class="py-1.5 pr-3 font-semibold">State</th>
                      <th class="py-1.5 pr-3 font-semibold">Mode</th>
                      <th class="py-1.5 pr-3 font-semibold">Replicas</th>
                      <th class="py-1.5 pr-3 font-semibold">Image</th>
                      <th class="py-1.5 font-semibold">Ports</th>
                    </tr>
                  </thead>
                  <tbody [qitsEntityList]="services">
                    @for (row of rows(); track row.id) {
                      <tr
                        class="border-b border-line-subtle align-top"
                        [qitsEntity]="row"
                        entityKey="id"
                      >
                        <td
                          class="py-1.5 pr-3 font-medium whitespace-nowrap"
                          [fieldOf]="row"
                          qitsField="name"
                        >
                          {{ row.name }}
                        </td>
                        <td class="py-1.5 pr-3 whitespace-nowrap">
                          <ui-chip
                            [label]="stateOf(row).label"
                            [tone]="stateOf(row).tone"
                            [fieldOf]="row"
                            [qitsField]="marks.state"
                          />
                        </td>
                        <td
                          class="py-1.5 pr-3 whitespace-nowrap text-fg-soft"
                          [fieldOf]="row"
                          qitsField="mode"
                        >
                          {{ row.mode }}
                        </td>
                        <td
                          class="py-1.5 pr-3 font-mono whitespace-nowrap tabular-nums"
                          [fieldOf]="row"
                          qitsField="replicas"
                        >
                          {{ row.replicas }}
                        </td>
                        <td
                          class="min-w-64 py-1.5 pr-3 font-mono text-xs break-all text-fg-soft"
                          [fieldOf]="row"
                          qitsField="image"
                        >
                          {{ row.image }}
                        </td>
                        <td
                          class="min-w-32 py-1.5 font-mono text-xs break-all text-fg-soft"
                          [fieldOf]="row"
                          [qitsField]="marks.ports"
                        >
                          {{ row.ports || '—' }}
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <p class="mt-3 mb-0 text-sm text-fg-soft">
                The state is read off the replicas, running out of desired; replicas that do not
                read that way have none.
              </p>
            }
          </ui-spinner>
        }
      </app-page-layout>
    </div>
  `,
})
export class SwarmServicesPage {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** The swarm's services; read again after a deployment went live or failed. */
  protected readonly services = qitsResource(
    SWARM_SERVICE_LIST,
    () => (this.browser ? {} : undefined),
    { refreshOn: { names: DEPLOYMENT_EVENTS, debounceMs: 1_000 } },
  );

  /** The read's answer; no services while it has none. */
  protected readonly answer = computed(
    (): readonly SwarmService[] => (this.services.hasValue() ? this.services.value() : []) ?? [],
  );

  /** The rows, in the server's order. */
  protected readonly rows = computed((): readonly SwarmService[] => this.answer());

  protected readonly state = computed((): LoadState => loadState(this.services));

  /** The read's failure status (403, 503, …); undefined while it has not failed. */
  private readonly failure = computed((): number | undefined => {
    if (this.services.status() !== 'error') return undefined;
    const error = this.services.error();
    return error instanceof QitsApiError ? error.status : undefined;
  });

  /** A 403: the viewer's roles may not read the swarm. */
  protected readonly refused = computed(() => this.failure() === 403);

  /** A 503 is the swarm itself not answering; anything else is the read failing. */
  protected readonly failureMessage = computed(() =>
    this.failure() === 503
      ? 'The swarm cannot be read right now.'
      : 'The swarm’s services could not be read.',
  );

  /** `2 services`. */
  protected readonly caption = computed(() => plural(this.rows().length, 'service'));

  /** Refresh: the services, read again (a change outside a deployment sends no event). */
  protected readonly actions: readonly Action[] = [
    { label: 'Refresh', variant: 'muted', callback: () => this.services.reload() },
  ];

  protected readonly marks = MARKS;

  protected stateOf(row: SwarmService): SwarmServiceState {
    return swarmServiceState(row.replicas);
  }
}

/** The data marks of what the page derives (each a class constant, as the rule reads). */
const MARKS = {
  count: { derived: [] },
  state: { derived: ['replicas'] },
  ports: { derived: ['ports'] },
} as const;
