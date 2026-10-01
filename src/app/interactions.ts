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
} as const;

/** A slug from {@link INTERACTIONS}. A slug that is not in the catalog does not compile. */
export type InteractionSlug = keyof typeof INTERACTIONS;
