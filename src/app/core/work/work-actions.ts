/**
 * Which actions a work item's page offers, by archetype and status. Pure: the page maps each id to
 * a label, a variant and a callback.
 *
 * Three groups, each left out when empty:
 *
 * - `agent` (Dispatch, Next phase): while a phase runs behind the status, so before VERIFIED. An
 *   epic or a ticket gets both. A campaign gets Dispatch only (its start: the service refuses a
 *   single phase), by the same rule: until VERIFIED.
 *
 *   INTERIM for a campaign: the service starts a campaign only from REFINED, so a press at any
 *   other status will be refused. By USER RULE which actions are available must come from the
 *   backend (the archetype registry's `phases`), but CAMPAIGN's `phases` is `{}` today; move this
 *   there once the registry says it.
 * - `status` (Mark refined, Drop, Block): status moves. None in a final state (DONE, DROPPED).
 *   Mark refined at REPORTED only (its one forward move by name); Drop in every open status; Block
 *   where a phase runs (an epic or ticket before VERIFIED, a campaign at REFINED).
 * - `plan` (Edit, Reshape, Refine): before IMPLEMENTING, so at REPORTED and REFINED. Edit and
 *   Reshape for every archetype but a campaign; Refine for an epic or a ticket at REPORTED, where
 *   refine is the phase that runs.
 *
 * A feature or a task has no status of its own: the caller passes its epic's (`WorkGraph.statusOf`).
 * It has no lifecycle either, so it gets only Edit and Reshape.
 */

/** One action a work item's page can offer. */
export type WorkActionId =
  'dispatch' | 'nextPhase' | 'markRefined' | 'drop' | 'block' | 'edit' | 'reshape' | 'refine';

/** The three groups, in the order the page shows them. */
export type WorkActionGroupId = 'agent' | 'status' | 'plan';

/** One non-empty group of available actions. */
export interface WorkActionGroup {
  readonly id: WorkActionGroupId;
  readonly actions: readonly WorkActionId[];
}

/** Statuses where a phase runs behind the status: an agent can be dispatched. */
const PHASED: ReadonlySet<string> = new Set([
  'REPORTED',
  'REFINED',
  'IMPLEMENTING',
  'IMPLEMENTED',
  'VERIFYING',
]);

/** Statuses that can still be dropped: every status but the two final ones. */
const OPEN: ReadonlySet<string> = new Set([...PHASED, 'VERIFIED']);

/** Statuses before IMPLEMENTING: the plan can still change. */
const PLANNING: ReadonlySet<string> = new Set(['REPORTED', 'REFINED']);

/** The actions available for `archetype` at `status`, by group; empty groups are left out. */
export function workActions(
  archetype: string | undefined,
  status: string | null | undefined,
): readonly WorkActionGroup[] {
  const s = status ?? '';
  const lifecycle = archetype === 'EPIC' || archetype === 'TICKET';
  const campaign = archetype === 'CAMPAIGN';
  const structure = archetype === 'FEATURE' || archetype === 'TASK';

  const agent: WorkActionId[] = [];
  if (lifecycle && PHASED.has(s)) agent.push('dispatch', 'nextPhase');
  if (campaign && PHASED.has(s)) agent.push('dispatch');

  const moves: WorkActionId[] = [];
  if (lifecycle || campaign) {
    if (s === 'REPORTED') moves.push('markRefined');
    if (OPEN.has(s)) moves.push('drop');
    if ((lifecycle && PHASED.has(s)) || (campaign && s === 'REFINED')) moves.push('block');
  }

  const plan: WorkActionId[] = [];
  if ((lifecycle || structure) && PLANNING.has(s)) plan.push('edit', 'reshape');
  if (lifecycle && s === 'REPORTED') plan.push('refine');

  const groups: WorkActionGroup[] = [
    { id: 'agent', actions: agent },
    { id: 'status', actions: moves },
    { id: 'plan', actions: plan },
  ];
  return groups.filter((g) => g.actions.length > 0);
}
