import { qitsOperation } from '@qits/angular';
import {
  addWorkComment,
  getWork,
  listProjectWork,
  patchWork,
  setWorkStatus,
} from '../../api/projects';
import { GET_WORK, WORK_COMMENT } from './work-detail.consumes';
import { PATCH_WORK_INSPIRATION, WORK_REFUSAL } from './work-writes.consumes';
import { PROJECT_CARD_WORK as PROJECT_CARD_WORK_PATHS, SET_WORK_STATUS } from './work.consumes';

/**
 * qits-projects' work reads and writes declared as operations (qits-2145), for the components that
 * read through `qitsResource` and write through `qitsMutation` instead of `WorkStore`,
 * `WorkDetailStore` and `WorkWritesStore` (qits-2146); `work.operations.pact.spec.ts` binds each
 * with the same provider, operationId and `consumes`, except `SET_WORK_INSPIRATION`, which no
 * recording holds yet (see there).
 */

/**
 * A project's planning tree (`listProjectWork`), as a project card reads it: how many of its
 * entries count as work (`countsAsWork`).
 */
export const PROJECT_CARD_WORK = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'listProjectWork',
  method: 'GET',
  call: listProjectWork,
  consumes: PROJECT_CARD_WORK_PATHS,
});

/**
 * A project's planning tree (`listProjectWork`), as the Desk's open issues read it (qits-1819):
 * the entries without their needs' rows, which `openIssues` narrows to the OPEN issues, each shown
 * by its qualified id and title. The same paths as the card's, which is what the store bound for it.
 */
export const OPEN_ISSUES = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'listProjectWork',
  method: 'GET',
  call: listProjectWork,
  consumes: PROJECT_CARD_WORK_PATHS,
});

/**
 * One work item (`getWork`, by qualified id), as the work item page reads it (`GET_WORK`): the
 * Desk's open issues show each issue's description from it.
 */
export const WORK_ITEM = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'getWork',
  method: 'GET',
  call: getWork,
  consumes: GET_WORK,
});

/** A comment on a work item's thread (`addWorkComment`): the comment as written. */
export const ADD_WORK_COMMENT = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'addWorkComment',
  method: 'POST',
  call: addWorkComment,
  consumes: WORK_COMMENT,
});

/** A work item's move to another status (`setWorkStatus`): the status it now holds. */
export const MOVE_WORK = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'setWorkStatus',
  method: 'POST',
  call: setWorkStatus,
  consumes: SET_WORK_STATUS,
});

/**
 * Names an idea as a work item's inspiration, or clears it with `null` (`patchWork`, a JSON merge
 * patch of `inspiredBy` alone; every archetype, qits-1792); a refusal carries the service's
 * `message`.
 */
export const SET_WORK_INSPIRATION = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'patchWork',
  method: 'PATCH',
  call: patchWork,
  consumes: PATCH_WORK_INSPIRATION,
  errorConsumes: WORK_REFUSAL,
});
