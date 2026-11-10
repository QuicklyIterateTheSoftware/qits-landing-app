import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { consume } from '@qits/angular';
import {
  getNodes,
  getPeerConfig,
  getPeers,
  getPrivateEdge,
  revokePeer,
} from '../../api/network-access';
import {
  GET_PEER_CONFIG,
  GET_PRIVATE_EDGE,
  LIST_NODES,
  LIST_PEERS,
  REVOKE_PEER,
  type NodeEntry,
  type PeerEntry,
  type PrivateEdgeEntry,
} from './peers.consumes';

type Status = 'idle' | 'loading' | 'loaded' | 'error';

/** The pane's filters: `mine` asks the service (`owner=me`), the others narrow the whole list. */
export const PEER_FILTERS = ['all', 'mine', 'devices', 'nodes', 'revoked'] as const;

/** One of {@link PEER_FILTERS}. */
export type PeerFilter = (typeof PEER_FILTERS)[number];

/** A list of peers, as a read left it. */
export interface PeerList {
  readonly status: Status;
  readonly peers: readonly PeerEntry[];
}

/** The private edge, as its read left it: `none` is the service's 404, no edge announced yet. */
export type PrivateEdge =
  | { readonly status: 'idle' | 'loading' | 'error' | 'none' }
  | { readonly status: 'loaded'; readonly edge: PrivateEdgeEntry };

/** What a revoke answered. */
export type RevokeOutcome =
  { readonly ok: true } | { readonly ok: false; readonly refusal: string };

/** What a config read answered: the `wg-quick` text, `<PRIVATE_KEY>` placeholder kept, or why not. */
export type ConfigOutcome =
  { readonly ok: true; readonly text: string } | { readonly ok: false; readonly refusal: string };

/** The 403 a revoke answers a credential without a writing role (`qits:agent`, a viewer). */
export const REVOKE_FORBIDDEN = 'Your credential may not revoke peers.';

/**
 * Asks Angular's `HttpRequest` for the body as text: the generated options do not name
 * `responseType`, but the client hands every option to the request's init, which reads it.
 */
const AS_TEXT = { responseType: 'text' } as const;

/** Why a write or a read was refused, for a person. The service sends no body on a 403. */
export function networkAccessRefusal(
  error: unknown,
  httpStatus: number | undefined,
  forbidden: string,
): string {
  if (httpStatus === 403) return forbidden;
  if (httpStatus === 404) return 'The peer no longer exists.';
  if (httpStatus === 409) return 'No private edge has announced itself yet.';
  const message =
    error !== null && typeof error === 'object' && 'message' in error ? error.message : undefined;
  if (typeof message === 'string' && message.trim()) return message;
  return httpStatus
    ? `The service refused it (HTTP ${httpStatus}).`
    : 'The service is unreachable.';
}

/** The peers `filter` keeps of the whole list (`mine` is its own read, see {@link PeersStore}). */
export function filterPeers(
  peers: readonly PeerEntry[],
  filter: Exclude<PeerFilter, 'mine'>,
): readonly PeerEntry[] {
  switch (filter) {
    case 'devices':
      return peers.filter((peer) => peer.kind === 'DEVICE');
    case 'nodes':
      return peers.filter((peer) => peer.kind === 'NODE');
    case 'revoked':
      return peers.filter((peer) => peer.status === 'REVOKED');
    default:
      return peers;
  }
}

interface PeersState {
  /** Every peer (`getPeers` without a filter). */
  readonly all: PeerList;
  /** The caller's own peers (`getPeers?owner=me`), read once the filter is chosen. */
  readonly mine: PeerList;
  readonly nodesStatus: Status;
  readonly nodes: readonly NodeEntry[];
  readonly edge: PrivateEdge;
}

const EMPTY: PeerList = { status: 'idle', peers: [] };

/**
 * qits-network-access' peers, nodes and private edge (epic qits-1977), for the Network access pane.
 *
 * - `load()` reads every peer, the nodes and the private edge, once, and again after an error.
 *   `reload()` reads them again (after a revoke). A 404 on the edge is `none`.
 * - `loadMine()` reads the caller's own peers (`owner=me`, the service resolves the caller).
 * - `revoke(id)` revokes a peer; a 403 is {@link REVOKE_FORBIDDEN}. The pane reads again after.
 * - `config(id)` reads the peer's `wg-quick` text as text, `<PRIVATE_KEY>` placeholder kept.
 *
 * Staleness (qits-1270): none yet. qits-network-access sends no domain event when a peer is
 * added, revoked or a node joins, so the pane reads again only after its own revoke.
 */
export const PeersStore = signalStore(
  { providedIn: 'root' },
  withState<PeersState>({
    all: EMPTY,
    mine: EMPTY,
    nodesStatus: 'idle',
    nodes: [],
    edge: { status: 'idle' },
  }),
  withMethods((store) => {
    async function fetchPeers(mine: boolean): Promise<PeerList> {
      const { data, error } = mine
        ? await consume(getPeers({ query: { owner: 'me' } }), LIST_PEERS)
        : await consume(getPeers(), LIST_PEERS);
      return error !== undefined || !data
        ? { status: 'error', peers: [] }
        : { status: 'loaded', peers: data };
    }

    async function fetchAll(): Promise<void> {
      patchState(store, { all: await fetchPeers(false) });
    }

    async function fetchNodes(): Promise<void> {
      const { data, error } = await consume(getNodes(), LIST_NODES);
      patchState(
        store,
        error !== undefined || !data
          ? { nodesStatus: 'error', nodes: [] }
          : { nodesStatus: 'loaded', nodes: data },
      );
    }

    async function fetchEdge(): Promise<void> {
      const { data, error, response } = await consume(getPrivateEdge(), GET_PRIVATE_EDGE);
      if (response?.status === 404) {
        patchState(store, { edge: { status: 'none' } });
      } else if (error !== undefined || !data) {
        patchState(store, { edge: { status: 'error' } });
      } else {
        patchState(store, { edge: { status: 'loaded', edge: data } });
      }
    }

    async function fetchMine(): Promise<void> {
      patchState(store, { mine: await fetchPeers(true) });
    }

    const settled = (status: Status) => status === 'loading' || status === 'loaded';

    return {
      async load(): Promise<void> {
        const reads: Promise<void>[] = [];
        if (!settled(store.all().status)) {
          patchState(store, { all: { status: 'loading', peers: [] } });
          reads.push(fetchAll());
        }
        if (!settled(store.nodesStatus())) {
          patchState(store, { nodesStatus: 'loading' });
          reads.push(fetchNodes());
        }
        const edge = store.edge().status;
        if (edge !== 'loading' && edge !== 'loaded' && edge !== 'none') {
          patchState(store, { edge: { status: 'loading' } });
          reads.push(fetchEdge());
        }
        await Promise.all(reads);
      },
      async loadMine(): Promise<void> {
        if (settled(store.mine().status)) return;
        patchState(store, { mine: { status: 'loading', peers: [] } });
        await fetchMine();
      },
      /** Reads every list again, keeping what is shown until the answers arrive. */
      async reload(): Promise<void> {
        const reads = [fetchAll(), fetchNodes()];
        if (store.mine().status !== 'idle') reads.push(fetchMine());
        await Promise.all(reads);
      },
      async revoke(peerId: string): Promise<RevokeOutcome> {
        const { data, error, response } = await consume(
          revokePeer({ path: { peerId } }),
          REVOKE_PEER,
        );
        if (error !== undefined || data?.status !== 'REVOKED') {
          return {
            ok: false,
            refusal: networkAccessRefusal(error, response?.status, REVOKE_FORBIDDEN),
          };
        }
        return { ok: true };
      },
      async config(peerId: string): Promise<ConfigOutcome> {
        const { data, error, response } = await consume(
          getPeerConfig({ path: { peerId }, ...AS_TEXT }),
          GET_PEER_CONFIG,
        );
        const text = data as unknown;
        if (error !== undefined || typeof text !== 'string') {
          return {
            ok: false,
            refusal: networkAccessRefusal(
              error,
              response?.status,
              'Your credential may not read this peer’s config.',
            ),
          };
        }
        return { ok: true, text };
      },
    };
  }),
);
