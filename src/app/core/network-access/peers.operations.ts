import { qitsOperation } from '@qits/angular';
import {
  createPeer,
  getNodes,
  getPeerAppConfig,
  getPeerConfig,
  getPeers,
  getPrivateEdge,
  revokePeer,
} from '../../api/network-access';
import {
  CREATE_PEER,
  GET_PEER_APP_CONFIG,
  GET_PEER_CONFIG,
  GET_PRIVATE_EDGE,
  LIST_NODES,
  LIST_PEERS,
  REFUSAL_MESSAGE,
  REVOKE_PEER,
} from './peers.consumes';

/**
 * qits-network-access' reads and its two writes, declared as operations (qits-2145) for the Network
 * access pane (`network-access.page.ts`, epic qits-1977), which reads them through `qitsResource`
 * and writes through `qitsMutation` instead of `PeersStore` (qits-2146);
 * `peers.operations.pact.spec.ts` binds each with the same provider, operationId and `consumes`.
 */

/** The peers, newest first (`getPeers`; `?owner=me` for the visitor's own), the pane's table. */
export const PEER_LIST = qitsOperation({
  provider: 'qits-network-access-service',
  operationId: 'getPeers',
  method: 'GET',
  call: getPeers,
  consumes: LIST_PEERS,
});

/** The joined nodes (`getNodes`), naming a NODE peer's target in the table's Owner column. */
export const NODE_LIST = qitsOperation({
  provider: 'qits-network-access-service',
  operationId: 'getNodes',
  method: 'GET',
  call: getNodes,
  consumes: LIST_NODES,
});

/** The announced private edge (`getPrivateEdge`), its card; a 404 is "none announced yet". */
export const PRIVATE_EDGE = qitsOperation({
  provider: 'qits-network-access-service',
  operationId: 'getPrivateEdge',
  method: 'GET',
  call: getPrivateEdge,
  consumes: GET_PRIVATE_EDGE,
});

/**
 * A device's `wg-quick` text (`getPeerConfig`, read as text: `AS_TEXT`), saved as a file by Download
 * WireGuard config. A read on a press, not a value the pane shows: the pane calls its `fetch`.
 */
export const PEER_CONFIG = qitsOperation({
  provider: 'qits-network-access-service',
  operationId: 'getPeerConfig',
  method: 'GET',
  call: getPeerConfig,
  consumes: GET_PEER_CONFIG,
});

/** Revokes a peer (`revokePeer`); the answer is the peer, which must come back REVOKED. */
export const PEER_REVOKE = qitsOperation({
  provider: 'qits-network-access-service',
  operationId: 'revokePeer',
  method: 'POST',
  call: revokePeer,
  consumes: REVOKE_PEER,
});

/**
 * Adds a device peer owned by the visitor (`createPeer`, qits-2262): Add device sends the name and
 * the public key the browser made, never the private key. A 400 or 409 carries the service's
 * reason as `message`.
 */
export const PEER_CREATE = qitsOperation({
  provider: 'qits-network-access-service',
  operationId: 'createPeer',
  method: 'POST',
  call: createPeer,
  consumes: CREATE_PEER,
  errorConsumes: REFUSAL_MESSAGE,
});

/**
 * A device's config for the WireGuard apps (`getPeerAppConfig`, read as text: `AS_TEXT`), which
 * Add device fills with the new private key in memory and shows once as a QR code and a file. A
 * read on a press: the pane calls its `fetch`.
 */
export const PEER_APP_CONFIG = qitsOperation({
  provider: 'qits-network-access-service',
  operationId: 'getPeerAppConfig',
  method: 'GET',
  call: getPeerAppConfig,
  consumes: GET_PEER_APP_CONFIG,
});
