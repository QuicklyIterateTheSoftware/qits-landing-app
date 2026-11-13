import { qitsOperation } from '@qits/angular';
import {
  editWorkComment,
  getWork,
  listWorkComments,
  listWorkDossier,
  listWorkDossierAssets,
} from '../../api/projects';
import {
  GET_WORK,
  GET_WORK_CRITERIA,
  LIST_DOSSIER_PAGES,
  LIST_WORK_COMMENTS,
  LIST_WORK_DOSSIER_ASSETS,
  WORK_COMMENT,
} from './work-detail.consumes';

/**
 * qits-projects' reads of one work item's page beyond the project's work, all by qualified id
 * (qits-2146), in place of `WorkDetailStore`: the item, its thread, its dossier's pages and figures,
 * a comment's edit, and the item's acceptance criteria alone (the Schedule tab).
 * `work-detail.operations.pact.spec.ts` binds each with the store's interactions, unchanged. A
 * comment's addition is `ADD_WORK_COMMENT` (`work.operations.ts`).
 */

/** The work item page's item (`getWork`): description, facts, needs, inspiration (`GET_WORK`). */
export const WORK_DETAIL = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'getWork',
  method: 'GET',
  call: getWork,
  consumes: GET_WORK,
});

/** An item's thread (`listWorkComments`), oldest first. */
export const WORK_COMMENTS = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'listWorkComments',
  method: 'GET',
  call: listWorkComments,
  consumes: LIST_WORK_COMMENTS,
});

/** An epic's or a ticket's dossier pages (`listWorkDossier`), in position order. */
export const WORK_DOSSIER = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'listWorkDossier',
  method: 'GET',
  call: listWorkDossier,
  consumes: LIST_DOSSIER_PAGES,
});

/** An epic's dossier figures (`listWorkDossierAssets`): each figure's id and stored address. */
export const WORK_DOSSIER_ASSETS = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'listWorkDossierAssets',
  method: 'GET',
  call: listWorkDossierAssets,
  consumes: LIST_WORK_DOSSIER_ASSETS,
});

/** One comment's body rewritten (`editWorkComment`, a JSON merge patch): the comment as written. */
export const EDIT_WORK_COMMENT = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'editWorkComment',
  method: 'PATCH',
  call: editWorkComment,
  consumes: WORK_COMMENT,
});

/** An item's acceptance criteria alone (`getWork`), as the Schedule tab lists them. */
export const WORK_CRITERIA = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'getWork',
  method: 'GET',
  call: getWork,
  consumes: GET_WORK_CRITERIA,
});
