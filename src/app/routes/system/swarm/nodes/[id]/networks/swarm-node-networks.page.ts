import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, PLATFORM_ID } from '@angular/core';
import { QitsApiError, QitsEntity, QitsEntityList, QitsField, qitsResource } from '@qits/angular';
import { plural } from '$core/artifacts/artifact-listings';
import { formatInstant } from '$core/release-requests/release-request-model';
import { loadState } from '$core/resources/load-state';
import { dockerInstant } from '$core/system/docker-date';
import type { NodeNetwork } from '$core/system/node-networks.consumes';
import { NODE_NETWORK_LIST } from '$core/system/node-networks.operations';
import { OPEN_SWARM_NODE } from '$core/system/open-swarm-node';
import type { Action } from '$ui/components/action-button/action';
import { ActionButton } from '$ui/components/action-button/action-button';
import { Chip } from '$ui/components/chip/chip';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';
import { nodeLabelPairs } from '../swarm-node.layout';

/** What the tab draws for a value a network does not have. */
const NONE = '—';

/** A network's creation date, docker's Go layout read by its offset; {@link NONE} if unparseable. */
export function networkCreated(createdAt: string | undefined): string {
  return formatInstant(dockerInstant(createdAt));
}

/**
 * A swarm node's Networks tab (qits-2354), at `/system/swarm/nodes/<id>/networks`, inside the node
 * layout (`SwarmNodeLayout`, whose header, facts and tab row stay above it). It replaces
 * qits-system-frontend's `swarm/nodes/:id/networks` (`NodeNetworksTab`), which hands off to it with
 * a full-document load.
 *
 * **Load budget: 1, nothing per row.** `NODE_NETWORK_LIST` (`listNodeNetworks`, `docker network
 * ls`), by the layout's node id (`OPEN_SWARM_NODE`), in the browser only (the server render has no
 * session). A node's networks are local to its docker daemon, and qits-system reaches only its own:
 * the tab reads nothing until the layout has read the node, and only when it is that node (`self`).
 * Another node is one sentence, never a failure, and so is the read's own 409 (`NODE_REMOTE`, its
 * `message` beside it).
 *
 * - Header: "Networks" with Refresh, then "N networks".
 * - Rows, in the server's order: name (an "internal" chip when the network is internal), docker's
 *   id (monospace), driver, scope, the labels as `key=value` chips sorted by key ("—" for none),
 *   and created (docker's date read by its offset, `dockerInstant`; "—" when unparseable).
 *
 * States: loading; `[]` says the node lists none (a running docker daemon always has bridge, host
 * and none, so it is worth a look); a 403 says reading the swarm needs an admin role; a 503 or any
 * other failure says the networks cannot be read right now, with Retry.
 *
 * Marks (qits-2141): the table is the read's list, each row a network by its `id`; the name, id,
 * driver, scope and the chip are their fields, the labels and created derived from theirs, the
 * count from the whole answer.
 *
 * Staleness (qits-1270): no `refreshOn`. No event names a network change (an overlay a deploy
 * creates, a runner's lease bridge created or removed): qits-system sends none for docker's
 * networks. The tab's own Refresh reads them again (the layout's re-reads the node and its tasks
 * only). Nothing polls.
 */
@Component({
  selector: 'app-swarm-node-networks-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionButton, Chip, LoadFailure, QitsEntity, QitsEntityList, QitsField, Spinner],
  host: { class: 'block' },
  template: `
    <section aria-labelledby="node-networks">
      <div class="mb-1 flex items-center justify-between gap-3">
        <h2 id="node-networks" class="m-0 text-base font-semibold">Networks</h2>
        @if (readable()) {
          <ui-action-button [action]="refresh" />
        }
      </div>

      @if (remote()) {
        <p
          role="status"
          class="m-0 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
          data-remote
        >
          Only the node qits-system runs on can be read; this is another node.
          @if (remoteMessage(); as message) {
            <span class="block text-fg-muted" data-remote-message>{{ message }}</span>
          }
        </p>
      } @else if (refused()) {
        <p
          role="alert"
          class="m-0 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
        >
          Reading the swarm needs an admin role: qits:admin, qits:admin-agent, qits:desk-admin,
          qits:system or qits:agent.
        </p>
      } @else {
        <ui-load-failure
          message="The node’s networks cannot be read right now."
          [class.hidden]="state() !== 'error'"
          (retry)="networks.reload()"
        />
        <ui-spinner [state]="state()" class="min-h-24" [class.hidden]="state() === 'error'">
          @if (rows().length) {
            <p class="mt-0 mb-2 text-xs text-fg-muted" [qitsEntityList]="networks" data-caption>
              <span [fieldOf]="answer()" [qitsField]="marks.count">{{ caption() }}</span>
            </p>
            <div class="overflow-x-auto">
              <table class="w-full border-collapse text-left text-sm" aria-label="Networks">
                <thead>
                  <tr class="border-b border-line text-xs text-fg-muted">
                    <th class="py-1.5 pr-3 font-semibold">Name</th>
                    <th class="py-1.5 pr-3 font-semibold">ID</th>
                    <th class="py-1.5 pr-3 font-semibold">Driver</th>
                    <th class="py-1.5 pr-3 font-semibold">Scope</th>
                    <th class="py-1.5 pr-3 font-semibold">Labels</th>
                    <th class="py-1.5 font-semibold">Created</th>
                  </tr>
                </thead>
                <tbody [qitsEntityList]="networks">
                  @for (row of rows(); track row.id) {
                    <tr
                      class="border-b border-line-subtle align-top"
                      [qitsEntity]="row"
                      entityKey="id"
                    >
                      <td class="py-1.5 pr-3 break-all">
                        <span class="font-medium" [fieldOf]="row" qitsField="name">{{
                          row.name
                        }}</span>
                        @if (row.internal) {
                          <!-- A space, so the cell reads "<name> internal". -->
                          &ngsp;<ui-chip
                            class="ml-1"
                            label="internal"
                            tone="neutral"
                            [fieldOf]="row"
                            qitsField="internal"
                          />
                        }
                      </td>
                      <td
                        class="py-1.5 pr-3 font-mono text-xs whitespace-nowrap text-fg-soft"
                        [fieldOf]="row"
                        qitsField="id"
                      >
                        {{ row.id }}
                      </td>
                      <td
                        class="py-1.5 pr-3 whitespace-nowrap text-fg-soft"
                        [fieldOf]="row"
                        qitsField="driver"
                      >
                        {{ row.driver }}
                      </td>
                      <td
                        class="py-1.5 pr-3 whitespace-nowrap text-fg-soft"
                        [fieldOf]="row"
                        qitsField="scope"
                      >
                        {{ row.scope }}
                      </td>
                      <td class="py-1.5 pr-3">
                        <ul
                          class="m-0 flex list-none flex-wrap gap-1 p-0"
                          [fieldOf]="row"
                          [qitsField]="marks.labels"
                          data-labels
                        >
                          @for (label of labels(row.labels); track label) {
                            <li><ui-chip [label]="label" tone="neutral" class="font-mono" /></li>
                          } @empty {
                            <li class="text-fg-muted">{{ none }}</li>
                          }
                        </ul>
                      </td>
                      <td
                        class="py-1.5 whitespace-nowrap text-fg-soft"
                        [fieldOf]="row"
                        [qitsField]="marks.createdAt"
                        data-created
                      >
                        {{ created(row.createdAt) }}
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
              [qitsEntityList]="networks"
              data-no-networks
            >
              This node lists no networks; a running docker daemon always has bridge, host and none.
            </p>
          }
        </ui-spinner>
      }
    </section>
  `,
})
export class SwarmNodeNetworksPage {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly open = inject(OPEN_SWARM_NODE);

  /** The node is read and is the one qits-system runs on: the only node whose networks it reaches. */
  protected readonly readable = computed(() => this.open.node()?.self === true);

  /** The read's params: the open node, once known to be qits-system's own, in the browser only. */
  private readonly addressed = () => {
    const id = this.open.nodeId();
    return this.browser && id && this.readable() ? { path: { id } } : undefined;
  };

  /** The node's networks; read again on Refresh only (no event names a network change). */
  protected readonly networks = qitsResource(NODE_NETWORK_LIST, this.addressed);

  /** The read's failure, while it has failed; undefined otherwise. */
  private readonly failure = computed((): QitsApiError | undefined => {
    if (this.networks.status() !== 'error') return undefined;
    const error = this.networks.error();
    return error instanceof QitsApiError ? error : undefined;
  });

  /** A 409 (qits-system's `NODE_REMOTE`): the node is not qits-system's own. */
  private readonly remoteRefusal = computed(() => this.failure()?.status === 409);

  /** Another node: known not to be qits-system's, or the read refused as remote. Never a failure. */
  protected readonly remote = computed(() => {
    const node = this.open.node();
    return (node !== undefined && node.self !== true) || this.remoteRefusal();
  });

  /** The 409's own `message`, when it sent one (with `NODE_REMOTE` or another code). */
  protected readonly remoteMessage = computed((): string | undefined => {
    if (!this.remoteRefusal()) return undefined;
    // Checked, not trusted: the OpenAPI document types the error body `unknown`.
    const body: unknown = this.failure()?.error;
    const message =
      body !== null && typeof body === 'object'
        ? (body as Record<string, unknown>)['message']
        : undefined;
    return typeof message === 'string' && message.trim() ? message : undefined;
  });

  /** A 403: the viewer's roles may not read the swarm. */
  protected readonly refused = computed(() => this.failure()?.status === 403);

  protected readonly state = computed((): LoadState => loadState(this.networks));

  /** The read's answer; none while it has none. */
  protected readonly answer = computed(
    (): readonly NodeNetwork[] => (this.networks.hasValue() ? this.networks.value() : []) ?? [],
  );

  /** The rows, in the server's order. */
  protected readonly rows = computed((): readonly NodeNetwork[] => this.answer());

  /** `2 networks`. */
  protected readonly caption = computed(() => plural(this.rows().length, 'network'));

  /** Refresh: the networks, read again (nothing announces a network change). */
  protected readonly refresh: Action = {
    label: 'Refresh',
    variant: 'muted',
    callback: () => this.networks.reload(),
  };

  protected readonly marks = MARKS;
  protected readonly none = NONE;
  protected readonly labels = nodeLabelPairs;
  protected readonly created = networkCreated;
}

/** The data marks of what the tab derives (each a class constant, as the rule reads). */
const MARKS = {
  count: { derived: [] },
  labels: { derived: ['labels'] },
  createdAt: { derived: ['createdAt'] },
} as const;
