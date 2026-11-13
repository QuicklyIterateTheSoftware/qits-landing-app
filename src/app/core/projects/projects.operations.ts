import { qitsOperation } from '@qits/angular';
import { getProject, listProjectReleaseRequests, listProjects } from '../../api/projects';
import { GET_PROJECT, LIST_PROJECT_RELEASE_REQUESTS, LIST_PROJECTS } from './projects.consumes';

/**
 * qits-projects' project reads declared as operations (qits-2145), for the shell and the project
 * pages, which read through `qitsResource` instead of `ProjectsStore` (qits-2146);
 * `projects.operations.pact.spec.ts` binds each with the same provider, operationId and
 * `consumes`.
 */

/**
 * Every project (`listProjects`): the picker's cards, and the list `SelectedProject` finds the
 * URL's project in.
 */
export const PROJECT_LIST = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'listProjects',
  method: 'GET',
  call: listProjects,
  consumes: LIST_PROJECTS,
});

/** One project by its id (`getProject`): the name a project's page and its Setup page show. */
export const PROJECT_DETAIL = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'getProject',
  method: 'GET',
  call: getProject,
  consumes: GET_PROJECT,
});

/**
 * The open project's release requests (`listProjectReleaseRequests`), as `ProjectReleaseRequests`
 * holds them for the shell: the sidebar's Release Requests line, the trail's request crumb, and the
 * agents' waits on a request.
 */
export const PROJECT_RELEASE_REQUESTS = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'listProjectReleaseRequests',
  method: 'GET',
  call: listProjectReleaseRequests,
  consumes: LIST_PROJECT_RELEASE_REQUESTS,
});
