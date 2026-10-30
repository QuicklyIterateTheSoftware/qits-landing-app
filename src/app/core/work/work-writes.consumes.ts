import type { CreateWorkResponses, PatchWorkResponses } from '../../api/projects';
import type { Consumed } from '@qits/angular';

/**
 * What `WorkWritesStore` reads from qits-projects' answers to the work create form and the work
 * item page's inspiration (epic qits-888). The store passes each list to `consume(...)`, so it
 * cannot read any other field, and its pact spec passes the same lists as `consumes`.
 */

/** `createWork`: the new item's qualified id, which the form goes to. */
export const CREATE_WORK = ['qualifiedId'] as const;

/** A created item, cut to what the store reads. */
export type CreatedWork = Consumed<CreateWorkResponses[201], typeof CREATE_WORK>;

/**
 * `patchWork` with `inspiredBy` alone: the item's inspiration as the edit left it (absent once
 * cleared: the answer omits a null `inspiredBy`).
 */
export const PATCH_WORK_INSPIRATION = ['qualifiedId', 'inspiredBy'] as const;

/** A patched item, cut to what the store reads. */
export type PatchedWork = Consumed<PatchWorkResponses[200], typeof PATCH_WORK_INSPIRATION>;

/** A refusal (400, 409): the service's own words. */
export const WORK_REFUSAL = ['message'] as const;
