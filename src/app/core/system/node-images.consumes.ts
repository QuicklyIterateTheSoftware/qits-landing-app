import type { ListNodeImagesResponses } from '../../api/system';
import type { Consumed } from '@qits/angular';

/**
 * What the app reads of qits-system's node images (qits-2353): `NODE_IMAGE_LIST`
 * (`node-images.operations.ts`) declares it as `consumes`, so nothing else can be read, and its pact
 * spec binds the same list. To read another field, add it here.
 *
 * Not `digest` (`<none>` on every row: the door runs `docker image ls` without `--digests`), not
 * `size` (docker's rounded text; `sizeBytes` is the number) and not `createdSince` (docker's phrase,
 * frozen at the moment of the read).
 */
export const LIST_NODE_IMAGES = [
  '[].id',
  '[].repository',
  '[].tag',
  '[].sizeBytes',
  '[].createdAt',
  '[].containers',
] as const;

/**
 * What the tab reads of the door's refusal: a node other than the one qits-system runs on answers
 * 409 `{"code":"NODE_REMOTE","message":"only the local node is reachable in this version"}`.
 */
export const NODE_IMAGES_REFUSAL = ['code', 'message'] as const;

/** One image a node holds, cut to what the Images tab reads. */
export type NodeImage = Consumed<ListNodeImagesResponses[200], typeof LIST_NODE_IMAGES>[number];
