import { InjectionToken, type Signal } from '@angular/core';
import type { SwarmNodeDetail } from './swarm.consumes';

/**
 * The swarm node a node's page shows (qits-2354), as its tabs read it: the node layout
 * (`swarm-node.layout.ts`) reads the node through its own `qitsResource` over `SWARM_NODE` and
 * provides itself under this token, so the Containers, Images, Volumes and Networks tabs (its child
 * routes) follow the same read, one request, instead of reading the node again. The tabs' resources
 * are local to the node qits-system runs on, so a tab skips its read while `node()?.self` is not
 * true. Not a root service: it lives as long as the node's page.
 */
export interface OpenSwarmNodeRead {
  /** The node's id in the URL (the layout's `:id`). */
  readonly nodeId: Signal<string>;
  /** The node, once read (`id`, `self`, …); undefined before, and for a node swarm does not know. */
  readonly node: Signal<SwarmNodeDetail | undefined>;
}

/** Where a swarm node page's tabs find the node the layout read. */
export const OPEN_SWARM_NODE = new InjectionToken<OpenSwarmNodeRead>('OPEN_SWARM_NODE');
