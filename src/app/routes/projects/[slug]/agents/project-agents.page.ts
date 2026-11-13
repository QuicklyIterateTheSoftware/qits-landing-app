import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, PLATFORM_ID } from '@angular/core';
import {
  exit,
  outcomes,
  QitsEntity,
  QitsEntityList,
  QitsExit,
  QitsField,
  qitsResource,
  type QitsDomainEvent,
  type QitsRefreshOn,
} from '@qits/angular';
import { payloadIds } from '$core/events/refresh-on';
import { PlatformOrigins } from '$core/platform/platform-origins';
import { SelectedProject } from '$core/projects/selected-project';
import { LIST_PROJECT_WRAPPER } from '$core/repositories/repositories.operations';
import { movesWrapper } from '$core/repositories/repositories.store';
import { placementNote, runtimeLabel } from '$core/workspaces/agent-labels';
import {
  LIST_PROJECT_ACTIVE_AGENTS,
  LIST_WRAPPER_AGENTS,
  LIST_WRAPPER_SLOTS,
} from '$core/workspaces/agents.operations';
import { notRemoved, ofProject } from '$core/workspaces/agent-lists';
import {
  aboutProjectAgents,
  AGENT_STATUS_EVENTS,
  concerns,
  WORKSPACE_EVENTS,
  WORKSPACE_REFRESH_DEBOUNCE_MS,
} from '$core/workspaces/workspace-events';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import { AgentStatus } from '$patterns/agents/agent-status/agent-status';
import { AgentRow } from '$patterns/workspaces/agent-row/agent-row';
import { Chip } from '$ui/components/chip/chip';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** What a resource's spinner shows: failed, loaded (a quiet reload included), else loading. */
function loadState(read: { status(): string; hasValue(): boolean }): LoadState {
  if (read.status() === 'error') return 'error';
  return read.hasValue() ? 'loaded' : 'loading';
}

/**
 * The project's Agents page, at `/projects/<slug>/agents` (epic qits-1681; `workspaces` redirects
 * here). First its ACTIVE agents (`activeAgents`) — each a link to the agent's page
 * (`agents/<agent id>`) — with how each runs, what each waits on and, when one needs a person, why
 * and what to do (`app-agent-status`). Then, under a "Workspaces" heading, the project's wrapper's
 * slots, the workspaces agents run in — each a link to the slot's page (`workspaces/<slot id>`,
 * the declared exit `open-agents-slot` `slot`, epic qits-2000) —
 * with its container state, placement and how many agents it hosts. Beside that heading, Targets
 * leads to qits-system's Targets page (`https://system.qits.<domain>/system/targets`,
 * `PlatformOrigins.page('system')`, epic qits-1481), where the execution targets slots are placed
 * on are managed.
 *
 * It reads through `qitsResource` (qits-2143, the pilot of qits-2145), one resource per backend
 * read, never through a store: `repositories` (qits-projects' `LIST_PROJECT_WRAPPER`: which
 * repository is the wrapper), then, once it is known, the wrapper's `slots` (`LIST_WRAPPER_SLOTS`)
 * and every agent (`wrapperAgents`, `LIST_WRAPPER_AGENTS`, of which it keeps the wrapper's that are
 * not removed, to count those each slot hosts), and the project's `activeAgents`
 * (`LIST_PROJECT_ACTIVE_AGENTS`, the same request as the agents menu's, made on its own). In the
 * browser only: the server render has no session to send, so every params stays `undefined` there.
 * A failed read again keeps what the page shows (`reloadError`); a failed first read is the
 * spinner's error.
 *
 * What it shows carries the data marks (qits-2141): each list its resource (`qitsEntityList`),
 * each row its record (`qitsEntity`: an agent by `agentId`, a slot by `id`), each value its field
 * or the fields it is derived from (`qitsField`); `qits/data-through-fields` holds the template to
 * them. A slot's agent count joins `wrapperAgents` to the slot, which no mark can say: it is marked
 * derived from the slot's `id` alone.
 *
 * Staleness (qits-1270), each a resource's `refreshOn`, through the app's one stream
 * (`QITS_DOMAIN_EVENTS`, `DomainEvents`), debounced 1 s (`WORKSPACE_REFRESH_DEBOUNCE_MS`, the
 * library's `REFRESH_DEBOUNCE_MS` too):
 * - `AGENT_STATUS_EVENTS` about the project (`aboutProjectAgents`: its `projectId`, else an agent or
 *   a repository of the agents listed) → `activeAgents`, as `ProjectActiveAgents` reads the agents
 *   menu's;
 * - `WORKSPACE_EVENTS` naming the wrapper (`repositoryId`) or a listed wrapper agent's `agentId`
 *   (`concerns`) → `slots` and `wrapperAgents`;
 * - `SCMPublishCommit` to the wrapper's main branch (`movesWrapper`) → `repositories`, as
 *   `RepositoriesStore.follow` reads the Repositories page's.
 * Not announced: a queued agent's creation, a slot's runtime leaving RUNNING.
 */
@Component({
  selector: 'app-project-agents-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AgentRow,
    AgentStatus,
    Chip,
    PageLayoutComponent,
    QitsEntity,
    QitsEntityList,
    QitsExit,
    QitsField,
    Spinner,
  ],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout title="Agents">
        <p class="m-0 mb-6 max-w-[48rem] text-sm text-fg-soft">
          An agent works on one ticket or epic in its own worktree of the project's wrapper.
          Workspaces are the slots agents run in; the platform makes and removes them as agents need
          them.
        </p>
        <div class="flex flex-col gap-8">
          <section class="flex flex-col gap-3" aria-labelledby="project-agents">
            <h2 id="project-agents" class="m-0 text-base font-semibold text-fg">Active agents</h2>
            <ui-spinner [state]="agentsState()" class="min-h-16">
              <p
                class="m-0 text-sm text-fg-muted"
                [class.hidden]="agentsState() !== 'loaded' || agents().length"
              >
                No active agents.
              </p>
              <ul class="m-0 flex list-none flex-col gap-2 p-0" [qitsEntityList]="activeAgents">
                @for (agent of agents(); track agent.agentId) {
                  <li [qitsEntity]="agent" entityKey="agentId">
                    <app-agent-row [agent]="agent" [slug]="slug()">
                      <app-agent-status [agent]="agent" />
                    </app-agent-row>
                  </li>
                }
              </ul>
            </ui-spinner>
          </section>

          <section class="flex flex-col gap-3" aria-labelledby="project-workspaces">
            <div class="flex flex-wrap items-baseline gap-3">
              <h2 id="project-workspaces" class="m-0 text-base font-semibold text-fg">
                Workspaces
              </h2>
              @if (targetsHref(); as href) {
                <a class="text-sm text-accent" [href]="href">Targets</a>
              }
            </div>
            <ui-spinner [state]="state()" class="min-h-16">
              <p
                class="m-0 text-sm text-fg-muted"
                [class.hidden]="state() !== 'loaded' || slotRows().length"
              >
                No workspaces right now.
              </p>
              <ul class="m-0 flex list-none flex-col gap-2 p-0" [qitsEntityList]="slots">
                @for (slot of slotRows(); track slot.id) {
                  <li [qitsEntity]="slot" entityKey="id">
                    <a
                      class="flex flex-wrap items-center gap-3 rounded-md border border-line px-4 py-2.5 text-sm text-fg no-underline transition-shadow duration-150 hover:shadow-md"
                      [qitsExit]="opening.slot"
                      [exitParams]="{ slug: slug() ?? '', slotId: slot.id ?? '' }"
                    >
                      <span
                        class="font-mono font-semibold"
                        [fieldOf]="slot"
                        qitsField="workspaceId"
                        >{{ slot.workspaceId }}</span
                      >
                      <ui-chip
                        [label]="runtime(slot.runtimeStatus)"
                        [fieldOf]="slot"
                        [qitsField]="{ derived: ['runtimeStatus'] }"
                      />
                      <span
                        class="text-fg-soft"
                        [fieldOf]="slot"
                        [qitsField]="{ derived: ['placement', 'runtimeStatus', 'queuedAt'] }"
                        >{{ placement(slot) }}</span
                      >
                      @if (slot.admin) {
                        <ui-chip
                          label="docker socket"
                          tone="waiting"
                          [fieldOf]="slot"
                          [qitsField]="{ derived: ['admin'] }"
                        />
                      }
                      <span
                        class="ml-auto text-fg-soft"
                        [fieldOf]="slot"
                        [qitsField]="{ derived: ['id'] }"
                        >{{ hosted(slot.id) }}</span
                      >
                    </a>
                  </li>
                }
              </ul>
            </ui-spinner>
          </section>
        </div>
      </app-page-layout>
    </div>
  `,
})
export class ProjectAgentsPage {
  private readonly selected = inject(SelectedProject);
  private readonly origins = inject(PlatformOrigins);
  /** No read in the server render: it has no session to send. */
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly slug = computed(() => this.selected.slug());

  /** The open project's id, in the browser only: every read below waits for it. */
  private readonly projectId = computed(() =>
    this.browser ? this.selected.project()?.id : undefined,
  );

  /** A slot's row opens the slot's page (epic qits-2000). */
  protected readonly opening = outcomes('open-agents-slot', {
    slot: exit('projects/:slug/workspaces/:slotId'),
  });

  /** qits-system's Targets page, where the slots' execution targets are managed (epic qits-1481). */
  protected readonly targetsHref = computed(() => {
    const origin = this.origins.page('system');
    return origin ? `${origin}/system/targets` : undefined;
  });

  /** The project's repositories, for its wrapper; again after a commit to the wrapper's main. */
  protected readonly repositories = qitsResource(
    LIST_PROJECT_WRAPPER,
    () => {
      const projectId = this.projectId();
      return projectId ? { path: { projectId } } : undefined;
    },
    {
      refreshOn: {
        names: ['SCMPublishCommit'],
        when: (event) => this.commitsToWrapper(event),
        debounceMs: WORKSPACE_REFRESH_DEBOUNCE_MS,
      },
    },
  );

  /** The project's wrapper repository, once qits-projects named it. */
  protected readonly wrapperId = computed(() =>
    this.repositories.hasValue() ? this.repositories.value()?.wrapper?.repositoryId : undefined,
  );

  /** The slots and their agents read again after a lifecycle event of the wrapper or its agents. */
  private readonly workspaceEvents: QitsRefreshOn = {
    names: WORKSPACE_EVENTS,
    when: (event) =>
      concerns(event, [
        { repositoryId: this.wrapperId() },
        ...this.hostedAgents().map((agent) => ({ agentId: agent.agentId })),
      ]),
    debounceMs: WORKSPACE_REFRESH_DEBOUNCE_MS,
  };

  /** The wrapper's ACTIVE slots. */
  protected readonly slots = qitsResource(
    LIST_WRAPPER_SLOTS,
    () => {
      const repositoryId = this.wrapperId();
      return repositoryId ? { query: { repositoryId } } : undefined;
    },
    { refreshOn: this.workspaceEvents },
  );

  /** Every agent (`listAgents`, unfiltered), for those the wrapper's slots host. */
  protected readonly wrapperAgents = qitsResource(
    LIST_WRAPPER_AGENTS,
    () => (this.wrapperId() ? {} : undefined),
    { refreshOn: this.workspaceEvents },
  );

  /** The project's ACTIVE agents, with their waits and attention. */
  protected readonly activeAgents = qitsResource(
    LIST_PROJECT_ACTIVE_AGENTS,
    () => {
      const projectId = this.projectId();
      return projectId ? { query: { projectId, state: 'ACTIVE' as const } } : undefined;
    },
    {
      refreshOn: {
        names: AGENT_STATUS_EVENTS,
        when: (event) => this.aboutTheAgents(event),
        debounceMs: WORKSPACE_REFRESH_DEBOUNCE_MS,
      },
    },
  );

  protected readonly agents = computed(() =>
    this.activeAgents.hasValue() ? (this.activeAgents.value()?.agents ?? []) : [],
  );

  /** The slots' rows: each entry's slot. */
  protected readonly slotRows = computed(() =>
    this.slots.hasValue()
      ? (this.slots.value()?.entries ?? []).flatMap((entry) =>
          entry.workspace ? [entry.workspace] : [],
        )
      : [],
  );

  /**
   * The wrapper's agents that are not removed, newest first: those working in the wrapper or on one
   * of the project's items (`<slug>-<n>`), as qits-workspaces-frontend's overview kept them.
   */
  private readonly hostedAgents = computed(() => {
    const wrapper = this.wrapperId();
    const slug = this.slug();
    const all = this.wrapperAgents.hasValue() ? this.wrapperAgents.value()?.agents : undefined;
    return notRemoved(all).filter(
      (agent) => agent.repositoryId === wrapper || ofProject(agent.entityId, slug),
    );
  });

  protected readonly agentsState = computed((): LoadState => loadState(this.activeAgents));

  /** The slots' read: the wrapper's, then its slots and their agents. */
  protected readonly state = computed((): LoadState => {
    const repositories = loadState(this.repositories);
    if (repositories !== 'loaded') return repositories;
    // A project without a wrapper has no workspaces: nothing to read (the slots' params stay
    // undefined, so the read is idle), nothing to show.
    if (this.slots.status() === 'idle') return 'loaded';
    const reads = [loadState(this.slots), loadState(this.wrapperAgents)];
    if (reads.includes('error')) return 'error';
    return reads.every((read) => read === 'loaded') ? 'loaded' : 'loading';
  });

  /** Whether a commit is to the wrapper's main branch, as the repositories read names them. */
  private commitsToWrapper(event: QitsDomainEvent): boolean {
    return movesWrapper(
      event,
      this.repositories.hasValue() ? this.repositories.value() : undefined,
    );
  }

  /** Whether an agent status event is about the project's ACTIVE agents as the page lists them. */
  private aboutTheAgents(event: QitsDomainEvent): boolean {
    return aboutProjectAgents(payloadIds(event), this.projectId(), this.agents());
  }

  protected runtime(status: string | undefined): string {
    return runtimeLabel(status);
  }

  protected placement(slot: Parameters<typeof placementNote>[0]): string {
    return placementNote(slot);
  }

  /** How many of the wrapper's agents the slot hosts. */
  protected hosted(id: number | undefined): string {
    const count = this.hostedAgents().filter((a) => a.workspaceRowId === id).length;
    return count === 1 ? '1 agent' : `${count} agents`;
  }
}
