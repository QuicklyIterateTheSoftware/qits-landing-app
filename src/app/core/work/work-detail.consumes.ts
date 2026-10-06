import type {
  GetWorkResponses,
  ListWorkCommentsResponses,
  ListWorkDossierAssetsResponses,
  ListWorkDossierResponses,
} from '../../api/projects';
import type { Consumed } from '@qits/angular';

/**
 * What `WorkDetailStore` reads from qits-projects for one work item's page (epic qits-112). The
 * store passes each list to `consume(...)`, so it cannot read any other field, and its pact spec
 * passes the same lists as `consumes`. To read another field, add it here.
 */

/**
 * `getWork`, by qualified id: the item's own fields the detail views show. A ticket: its type,
 * impetus, assignee and whether it is blocked. A task: its repository, when it was started and
 * implemented, and what it depends on. A feature: what it depends on. Every archetype: its
 * description (Markdown).
 */
export const GET_WORK = [
  'id',
  'archetype',
  'description',
  'ticketType',
  'impetus',
  'assignee',
  'blocked',
  'repositoryId',
  'implementingAt',
  'implementedAt',
  'dependsOn',
] as const;

/**
 * {@link GET_WORK} as it binds a feature's or a task's answer: they are never blocked, so their
 * answer has no `blocked`, and the views read it of a ticket only.
 */
export const GET_WORK_UNBLOCKABLE = GET_WORK.filter((path) => path !== 'blocked');

/** The item, cut to what the store reads. */
export type EntityDetail = Consumed<GetWorkResponses[200], typeof GET_WORK>;

/**
 * `getWork`, by qualified id, for the Schedule tab (`WorkDetailStore.loadCriteria`): an epic's or
 * a ticket's acceptance criteria (one line of Markdown each), which the list of the project's work
 * does not carry. Scheduling is refused without them (the ACCEPTANCE_CRITERIA gate), so the tab
 * shows them beside each item.
 */
export const GET_WORK_CRITERIA = ['acceptanceCriteria'] as const;

/** `listWorkComments`, by qualified id: the thread, oldest first. The body is Markdown. */
export const LIST_WORK_COMMENTS = [
  'entries[].comment.id',
  'entries[].comment.author',
  'entries[].comment.body',
  'entries[].comment.createdAt',
] as const;

/** One comment, cut to what the store reads. */
export type CommentEntry = NonNullable<
  NonNullable<
    Consumed<ListWorkCommentsResponses[200], typeof LIST_WORK_COMMENTS>['entries']
  >[number]['comment']
>;

/**
 * `listWorkDossier`, by qualified id: an epic's or a ticket's dossier, each page's title and
 * Markdown body.
 */
export const LIST_DOSSIER_PAGES = ['pages[].id', 'pages[].title', 'pages[].body'] as const;

/** One dossier page, cut to what the store reads (the epic's and the ticket's are alike). */
export type DossierPage = NonNullable<
  Consumed<ListWorkDossierResponses[200], typeof LIST_DOSSIER_PAGES>['pages']
>[number];

/**
 * `listWorkDossierAssets`, by qualified id: the figures an epic's pages inline, by the address the
 * pages name them with (`url`, relative to qits-projects' API: the stored
 * `/epics/{epicId}/dossier-assets/{assetId}/content`, which is data in the page bodies), their id
 * (the browser loads each from `/work/{qualifiedId}/dossier-assets/{id}/content`) and their label.
 */
export const LIST_WORK_DOSSIER_ASSETS = ['assets[].id', 'assets[].url', 'assets[].label'] as const;

/** One figure, cut to what the store reads. */
export type DossierAsset = NonNullable<
  Consumed<ListWorkDossierAssetsResponses[200], typeof LIST_WORK_DOSSIER_ASSETS>['assets']
>[number];
