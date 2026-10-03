import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  PLATFORM_ID,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { SelectedProject } from '$core/projects/selected-project';
import { SelectedWork } from '$core/work/selected-work';
import { ArchetypesStore } from '$core/work/archetypes.store';
import {
  lookOf,
  workActions,
  type WorkAction,
  type WorkActionGroupId,
} from '$core/work/work-actions';
import type { WorkEntry } from '$core/work/work.consumes';
import { WorkStore, type WorkStatus } from '$core/work/work.store';
import type { Action, ActionGroup } from '$ui/components/action-button/action';
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
 * the board or in a list. Its title, and its actions by archetype and status, from qits-projects'
 * archetype registry (`ArchetypesStore`, `workActions` in `$core/work/work-actions.ts`). Below, its children, drawn as the lists draw them, each linking to
 * its own page: a campaign's members in campaign order (with its description, as plain text), an
 * epic's features with their tasks, a feature's tasks (the feature as its row). A ticket or a task
 * has none. Everything comes from what `SelectedWork` loads already.
 *
 * Wired: every Status move (`WorkStore.transition`, the item's entry takes the answered status),
 * Dispatch (`WorkStore.dispatch`, the whole flow) and the next phase's button (that phase alone).
 * Every other press is a placeholder for now (`notBuiltYet`); see `callbackOf`.
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
  private readonly archetypes = inject(ArchetypesStore);

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

  /** The actions for the item's archetype and status, from the archetype registry. */
  protected readonly actions = computed((): readonly ActionGroup[] => {
    const entry = this.entry();
    if (!entry) return [];
    const registry = this.archetypes.of(entry.archetype);
    const status = this.work.graph().statusOf(entry);
    return workActions(registry, entry.archetype, status).map((group) => ({
      title: GROUP_TITLES[group.id],
      actions: group.actions.map((action) => this.action(action, entry)),
    }));
  });

  constructor() {
    this.work.followTransitions(inject(DestroyRef));
    // In the browser only, as the work: the server render has no session cookie to send.
    if (isPlatformBrowser(inject(PLATFORM_ID))) void this.archetypes.load();
  }

  private action(action: WorkAction, entry: WorkEntry): Action {
    return { ...lookOf(action), callback: this.callbackOf(action, entry) };
  }

  private callbackOf(action: WorkAction, entry: WorkEntry): () => void {
    const projectId = this.selected.project()?.id;
    switch (action.kind) {
      case 'move': {
        const target = action.move.to as WorkStatus | undefined;
        if (!projectId || !target) return notBuiltYet;
        return () => void this.store.transition(projectId, entry, target);
      }
      case 'dispatch':
        // TODO: the old UI then links the workspace the dispatch stood up.
        return () => void this.store.dispatch(entry, 'FLOW');
      case 'nextPhase':
        return () => void this.store.dispatch(entry, 'PHASE');
      case 'startCampaign':
        // TODO: `POST /entities/{id}/dispatch` starts a campaign, after asking twice ("Confirm
        // start campaign?"): that start authorises every ungated dispatch in the campaign. Needs a
        // recorded provider state and a pact interaction first. Interim: the registry serves no
        // campaign phases, so when it shows is `workActions`' own rule.
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
