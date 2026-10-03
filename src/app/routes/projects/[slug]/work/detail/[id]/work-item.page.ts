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
import { FeatureListRow } from '$patterns/work/feature-list-row/feature-list-row';
import { WorkList } from '$patterns/work/work-list/work-list';
import type { WorkNode } from '$core/work/work-tree';

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

/** What a work item's page draws below its header. */
interface Children {
  readonly kind: 'none' | 'members' | 'rows';
  readonly heading: string;
  readonly members: readonly WorkNode[];
  readonly rows: readonly WorkNode[];
}

/**
 * A press that does nothing yet. Each use names what the old UI (qits-projects-frontend's entity
 * page) does there.
 */
const notBuiltYet = (): void => undefined;

/**
 * One work item's page, at `/projects/<slug>/work/detail/<qualified id>`, reached from any card on
 * the board or in a list. Its title, and its actions by archetype and status (`workActions` in
 * `$core/work/work-actions.ts`). Below, its children, drawn as the lists draw them, each linking to
 * its own page: a campaign's members in campaign order (with its description, as plain text), an
 * epic's features with their tasks, a feature's tasks (the feature as its row). A ticket or a task
 * has none. Everything comes from what `SelectedWork` loads already.
 *
 * Wired: Mark refined and Drop for an epic or a ticket (`WorkStore.transition`). Every other press
 * is a placeholder for now (`notBuiltYet`); see `callbackOf`.
 */
@Component({
  selector: 'app-work-item-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageLayoutComponent, Spinner, WorkList, FeatureListRow],
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
          <p
            class="m-0 mt-4 max-w-[48rem] text-sm whitespace-pre-line text-charcoal-brown-800"
            [class.hidden]="!description()"
          >
            {{ description() }}
          </p>
          <section
            class="mt-8 flex-col gap-4"
            [class]="children().heading ? 'flex' : 'hidden'"
            [attr.aria-label]="children().heading || null"
          >
            <h2 class="m-0 text-base font-semibold text-charcoal-brown-900">
              {{ children().heading }}
            </h2>
            <app-work-list
              [class.hidden]="children().kind !== 'members'"
              [tree]="children().members"
              [base]="detailPath()"
              view="campaign"
            />
            <div
              class="flex-col gap-4 pr-6 [--lane-chin:--spacing(4)]"
              [class]="children().rows.length ? 'flex' : 'hidden'"
            >
              @for (row of children().rows; track row.entry.id) {
                <app-feature-list-row [node]="row" [base]="detailPath()" />
              }
            </div>
            <p
              class="m-0 text-sm text-charcoal-brown-500"
              [class.hidden]="children().kind !== 'rows' || children().rows.length"
            >
              Nothing here
            </p>
          </section>
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

  protected readonly detailPath = computed(
    () => `/projects/${this.selected.slug() ?? ''}/work/detail`,
  );

  /** A campaign's description, as recorded; empty for anything else. */
  protected readonly description = computed(() => {
    const entry = this.entry();
    if (entry?.archetype !== 'CAMPAIGN' || !entry.id) return '';
    return this.work.campaignDescriptions()[entry.id] ?? '';
  });

  /**
   * The item's children and how they are drawn: `members` (a campaign's, as the Campaigns page
   * draws them) or `rows` (an epic's features, or a feature itself, each with its tasks). `heading`
   * is empty for an item that has no children by kind (a ticket, a task).
   */
  protected readonly children = computed((): Children => {
    const entry = this.entry();
    const graph = this.work.graph();
    const none: Children = { kind: 'none', heading: '', members: [], rows: [] };
    switch (entry?.archetype) {
      case 'CAMPAIGN':
        return { ...none, kind: 'members', heading: 'Members', members: graph.membersOf(entry) };
      case 'EPIC':
        return { ...none, kind: 'rows', heading: 'Features', rows: graph.nodeOf(entry).children };
      case 'FEATURE':
        return { ...none, kind: 'rows', heading: 'Tasks', rows: [graph.nodeOf(entry)] };
      default:
        return none;
    }
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
        // or `{mode: PHASE}` (Next phase); the old UI then links the workspace it stood up. It asks
        // twice before a campaign's start ("Confirm start campaign?"): that start authorises every
        // ungated dispatch in the campaign. Needs a recorded provider state and a pact interaction
        // first. A campaign's start shows until VERIFIED (`workActions`), but the service starts a
        // campaign only from REFINED: interim, until the archetype registry says when.
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
