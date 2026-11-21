import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, PLATFORM_ID } from '@angular/core';
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
import { plural } from '$core/artifacts/artifact-listings';
import { loadState } from '$core/resources/load-state';
import type { SwarmNode } from '$core/system/swarm.consumes';
import { SWARM_NODE_LIST } from '$core/system/swarm.operations';
import {
  shortSwarmId,
  swarmNodeAvailabilityTone,
  swarmNodeStatusTone,
} from '$core/system/swarm-node-tones';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import type { Action } from '$ui/components/action-button/action';
import { Chip, type ChipTone } from '$ui/components/chip/chip';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/**
 * The System section's nodes page (qits-2346), at `/system/swarm/nodes`: the nodes of the one
 * swarm qits-system runs on. It replaces qits-system-frontend's `swarm/nodes`, without its Address
 * column (the list door answers `address: null` for every row).
 *
 * **Load budget: 1, nothing per row.** `SWARM_NODE_LIST` (`listSwarmNodes`, `docker node ls` on the
 * manager) is the table, in the server's order. The read is made in the browser only (the server
 * render has no session).
 *
 * - Header: "Swarm nodes", Refresh, and "N nodes".
 * - Rows: hostname (linking the node's page here by its id, `open-swarm-node`, qits-2347), "this
 *   node" beside the one qits-system runs on (`self`), docker's 12-character id (the whole id on
 *   hover), role, status, availability, manager status and engine version ("—" when empty: a
 *   worker has no manager status).
 * - Status and availability are docker's own words, each on a chip whose tone
 *   (`swarmNodeStatusTone`, `swarmNodeAvailabilityTone`) says how it stands: Ready / Active ok,
 *   Down failed, Unknown / Disconnected / Pause waiting, Drain and anything else neutral.
 *
 * States: loading; a manager listing no nodes is one sentence; a 403 says the swarm needs an admin
 * role; a 503 (the swarm is inactive, docker's socket missing or timing out: qits-system never
 * answers that as an empty list) says the swarm cannot be read right now, with Retry; any other
 * failure, with Retry.
 *
 * Marks (qits-2141): the table is the nodes' read, each row a node by its `id`; the short id is
 * derived from `id`, each chip from its field (its tone is the page's), the manager and engine cells from their fields (a dash for none), the count
 * from the whole answer.
 *
 * Staleness (qits-1270): no `refreshOn`. No event names a node change (a node joining or leaving,
 * a drain, a node going Down): qits-system sends none for the swarm's nodes, and a deployment does
 * not change them. Refresh reads the list again. Nothing polls.
 */
@Component({
  selector: 'app-swarm-nodes-page',
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
      <app-page-layout title="Swarm nodes" [actions]="actions">
        @if (state() === 'loaded') {
          <p class="mt-0 mb-4 text-sm text-fg-soft" [qitsEntityList]="nodes" data-lede>
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
            (retry)="nodes.reload()"
          />
          <ui-spinner [state]="state()" class="min-h-32" [class.hidden]="state() === 'error'">
            @if (rows().length === 0) {
              <p
                role="status"
                class="m-0 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
              >
                The swarm manager lists no nodes.
              </p>
            } @else {
              <div class="overflow-x-auto">
                <table class="w-full border-collapse text-left text-sm" aria-label="Nodes">
                  <thead>
                    <tr class="border-b border-line text-xs text-fg-muted">
                      <th class="py-1.5 pr-3 font-semibold">Hostname</th>
                      <th class="py-1.5 pr-3 font-semibold">ID</th>
                      <th class="py-1.5 pr-3 font-semibold">Role</th>
                      <th class="py-1.5 pr-3 font-semibold">Status</th>
                      <th class="py-1.5 pr-3 font-semibold">Availability</th>
                      <th class="py-1.5 pr-3 font-semibold">Manager</th>
                      <th class="py-1.5 font-semibold">Engine</th>
                    </tr>
                  </thead>
                  <tbody [qitsEntityList]="nodes">
                    @for (row of rows(); track row.id) {
                      <tr
                        class="border-b border-line-subtle align-top"
                        [qitsEntity]="row"
                        entityKey="id"
                      >
                        <td class="py-1.5 pr-3 whitespace-nowrap">
                          <a
                            class="font-medium text-accent no-underline hover:underline"
                            [qitsExit]="opening.node"
                            [exitParams]="{ id: row.id ?? '' }"
                            [fieldOf]="row"
                            qitsField="hostname"
                            >{{ row.hostname }}</a
                          >
                          @if (row.self) {
                            <!-- A space, so the cell reads "fake-host this node". -->
                            &ngsp;<ui-chip
                              class="ml-1"
                              label="this node"
                              tone="neutral"
                              [fieldOf]="row"
                              qitsField="self"
                            />
                          }
                        </td>
                        <td
                          class="py-1.5 pr-3 font-mono text-xs whitespace-nowrap text-fg-soft"
                          [attr.title]="row.id"
                          [fieldOf]="row"
                          [qitsField]="marks.id"
                        >
                          {{ shortId(row.id) }}
                        </td>
                        <td
                          class="py-1.5 pr-3 whitespace-nowrap text-fg-soft"
                          [fieldOf]="row"
                          qitsField="role"
                        >
                          {{ row.role }}
                        </td>
                        <td class="py-1.5 pr-3 whitespace-nowrap">
                          <ui-chip
                            [label]="row.status ?? ''"
                            [tone]="statusTone(row)"
                            [fieldOf]="row"
                            [qitsField]="marks.status"
                          />
                        </td>
                        <td class="py-1.5 pr-3 whitespace-nowrap">
                          <ui-chip
                            [label]="row.availability ?? ''"
                            [tone]="availabilityTone(row)"
                            [fieldOf]="row"
                            [qitsField]="marks.availability"
                          />
                        </td>
                        <td
                          class="py-1.5 pr-3 whitespace-nowrap text-fg-soft"
                          [fieldOf]="row"
                          [qitsField]="marks.managerStatus"
                        >
                          {{ row.managerStatus || '—' }}
                        </td>
                        <td
                          class="py-1.5 font-mono text-xs whitespace-nowrap text-fg-soft"
                          [fieldOf]="row"
                          [qitsField]="marks.engineVersion"
                        >
                          {{ row.engineVersion || '—' }}
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </ui-spinner>
        }
      </app-page-layout>
    </div>
  `,
})
export class SwarmNodesPage {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** A row's hostname: the node's page here (qits-2347), addressed by its id. */
  protected readonly opening = outcomes('open-swarm-node', {
    node: exit('system/swarm/nodes/:id'),
  });

  /** The swarm's nodes; read again on Refresh only (no event names a node change). */
  protected readonly nodes = qitsResource(SWARM_NODE_LIST, () => (this.browser ? {} : undefined));

  /** The read's answer; no nodes while it has none. */
  protected readonly answer = computed(
    (): readonly SwarmNode[] => (this.nodes.hasValue() ? this.nodes.value() : []) ?? [],
  );

  /** The rows, in the server's order. */
  protected readonly rows = computed((): readonly SwarmNode[] => this.answer());

  protected readonly state = computed((): LoadState => loadState(this.nodes));

  /** The read's failure status (403, 503, …); undefined while it has not failed. */
  private readonly failure = computed((): number | undefined => {
    if (this.nodes.status() !== 'error') return undefined;
    const error = this.nodes.error();
    return error instanceof QitsApiError ? error.status : undefined;
  });

  /** A 403: the viewer's roles may not read the swarm. */
  protected readonly refused = computed(() => this.failure() === 403);

  /** A 503 is the swarm itself not answering; anything else is the read failing. */
  protected readonly failureMessage = computed(() =>
    this.failure() === 503
      ? 'The swarm cannot be read right now.'
      : 'The swarm’s nodes could not be read.',
  );

  /** `1 node`. */
  protected readonly caption = computed(() => plural(this.rows().length, 'node'));

  /** Refresh: the nodes, read again (nothing announces a node change). */
  protected readonly actions: readonly Action[] = [
    { label: 'Refresh', variant: 'muted', callback: () => this.nodes.reload() },
  ];

  protected readonly marks = MARKS;

  protected readonly shortId = shortSwarmId;

  protected statusTone(row: SwarmNode): ChipTone {
    return swarmNodeStatusTone(row.status);
  }

  protected availabilityTone(row: SwarmNode): ChipTone {
    return swarmNodeAvailabilityTone(row.availability);
  }
}

/** The data marks of what the page derives (each a class constant, as the rule reads). */
const MARKS = {
  count: { derived: [] },
  id: { derived: ['id'] },
  status: { derived: ['status'] },
  availability: { derived: ['availability'] },
  managerStatus: { derived: ['managerStatus'] },
  engineVersion: { derived: ['engineVersion'] },
} as const;
