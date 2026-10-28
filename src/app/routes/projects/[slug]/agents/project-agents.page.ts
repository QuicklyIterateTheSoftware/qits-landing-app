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
import { RouterLink } from '@angular/router';
import { PlatformOrigins } from '$core/platform/platform-origins';
import { SelectedProject } from '$core/projects/selected-project';
import { RepositoriesStore } from '$core/repositories/repositories.store';
import { placementNote, runtimeLabel } from '$core/workspaces/agent-labels';
import { AgentsStore } from '$core/workspaces/agents.store';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import { AgentStatus } from '$patterns/agents/agent-status/agent-status';
import { AgentRow } from '$patterns/workspaces/agent-row/agent-row';
import { Chip } from '$ui/components/chip/chip';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/**
 * The project's Agents page, at `/projects/<slug>/agents` (epic qits-1681; `workspaces` redirects
 * here). First its ACTIVE agents (`AgentsStore.loadProjectAgents`) — each a link to the agent's page
 * (`agents/<agent id>`) — with how each runs, what each waits on and, when one needs a person, why
 * and what to do (`app-agent-status`). Then, under a "Workspaces" heading, the project's wrapper's
 * slots, the workspaces agents run in — each a link to the slot's page (`workspaces/<slot id>`) —
 * with its container state, placement and how many agents it hosts. Beside that heading, Targets
 * leads to qits-system's Targets page (`https://system.qits.<domain>/system/targets`,
 * `PlatformOrigins.page('system')`, epic qits-1481), where the execution targets slots are placed
 * on are managed.
 *
 * The slots are the project's wrapper's: qits-projects names the wrapper (`RepositoriesStore`), and
 * the page reads its slots and the agents they host (`AgentsStore.loadProject`) once it is known.
 * In the browser only: the server render has no session to send.
 *
 * Staleness (qits-1270): `AGENT_STATUS_EVENTS` about the project → its ACTIVE agents
 * (`AgentsStore.followProject`, debounced 1 s; its comment has the mapping). `WORKSPACE_EVENTS`
 * naming the wrapper (`repositoryId`), or a listed agent's `agentId` → the wrapper's slots and their
 * agents (`AgentsStore.loadProject`, quietly, at most once a second). Not announced (see
 * `AgentsStore`): a queued agent's creation, a slot's runtime leaving RUNNING.
 */
@Component({
  selector: 'app-project-agents-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AgentRow, AgentStatus, Chip, PageLayoutComponent, RouterLink, Spinner],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout title="Agents">
        <p class="m-0 mb-6 max-w-[48rem] text-sm text-charcoal-brown-600">
          An agent works on one ticket or epic in its own worktree of the project's wrapper.
          Workspaces are the slots agents run in; the platform makes and removes them as agents need
          them.
        </p>
        <div class="flex flex-col gap-8">
          <section class="flex flex-col gap-3" aria-labelledby="project-agents">
            <h2 id="project-agents" class="m-0 text-base font-semibold text-charcoal-brown-900">
              Active agents
            </h2>
            <ui-spinner [state]="agentsState()" class="min-h-16">
              <p
                class="m-0 text-sm text-charcoal-brown-500"
                [class.hidden]="agentsState() !== 'loaded' || agents().length"
              >
                No active agents.
              </p>
              <ul class="m-0 flex list-none flex-col gap-2 p-0">
                @for (agent of agents(); track agent.agentId) {
                  <li>
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
              <h2
                id="project-workspaces"
                class="m-0 text-base font-semibold text-charcoal-brown-900"
              >
                Workspaces
              </h2>
              @if (targetsHref(); as href) {
                <a class="text-sm text-ocean-deep-700" [href]="href">Targets</a>
              }
            </div>
            <ui-spinner [state]="state()" class="min-h-16">
              <p
                class="m-0 text-sm text-charcoal-brown-500"
                [class.hidden]="state() !== 'loaded' || slots().length"
              >
                No workspaces right now.
              </p>
              <ul class="m-0 flex list-none flex-col gap-2 p-0">
                @for (slot of slots(); track slot.id) {
                  <li>
                    <a
                      class="flex flex-wrap items-center gap-3 rounded-md border border-charcoal-brown-200 px-4 py-2.5 text-sm text-charcoal-brown-900 no-underline transition-shadow duration-150 hover:shadow-md"
                      [routerLink]="slotLink(slot.id)"
                    >
                      <span class="font-mono font-semibold">{{ slot.workspaceId }}</span>
                      <ui-chip [label]="runtime(slot.runtimeStatus)" />
                      <span class="text-charcoal-brown-600">{{ placement(slot) }}</span>
                      @if (slot.admin) {
                        <ui-chip label="docker socket" tone="waiting" />
                      }
                      <span class="ml-auto text-charcoal-brown-600">{{ hosted(slot.id) }}</span>
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
  private readonly repositories = inject(RepositoriesStore);
  private readonly store = inject(AgentsStore);
  private readonly origins = inject(PlatformOrigins);

  protected readonly slug = computed(() => this.selected.slug());

  /** qits-system's Targets page, where the slots' execution targets are managed (epic qits-1481). */
  protected readonly targetsHref = computed(() => {
    const origin = this.origins.page('system');
    return origin ? `${origin}/system/targets` : undefined;
  });

  /** The project's wrapper repository, once qits-projects named it. */
  protected readonly wrapperId = computed(() => {
    const id = this.selected.project()?.id;
    return id ? this.repositories.byProject()[id]?.wrapper?.repositoryId : undefined;
  });

  private readonly read = computed(() => {
    const wrapper = this.wrapperId();
    return wrapper ? this.store.projectOf(wrapper) : undefined;
  });

  /** The wrapper's agents, for how many each slot hosts. */
  private readonly hostedAgents = computed(() => this.read()?.agents ?? []);
  protected readonly slots = computed(() => this.read()?.slots ?? []);

  /** The project's ACTIVE agents, with their waits and attention. */
  private readonly listed = computed(() => {
    const id = this.selected.project()?.id;
    return id ? this.store.projectAgentsOf(id) : undefined;
  });

  protected readonly agents = computed(() => this.listed()?.agents ?? []);

  protected readonly agentsState = computed((): LoadState => {
    const status = this.listed()?.status;
    if (status === 'loaded') return 'loaded';
    return status === 'error' || status === 'missing' ? 'error' : 'loading';
  });

  /** The slots' read. */
  protected readonly state = computed((): LoadState => {
    const id = this.selected.project()?.id;
    const repositories = id ? this.repositories.byProject()[id] : undefined;
    if (repositories?.status === 'error') return 'error';
    // A project without a wrapper has no workspaces: nothing to read, nothing to show.
    if (repositories?.status === 'loaded' && !this.wrapperId()) return 'loaded';
    const status = this.read()?.status;
    if (status === 'loaded') return 'loaded';
    return status === 'error' || status === 'missing' ? 'error' : 'loading';
  });

  constructor() {
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    if (!browser) return;
    effect(() => {
      const id = this.selected.project()?.id;
      if (id) untracked(() => void this.repositories.load(id));
    });
    effect(() => {
      const id = this.selected.project()?.id;
      if (id) untracked(() => void this.store.loadProjectAgents(id));
    });
    const destroy = inject(DestroyRef);
    this.store.followProject(destroy, () => this.selected.project()?.id);
    effect(() => {
      const wrapper = this.wrapperId();
      if (wrapper) untracked(() => void this.store.loadProject(wrapper, this.slug()));
    });
    this.store.follow(
      destroy,
      () => [
        { repositoryId: this.wrapperId() },
        ...this.hostedAgents().map((agent) => ({ agentId: agent.agentId })),
      ],
      () => this.reload(),
    );
  }

  /** Reads the wrapper's slots and the agents they host again (after a lifecycle event). */
  protected reload(): void {
    const wrapper = this.wrapperId();
    if (wrapper) void this.store.loadProject(wrapper, this.slug());
  }

  protected slotLink(id: number | undefined): string {
    return `/projects/${this.slug() ?? ''}/workspaces/${id ?? ''}`;
  }

  protected runtime(status: string | undefined): string {
    return runtimeLabel(status);
  }

  protected placement(slot: Parameters<typeof placementNote>[0]): string {
    return placementNote(slot);
  }

  /** How many of the listed agents the slot hosts. */
  protected hosted(id: number | undefined): string {
    const count = this.hostedAgents().filter((a) => a.workspaceRowId === id).length;
    return count === 1 ? '1 agent' : `${count} agents`;
  }
}
