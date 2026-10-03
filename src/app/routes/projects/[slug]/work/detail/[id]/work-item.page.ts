import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { SelectedProject } from '$core/projects/selected-project';
import { SelectedWork } from '$core/work/selected-work';
import { workActions, type WorkActionGroupId, type WorkActionId } from '$core/work/work-actions';
import type { WorkEntry } from '$core/work/work.consumes';
import { WorkStore } from '$core/work/work.store';
import type { Action, ActionGroup, ActionVariant } from '$ui/components/action-button/action';
import { Spinner } from '$ui/components/spinner/spinner';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';

/** Each group's caption, shown below its buttons. */
const GROUP_TITLES: Readonly<Record<WorkActionGroupId, string>> = {
  agent: 'Agent',
  status: 'Status',
  plan: 'Plan',
};

/** Each action's label and look. */
const LOOKS: Readonly<Record<WorkActionId, { label: string; variant: ActionVariant }>> = {
  dispatch: { label: 'Dispatch', variant: 'success' },
  nextPhase: { label: 'Next phase', variant: 'muted' },
  markRefined: { label: 'Mark refined', variant: 'success' },
  drop: { label: 'Drop', variant: 'danger' },
  block: { label: 'Block', variant: 'muted' },
  edit: { label: 'Edit', variant: 'muted' },
  reshape: { label: 'Reshape', variant: 'muted' },
  refine: { label: 'Refine', variant: 'muted' },
};

/**
 * A press that does nothing yet. Each use names what the old UI (qits-projects-frontend's entity
 * page) does there.
 */
const notBuiltYet = (): void => undefined;

/**
 * One work item's page, at `/projects/<slug>/work/detail/<qualified id>`, reached from any card on
 * the board or in a list. Its title, and its actions by archetype and status (`workActions` in
 * `$core/work/work-actions.ts`).
 *
 * Wired: Mark refined and Drop for an epic or a ticket (`WorkStore.transition`). Every other press
 * is a placeholder for now (`notBuiltYet`); see `callbackOf`.
 */
@Component({
  selector: 'app-work-item-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageLayoutComponent, Spinner],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout [title]="title()" [actions]="actions()">
        <ui-spinner [state]="work.state()" class="min-h-48">
          <p class="m-0 text-sm text-charcoal-brown-600" [class.hidden]="!entry()">
            {{ facts() }}
          </p>
          <p
            class="m-0 text-sm text-charcoal-brown-600"
            [class.hidden]="work.state() !== 'loaded' || !!entry()"
          >
            This project has no work item {{ id() }}.
          </p>
        </ui-spinner>
      </app-page-layout>
    </div>
  `,
})
export class WorkItemPage {
  protected readonly work = inject(SelectedWork);
  private readonly selected = inject(SelectedProject);
  private readonly store = inject(WorkStore);

  /** The qualified id in the URL. */
  protected readonly id = toSignal(
    inject(ActivatedRoute).paramMap.pipe(map((params) => params.get('id') ?? '')),
    { initialValue: '' },
  );

  /** The work item the URL names, once the project's work is loaded. */
  protected readonly entry = computed(() =>
    this.work.entries().find((e) => e.qualifiedId === this.id()),
  );

  protected readonly title = computed(() => this.entry()?.title ?? this.id());

  protected readonly facts = computed(() => {
    const entry = this.entry();
    if (!entry) return '';
    const status = entry.status ? ` · ${entry.status.toLowerCase()}` : '';
    return `${entry.qualifiedId} · ${(entry.archetype ?? '').toLowerCase()}${status}`;
  });

  /** The actions for the item's archetype and status; a feature or task takes its epic's. */
  protected readonly actions = computed((): readonly ActionGroup[] => {
    const entry = this.entry();
    if (!entry) return [];
    const status = this.work.graph().statusOf(entry);
    return workActions(entry.archetype, status).map((group) => ({
      title: GROUP_TITLES[group.id],
      actions: group.actions.map((id) => this.action(id, entry)),
    }));
  });

  constructor() {
    this.work.followTransitions(inject(DestroyRef));
  }

  private action(id: WorkActionId, entry: WorkEntry): Action {
    const look = LOOKS[id];
    const label =
      id === 'dispatch' && entry.archetype === 'CAMPAIGN' ? 'Start campaign' : look.label;
    return { label, variant: look.variant, callback: this.callbackOf(id, entry) };
  }

  private callbackOf(id: WorkActionId, entry: WorkEntry): () => void {
    const projectId = this.selected.project()?.id;
    const lifecycle = entry.archetype === 'EPIC' || entry.archetype === 'TICKET';
    switch (id) {
      case 'markRefined':
      case 'drop':
        // TODO: a campaign moves through its own door (`POST /campaigns/{id}/transition`), which
        // has no recorded provider state and no pact yet.
        if (!lifecycle || !projectId) return notBuiltYet;
        return () =>
          void this.store.transition(projectId, entry, id === 'drop' ? 'DROPPED' : 'REFINED');
      case 'dispatch':
      case 'nextPhase':
        // TODO: `POST /entities/{id}/dispatch` with `{mode: FLOW}` (Dispatch, a campaign's start)
        // or `{mode: PHASE}` (Next phase); the old UI then links the workspace it stood up. Needs
        // a recorded provider state and a pact interaction first.
        return notBuiltYet;
      case 'block':
        // TODO: the old UI opens a form for the reason (required), then sends
        // `POST /entities/{id}/blocked` with `{blocked: true, reason}`; Unblock when blocked.
        return notBuiltYet;
      case 'edit':
        // TODO: the old UI opens a form (title, description; a ticket also impetus, type and
        // assignee) and saves a restatement of the row through `POST /entities/transition`.
        return notBuiltYet;
      case 'reshape':
        // TODO: the old UI opens the reshape panel (promote, demote, reparent), which also saves
        // through `POST /entities/transition`.
        return notBuiltYet;
      case 'refine':
        // TODO: the old UI opens the item's refinement room (`POST /entities/{id}/refinement`,
        // or the room there is) and goes to it.
        return notBuiltYet;
    }
  }
}
