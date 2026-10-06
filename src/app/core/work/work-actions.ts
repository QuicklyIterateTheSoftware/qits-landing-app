import type { ActionDetails, ActionVariant } from '$ui/components/action-button/action';
import type { ArchetypeEntry, DispatchPhase, LegalMove } from './archetypes.consumes';

/**
 * Which actions a work item's page offers, from qits-projects' archetype registry
 * (`ArchetypesStore`) for the item's archetype and status. Pure: the page maps each action to a
 * callback. By USER RULE the app holds no status model and no dispatch phases of its own: the
 * Agent and Status groups are exactly what the registry serves.
 *
 * Three groups, each left out when empty:
 *
 * - `agent`: a dispatch press, from `phases[status]`: "Dispatch" runs the whole `flow` (its
 *   popover lists the phases), the next phase's button (`next`, labelled by its word, e.g.
 *   "Implement") runs that one phase. Each is left out when the registry has none (`next` null,
 *   `flow` empty; a feature, a task and a campaign have no phases).
 *
 *   INTERIM for a campaign: its press is its start, and the registry serves no campaign phases.
 *   "Start campaign" shows while the campaign has a forward move short of DONE (REPORTED,
 *   REFINED, IMPLEMENTED), but the service starts a campaign only from REFINED, so a press at any
 *   other status is refused. TODO: take it from the registry once it says when a campaign starts.
 * - `status`: every move the registry serves out of the status, in its order (`transitions`), then
 *   Block (a placeholder) wherever the Agent group has something to run.
 * - `plan` (Edit, Reshape, Refinement room): placeholders. Edit and Reshape for every archetype
 *   but a campaign at REPORTED and REFINED; TODO: the registry does not say yet when the plan can
 *   change. Refinement room where the next phase is refine.
 */

/** One action a work item's page can offer. */
export type WorkAction =
  | { readonly kind: 'dispatch'; readonly flow: readonly DispatchPhase[] }
  | { readonly kind: 'nextPhase'; readonly phase: DispatchPhase }
  | { readonly kind: 'startCampaign' }
  | { readonly kind: 'move'; readonly move: LegalMove }
  | { readonly kind: 'block' | 'edit' | 'reshape' | 'refine' };

/** The three groups, in the order the page shows them. */
export type WorkActionGroupId = 'agent' | 'status' | 'plan';

/** One non-empty group of available actions. */
export interface WorkActionGroup {
  readonly id: WorkActionGroupId;
  readonly actions: readonly WorkAction[];
}

/** Statuses where the plan can still change. TODO: from the registry, once it says so. */
const PLANNING: ReadonlySet<string> = new Set(['REPORTED', 'REFINED']);

/**
 * The actions available for `archetype` at `status`, by group; empty groups are left out.
 * `registry` is the archetype's registry entry: without it (not loaded yet) there are no Agent or
 * Status actions.
 */
export function workActions(
  registry: ArchetypeEntry | undefined,
  archetype: string | undefined,
  status: string | null | undefined,
): readonly WorkActionGroup[] {
  const s = status ?? '';
  const phases = registry?.phases?.[s];
  const moves = registry?.transitions?.[s] ?? [];
  const campaign = archetype === 'CAMPAIGN';

  const agent: WorkAction[] = [];
  const flow = phases?.flow ?? [];
  if (flow.length) agent.push({ kind: 'dispatch', flow });
  if (phases?.next) agent.push({ kind: 'nextPhase', phase: phases.next });
  if (campaign && moves.some((m) => m.kind === 'FORWARD' && m.to !== 'DONE')) {
    agent.push({ kind: 'startCampaign' });
  }

  const moving: WorkAction[] = moves.map((move) => ({ kind: 'move', move }));
  if (agent.length) moving.push({ kind: 'block' });

  const plan: WorkAction[] = [];
  if (!campaign && PLANNING.has(s)) plan.push({ kind: 'edit' }, { kind: 'reshape' });
  if (phases?.next?.phase === 'refine') plan.push({ kind: 'refine' });

  const groups: WorkActionGroup[] = [
    { id: 'agent', actions: agent },
    { id: 'status', actions: moving },
    { id: 'plan', actions: plan },
  ];
  return groups.filter((g) => g.actions.length > 0);
}

/** How an action looks: its label, its variant and, for Dispatch, its popover. */
export interface WorkActionLook {
  readonly label: string;
  readonly variant: ActionVariant;
  readonly details?: ActionDetails;
}

/** A status word as a label shows it: `IMPLEMENTED` → `implemented`, `READY_FOR_DEV` → `ready for dev`. */
const word = (status: string | undefined) => (status ?? '').toLowerCase().replaceAll('_', ' ');

/** A phase word as a button shows it: `implement` → `Implement`. */
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** How `action` looks on the page. */
export function lookOf(action: WorkAction): WorkActionLook {
  switch (action.kind) {
    case 'dispatch':
      return {
        label: 'Dispatch',
        variant: 'success',
        details: {
          title: 'Runs',
          items: action.flow.map((p) => `${p.phase ?? ''} → ${p.endsIn ?? ''}`),
        },
      };
    case 'nextPhase':
      return { label: capital(action.phase.phase ?? 'Next phase'), variant: 'muted' };
    case 'startCampaign':
      return { label: 'Start campaign', variant: 'success' };
    case 'move':
      return moveLook(action.move);
    case 'block':
      return { label: 'Block', variant: 'muted' };
    case 'edit':
      return { label: 'Edit', variant: 'muted' };
    case 'reshape':
      return { label: 'Reshape', variant: 'muted' };
    case 'refine':
      return { label: 'Refinement room', variant: 'muted' };
  }
}

/** A move's label and variant, by its kind; a kind this app does not know is a plain move. */
function moveLook(move: LegalMove): WorkActionLook {
  const to = word(move.to);
  switch (move.kind) {
    case 'FORWARD':
      return { label: `Mark ${to}`, variant: 'success' };
    case 'SKIP':
      return { label: `Skip to ${to}`, variant: 'muted' };
    case 'BACK':
      return { label: `Back to ${to}`, variant: 'muted' };
    case 'DROP':
      return { label: 'Drop', variant: 'danger' };
    case 'REOPEN':
      return { label: 'Reopen', variant: 'muted' };
    default:
      return { label: `Move to ${to}`, variant: 'muted' };
  }
}
