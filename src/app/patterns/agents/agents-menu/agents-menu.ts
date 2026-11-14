import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { exit, outcomes, QitsEntity, QitsEntityList, QitsExit, QitsField } from '@qits/angular';
import { ProjectReleaseRequests } from '$core/projects/project-release-requests';
import { SelectedProject } from '$core/projects/selected-project';
import { requestTone } from '$core/projects/release-requests';
import { lifecycleSummary, type SummaryPoint } from '$core/release-requests/release-lifecycle';
import {
  attentionAction,
  attentionCount,
  needsAttention,
  waitSubject,
  type AttentionAction,
  type WaitSubject,
} from '$core/workspaces/agent-attention';
import type { AgentWait, ProjectStatusAgent } from '$core/workspaces/agents.consumes';
import { itemDoneLabel } from '$core/workspaces/agent-labels';
import { OpenProjectWaits } from '$core/workspaces/open-project-waits';
import type { ProjectActiveAgents } from '$core/workspaces/project-active-agents';
import { chipClass, type ChipTone } from '$ui/components/chip/chip';
import { Dropdown } from '$ui/components/dropdown/dropdown';
import { LifecycleLine } from '$ui/components/lifecycle-line/lifecycle-line';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** An instant as the wall clock read it, `HH:mm`; empty for none or an unparseable one. */
export function clockTime(iso: string | null | undefined): string {
  const at = iso ? new Date(iso) : undefined;
  if (!at || Number.isNaN(at.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/**
 * Whole minutes from `since` to `now`, ` · N min` (` · <1 min` under one); empty for no instant or
 * an unparseable one.
 */
function elapsed(since: string | null | undefined, now: number): string {
  const at = since ? Date.parse(since) : NaN;
  if (Number.isNaN(at)) return '';
  const minutes = Math.floor((now - at) / 60_000);
  return minutes < 1 ? ' · <1 min' : ` · ${minutes} min`;
}

/**
 * The activity chip: what the agent is doing, in a word or three, and its tone.
 *
 * An ended session first. Then what proves the harness is up, whatever its phase reads: working,
 * waiting on its waits, its item done. Only then, while the agent comes up (qits-2007, `phase`),
 * where its start stands and for how long (`phaseSince`, whole minutes to `now`): queued for a
 * slot, its workspace provisioning, its session launching (a READY agent with no activity yet is
 * still launching too). Last: idle, since when it went idle. A READY agent shows Idle only on an
 * IDLE activity (or WAITING, the harness blocked on its user, which reads as idle here as it always
 * did). An agent with no phase (yielded, stopped, an older qits-workspaces) keeps the old fallback,
 * Idle on any activity.
 */
export function activityChip(
  agent: {
    readonly activity?: string | null;
    readonly entityStatus?: string | null;
    readonly waitingSince?: string | null;
    readonly waits?: readonly unknown[] | null;
    readonly phase?: string | null;
    readonly phaseSince?: string | null;
  },
  now = Date.now(),
): { readonly label: string; readonly tone: ChipTone } {
  if (agent.activity === 'ENDED') return { label: 'Ended', tone: 'neutral' };
  if (agent.activity === 'BUSY') return { label: 'Working', tone: 'ok' };
  if (agent.waits?.length) return { label: 'Waiting', tone: 'waiting' };
  const done = itemDoneLabel(agent.entityStatus);
  if (done) return { label: done.charAt(0).toUpperCase() + done.slice(1), tone: 'ok' };
  const phaseFor = elapsed(agent.phaseSince, now);
  if (agent.phase === 'QUEUED') {
    return { label: `Queued: waiting for a slot${phaseFor}`, tone: 'waiting' };
  }
  if (agent.phase === 'PROVISIONING') {
    return { label: `Starting: provisioning workspace${phaseFor}`, tone: 'waiting' };
  }
  if (agent.phase === 'STARTING') {
    return { label: `Starting: launching session${phaseFor}`, tone: 'waiting' };
  }
  // READY with no activity yet: the session is still coming up. `phaseSince` is when it turned
  // READY, not when the launch began, so no minutes.
  if (agent.phase && !agent.activity) {
    return { label: 'Starting: launching session', tone: 'waiting' };
  }
  const since = clockTime(agent.waitingSince);
  return { label: since ? `Idle since ${since}` : 'Idle', tone: 'neutral' };
}

/** A run's or an item's state as a chip tone: done, on its way, or stuck. */
function stateTone(state: string | undefined): ChipTone {
  switch (state) {
    case 'SUCCESS':
    case 'SUCCEEDED':
    case 'PASSED':
    case 'DONE':
    case 'VERIFIED':
    case 'IMPLEMENTED':
      return 'ok';
    case 'FAILED':
    case 'FAILURE':
    case 'ERROR':
    case 'CANCELLED':
    case 'REJECTED':
      return 'failed';
    case undefined:
    case '':
      return 'neutral';
    default:
      return 'waiting';
  }
}

/** One wait's line, with the request's lifecycle line when the project's requests hold it. */
interface WaitLine {
  readonly id: string;
  /** The wait as qits-workspaces listed it: the entity the line marks. */
  readonly wait: AgentWait;
  readonly subject: WaitSubject;
  readonly tone: ChipTone;
  readonly lifecycle?: readonly SummaryPoint[];
}

/**
 * The data marks of what a row shows (qits-2141), each derived from the fields of the agent or the
 * wait it marks. Bound as constants: what the template shows is the row's view of them
 * (`AgentMenuRow`, `WaitLine`), which names other paths than the agent's and the wait's own.
 */
const MARKS = {
  activity: {
    derived: ['activity', 'waits', 'entityStatus', 'phase', 'phaseSince', 'waitingSince'],
  },
  subject: {
    derived: ['subjectKind', 'subjectQualifiedId', 'subjectId', 'subjectRef', 'label'],
  },
  run: { derived: ['subjectKind', 'subjectId', 'subjectRef', 'label'] },
  subjectState: { derived: ['subjectKind', 'subjectState'] },
  request: { derived: ['subjectKind', 'subjectId', 'subjectQualifiedId', 'subjectRef'] },
  prompt: { derived: ['attention.code', 'attention.waitId', 'waits'] },
  openItem: { derived: ['attention.code', 'entityId'] },
} as const;

/** The agents' answer, as `LIST_PROJECT_ACTIVE_AGENTS` cuts it. */
type ActiveAgentsAnswer = NonNullable<ReturnType<ProjectActiveAgents['resource']['value']>>;

/** One agent's row. */
interface AgentMenuRow {
  readonly agent: ProjectStatusAgent;
  readonly activity: { readonly label: string; readonly tone: ChipTone };
  readonly waits: readonly WaitLine[];
  readonly blockedAt?: string;
  readonly action?: AttentionAction;
}

/**
 * The top bar's agents menu (epic qits-1681), beside the lightning menu: the open project's ACTIVE
 * agents (`agents`, the shell's `ProjectActiveAgents.resource`, qits-2146), each with its item
 * linked to the agent's page
 * (`agents/<agent id>`), an
 * activity chip (Queued / Starting while it comes up, with the minutes in that phase (qits-2007),
 * Working, Waiting, Done, awaiting acceptance / Done (qits-1776), Idle since HH:mm, Ended), a line
 * per open wait
 * (`waitSubject`: a request with its state and lifecycle line, a run, an item, comments, or the
 * wait's label), "Blocked since HH:mm" when its item is blocked (the work list carries no block
 * reason), and, when it needs a person (`needsAttention`), the attention's reason in the danger tone with
 * its action (`attentionAction`: Prompt agent → the agent page's Chat tab, Open item → the item,
 * or the overdue wait's subject). Shown only while a project is open, like the lightning menu;
 * with none open the dropdown is not rendered at all (ticket qits-2225), not just hidden: its
 * "All agents" link would be a trigger the page renders and no person can reach, which the
 * per-route outcome check counts against every project-less route.
 *
 * Rows needing a person come first, then the rest by `lastActivityAt`, newest first. The badge
 * counts the agents needing a person, in red; with none, the active agents, in amber; it is hidden
 * at none. The footer links "All agents" to the project's Agents page; it sits below the list's
 * spinner rather than in it, so it stays usable while the agents cannot be read (a refusal, an
 * error: the spinner's overlay covers only the list, qits-2225).
 *
 * The agents are read as soon as a project opens (`ProjectActiveAgents`, a root service: the
 * shell's trail names an agent from the same read), and again on each opening (`reload()`). The
 * shell hands the menu that service's resource and its load state; the menu reads nothing on its
 * own. A start-up chip's minutes are counted when the agents are read (no timer: the lint rule
 * keeps refresh timers in `core/events/`), so they move on the next read, an opening or a status
 * event. A wait's request comes from the project's release requests (`ProjectReleaseRequests`); an
 * item's status from the open project's work, when something has read it (else the wait's last
 * known state), both through `OpenProjectWaits`. Staleness (qits-1270): `AGENT_STATUS_EVENTS`
 * about the open project (its start-up's `AgentStarted` and `WorkspaceStarted` among them,
 * qits-2007) → its agents (the resource's `refreshOn`, debounced 1 s, see `ProjectActiveAgents`);
 * a request's gates follow `RELEASE_REQUEST_EVENTS` through `ProjectReleaseRequests`, an item's
 * status `WORK_EVENTS` wherever the work is followed. Every link closes the panel.
 *
 * What it shows carries the data marks (qits-2141): each row its agent (`qitsEntity`, by
 * `agentId`, from `agents`' read), each wait's line its wait (by `id`), each value its field or the
 * fields it is derived from (`qitsField`); the badge is derived from the list's `agents`. A wait's
 * state, its request's lifecycle and gates, and an item's words, may come from the project's
 * release requests or its work rather than the wait: the marks name the wait's fields only.
 *
 * Its links are declared exits (epic qits-2000), declared here rather than handed down from the
 * shell that draws the menu: like the shell's, a pattern's declarations are app-wide. The agent's
 * page (`open-menu-agent`); a wait's subject, one exit per kind (`open-menu-agent-wait`: its
 * release request, its work item, the item whose comments it waits on; a CI run is qits-ci's page,
 * a plain link); the attention's action (`act-on-menu-agent-attention`: Prompt agent → the Chat
 * tab, Open item → the item, an overdue release request → the request; an overdue run is a plain
 * link); and "All agents" (`open-all-agents`).
 */
@Component({
  selector: 'app-agents-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Dropdown, LifecycleLine, QitsEntity, QitsEntityList, QitsExit, QitsField, Spinner],
  // One display class or the other: a static display class would beat `hidden`.
  host: {
    '[class]': "projectId() ? 'inline-flex' : 'hidden'",
  },
  template: `
    @if (projectId()) {
      <ui-dropdown
        #menu
        label="Agents"
        panelLabel="The project's agents"
        panelId="agents-menu"
        (opened)="load()"
      >
        <svg
          dropdown-trigger
          viewBox="0 0 24 24"
          aria-hidden="true"
          class="size-5"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <rect x="4" y="8" width="16" height="12" rx="3" />
          <path d="M12 8V4" />
          <circle cx="12" cy="3.5" r="1" />
          <circle cx="9" cy="14" r="1" />
          <circle cx="15" cy="14" r="1" />
          <path d="M2 13v3M22 13v3" />
        </svg>
        <span
          dropdown-trigger
          class="absolute -top-0.5 -right-0.5 min-w-4 rounded-full px-1 text-[0.625rem] leading-4 font-semibold"
          [class]="
            (attention()
              ? 'bg-danger text-fg-on-accent'
              : 'bg-warning-soft text-warning-strong ring-1 ring-warning-line') +
            (count() ? '' : ' hidden')
          "
          aria-hidden="true"
          [qitsEntityList]="agents()"
          [fieldOf]="answer()"
          [qitsField]="{ derived: ['agents'] }"
          >{{ attention() || count() }}</span
        >
        <ui-spinner dropdown-panel [state]="state()" class="min-h-16">
          <ul class="m-0 list-none p-0" [qitsEntityList]="agents()">
            @for (row of rows(); track row.agent.agentId) {
              @let agent = row.agent;
              <li
                class="flex flex-col gap-1 border-b border-line-subtle px-3 py-2 last:border-b-0"
                [class]="row.action ? 'border-l-4 border-l-danger bg-danger-soft' : ''"
                [qitsEntity]="agent"
                entityKey="agentId"
              >
                <div class="flex items-baseline justify-between gap-2">
                  @if (slug() && agent.agentId; as agentId) {
                    <a
                      class="min-w-0 truncate text-sm text-fg no-underline hover:underline"
                      [qitsExit]="opening.agent"
                      [exitParams]="{ slug: slug(), agentId }"
                      (click)="menu.close()"
                      [fieldOf]="agent"
                      [qitsField]="{ derived: ['entityId', 'entityTitle'] }"
                      ><span class="font-semibold" [fieldOf]="agent" qitsField="entityId">{{
                        agent.entityId
                      }}</span>
                      {{ agent.entityTitle }}</a
                    >
                  } @else {
                    <span
                      class="min-w-0 truncate text-sm text-fg"
                      [fieldOf]="agent"
                      [qitsField]="{ derived: ['entityId', 'agentId', 'entityTitle'] }"
                      ><span class="font-semibold">{{ agent.entityId ?? agent.agentId }}</span>
                      {{ agent.entityTitle }}</span
                    >
                  }
                  <span
                    class="shrink-0 rounded px-1.5 text-[0.6875rem] leading-4 font-semibold whitespace-nowrap"
                    [class]="chip(row.activity.tone)"
                    data-activity
                    [fieldOf]="agent"
                    [qitsField]="marks.activity"
                    >{{ row.activity.label }}</span
                  >
                </div>
                @for (wait of row.waits; track wait.id) {
                  @let source = wait.wait;
                  <div
                    class="flex flex-col gap-0.5 text-[0.8125rem] text-fg-soft"
                    data-wait
                    [qitsEntity]="source"
                    entityKey="id"
                  >
                    <div class="flex items-baseline justify-between gap-2">
                      <span class="min-w-0 truncate">
                        <span class="text-fg-muted">waits on </span>
                        @switch (slug() && wait.subject.id ? wait.subject.kind : null) {
                          @case ('RELEASE_REQUEST') {
                            <a
                              class="text-fg"
                              [qitsExit]="waiting.releaseRequest"
                              [exitParams]="{ slug: slug(), requestId: wait.subject.id! }"
                              (click)="menu.close()"
                              [fieldOf]="source"
                              [qitsField]="marks.subject"
                              >{{ wait.subject.text }}</a
                            >
                          }
                          @case ('WORK_ITEM') {
                            <a
                              class="text-fg"
                              [qitsExit]="waiting.workItem"
                              [exitParams]="{ slug: slug(), id: wait.subject.id! }"
                              (click)="menu.close()"
                              [fieldOf]="source"
                              [qitsField]="marks.subject"
                              >{{ wait.subject.text }}</a
                            >
                          }
                          @case ('COMMENTS') {
                            <a
                              class="text-fg"
                              [qitsExit]="waiting.comments"
                              [exitParams]="{ slug: slug(), id: wait.subject.id! }"
                              (click)="menu.close()"
                              [fieldOf]="source"
                              [qitsField]="marks.subject"
                              >{{ wait.subject.text }}</a
                            >
                          }
                          @default {
                            @if (wait.subject.href; as href) {
                              <a
                                class="text-fg"
                                [href]="href"
                                (click)="menu.close()"
                                [fieldOf]="source"
                                [qitsField]="marks.run"
                                >{{ wait.subject.text }}</a
                              >
                            } @else {
                              <span class="text-fg" [fieldOf]="source" [qitsField]="marks.run">{{
                                wait.subject.text
                              }}</span>
                            }
                          }
                        }
                      </span>
                      @if (wait.subject.state; as state) {
                        <span
                          class="shrink-0 rounded px-1.5 text-[0.6875rem] leading-4 font-semibold whitespace-nowrap"
                          [class]="chip(wait.tone)"
                          [fieldOf]="source"
                          [qitsField]="marks.subjectState"
                          >{{ state }}</span
                        >
                      }
                    </div>
                    @if (wait.lifecycle; as points) {
                      <ui-lifecycle-line
                        [points]="points"
                        [spread]="true"
                        [fieldOf]="source"
                        [qitsField]="marks.request"
                      />
                    } @else if (wait.subject.gates?.length) {
                      <span
                        class="flex flex-wrap gap-1"
                        [fieldOf]="source"
                        [qitsField]="marks.request"
                      >
                        @for (gate of wait.subject.gates; track $index) {
                          <span
                            class="rounded px-1.5 text-[0.6875rem] leading-4 font-semibold"
                            [class]="chip(tone(gate.state))"
                            >{{ gate.kind }} {{ gate.state }}</span
                          >
                        }
                      </span>
                    }
                  </div>
                }
                @if (row.blockedAt !== undefined) {
                  <span
                    class="text-[0.8125rem] text-fg-soft"
                    data-blocked
                    [fieldOf]="agent"
                    [qitsField]="{ derived: ['entityBlocked', 'blockedAt'] }"
                    >{{ row.blockedAt ? 'Blocked since ' + row.blockedAt : 'Blocked' }}</span
                  >
                }
                @if (row.action; as action) {
                  <div
                    class="flex flex-wrap items-baseline gap-x-2 text-[0.8125rem]"
                    data-attention
                  >
                    <span class="text-danger" [fieldOf]="agent" qitsField="attention.reason">{{
                      agent.attention?.reason
                    }}</span>
                    @switch (action.kind) {
                      @case ('prompt') {
                        @if (slug() && agent.agentId; as agentId) {
                          <a
                            class="font-semibold text-fg"
                            [qitsExit]="acting.prompt"
                            [exitParams]="{ slug: slug(), agentId }"
                            (click)="menu.close()"
                            [fieldOf]="agent"
                            [qitsField]="marks.prompt"
                            data-action
                            >{{ action.label }}</a
                          >
                        }
                      }
                      @case ('open-item') {
                        @if (slug() && action.itemId; as id) {
                          <a
                            class="font-semibold text-fg"
                            [qitsExit]="acting.openItem"
                            [exitParams]="{ slug: slug(), id }"
                            (click)="menu.close()"
                            [fieldOf]="agent"
                            [qitsField]="marks.openItem"
                            data-action
                            >{{ action.label }}</a
                          >
                        }
                      }
                      @case ('subject') {
                        @if (
                          slug() && action.subject.kind === 'RELEASE_REQUEST' && action.subject.id;
                          as requestId
                        ) {
                          <a
                            class="font-semibold text-fg"
                            [qitsExit]="acting.overdueRequest"
                            [exitParams]="{ slug: slug(), requestId }"
                            (click)="menu.close()"
                            [fieldOf]="agent"
                            [qitsField]="marks.prompt"
                            data-action
                            >{{ action.label }}</a
                          >
                        } @else if (action.subject.href; as href) {
                          <a
                            class="font-semibold text-fg"
                            [href]="href"
                            (click)="menu.close()"
                            [fieldOf]="agent"
                            [qitsField]="marks.prompt"
                            data-action
                            >{{ action.label }}</a
                          >
                        }
                      }
                    }
                  </div>
                }
              </li>
            }
          </ul>
          <p
            class="m-0 px-3 py-4 text-center text-sm text-fg-muted"
            [class.hidden]="state() !== 'loaded' || rows().length > 0"
          >
            No active agents
          </p>
        </ui-spinner>
        <!-- Below the spinner, not in it: its error overlay would cover the link (qits-2225). -->
        <a
          dropdown-panel
          class="block border-t border-line-subtle px-3 py-2 text-center text-sm font-semibold text-fg-soft no-underline hover:bg-surface-subtle"
          [qitsExit]="all.agents"
          [exitParams]="{ slug: slug() }"
          (click)="menu.close()"
          >All agents</a
        >
      </ui-dropdown>
    }
  `,
})
export class AgentsMenu {
  /** The open project's ACTIVE agents: the shell's `ProjectActiveAgents.resource`. */
  readonly agents = input.required<ProjectActiveAgents['resource']>();

  /** How the agents' read stands, as the shell's resource says it. */
  readonly state = input<LoadState>('loading');

  protected readonly marks = MARKS;

  private readonly selected = inject(SelectedProject);
  private readonly releaseRequests = inject(ProjectReleaseRequests);
  private readonly waits = inject(OpenProjectWaits);

  /** The open project's id, once the list holds it. */
  protected readonly projectId = computed(() => this.selected.project()?.id);

  /** The open project's slug, the exits' param. */
  protected readonly slug = computed(() => this.selected.slug() ?? '');

  /** An agent's item, linked to the agent's page (epic qits-2000). */
  protected readonly opening = outcomes('open-menu-agent', {
    agent: exit('projects/:slug/agents/:agentId'),
  });

  /** A wait's subject, one exit per kind that has a page here (epic qits-2000). */
  protected readonly waiting = outcomes('open-menu-agent-wait', {
    releaseRequest: exit('projects/:slug/release-requests/:requestId'),
    workItem: exit('projects/:slug/work/detail/:id'),
    comments: exit('projects/:slug/work/detail/:id'),
  });

  /** What to do about an agent's attention, one exit per action (epic qits-2000). */
  protected readonly acting = outcomes('act-on-menu-agent-attention', {
    prompt: exit('projects/:slug/agents/:agentId/chat'),
    openItem: exit('projects/:slug/work/detail/:id'),
    overdueRequest: exit('projects/:slug/release-requests/:requestId'),
  });

  /** The footer's "All agents" (epic qits-2000). */
  protected readonly all = outcomes('open-all-agents', {
    agents: exit('projects/:slug/agents'),
  });

  /** The agents' answer, once read; an empty one before. */
  protected readonly answer = computed((): ActiveAgentsAnswer => {
    const read = this.agents();
    return (read.hasValue() ? read.value() : undefined) ?? { agents: [] };
  });

  private readonly listed = computed(
    (): readonly ProjectStatusAgent[] => this.answer().agents ?? [],
  );

  /** The agents needing a person first, then by their last activity, newest first. */
  protected readonly rows = computed((): readonly AgentMenuRow[] => {
    const ctx = this.waits.context();
    const requests = this.releaseRequests.requests();
    const time = (agent: ProjectStatusAgent) => Date.parse(agent.lastActivityAt ?? '') || 0;
    const sorted = [...this.listed()].sort(
      (a, b) => Number(needsAttention(b)) - Number(needsAttention(a)) || time(b) - time(a),
    );
    return sorted.map((agent) => {
      return {
        agent,
        activity: activityChip(agent),
        waits: (agent.waits ?? []).map((wait, index) => {
          const subject = waitSubject(wait, ctx);
          const request =
            wait.subjectKind === 'RELEASE_REQUEST'
              ? requests.find(
                  (r) =>
                    (!!r.id && (r.id === wait.subjectId || r.id === wait.subjectRef)) ||
                    (!!r.qualifiedId &&
                      (r.qualifiedId === wait.subjectQualifiedId ||
                        r.qualifiedId === wait.subjectRef)),
                )
              : undefined;
          return {
            id: wait.id ?? String(index),
            wait,
            subject,
            tone:
              subject.kind === 'RELEASE_REQUEST'
                ? requestTone(subject.state)
                : stateTone(subject.state),
            lifecycle: request ? lifecycleSummary(request) : undefined,
          };
        }),
        blockedAt: agent.entityBlocked ? clockTime(agent.blockedAt) : undefined,
        action: attentionAction(agent, ctx),
      };
    });
  });

  /** How many agents need a person: the badge shows these, in red, when there are any. */
  protected readonly attention = computed(() => attentionCount(this.listed()));

  /** How many agents are active, once read; undefined before. */
  protected readonly count = computed(() =>
    this.state() === 'loaded' ? this.listed().length : undefined,
  );

  protected chip(tone: ChipTone): string {
    return chipClass(tone);
  }

  protected tone(state: string | undefined): ChipTone {
    return stateTone(state);
  }

  /** On each opening: the open project's agents again. */
  protected load(): void {
    if (this.projectId() !== undefined) this.agents().reload();
  }
}
