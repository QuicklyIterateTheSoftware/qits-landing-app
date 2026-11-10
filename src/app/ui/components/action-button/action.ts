import type { Outcome } from '@qits/angular';

/** How an action looks: `success` confirms, `danger` destroys, `muted` is everything else. */
export type ActionVariant = 'success' | 'danger' | 'muted';

/** What an action's popover tells before the click: a title and an ordered list. */
export interface ActionDetails {
  readonly title?: string;
  readonly items: readonly string[];
}

/** One thing the user can do, shown as a button (`ui-action-button`). */
export interface Action {
  readonly label: string;
  readonly callback: () => void;
  readonly variant: ActionVariant;
  /** Shown in a popover while the button is hovered or focused. */
  readonly details?: ActionDetails;
  /** The button cannot be pressed (a change in flight, say). */
  readonly disabled?: boolean;
  /**
   * The declared outcomes a click can reach (epic qits-2000), which the button names in its
   * `data-qits-outcome` mark (`outcomeMark`). Recording them is the callback's business (`go()`,
   * `reach()`); the mark only names them. Left out, the button carries no mark.
   */
  readonly outcomes?: readonly Outcome[];
}

/** Actions shown as joined buttons. `title` names the group (its caption and `aria-label`). */
export interface ActionGroup {
  readonly title?: string;
  readonly actions: readonly Action[];
}

/** True for a group, false for a single action. */
export function isActionGroup(item: Action | ActionGroup): item is ActionGroup {
  return 'actions' in item;
}
