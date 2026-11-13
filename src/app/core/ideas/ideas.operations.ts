import { qitsOperation } from '@qits/angular';
import {
  archiveIdea,
  createIdea,
  getIdea,
  listIdeas,
  patchIdea,
  reprioritizeIdea,
  unarchiveIdea,
} from '../../api/projects';
import {
  GET_IDEA,
  IDEA_REFUSAL,
  IDEA_WRITTEN,
  LIST_IDEAS,
  REPRIORITIZE_IDEA,
} from './ideas.consumes';

/**
 * qits-projects' `/ideas` doors (epic qits-888) declared as operations (qits-2145), for the pages
 * that read through `qitsResource` and write through `qitsMutation` in place of the former
 * `IdeasStore` (qits-2146); `ideas.operations.pact.spec.ts` binds each with the same provider,
 * operationId and `consumes`. The requests the writes send are built by `idea-writes.ts`, which the
 * pact spec drives too, so a page cannot send what no interaction holds.
 */

/**
 * A project's ideas (`listIdeas`, `?project=` by id, `&archived=true` with the archived ones):
 * the Ideas page, the idea forms' "Enabled by" choice and the work item page's inspiration picker.
 */
export const IDEA_LIST = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'listIdeas',
  method: 'GET',
  call: listIdeas,
  consumes: LIST_IDEAS,
});

/**
 * One idea's page (`getIdea`): the idea, the idea enabling it, the ideas it enables and the work it
 * inspired. The edit form fills itself from it; the work item page and the work form show its title.
 */
export const IDEA = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'getIdea',
  method: 'GET',
  call: getIdea,
  consumes: GET_IDEA,
});

/** Create on the idea form (`createIdea`); a refusal carries the service's `message`. */
export const CREATE_IDEA = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'createIdea',
  method: 'POST',
  call: createIdea,
  consumes: IDEA_WRITTEN,
  errorConsumes: IDEA_REFUSAL,
});

/** Save on the idea edit form (`patchIdea`, a JSON merge patch). */
export const EDIT_IDEA = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'patchIdea',
  method: 'PATCH',
  call: patchIdea,
  consumes: IDEA_WRITTEN,
  errorConsumes: IDEA_REFUSAL,
});

/** Archive on an idea's page (`archiveIdea`), with the reason the service requires. */
export const ARCHIVE_IDEA = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'archiveIdea',
  method: 'POST',
  call: archiveIdea,
  consumes: IDEA_WRITTEN,
  errorConsumes: IDEA_REFUSAL,
});

/** Unarchive on an archived idea's page (`unarchiveIdea`). */
export const UNARCHIVE_IDEA = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'unarchiveIdea',
  method: 'POST',
  call: unarchiveIdea,
  consumes: IDEA_WRITTEN,
  errorConsumes: IDEA_REFUSAL,
});

/**
 * A drop on the Ideas page (`reprioritizeIdea`, qits-1791): the ideas it renumbered, each with its
 * new priority.
 */
export const REPRIORITIZE = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'reprioritizeIdea',
  method: 'PUT',
  call: reprioritizeIdea,
  consumes: REPRIORITIZE_IDEA,
  errorConsumes: IDEA_REFUSAL,
});
