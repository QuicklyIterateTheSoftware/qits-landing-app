import { qitsOperation } from '@qits/angular';
import { createWork, patchWork, reprioritizeWork } from '../../api/projects';
import {
  CREATE_WORK as CREATE_WORK_PATHS,
  PATCH_WORK_NEEDS,
  REPRIORITIZE_WORK as REPRIORITIZE_WORK_PATHS,
  WORK_REFUSAL,
} from './work-writes.consumes';

/**
 * qits-projects' work writes outside a move (epic qits-888, qits-2146), in place of
 * `WorkWritesStore`; their requests are built by `work-writes.ts`, for the pages and for
 * `work-writes.operations.pact.spec.ts` alike, and every refusal carries the service's `message`.
 */

/** A new root epic or ticket of a project (`createWork`): its qualified id. */
export const CREATE_WORK = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'createWork',
  method: 'POST',
  call: createWork,
  consumes: CREATE_WORK_PATHS,
  errorConsumes: WORK_REFUSAL,
});

/** What an item needs (`patchWork` of `needs` alone, the whole list; `[]` clears it). */
export const SET_WORK_NEEDS = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'patchWork',
  method: 'PATCH',
  call: patchWork,
  consumes: PATCH_WORK_NEEDS,
  errorConsumes: WORK_REFUSAL,
});

/** An item put above or below an open sibling (`reprioritizeWork`): the renumbered siblings. */
export const REPRIORITIZE_WORK = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'reprioritizeWork',
  method: 'PUT',
  call: reprioritizeWork,
  consumes: REPRIORITIZE_WORK_PATHS,
  errorConsumes: WORK_REFUSAL,
});
