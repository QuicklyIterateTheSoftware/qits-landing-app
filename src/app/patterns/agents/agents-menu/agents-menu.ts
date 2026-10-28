import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { PlatformOrigins } from '$core/platform/platform-origins';
import { ProjectsStore } from '$core/projects/projects.store';
import { SelectedProject } from '$core/projects/selected-project';
import type { ReleaseRequestEntry } from '$core/projects/projects.consumes';
import { requestTone } from '$core/projects/release-requests';
import { lifecycleSummary, type SummaryPoint } from '$core/release-requests/release-lifecycle';
import { WorkStore } from '$core/work/work.store';
import {
  attentionAction,
  attentionCount,
  needsAttention,
  waitSubject,
  workItemPath,
  type AttentionAction,
  type WaitContext,
  type WaitSubject,
} from '$core/workspaces/agent-attention';
import type { ProjectStatusAgent } from '$core/workspaces/agents.consumes';
import { AgentsStore } from '$core/workspaces/agents.store';
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

/** The activity chip: what the agent is doing, in a word or three, and its tone. */
export function activityChip(agent: {
  readonly activity?: string | null;
  readonly waitingSince?: string | null;
  readonly waits?: readonly unknown[] | null;
}): { readonly label: string; readonly tone: ChipTone } {
  if (agent.activity === 'ENDED') return { label: 'Ended', tone: 'neutral' };
  if (agent.activity === 'BUSY') return { label: 'Working', tone: 'ok' };
  if (agent.waits?.length) return { label: 'Waiting', tone: 'waiting' };
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

/** One wait's line, with the request's lifecycle line when the store holds the request. */
interface WaitLine {
  readonly id: string;
  readonly subject: WaitSubject;
  readonly tone: ChipTone;
  readonly lifecycle?: readonly SummaryPoint[];
}

/** One agent's row. */
interface AgentMenuRow {
  readonly agent: ProjectStatusAgent;
  readonly page: string | null;
  readonly activity: { readonly label: string; readonly tone: ChipTone };
  readonly waits: readonly WaitLine[];
  readonly blockedAt?: string;
  readonly action?: AttentionAction;
  /** The agent page's Chat tab, for Prompt agent. */
  readonly chat: string | null;
}

/**
 * The top bar's agents menu (epic qits-1681), beside the lightning menu: the open project's ACTIVE
 * agents (`AgentsStore.loadProjectAgents`), each with its item linked to the agent page, an
 * activity chip (Working, Waiting, Idle since HH:mm, Ended), a line per open wait
 * (`waitSubject`: a request with its state and lifecycle line, a run, an item, comments, or the
 * wait's label), "Blocked since HH:mm" when its item is blocked (the work list carries no block
 * reason), and, when it needs a person (`needsAttention`), the attention's reason in cinnabar with
 * its action (`attentionAction`: Prompt agent → the agent page's Chat tab, Open item → the item,
 * or the overdue wait's subject). Shown only while a project is open, like the lightning menu.
 *
 * Rows needing a person come first, then the rest by `lastActivityAt`, newest first. The badge
 * counts the agents needing a person, in red; with none, the active agents, in amber; it is hidden
 * at none. The footer links "All agents" to the project's Workspaces page.
 *
 * The agents are read as soon as a project opens, and again on each opening. A wait's request comes
 * from `ProjectsStore`'s release requests, which the lightning menu reads; an item's status from
 * the open project's work in `WorkStore`, when something has read it (else the wait's last known
 * state). Staleness (qits-1270): `AGENT_STATUS_EVENTS` about the open project → its agents
 * (`AgentsStore.followProject`, debounced 1 s); a request's gates follow `RELEASE_REQUEST_EVENTS`
 * through the lightning menu's `ProjectsStore` reads, an item's status `WORK_EVENTS` wherever the
 * work is followed. Every link closes the panel.
 */
@Component({
  selector: 'app-agents-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Dropdown, LifecycleLine, RouterLink, Spinner],
  // One display class or the other: a static display class would beat `hidden`.
  host: {
    '[class]': "projectId() ? 'inline-flex' : 'hidden'",
  },
  template: `
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
            ? 'bg-cinnabar-600 text-white'
            : 'bg-sunflower-gold-500 text-charcoal-brown-950') + (count() ? '' : ' hidden')
        "
        aria-hidden="true"
        >{{ attention() || count() }}</span
      >
      <ui-spinner dropdown-panel [state]="state()" class="min-h-16">
        <ul class="m-0 list-none p-0">
          @for (row of rows(); track row.agent.agentId) {
            @let agent = row.agent;
            <li
              class="flex flex-col gap-1 border-b border-gray-100 px-3 py-2 last:border-b-0"
              [class]="row.action ? 'border-l-4 border-l-cinnabar-600 bg-cinnabar-50' : ''"
            >
              <div class="flex items-baseline justify-between gap-2">
                @if (row.page; as page) {
                  <a
                    class="min-w-0 truncate text-sm text-gray-900 no-underline hover:underline"
                    [routerLink]="page"
                    (click)="menu.close()"
                    ><span class="font-semibold">{{ agent.entityId }}</span>
                    {{ agent.entityTitle }}</a
                  >
                } @else {
                  <span class="min-w-0 truncate text-sm text-gray-900"
                    ><span class="font-semibold">{{ agent.entityId ?? agent.agentId }}</span>
                    {{ agent.entityTitle }}</span
                  >
                }
                <span
                  class="shrink-0 rounded px-1.5 text-[0.6875rem] leading-4 font-semibold whitespace-nowrap"
                  [class]="chip(row.activity.tone)"
                  data-activity
                  >{{ row.activity.label }}</span
                >
              </div>
              @for (wait of row.waits; track wait.id) {
                <div class="flex flex-col gap-0.5 text-[0.8125rem] text-gray-600" data-wait>
                  <div class="flex items-baseline justify-between gap-2">
                    <span class="min-w-0 truncate">
                      <span class="text-gray-500">waits on </span>
                      @if (wait.subject.link; as link) {
                        @if (isAppPath(link)) {
                          <a class="text-gray-900" [routerLink]="link" (click)="menu.close()">{{
                            wait.subject.text
                          }}</a>
                        } @else {
                          <a class="text-gray-900" [href]="link" (click)="menu.close()">{{
                            wait.subject.text
                          }}</a>
                        }
                      } @else {
                        <span class="text-gray-900">{{ wait.subject.text }}</span>
                      }
                    </span>
                    @if (wait.subject.state; as state) {
                      <span
                        class="shrink-0 rounded px-1.5 text-[0.6875rem] leading-4 font-semibold whitespace-nowrap"
                        [class]="chip(wait.tone)"
                        >{{ state }}</span
                      >
                    }
                  </div>
                  @if (wait.lifecycle; as points) {
                    <ui-lifecycle-line [points]="points" [spread]="true" />
                  } @else if (wait.subject.gates?.length) {
                    <span class="flex flex-wrap gap-1">
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
                <span class="text-[0.8125rem] text-gray-600" data-blocked>{{
                  row.blockedAt ? 'Blocked since ' + row.blockedAt : 'Blocked'
                }}</span>
              }
              @if (row.action; as action) {
                <div class="flex flex-wrap items-baseline gap-x-2 text-[0.8125rem]" data-attention>
                  <span class="text-cinnabar-600">{{ agent.attention?.reason }}</span>
                  @switch (action.kind) {
                    @case ('prompt') {
                      @if (row.chat; as chat) {
                        <a
                          class="font-semibold text-gray-900"
                          [routerLink]="chat"
                          (click)="menu.close()"
                          data-action
                          >{{ action.label }}</a
                        >
                      }
                    }
                    @case ('open-item') {
                      @if (action.link; as link) {
                        <a
                          class="font-semibold text-gray-900"
                          [routerLink]="link"
                          (click)="menu.close()"
                          data-action
                          >{{ action.label }}</a
                        >
                      }
                    }
                    @case ('subject') {
                      @if (action.subject.link; as link) {
                        @if (isAppPath(link)) {
                          <a
                            class="font-semibold text-gray-900"
                            [routerLink]="link"
                            (click)="menu.close()"
                            data-action
                            >{{ action.label }}</a
                          >
                        } @else {
                          <a
                            class="font-semibold text-gray-900"
                            [href]="link"
                            (click)="menu.close()"
                            data-action
                            >{{ action.label }}</a
                          >
                        }
                      }
                    }
                  }
                </div>
              }
            </li>
          }
        </ul>
        <p
          class="m-0 px-3 py-4 text-center text-sm text-gray-500"
          [class.hidden]="state() !== 'loaded' || rows().length > 0"
        >
          No active agents
        </p>
        <a
          class="block border-t border-gray-100 px-3 py-2 text-center text-sm font-semibold text-gray-700 no-underline hover:bg-gray-50"
          [routerLink]="['/projects', slug(), 'workspaces']"
          (click)="menu.close()"
          >All agents</a
        >
      </ui-spinner>
    </ui-dropdown>
  `,
})
export class AgentsMenu {
  private readonly agentsStore = inject(AgentsStore);
  private readonly projects = inject(ProjectsStore);
  private readonly work = inject(WorkStore);
  private readonly selected = inject(SelectedProject);
  private readonly origins = inject(PlatformOrigins);

  /** The open project's id, once the list holds it. */
  protected readonly projectId = computed(() => this.selected.project()?.id);

  /** The open project's slug, which the links name. */
  protected readonly slug = this.selected.slug;

  private readonly listed = computed(() => {
    const id = this.projectId();
    return id === undefined ? undefined : this.agentsStore.projectAgents()[id];
  });

  private readonly agents = computed(() => this.listed()?.agents ?? []);

  /** The project's release requests, as the lightning menu's reads left them. */
  private readonly requests = computed((): readonly ReleaseRequestEntry[] => {
    const id = this.projectId();
    return (id === undefined ? undefined : this.projects.releaseRequests()[id]?.requests) ?? [];
  });

  private readonly context = computed((): WaitContext => {
    const id = this.projectId();
    return {
      slug: this.slug() ?? '',
      ciOrigin: this.origins.page('ci') || undefined,
      releaseRequests: this.requests(),
      work: (id === undefined ? undefined : this.work.byProject()[id]?.entries) ?? [],
    };
  });

  /** The agents needing a person first, then by their last activity, newest first. */
  protected readonly rows = computed((): readonly AgentMenuRow[] => {
    const ctx = this.context();
    const requests = this.requests();
    const time = (agent: ProjectStatusAgent) => Date.parse(agent.lastActivityAt ?? '') || 0;
    const sorted = [...this.agents()].sort(
      (a, b) => Number(needsAttention(b)) - Number(needsAttention(a)) || time(b) - time(a),
    );
    return sorted.map((agent) => {
      const page =
        ctx.slug && agent.entityId ? `${workItemPath(ctx.slug, agent.entityId)}/agent` : null;
      return {
        agent,
        page,
        chat: page ? `${page}/chat` : null,
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
  protected readonly attention = computed(() => attentionCount(this.agents()));

  /** How many agents are active, once read; undefined before. */
  protected readonly count = computed(() =>
    this.listed()?.status === 'loaded' ? this.agents().length : undefined,
  );

  protected readonly state = computed((): LoadState => {
    const status = this.listed()?.status;
    if (status === 'loaded' || status === 'error') return status;
    if (status === 'missing') return 'error';
    return 'loading';
  });

  protected chip(tone: ChipTone): string {
    return chipClass(tone);
  }

  protected tone(state: string | undefined): ChipTone {
    return stateTone(state);
  }

  /** Whether a link is the app's own (a router link) rather than another app's page. */
  protected isAppPath(link: string): boolean {
    return link.startsWith('/');
  }

  constructor() {
    effect(() => {
      const id = this.projectId();
      if (id !== undefined) untracked(() => void this.agentsStore.loadProjectAgents(id));
    });
    this.agentsStore.followProject(inject(DestroyRef), () => this.projectId());
  }

  /** On each opening: the open project's agents again. */
  protected load(): void {
    const id = this.projectId();
    if (id !== undefined) void this.agentsStore.loadProjectAgents(id);
  }
}
