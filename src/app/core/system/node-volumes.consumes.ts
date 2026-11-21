import type { ListNodeVolumesResponses } from '../../api/system';
import type { Consumed } from '@qits/angular';

/**
 * What the swarm node page's Volumes tab reads of qits-system's `listNodeVolumes` (qits-2355):
 * `NODE_VOLUME_LIST` (`node-volumes.operations.ts`) declares it as `consumes`, so nothing else can
 * be read, and its pact spec binds the same list. Not `createdAt` (the door always answers it
 * `null`: `docker volume ls` prints no date) and not `scope` (always `local` on a node's own
 * volumes). `unused` is qits-system's: no container on the node references the volume, which does
 * not make it safe to delete.
 */
export const LIST_NODE_VOLUMES = [
  '[].name',
  '[].driver',
  '[].mountpoint',
  '[].labels',
  '[].unused',
] as const;

/** One volume of a node, cut to what the tab reads. */
export type NodeVolume = Consumed<ListNodeVolumesResponses[200], typeof LIST_NODE_VOLUMES>[number];

/**
 * `NODE_VOLUME_LIST`'s refusal: a node other than the one qits-system runs on is a 409 whose
 * `code` is `NODE_REMOTE` and whose `message` says only the local node is reachable; the tab shows
 * it as a note, never as a failure.
 */
export const NODE_VOLUMES_REFUSAL = ['code', 'message'] as const;
