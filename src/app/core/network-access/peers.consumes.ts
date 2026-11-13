import type { Consumed } from '@qits/angular';
import type {
  GetNodesResponses,
  GetPeersResponses,
  GetPrivateEdgeResponses,
} from '../../api/network-access';

/**
 * What the Network access pane reads from qits-network-access' answers (epic qits-1977). Each
 * operation over them (`peers.operations.ts`) narrows its answer to its list, so nothing can read
 * any other field, and its pact spec passes the same list as `consumes`. To read another field, add
 * it here.
 */

/**
 * `PEER_LIST`: the peers, newest first, for the Network access pane's
 * table (name, kind, tunnel IP, owner, status, created). `id` keys the row's Revoke and
 * Download WireGuard config.
 */
export const LIST_PEERS = [
  '[].id',
  '[].kind',
  '[].name',
  '[].tunnelIp',
  '[].ownerUserId',
  '[].status',
  '[].createdAt',
] as const;

/** One peer, cut to what the pane reads. */
export type PeerEntry = Consumed<GetPeersResponses[200], typeof LIST_PEERS>[number];

/**
 * `NODE_LIST`: the joined nodes. The table names a NODE peer's target by the node holding
 * it (`peer.id` → `name`).
 */
export const LIST_NODES = ['[].name', '[].peer.id'] as const;

/** One node, cut to what the pane reads. */
export type NodeEntry = Consumed<GetNodesResponses[200], typeof LIST_NODES>[number];

/** `PRIVATE_EDGE`: the announced private edge, for its card. A 404 is "none announced". */
export const GET_PRIVATE_EDGE = [
  'publicAddress',
  'listenPort',
  'publicKey',
  'announcedAt',
] as const;

/** The private edge, cut to what the pane reads. */
export type PrivateEdgeEntry = Consumed<GetPrivateEdgeResponses[200], typeof GET_PRIVATE_EDGE>;

/** `PEER_REVOKE`: the peer as revoked; the pane checks it came back REVOKED. */
export const REVOKE_PEER = ['status'] as const;

/**
 * `PEER_CONFIG`: the `wg-quick` text, read as text (`responseType: 'text'`), so nothing
 * is bound by field; the pact binds the status and the media type.
 */
export const GET_PEER_CONFIG = [] as const;
