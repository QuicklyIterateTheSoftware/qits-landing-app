import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { qitsResource, type QitsDomainEvent } from '@qits/angular';
import { SelectedProject } from '$core/projects/selected-project';
import { payloadField, payloadIds } from '$core/events/refresh-on';
import { PlatformOrigins } from '$core/platform/platform-origins';
import { loadState } from '$core/resources/load-state';
import { Archetypes } from '$core/work/archetypes';
import type { WorkStatus } from '$core/work/moves';
import { COMMENT_EVENTS, SelectedWork, WORK_EVENTS } from '$core/work/selected-work';
import {
  lookOf,
  workActions,
  type WorkAction,
  type WorkActionGroupId,
} from '$core/work/work-actions';
import type { WorkEntry } from '$core/work/work.consumes';
import { detailState, figuresOf } from '$core/work/work-detail';
import {
  WORK_COMMENTS,
  WORK_DETAIL,
  WORK_DOSSIER,
  WORK_DOSSIER_ASSETS,
} from '$core/work/work-detail.operations';
import { WorkMoves } from '$core/work/work-moves';
import { WrapperClosings } from '$core/work/wrapper-closings';
import type { Action, ActionGroup } from '$ui/components/action-button/action';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import { EpicDetail } from '$patterns/work/detail/epic-detail/epic-detail';
import { FeatureDetail } from '$patterns/work/detail/feature-detail/feature-detail';
import { TaskDetail } from '$patterns/work/detail/task-detail/task-detail';
import { TicketDetail } from '$patterns/work/detail/ticket-detail/ticket-detail';
import { WorkDrop } from '$patterns/work/detail/work-drop/work-drop';
import {
  ACTIVE_AGENT_EVENTS,
  concerns,
  WORKSPACE_REFRESH_DEBOUNCE_MS,
} from '$core/workspaces/workspace-events';
import { WorkspaceActivity } from '$core/workspaces/workspace-activity';
import { WORK_ITEM_WORKSPACES } from '$core/workspaces/workspaces.operations';
import { WorkWorkspaces } from '$patterns/work/detail/work-workspaces/work-workspaces';
import { WorkInspiration } from '$patterns/ideas/work-inspiration/work-inspiration';
import { WorkNeedsBadge } from '$patterns/work/work-needs/work-needs-badge';
import { WorkNeedsPanel } from '$patterns/work/work-needs/work-needs-panel';
import { WrapperClosingLine } from '$patterns/work/wrapper-closing/wrapper-closing';

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
 * archetype registry (`Archetypes`, `workActions` in `$core/work/work-actions.ts`). Below, a
 * body of its own per archetype (`$patterns/work/detail/`): the description (Markdown), the
 * archetype's facts, its children as the lists draw them, its dossier and its comments. The item
 * comes from what `SelectedWork` reads; the rest from the page's own `qitsResource`s (qits-2146),
 * by the URL's qualified id: the item (`WORK_DETAIL`), its thread (`WORK_COMMENTS`) and, as its
 * archetype calls for, its dossier (`WORK_DOSSIER`; an epic's figures too, `WORK_DOSSIER_ASSETS`),
 * handed to the body, which marks what it shows. Any of them failing fails the body.
 * Beside its id, archetype and status, its "needs" badge while it needs an item not at its status
 * yet (`app-work-needs`, epic qits-1899), apart from the Blocked fact and an agent's wait; a
 * VERIFIED ticket's line on how it will close, after them (`app-wrapper-closing`, qits-1873: the
 * line its card shows in the lists, from the project's wrapper closings); below the body, for every
 * archetype but an issue, what it needs, added and removed there (`app-work-needs-panel`, a
 * `patchWork` of the whole `needs` list), after which its own read and the project's work are read
 * again. The panel takes the needs of the item's own read once in, else the project's work's, so
 * it shows even when one of the item's own reads fails (the body then shows "Failed to load").
 * Below the body, the item's inspiration (`app-work-inspiration`, epic qits-888, every archetype as
 * of qits-1792): "Inspired by <idea title>" linking the idea, set or cleared there (`patchWork`),
 * after which the item's own read is read again.
 * Last, the item's workspaces in every state, newest first (`WORK_ITEM_WORKSPACES`, by the item's
 * id); the page also wants the open workspaces (`WorkWorkspaces`), for its cards' Workspace links.
 *
 * Wired, through `WorkMoves` (`qitsMutation`): every Status move (`transition`, the item's entry
 * takes the answered status; "Close as done", a CLOSE move, shows only while every direct child is
 * DONE or DROPPED: an epic's features or a feature's tasks as `SelectedWork`'s graph holds them),
 * Dispatch (`dispatch`, the whole flow) and the next phase's button (that phase alone).
 * Drop opens its own form instead of moving at once (`app-work-drop`, qits-248): it asks for the
 * outcome and, where the outcome needs one, a reference, then sends `WorkMoves.drop`. Every other
 * press is a placeholder for now (`notBuiltYet`); see `callbackOf`.
 *
 * Staleness (qits-1270): `EntityTransitioned` naming the open project → the project's work
 * (`SelectedWork.followTransitions`: the item's status, its children, its actions); naming this
 * item among its `entities[].entityId` → the item's own reads (each resource's `refreshOn`: its
 * started/implemented times move with its status). `EntityCommented` naming this item as its
 * `entityId` → the same reads, which bring the new comment (qits-1660). A needed item's move is an
 * `EntityTransitioned` naming that item, not this one: the project's work follows it (the badge),
 * and the item's own read (the panel's met marks) is read again on the next visit or edit. A
 * child's or the parent's move changes only their rows in the work, which the first read again
 * reads. qits-projects sends no event for a comment's edit, a dossier page or figure, an edit of the
 * item's fields (description, criteria, assignee, needs…), or a block or unblock: those show on the
 * next visit.
 * The wrapper closings a VERIFIED ticket's line reads follow their events through
 * `WrapperClosings.follow` (qits-1873; see there).
 * `AgentPlaced`, `AgentRequeued`, `AgentObsolete`, `AgentRemoved` naming this item's `workId` →
 * the item's workspaces (the resource's `refreshOn`); any of them → the open workspaces
 * (`WorkspaceActivity.follow`). An agent's creation is not announced: a queued agent's row shows once
 * it is placed.
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
    EpicDetail,
    FeatureDetail,
    TaskDetail,
    TicketDetail,
    WorkDrop,
    WorkInspiration,
    WorkNeedsBadge,
    WorkNeedsPanel,
    WorkWorkspaces,
    WrapperClosingLine,
  ],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout [title]="title()" [actions]="actions()">
        @if (dropping(); as entry) {
          <app-work-drop
            class="mb-6"
            [projectId]="projectId()"
            [entry]="entry"
            (dropped)="dropping.set(null)"
            (cancelled)="dropping.set(null)"
          />
        }
        <ui-spinner [state]="work.state()" class="min-h-48">
          <p
            class="m-0 flex-wrap items-center gap-2 text-sm text-fg-soft"
            [class]="entry() ? 'flex' : 'hidden'"
          >
            <span>{{ facts() }}</span>
            <app-work-needs [needs]="needs()" [unmet]="unmetNeeds()" />
            @if (closesAutomatically()) {
              <app-wrapper-closing [qualifiedId]="id()" />
            }
          </p>
          <p
            class="m-0 text-sm text-fg-soft"
            [class.hidden]="work.state() !== 'loaded' || !!entry()"
          >
            This project has no work item {{ id() }}.
          </p>
          <ui-spinner [state]="detailState()" class="mt-6 min-h-24" [class.hidden]="!entry()">
            @if (entry(); as entry) {
              @switch (entry.archetype) {
                @case ('EPIC') {
                  <app-epic-detail
                    [entry]="entry"
                    [item]="item"
                    [comments]="comments"
                    [pages]="pages"
                    [figures]="figures()"
                  />
                }
                @case ('FEATURE') {
                  <app-feature-detail [entry]="entry" [item]="item" [comments]="comments" />
                }
                @case ('TASK') {
                  <app-task-detail [entry]="entry" [item]="item" [comments]="comments" />
                }
                @case ('TICKET') {
                  <app-ticket-detail
                    [entry]="entry"
                    [item]="item"
                    [comments]="comments"
                    [pages]="pages"
                  />
                }
                @case ('ISSUE') {
                  <app-ticket-detail
                    [entry]="entry"
                    [item]="item"
                    [comments]="comments"
                    [pages]="pages"
                  />
                }
              }
            }
          </ui-spinner>
          @if (entry(); as entry) {
            <!-- From the project's work until the item's own data is in, and if that fails (a
                 dossier read refused, say): the needs do not depend on it. -->
            @if (entry.archetype !== 'ISSUE') {
              <app-work-needs-panel
                class="mt-6"
                [qualifiedId]="id()"
                [needs]="needs()"
                (changed)="needsChanged()"
              />
            }
            @if (entity(); as entity) {
              <app-work-inspiration
                class="mt-6"
                [slug]="slug()"
                [projectId]="projectId()"
                [qualifiedId]="id()"
                [archetype]="entry.archetype"
                [inspiredBy]="entity.inspiredBy"
                (changed)="inspirationChanged()"
              />
            }
          }
          <app-work-workspaces
            class="mt-8"
            [class.hidden]="!entry()"
            [workspaces]="history"
            [state]="historyState()"
            [slug]="slug()"
            [qualifiedId]="id()"
          />
        </ui-spinner>
      </app-page-layout>
    </div>
  `,
})
export class WorkItemPage {
  protected readonly work = inject(SelectedWork);
  private readonly selected = inject(SelectedProject);
  private readonly moves = inject(WorkMoves);
  private readonly archetypes = inject(Archetypes);
  private readonly origins = inject(PlatformOrigins);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** The qualified id in the URL. */
  protected readonly id = toSignal(
    inject(ActivatedRoute).paramMap.pipe(map((params) => params.get('id') ?? '')),
    { initialValue: '' },
  );

  /** The work item the URL names, once the project's work is loaded. */
  protected readonly entry = computed(() =>
    this.work.entries().find((e) => e.qualifiedId === this.id()),
  );

  /** The item's id: a signal of its own, so a new entry for the same item reads nothing again. */
  private readonly entryId = computed(() => this.entry()?.id);

  /**
   * The item's own reads' staleness: `EntityTransitioned` naming it among its `entities[].entityId`,
   * or `EntityCommented` naming it as its `entityId` (qits-1660).
   */
  private readonly itemEvents = {
    names: [...WORK_EVENTS, ...COMMENT_EVENTS],
    when: (event: QitsDomainEvent) => {
      const id = this.entryId();
      return (
        !!id && (payloadIds(event).workIds.includes(id) || payloadField(event, 'entityId') === id)
      );
    },
  };

  /** The URL's qualified id as the item's reads take it; in the browser only. */
  private readonly ref = computed(() => {
    const qualifiedId = this.browser ? this.id() : '';
    return qualifiedId ? { path: { qualifiedId } } : undefined;
  });

  /** The item itself (description, facts, needs, inspiration). */
  protected readonly item = qitsResource(WORK_DETAIL, () => this.ref(), {
    refreshOn: this.itemEvents,
  });

  /** Its thread. */
  protected readonly comments = qitsResource(WORK_COMMENTS, () => this.ref(), {
    refreshOn: this.itemEvents,
  });

  /** The item's archetype as its own read says it: the dossier's reads wait for it. */
  private readonly archetype = computed(() => this.entity()?.archetype);

  /** The item as read; none until it is in, and after a failed read. */
  protected readonly entity = computed(() =>
    this.item.hasValue() ? this.item.value() : undefined,
  );

  /** An epic's or a ticket's dossier pages. */
  protected readonly pages = qitsResource(
    WORK_DOSSIER,
    () => {
      const archetype = this.archetype();
      return archetype === 'EPIC' || archetype === 'TICKET' ? this.ref() : undefined;
    },
    { refreshOn: this.itemEvents },
  );

  /** An epic's dossier figures. */
  private readonly assets = qitsResource(
    WORK_DOSSIER_ASSETS,
    () => (this.archetype() === 'EPIC' ? this.ref() : undefined),
    { refreshOn: this.itemEvents },
  );

  /** Where each figure the epic's pages name loads from. */
  protected readonly figures = computed(() =>
    figuresOf(
      this.origins.api('projects'),
      this.id(),
      (this.assets.hasValue() ? this.assets.value()?.assets : undefined) ?? [],
    ),
  );

  /**
   * The body's state: loading until the item, its thread and the dossier its archetype calls for
   * are read; any failed read fails the whole body, as one read did.
   */
  protected readonly detailState = computed(() =>
    detailState(this.item, this.comments, this.pages, this.assets),
  );

  /** The item's workspaces in every state, by the item's id (known once the work is). */
  protected readonly history = qitsResource(
    WORK_ITEM_WORKSPACES,
    () => {
      const workRef = this.entryId();
      return workRef ? { path: { workRef } } : undefined;
    },
    {
      refreshOn: {
        names: ACTIVE_AGENT_EVENTS,
        when: (event) => concerns(event, { workId: this.entryId() }),
        debounceMs: WORKSPACE_REFRESH_DEBOUNCE_MS,
      },
    },
  );

  protected readonly historyState = computed(() => loadState(this.history));

  protected readonly title = computed(() => this.entry()?.title ?? this.id());

  protected readonly facts = computed(() => {
    const entry = this.entry();
    if (!entry) return '';
    const status = entry.status ? ` · ${entry.status.toLowerCase()}` : '';
    return `${entry.qualifiedId} · ${(entry.archetype ?? '').toLowerCase()}${status}`;
  });

  /**
   * Whether the item is a VERIFIED ticket, which closes on its own (qits-150): its facts then say
   * how its wrapper closing stands (qits-1873).
   */
  protected readonly closesAutomatically = computed(() => {
    const entry = this.entry();
    return entry?.archetype === 'TICKET' && entry.status === 'VERIFIED';
  });

  /** The open project's slug, for the inspiration's link to its idea and the workspaces' links. */
  protected readonly slug = computed(() => this.selected.slug() ?? '');

  /**
   * What the item needs: its own read's once read (it follows the panel's edits at once), else the
   * project's work's.
   */
  protected readonly needs = computed(() => this.entity()?.needs ?? this.entry()?.needs ?? []);

  /** How many of them are not met, from the same read as {@link needs}. */
  protected readonly unmetNeeds = computed(() => {
    const entity = this.entity();
    return entity ? entity.unmetNeeds : this.entry()?.unmetNeeds;
  });

  /**
   * The Needs panel's write went through: the item's own read and the project's work hold its
   * needs, so both are read again (no event follows the edit, and the answer omits the needs).
   */
  protected needsChanged(): void {
    this.item.reload();
    this.work.reload();
  }

  /** The item's inspiration changed: its own read holds `inspiredBy`, so it is read again. */
  protected inspirationChanged(): void {
    this.item.reload();
  }

  /** The open project's id, for `WorkMoves.drop` (and every other write the page makes). */
  protected readonly projectId = computed(() => this.selected.project()?.id ?? '');

  /** The item the Drop form is open for; null while it is closed. */
  protected readonly dropping = signal<WorkEntry | null>(null);

  /** The actions for the item's archetype and status, from the archetype registry. */
  protected readonly actions = computed((): readonly ActionGroup[] => {
    const entry = this.entry();
    if (!entry) return [];
    const registry = this.archetypes.of(entry.archetype);
    const graph = this.work.graph();
    const status = graph.statusOf(entry);
    // A CLOSE move's gate reads the direct children (qits-1757): the item's children in the work
    // tree (an epic's features, a feature's tasks), by their own status.
    const children = graph.nodeOf(entry).children.map((child) => child.entry.status);
    return workActions(registry, entry.archetype, status, children).map((group) => ({
      title: GROUP_TITLES[group.id],
      actions: group.actions.map((action) => this.action(action, entry)),
    }));
  });

  constructor() {
    const destroy = inject(DestroyRef);
    this.work.followTransitions(destroy);
    inject(WrapperClosings).follow(destroy);
    // In the browser only, as the work: the server render holds no token to send.
    if (this.browser) {
      this.archetypes.want();
      const workspaces = inject(WorkspaceActivity);
      workspaces.wantOpen();
      workspaces.follow(destroy);
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
        // DROP opens its own form (the outcome, and its reference) instead of moving at once;
        // `app-work-drop` sends it (qits-248).
        if (action.move.kind === 'DROP') return () => this.dropping.set(entry);
        return () => void this.moves.transition(projectId, entry, target);
      }
      case 'dispatch':
        // TODO: the old UI then links the workspace the dispatch stood up.
        return () => void this.moves.dispatch(entry, 'FLOW');
      case 'nextPhase':
        return () => void this.moves.dispatch(entry, 'PHASE');
      case 'block':
        // TODO: the old UI opens a form for the reason (required), then sends
        // `POST /work/{qualifiedId}/blocked` with `{blocked: true, reason}`; Unblock when blocked.
        return notBuiltYet;
      case 'edit':
        // TODO: the old UI opens a form (title, description; a ticket also impetus, type and
        // assignee) and saves a restatement of the row through `PUT /work/{qualifiedId}`.
        return notBuiltYet;
      case 'reshape':
        // TODO: the old UI opens the reshape panel (promote, demote, reparent), which also saves
        // through `POST /work/transition`.
        return notBuiltYet;
      case 'refine':
        // TODO: the old UI opens the item's refinement room (`POST /work/{qualifiedId}/refinement`,
        // or the room there is) and goes to it.
        return notBuiltYet;
    }
  }
}
