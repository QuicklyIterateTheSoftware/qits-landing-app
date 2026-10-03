import type { ListArchetypesResponses } from '../../api/projects';
import type { Consumed } from '@qits/angular';

/**
 * What `ArchetypesStore` reads from qits-projects' archetype registry (epic qits-112). The store
 * passes this to `consume(...)`, so it cannot read any other field, and its pact spec passes the
 * same list as `consumes`. To read another field, add it here.
 *
 * `ArchetypesStore.load()`: per archetype, the moves out of each status (`transitions`, in the
 * served order) and what a dispatch press runs from each status (`phases`). Both are maps keyed by
 * status, so they are read whole.
 */
export const LIST_ARCHETYPES = [
  'archetypes[].archetype',
  'archetypes[].transitions',
  'archetypes[].phases',
] as const;

/** One archetype's entry in the registry, cut to what the store reads. */
export type ArchetypeEntry = NonNullable<
  Consumed<ListArchetypesResponses[200], typeof LIST_ARCHETYPES>['archetypes']
>[number];

/** One legal move out of a status: where to, and its kind (FORWARD, SKIP, BACK, DROP, REOPEN). */
export type LegalMove = NonNullable<ArchetypeEntry['transitions']>[string][number];

/** What a dispatch press runs from one status: the next phase, and the whole flow. */
export type StatusPhases = NonNullable<ArchetypeEntry['phases']>[string];

/** One phase a dispatch runs: its word, and the status it ends in. */
export type DispatchPhase = NonNullable<StatusPhases['flow']>[number];
