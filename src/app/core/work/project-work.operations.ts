import { qitsOperation } from '@qits/angular';
import { dispatchWork, listProjectWork } from '../../api/projects';
import { DISPATCH_WORK as DISPATCH_WORK_PATHS, LIST_PROJECT_WORK } from './work.consumes';

/**
 * qits-projects' reads and writes of the open project's work as the work section makes them
 * (qits-2146), in place of `WorkStore`: the planning tree every work page draws, and a dispatch
 * press. `project-work.operations.pact.spec.ts` binds each with the same provider, operationId and
 * `consumes` as `WorkStore`'s pact spec did (its interactions moved there unchanged). The moves
 * (`MOVE_WORK`) are `work.operations.ts`'.
 */

/**
 * A project's whole planning tree (`listProjectWork`, unfiltered), as the work section reads it
 * (`SelectedWork`): each entity's id, qualified id, title, archetype, status, parent, priority and
 * needs (`LIST_PROJECT_WORK`).
 */
export const PROJECT_WORK = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'listProjectWork',
  method: 'GET',
  call: listProjectWork,
  consumes: LIST_PROJECT_WORK,
});

/**
 * A dispatch press (`dispatchWork`, by qualified id): `FLOW` runs every phase left, `PHASE` the next
 * one. The answer names the phase it started; the move it causes arrives as an event.
 */
export const DISPATCH_WORK = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'dispatchWork',
  method: 'POST',
  call: dispatchWork,
  consumes: DISPATCH_WORK_PATHS,
});
