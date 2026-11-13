import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import {
  QitsApiError,
  QitsEntity,
  QitsField,
  qitsMutation,
  qitsResource,
  type QitsResourceRef,
} from '@qits/angular';
import {
  AS_TEXT,
  CONFIG_FORBIDDEN,
  filterPeers,
  networkAccessRefusal,
  PEER_FILTERS,
  REVOKE_FORBIDDEN,
  type PeerFilter,
} from '$core/network-access/peers';
import type { PeerEntry, PrivateEdgeEntry } from '$core/network-access/peers.consumes';
import {
  NODE_LIST,
  PEER_CONFIG,
  PEER_LIST,
  PEER_REVOKE,
  PRIVATE_EDGE,
} from '$core/network-access/peers.operations';
import { utcMinute } from '$core/projects/release-requests';
import { loadState } from '$core/resources/load-state';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import { CopyText } from '$patterns/workspaces/copy-text/copy-text';
import type { Action } from '$ui/components/action-button/action';
import { ActionButton } from '$ui/components/action-button/action-button';
import { Chip, type ChipTone } from '$ui/components/chip/chip';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** The line that connects this machine: the companion container, through the CLI. */
export const CONNECT_COMMAND = 'qits network-access up';

/** The companion's PAC URL, host-side (qits-network-access-service `proxy.go`, default port). */
export const PAC_URL = 'http://127.0.0.1:47813/proxy.pac';

/** Each filter's button label. */
const FILTER_LABELS: Readonly<Record<PeerFilter, string>> = {
  all: 'All',
  mine: 'Mine',
  devices: 'Devices',
  nodes: 'Nodes',
  revoked: 'Revoked',
};

/** A peer's status, as a chip's tone. */
function statusTone(status: string | undefined): ChipTone {
  switch (status) {
    case 'ACTIVE':
      return 'ok';
    case 'REVOKED':
      return 'failed';
    default:
      return 'neutral';
  }
}

/** The private edge, as its read left it: `none` is the service's 404, no edge announced yet. */
type PrivateEdgeRead =
  | { readonly status: 'loading' | 'error' | 'none' }
  | { readonly status: 'loaded'; readonly edge: PrivateEdgeEntry };

/**
 * The Network access pane, at `/network-access` (epic qits-1977): qits-network-access' view of the
 * platform's private network, open to anyone signed in, with no project open.
 *
 * It reads through `qitsResource` and writes through `qitsMutation` (qits-2146), over the
 * operations in `peers.operations.ts`, in the browser only (the server render has no session to
 * send, so every params stays `undefined` there):
 *
 * - The peers (`peers`, `PEER_LIST`): name, kind, tunnel IP, owner (a DEVICE's user, a NODE's
 *   joined node, `nodes`, `NODE_LIST`), status and created, newest first. The filters All,
 *   Devices, Nodes and Revoked narrow the one list; Mine reads the visitor's own peers (`mine`,
 *   `PEER_LIST` with `owner=me`), from its first choosing on.
 * - Revoke on an ACTIVE row asks first ("Confirm revoke?"), then `revoking` (`PEER_REVOKE`), which
 *   reads the lists again; a refusal shows under the table in the service's terms (a 403: the
 *   visitor's credential may not revoke peers).
 * - Download WireGuard config on an ACTIVE DEVICE row reads the peer's `wg-quick` text
 *   (`PEER_CONFIG`'s `fetch`: a read on a press, not something the pane shows) and saves it as
 *   `<name>.conf`, the `<PRIVATE_KEY>` placeholder kept: the pane makes no keys and adds no devices.
 * - The private edge card (`edgeRead`, `PRIVATE_EDGE`): its endpoint, public key and announce time,
 *   or "No private edge has announced itself yet." on the service's 404.
 * - Connect this machine: the copyable `qits network-access up`, then a Browsers step with the
 *   companion's copyable PAC URL (qits-network-access-service `proxy.go`'s `/proxy.pac`): it only
 *   routes once `up` is running on this machine, is set as the system's or browser's automatic
 *   proxy configuration URL, and leaves public apps working while the companion is stopped.
 *
 * What it shows carries the data marks (qits-2141): each row its peer (`qitsEntity` by `id`, its
 * source the list the filter reads), the edge card its edge (by `publicKey`), each value its field
 * or the fields it is derived from (`qitsField`). A NODE's owner joins `nodes` to the peer, which
 * no mark can say: it is marked derived from the peer's own fields.
 *
 * Staleness (qits-1270): none yet. qits-network-access sends no domain event, so the pane reads
 * again only after its own revoke, and on Retry.
 */
@Component({
  selector: 'app-network-access-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ActionButton,
    Chip,
    CopyText,
    LoadFailure,
    PageLayoutComponent,
    QitsEntity,
    QitsField,
    Spinner,
  ],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout title="Network access">
        <p class="mt-0 mb-4 text-sm text-fg-soft">
          The devices and nodes on the platform’s private network, newest first.
        </p>

        <section
          class="mb-6 rounded-md border border-line bg-surface px-4 py-3"
          aria-labelledby="connect-heading"
        >
          <h2 id="connect-heading" class="m-0 mb-1 text-base font-semibold text-fg">
            Connect this machine
          </h2>
          <p class="mt-0 mb-2 text-sm text-fg-soft">
            Run this with the qits CLI. It registers this machine as a device of yours and runs the
            network-access companion container, so it needs Docker.
          </p>
          <app-copy-text [text]="connectCommand" label="Copy" />
          <p class="mt-2 mb-0 text-xs text-fg-muted">
            For a client outside the CLI, a device row’s Download WireGuard config gives its
            <code>wg-quick</code> file; put your own private key in place of
            <code>&lt;PRIVATE_KEY&gt;</code>.
          </p>

          <h3 class="mt-3 mb-1 text-sm font-semibold text-fg">Browsers</h3>
          <p class="mt-0 mb-2 text-sm text-fg-soft">
            Once <code>qits network-access up</code> is running on this machine, set this URL as the
            automatic proxy configuration URL in your system’s or browser’s proxy settings. Public
            apps keep working while the companion is stopped.
          </p>
          <app-copy-text [text]="pacUrl" label="Copy" />
        </section>

        <section
          class="mb-6 rounded-md border border-line bg-surface px-4 py-3"
          aria-labelledby="edge-heading"
          data-private-edge
        >
          <h2 id="edge-heading" class="m-0 mb-1 text-base font-semibold text-fg">Private edge</h2>
          @switch (edge().status) {
            @case ('loaded') {
              @if (edgeEntry(); as entry) {
                <dl
                  class="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm"
                  [qitsEntity]="entry"
                  entityKey="publicKey"
                  [entitySource]="edgeRead"
                >
                  <dt class="text-fg-muted">Endpoint</dt>
                  <dd
                    class="m-0 font-mono"
                    [fieldOf]="entry"
                    [qitsField]="{ derived: ['publicAddress', 'listenPort'] }"
                  >
                    {{ entry.publicAddress }}:{{ entry.listenPort }}
                  </dd>
                  <dt class="text-fg-muted">Public key</dt>
                  <dd class="m-0 font-mono break-all" [fieldOf]="entry" qitsField="publicKey">
                    {{ entry.publicKey }}
                  </dd>
                  <dt class="text-fg-muted">Announced</dt>
                  <dd class="m-0" [fieldOf]="entry" [qitsField]="{ derived: ['announcedAt'] }">
                    {{ when(entry.announcedAt) }}
                  </dd>
                </dl>
              }
            }
            @case ('none') {
              <p class="m-0 text-sm text-fg-soft">No private edge has announced itself yet.</p>
            }
            @case ('error') {
              <p class="m-0 text-sm text-danger" role="alert">
                The private edge could not be read.
              </p>
            }
            @default {
              <p class="m-0 text-sm text-fg-muted">Reading the private edge…</p>
            }
          }
        </section>

        <div class="mb-3 flex flex-wrap gap-1" role="group" aria-label="Filter peers">
          @for (option of filters; track option) {
            <button
              type="button"
              class="cursor-pointer rounded-md border border-line-strong bg-surface px-3 py-1 text-sm text-fg-soft hover:bg-surface-muted aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent"
              [attr.aria-pressed]="filter() === option"
              (click)="choose(option)"
            >
              {{ filterLabel(option) }}
            </button>
          }
        </div>

        <ui-load-failure
          message="The peers could not be read."
          [class.hidden]="state() !== 'error'"
          (retry)="retry()"
        />
        <ui-spinner [state]="state()" class="min-h-32" [class.hidden]="state() === 'error'">
          <div class="overflow-x-auto">
            <table class="w-full border-collapse text-left text-sm" aria-label="Peers">
              <thead>
                <tr class="border-b border-line text-xs text-fg-muted">
                  <th class="py-1.5 pr-3 font-semibold">Name</th>
                  <th class="py-1.5 pr-3 font-semibold">Kind</th>
                  <th class="py-1.5 pr-3 font-semibold">Tunnel IP</th>
                  <th class="py-1.5 pr-3 font-semibold">Owner</th>
                  <th class="py-1.5 pr-3 font-semibold">Status</th>
                  <th class="py-1.5 pr-3 font-semibold">Created</th>
                  <th class="py-1.5 font-semibold"><span class="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                @for (peer of shown(); track peer.id) {
                  <tr
                    class="border-b border-line-subtle align-top"
                    [attr.data-peer]="peer.id"
                    [qitsEntity]="peer"
                    entityKey="id"
                    [entitySource]="listRead()"
                  >
                    <td class="py-1.5 pr-3 font-medium text-fg" [fieldOf]="peer" qitsField="name">
                      {{ peer.name }}
                    </td>
                    <td class="py-1.5 pr-3" [fieldOf]="peer" [qitsField]="{ derived: ['kind'] }">
                      {{ kindLabel(peer) }}
                    </td>
                    <td class="py-1.5 pr-3 font-mono" [fieldOf]="peer" qitsField="tunnelIp">
                      {{ peer.tunnelIp }}
                    </td>
                    <td
                      class="py-1.5 pr-3"
                      [fieldOf]="peer"
                      [qitsField]="{ derived: ['kind', 'ownerUserId', 'id', 'name'] }"
                    >
                      {{ owner(peer) }}
                    </td>
                    <td class="py-1.5 pr-3">
                      <ui-chip
                        [label]="statusLabel(peer)"
                        [tone]="tone(peer)"
                        [fieldOf]="peer"
                        [qitsField]="{ derived: ['status'] }"
                      />
                    </td>
                    <td
                      class="py-1.5 pr-3 whitespace-nowrap text-fg-soft"
                      [fieldOf]="peer"
                      [qitsField]="{ derived: ['createdAt'] }"
                    >
                      {{ when(peer.createdAt) }}
                    </td>
                    <td class="py-1.5">
                      <div class="flex flex-wrap justify-end gap-1">
                        @if (downloadable(peer)) {
                          <ui-action-button
                            [action]="downloadAction(peer)"
                            [fieldOf]="peer"
                            [qitsField]="{ derived: ['id', 'name'] }"
                          />
                        }
                        @if (peer.status === 'ACTIVE') {
                          <ui-action-button
                            [action]="revokeAction(peer)"
                            [fieldOf]="peer"
                            [qitsField]="{ derived: ['id'] }"
                          />
                          @if (confirming() === peer.id) {
                            <ui-action-button [action]="cancel" />
                          }
                        }
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <p
            class="m-0 px-3 py-8 text-center text-sm text-fg-muted"
            [class]="state() === 'loaded' && shown().length === 0 ? 'block' : 'hidden'"
          >
            No peers match this filter.
          </p>
        </ui-spinner>
        @if (failure(); as failure) {
          <p class="mt-2 mb-0 text-sm text-danger" role="alert" data-refusal>
            {{ failure }}
          </p>
        }
      </app-page-layout>
    </div>
  `,
})
export class NetworkAccessPage {
  private readonly document = inject(DOCUMENT);
  /** No read in the server render: it has no session to send. */
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly connectCommand = CONNECT_COMMAND;
  protected readonly pacUrl = PAC_URL;
  protected readonly filters = PEER_FILTERS;
  protected readonly filter = signal<PeerFilter>('all');
  /** The row whose Revoke waits for its confirmation. */
  protected readonly confirming = signal<string | null>(null);
  /** The row whose revoke or download is in flight. */
  protected readonly pending = signal<string | null>(null);
  /** Why the last revoke or download was refused. */
  protected readonly failure = signal<string | null>(null);
  /** Whether Mine was chosen once: its read starts then, and stays. */
  private readonly mineAsked = signal(false);

  /** Every peer. */
  protected readonly peers = qitsResource(PEER_LIST, () => (this.browser ? {} : undefined));

  /** The visitor's own peers (`owner=me`), once Mine was chosen. */
  protected readonly mine = qitsResource(PEER_LIST, () =>
    this.browser && this.mineAsked() ? { query: { owner: 'me' } } : undefined,
  );

  /** The joined nodes, naming a NODE peer's target. */
  protected readonly nodes = qitsResource(NODE_LIST, () => (this.browser ? {} : undefined));

  /** The announced private edge; its 404 is "none announced yet". */
  protected readonly edgeRead = qitsResource(PRIVATE_EDGE, () => (this.browser ? {} : undefined));

  /** Revokes a peer, then reads the lists again. */
  private readonly revoking = qitsMutation(PEER_REVOKE, {
    affects: () => [this.peers, this.nodes, this.mine],
  });

  protected readonly edge = computed((): PrivateEdgeRead => {
    const read = this.edgeRead;
    if (read.status() === 'error') {
      const error = read.error();
      return { status: error instanceof QitsApiError && error.status === 404 ? 'none' : 'error' };
    }
    const edge = read.hasValue() ? read.value() : undefined;
    return edge ? { status: 'loaded', edge } : { status: 'loading' };
  });

  protected readonly edgeEntry = computed(() =>
    this.edgeRead.hasValue() ? this.edgeRead.value() : undefined,
  );

  /** The read the filter shows: Mine's own, else every peer. */
  protected readonly listRead = computed((): QitsResourceRef<readonly PeerEntry[]> =>
    this.filter() === 'mine' ? this.mine : this.peers,
  );

  protected readonly state = computed((): LoadState => loadState(this.listRead()));

  protected readonly shown = computed((): readonly PeerEntry[] => {
    const filter = this.filter();
    if (filter === 'mine') return this.mine.hasValue() ? (this.mine.value() ?? []) : [];
    return filterPeers(this.peers.hasValue() ? (this.peers.value() ?? []) : [], filter);
  });

  /** Each node's name, by the id of its peer. */
  private readonly nodeNames = computed(
    () =>
      new Map(
        (this.nodes.hasValue() ? (this.nodes.value() ?? []) : [])
          .filter((node) => node.peer?.id)
          .map((node) => [node.peer?.id ?? '', node.name ?? '']),
      ),
  );

  protected readonly when = (instant: string | null | undefined) => utcMinute(instant ?? undefined);

  protected readonly cancel: Action = {
    label: 'Cancel',
    variant: 'muted',
    callback: () => this.confirming.set(null),
  };

  protected filterLabel(filter: PeerFilter): string {
    return FILTER_LABELS[filter];
  }

  protected choose(filter: PeerFilter): void {
    this.filter.set(filter);
    this.confirming.set(null);
    if (filter === 'mine') this.mineAsked.set(true);
  }

  protected kindLabel(peer: PeerEntry): string {
    return peer.kind === 'DEVICE' ? 'Device' : peer.kind === 'NODE' ? 'Node' : (peer.kind ?? '');
  }

  protected statusLabel(peer: PeerEntry): string {
    return (peer.status ?? '').toLowerCase();
  }

  protected tone(peer: PeerEntry): ChipTone {
    return statusTone(peer.status);
  }

  /** A DEVICE's owner, a NODE's joined node (its own name while the nodes are not read). */
  protected owner(peer: PeerEntry): string {
    if (peer.kind === 'NODE') return this.nodeNames().get(peer.id ?? '') ?? peer.name ?? '';
    return peer.ownerUserId ?? '';
  }

  protected downloadable(peer: PeerEntry): boolean {
    return peer.kind === 'DEVICE' && peer.status === 'ACTIVE';
  }

  protected downloadAction(peer: PeerEntry): Action {
    return {
      label: 'Download WireGuard config',
      variant: 'muted',
      disabled: this.pending() !== null,
      callback: () => void this.download(peer),
    };
  }

  protected revokeAction(peer: PeerEntry): Action {
    const confirming = this.confirming() === peer.id;
    return {
      label: this.pending() === peer.id ? 'Revoking…' : confirming ? 'Confirm revoke?' : 'Revoke',
      variant: confirming ? 'danger' : 'muted',
      disabled: this.pending() !== null,
      callback: () => void (confirming ? this.revoke(peer) : this.confirming.set(peer.id ?? null)),
    };
  }

  /** Reads again what failed: Mine's list, or every peer, the nodes and the edge (not a 404). */
  protected retry(): void {
    const failed = (read: { status(): string }) => read.status() === 'error';
    if (this.filter() === 'mine') {
      if (failed(this.mine)) this.mine.reload();
      return;
    }
    if (failed(this.peers)) this.peers.reload();
    if (failed(this.nodes)) this.nodes.reload();
    if (this.edge().status === 'error') this.edgeRead.reload();
  }

  private async revoke(peer: PeerEntry): Promise<void> {
    const id = peer.id;
    if (!id) return;
    this.confirming.set(null);
    this.failure.set(null);
    this.pending.set(id);
    try {
      const peer = await this.revoking.run({ path: { peerId: id } });
      // A 2xx that does not answer the peer REVOKED is refused all the same.
      if (peer?.status !== 'REVOKED') {
        this.failure.set(networkAccessRefusal(undefined, 200, REVOKE_FORBIDDEN));
      }
    } catch (error) {
      this.failure.set(refusalOf(error, REVOKE_FORBIDDEN));
    } finally {
      this.pending.set(null);
    }
  }

  private async download(peer: PeerEntry): Promise<void> {
    const id = peer.id;
    if (!id) return;
    this.failure.set(null);
    this.pending.set(id);
    try {
      const { data, error, response } = await PEER_CONFIG.fetch({
        path: { peerId: id },
        ...AS_TEXT,
      });
      const text = data as unknown;
      if (error !== undefined || typeof text !== 'string') {
        this.failure.set(networkAccessRefusal(error, response?.status, CONFIG_FORBIDDEN));
        return;
      }
      this.save(`${peer.name || 'qits'}.conf`, text);
    } finally {
      this.pending.set(null);
    }
  }

  /** Hands `text` to the browser as a file download, through a `data:` link. */
  private save(filename: string, text: string): void {
    const link = this.document.createElement('a');
    link.href = `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`;
    link.download = filename;
    link.rel = 'noopener';
    link.click();
  }
}

/** Why a mutation was refused, for a person: its `QitsApiError`'s status and body, else unreachable. */
function refusalOf(error: unknown, forbidden: string): string {
  return error instanceof QitsApiError
    ? networkAccessRefusal(error.error, error.status, forbidden)
    : networkAccessRefusal(undefined, undefined, forbidden);
}
