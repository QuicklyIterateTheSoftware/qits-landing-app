import { computed, inject, type Signal } from '@angular/core';
import { SelectedProject } from '$core/projects/selected-project';
import type { FinishButtonState } from '$ui/components/finish-button/finish-button';
import { finishable } from './work.consumes';
import { WorkStore } from './work.store';
import type { WorkNode } from './work-tree';

/** The finish button's state for one node, and what its click does. */
export interface FinishControl {
  /** A VERIFIED epic or ticket of the list's own phase (not context). */
  readonly shown: Signal<boolean>;
  readonly state: Signal<FinishButtonState>;
  /** Hides the item at once and moves it to DONE later, unless undone (`WorkStore.finishLater`). */
  finish(): void;
}

/**
 * The finish button of `node` in the Acceptance list, in the open project. Call it in an injection context
 * (a field initializer of the card that draws the button).
 */
export function finishControl(node: Signal<WorkNode>): FinishControl {
  const store = inject(WorkStore);
  const selected = inject(SelectedProject);
  return {
    shown: computed(() => !node().context && finishable(node().entry)),
    state: computed(() => {
      const id = node().entry.id;
      return (id && store.finishing()[id]) || 'idle';
    }),
    finish: () => {
      const projectId = selected.project()?.id;
      if (projectId) store.finishLater(projectId, node().entry);
    },
  };
}
