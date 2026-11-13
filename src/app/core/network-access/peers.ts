import type { PeerEntry } from './peers.consumes';

/**
 * The Network access pane's helpers (epic qits-1977): its filters and how a refusal reads. The
 * reads, the revoke and the config are operations (`peers.operations.ts`, qits-2146), which the
 * pane reads through `qitsResource` and writes through `qitsMutation`.
 */

/** The pane's filters: `mine` asks the service (`owner=me`), the others narrow the whole list. */
export const PEER_FILTERS = ['all', 'mine', 'devices', 'nodes', 'revoked'] as const;

/** One of {@link PEER_FILTERS}. */
export type PeerFilter = (typeof PEER_FILTERS)[number];

/** The 403 a revoke answers a credential without a writing role (`qits:agent`, a viewer). */
export const REVOKE_FORBIDDEN = 'Your credential may not revoke peers.';

/** The 403 a config read answers a credential that may not read the peer's config. */
export const CONFIG_FORBIDDEN = 'Your credential may not read this peer’s config.';

/**
 * Asks Angular's `HttpRequest` for the body as text: the generated options do not name
 * `responseType`, but the client hands every option to the request's init, which reads it.
 */
export const AS_TEXT = { responseType: 'text' } as const;

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

/** The peers `filter` keeps of the whole list (`mine` is its own read, `owner=me`). */
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
