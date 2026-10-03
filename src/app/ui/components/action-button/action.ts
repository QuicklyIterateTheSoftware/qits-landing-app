/** How an action looks: `success` confirms, `danger` destroys, `muted` is everything else. */
export type ActionVariant = 'success' | 'danger' | 'muted';

/** One thing the user can do, shown as a button (`ui-action-button`). */
export interface Action {
  readonly label: string;
  readonly callback: () => void;
  readonly variant: ActionVariant;
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
