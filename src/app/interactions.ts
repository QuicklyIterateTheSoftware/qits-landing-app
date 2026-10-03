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
} as const;

/** A slug from {@link INTERACTIONS}. A slug that is not in the catalog does not compile. */
export type InteractionSlug = keyof typeof INTERACTIONS;
