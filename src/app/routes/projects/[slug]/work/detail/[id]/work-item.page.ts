import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  PLATFORM_ID,
  untracked,
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
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import { CampaignDetail } from '$patterns/work/detail/campaign-detail/campaign-detail';
import { EpicDetail } from '$patterns/work/detail/epic-detail/epic-detail';
import { FeatureDetail } from '$patterns/work/detail/feature-detail/feature-detail';
import { TaskDetail } from '$patterns/work/detail/task-detail/task-detail';
import { TicketDetail } from '$patterns/work/detail/ticket-detail/ticket-detail';
import { WorkDetailStore } from '$core/work/work-detail.store';
import { WorkspacesStore } from '$core/workspaces/workspaces.store';
import { WorkWorkspaces } from '$patterns/work/detail/work-workspaces/work-workspaces';

/** Each group's caption, shown below its buttons. */
const GROUP_TITLES: Readonly<Record<WorkActionGroupId, string>> = {
  agent: 'Agent',
  status: 'Status',
  plan: 'Plan',
};

/**
 * A press that does nothing yet. Each use names what the old UI (qits-projects-frontend's entity
 * page) does there.
 */
const notBuiltYet = (): void => undefined;

/**
 * One work item's page, at `/projects/<slug>/work/detail/<qualified id>`, reached from any card on
 * the board or in a list. Its title, and its actions by archetype and status, from qits-projects'
 * archetype registry (`ArchetypesStore`, `workActions` in `$core/work/work-actions.ts`). Below, a
 * body of its own per archetype (`$patterns/work/detail/`): the description (Markdown), the
 * archetype's facts, its children as the lists draw them, its dossier and its comments. The item
 * comes from what `SelectedWork` loads; the rest from `WorkDetailStore`, by the URL's qualified id.
 * Last, the item's workspaces in every state, newest first (`WorkspacesStore.loadHistory`, by the
 * item's id); the page also loads the open workspaces once, for its cards' Workspace links.
 *
 * Wired: every Status move (`WorkStore.transition`, the item's entry takes the answered status),
 * Dispatch (`WorkStore.dispatch`, the whole flow) and the next phase's button (that phase alone).
 * Every other press is a placeholder for now (`notBuiltYet`); see `callbackOf`.
 *
 * The body is picked with `@switch`: which archetype it is is known only in the browser (the server
 * loads no work), so the server render and the browser's first render both draw none.
 */
@Component({
  selector: 'app-work-item-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PageLayoutComponent,
    Spinner,
    CampaignDetail,
    EpicDetail,
    FeatureDetail,
    TaskDetail,
    TicketDetail,
    WorkWorkspaces,
  ],
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
          <ui-spinner [state]="detailState()" class="mt-6 min-h-24" [class.hidden]="!entry()">
            @if (entry(); as entry) {
              @switch (entry.archetype) {
                @case ('EPIC') {
                  <app-epic-detail [entry]="entry" [detail]="detail()" [base]="detailPath()" />
                }
                @case ('FEATURE') {
                  <app-feature-detail [entry]="entry" [detail]="detail()" [base]="detailPath()" />
                }
                @case ('TASK') {
                  <app-task-detail [entry]="entry" [detail]="detail()" [base]="detailPath()" />
                }
                @case ('TICKET') {
                  <app-ticket-detail [entry]="entry" [detail]="detail()" [base]="detailPath()" />
                }
                @case ('CAMPAIGN') {
                  <app-campaign-detail [entry]="entry" [detail]="detail()" [base]="detailPath()" />
                }
              }
            }
          </ui-spinner>
          <app-work-workspaces
            class="mt-8"
            [class.hidden]="!entry()"
            [workspaces]="history()?.entries ?? []"
            [state]="history()?.status ?? 'loading'"
            [link]="workspaceLink()"
          />
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
  private readonly details = inject(WorkDetailStore);
  private readonly workspaces = inject(WorkspacesStore);

  /** The qualified id in the URL. */
  protected readonly id = toSignal(
    inject(ActivatedRoute).paramMap.pipe(map((params) => params.get('id') ?? '')),
    { initialValue: '' },
  );

  /** The work item the URL names, once the project's work is loaded. */
  protected readonly entry = computed(() =>
    this.work.entries().find((e) => e.qualifiedId === this.id()),
  );

  /** The item's own data (description, facts, dossier, comments), once it is loaded. */
  protected readonly detail = computed(() => this.details.of(this.id()));

  protected readonly detailState = computed((): LoadState => this.detail()?.status ?? 'loading');

  /** The item's id: a signal of its own, so a new entry for the same item reads nothing again. */
  private readonly entryId = computed(() => this.entry()?.id);

  /** The item's workspaces, once they are loaded. */
  protected readonly history = computed(() => {
    const id = this.entryId();
    return id ? this.workspaces.historyOf(id) : undefined;
  });

  protected readonly workspaceLink = computed(
    () => `/projects/${this.selected.slug() ?? ''}/workspaces/${this.id()}`,
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
    const destroy = inject(DestroyRef);
    this.work.followTransitions(destroy);
    // In the browser only, as the work: the server render has no session cookie to send.
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      void this.archetypes.load();
      void this.workspaces.load();
      this.workspaces.follow(destroy);
      effect(() => {
        const id = this.id();
        if (id) untracked(() => void this.details.load(id));
      });
      // By the item's id, which qits-workspaces binds a workspace to: known once the work is.
      effect(() => {
        const id = this.entryId();
        if (id) untracked(() => void this.workspaces.loadHistory(id));
      });
    }
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
