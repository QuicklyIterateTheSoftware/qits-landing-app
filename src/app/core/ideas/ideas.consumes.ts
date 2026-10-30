import type { CreateIdeaResponses, GetIdeaResponses, ListIdeasResponses } from '../../api/projects';
import type { Consumed } from '@qits/angular';

/**
 * What `IdeasStore` reads from qits-projects' `/ideas` doors (epic qits-888). The store passes each
 * list to `consume(...)`, so it cannot read any other field, and its pact spec passes the same lists
 * as `consumes`. To read another field, add it here.
 */

/**
 * `listIdeas`, by project: each idea's id (the link), title, derived status and whether it is
 * archived (the list's chip, and the status filter). The list's ideas differ in which of
 * `description`/`enabledBy` are null, so neither is read here: the detail page reads them.
 */
export const LIST_IDEAS = [
  'ideas[].id',
  'ideas[].title',
  'ideas[].status',
  'ideas[].archived',
] as const;

/** One idea of the list, cut to what the store reads. */
export type IdeaEntry = NonNullable<
  Consumed<ListIdeasResponses[200], typeof LIST_IDEAS>['ideas']
>[number];

/**
 * `getIdea`, by id: the idea's page. Its own fields; the idea enabling it (`enabledByIdea`: its
 * title for the link, and whether it is archived, for the hint), the ideas it enables, and the work
 * naming it as its inspiration (linked by qualified id to the work item page). A field a recording
 * holds as `null` (`enabledByIdea` of an idea nothing enables) binds nothing below it.
 */
export const GET_IDEA = [
  'id',
  'title',
  'description',
  'status',
  'archived',
  'archiveReason',
  'enabledBy',
  'enabledByIdea.id',
  'enabledByIdea.title',
  'enabledByIdea.archived',
  'enables[].id',
  'enables[].title',
  'enables[].status',
  'enables[].archived',
  'inspired[].id',
  'inspired[].qualifiedId',
  'inspired[].title',
  'inspired[].status',
  'inspired[].archetype',
] as const;

/** The idea's page, cut to what the store reads. */
export type IdeaDetail = Consumed<GetIdeaResponses[200], typeof GET_IDEA>;

/**
 * `createIdea`, `patchIdea`, `archiveIdea`, `unarchiveIdea`: the idea as the write left it. The
 * pages go to it, or read its page again; only what says which idea and where it stands is read.
 */
export const IDEA_WRITTEN = ['id', 'title', 'status', 'archived'] as const;

/** A written idea, cut to what the store reads. */
export type WrittenIdea = Consumed<CreateIdeaResponses[201], typeof IDEA_WRITTEN>;

/** A refusal (400): the service's own words, shown as they are. */
export const IDEA_REFUSAL = ['message'] as const;
