import type { CreatedPeer, PeerEntry } from './peers.consumes';

/**
 * The Network access pane's helpers (epic qits-1977): its filters, how a refusal reads, and Add
 * device's name rule (qits-2262). The reads, the writes and the configs are operations (`peers.operations.ts`, qits-2146), which the
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

/** The 403 an add answers a credential that may not add devices. */
export const ADD_FORBIDDEN = 'Your credential may not add devices.';

/**
 * A device's name, as the service checks it (`PeerValidation.NAME`): a DNS label of lower-case
 * letters, digits and inner dashes, at most 63 characters.
 */
export const DEVICE_NAME = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/** What a name {@link DEVICE_NAME} refuses is told, in the service's own 400 words. */
export const DEVICE_NAME_RULE =
  'name must be a DNS label: lower-case letters, digits and inner dashes, at most 63';

/** Whether `name` is a name the service takes for a device. */
export function isDeviceName(name: string): boolean {
  return DEVICE_NAME.test(name);
}

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
  return messageOf(error) ?? refusedWithout(httpStatus);
}

/**
 * Why an add was refused, for a person (qits-2262): a 400 or a 409 in the service's own words (a
 * bad name or key; a key or a name already active, a full address pool), a 403 `ADD_FORBIDDEN`.
 * Unlike {@link networkAccessRefusal}, a 409 here is not about the private edge.
 */
export function addDeviceRefusal(error: unknown, httpStatus: number | undefined): string {
  if (httpStatus === 403) return ADD_FORBIDDEN;
  return messageOf(error) ?? refusedWithout(httpStatus);
}

/**
 * The new peer `createPeer` answered, checked into what Add device reads (the client types it
 * `unknown`: the service's OpenAPI document gives the 201 no schema); undefined without an `id`.
 */
export function asCreatedPeer(value: unknown): CreatedPeer | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const peer = value as CreatedPeer;
  return typeof peer.id === 'string' && peer.id ? peer : undefined;
}

/** The `message` of a refusal body (`{"message": "..."}`), when it has one. */
function messageOf(error: unknown): string | undefined {
  const message =
    error !== null && typeof error === 'object' && 'message' in error ? error.message : undefined;
  return typeof message === 'string' && message.trim() ? message : undefined;
}

/** A refusal without the service's words: its status, or no answer at all. */
function refusedWithout(httpStatus: number | undefined): string {
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
