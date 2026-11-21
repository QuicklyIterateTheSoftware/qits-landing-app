/** One tab of a swarm node's page, a child route of `system/swarm/nodes/:id`. */
export interface NodeTab {
  /** The URL segment after `nodes/<id>/`. */
  readonly segment: string;
  readonly label: string;
}

/**
 * The swarm node page's tabs (qits-2354), in the order they show, as qits-system-frontend's:
 * Containers, Images, Volumes, Networks; a tab not landed yet has no entry.
 *
 * A tab is an entry here plus a child route of `swarm/nodes/:id` in `app.routes.ts`, and its exit:
 * one key of `outcomes('switch-swarm-node-tab', …)` in `swarm-node.layout.ts`, named by the
 * segment (`containers: exit('system/swarm/nodes/:id/containers')`), because a declared exit is a
 * literal path the route tree must know (`route-paths.ts`). The tabs: qits-2352 containers,
 * qits-2353 images, qits-2355 volumes, qits-2354 networks.
 */
export const NODE_TABS: readonly NodeTab[] = [
  // One entry per line, in the order above.
  { segment: 'images', label: 'Images' },
  { segment: 'volumes', label: 'Volumes' },
];
