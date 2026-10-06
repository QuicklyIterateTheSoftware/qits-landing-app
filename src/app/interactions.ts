/**
 * The app's UI interactions: what a visitor does that makes this app call a backend.
 *
 * Each key is a stable slug, unique within the app. Pacts name the slug in
 * `comments.references.qits-trigger.interaction`, and diagrams name it too. Never reuse a slug for
 * a different interaction. If an interaction goes away, retire its slug with it.
 *
 * The value is a one-line title, for people.
 */
export const INTERACTIONS = {
  /** `session.guard.ts`: the session check before any page under the layout renders. */
  'sign-in-landing': 'Arriving at the landing page checks the visitor has a session',
  /** `projects.store.ts`, `load()` from the store's `onInit`: the picker's list. */
  'list-projects': 'The project picker lists every project',
  /** `projects.store.ts`, `refresh(id)`: a project the store does not hold yet. */
  'open-project': 'Opening a project fetches its detail',
  /** `project-card.ts`: each card counts the project's components from its repositories. */
  'show-project-repositories': 'A project card shows how many components the project has',
  /** `project-repositories.ts`: the Repositories page lists the open project's repositories. */
  'show-project-repositories-tree':
    'The Repositories page shows the project’s repositories in the wrapper’s directory tree',
  /** `project-card.ts`: each card counts the project's work from its planning tree. */
  'show-project-work': 'A project card shows how much work the project has',
  /**
   * The work section's pages (`routes/projects/[slug]/work/`) via `SelectedWork`: they lay the
   * project's work out on the board, the backlog, Acceptance and the archive, nested, with each
   * campaign's members.
   */
  'show-project-work-board': 'The Work page shows the project’s work on a board, nested',
  /** `epic-list-item.ts`: the finish button on a VERIFIED epic in Acceptance moves it to DONE. */
  'finish-epic': 'The finish button marks a verified epic done',
  /** `ticket-list-item.ts`: the finish button on a VERIFIED ticket in Acceptance moves it to DONE. */
  'finish-ticket': 'The finish button marks a verified ticket done',
  /**
   * `work-item.page.ts`: the work item page reads the archetype registry, which says the moves and
   * the dispatch phases its actions offer.
   */
  'show-work-item-actions': 'The work item page offers the moves and phases the registry serves',
  /**
   * `work-item.page.ts` via `WorkDetailStore`: the work item page reads the item, its comments and
   * its dossier (an epic's pages and figures, a ticket's pages).
   */
  'show-work-item': 'The work item page shows the item’s description, dossier and comments',
  /** `work-item.page.ts`: a Status action (Mark …, Skip to …, Back to …, Drop, Reopen). */
  'move-work-item': 'A status action on the work item page moves the item',
  /**
   * `work-schedule.page.ts` via `WorkDetailStore.loadCriteria`: the Schedule tab reads each listed
   * epic's and ticket's acceptance criteria.
   */
  'show-schedule-criteria': 'The Schedule tab shows each item’s acceptance criteria',
  /**
   * `work-schedule.page.ts`: "Schedule" moves the ticked REFINED epics and tickets to
   * READY_FOR_DEV, with the viewer's session (a person's approval).
   */
  'schedule-work': 'Schedule on the Schedule tab marks the ticked work ready for dev',
  /** `work-schedule.page.ts`: "Unschedule" moves a READY_FOR_DEV epic or ticket back to REFINED. */
  'unschedule-work': 'Unschedule on the Schedule tab takes scheduled work back to refined',
  /** `work-item.page.ts`: Dispatch (the whole flow) or the next phase's button. */
  'dispatch-work-item': 'Dispatch or the next phase on the work item page starts an agent',
  /** `loc.store.ts`, `load()` from the store's `onInit`: every card's lines of code, one request. */
  'show-project-loc': 'The project cards show how many lines of code each project has',
  /**
   * `release-menu.ts`: the top bar's lightning menu, for the open project — fetched when the
   * project opens, and again when domain events say its requests changed.
   */
  'open-release-requests': 'Opening the release menu lists the project’s pending release requests',
  /** `notifications-menu.ts`: the top bar's notifications menu, on its first opening. */
  'open-notifications': 'Opening the notifications menu lists the platform’s newest domain events',
  /** `bumps-menu.ts`: the top bar's bumps menu (a lighthouse), on its first opening. */
  'open-version-bumps': 'Opening the bumps menu lists the platform’s pending version bumps',
  /**
   * The work pages (`work.layout.ts`, `work-item.page.ts`) via `WorkspacesStore`: the ACTIVE
   * workspaces bound to work items, one request per page, for the Workspace links on the cards.
   */
  'show-open-workspaces': 'The work pages link each work item that has an active workspace',
  /** `work-item.page.ts` via `WorkspacesStore`: the item's workspaces in every state. */
  'show-work-item-workspaces': 'The work item page lists the item’s workspaces, newest first',
} as const;

/** A slug from {@link INTERACTIONS}. A slug that is not in the catalog does not compile. */
export type InteractionSlug = keyof typeof INTERACTIONS;
