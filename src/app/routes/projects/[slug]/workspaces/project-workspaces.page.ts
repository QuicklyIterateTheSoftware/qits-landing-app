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
import { SelectedProject } from '$core/projects/selected-project';
import { RepositoriesStore } from '$core/repositories/repositories.store';
import { placementNote, runtimeLabel } from '$core/workspaces/agent-labels';
import { AgentsStore } from '$core/workspaces/agents.store';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import { AgentRow } from '$patterns/workspaces/agent-row/agent-row';
import { CreateAgentForm } from '$patterns/workspaces/create-agent-form/create-agent-form';
import { Chip } from '$ui/components/chip/chip';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/**
 * The project's Workspaces page, at `/projects/<slug>/workspaces` (epic qits-1230), ported from
 * qits-workspaces-frontend's overview. The "New agent" form (`app-create-agent-form`: a ticket or
 * an epic of the project, a harness, admin mode), then its agents — each a link to its work item's
 * agent page — with how each runs and what it waits on; then its slots, the workspaces agents run in — each a
 * link to the slot's page (`workspaces/<slot id>`) — with its container state, placement and how
 * many agents it hosts.
 *
 * The slots are the project's wrapper's: qits-projects names the wrapper (`RepositoriesStore`), and
 * the page reads its slots and the project's agents (`AgentsStore.loadProject`: those in the
 * wrapper or on the project's items) once it is known, and again after a lifecycle event about the
 * wrapper (at most once a second), and after an agent is created. In the browser only: the server
 * render has no session to send.
 */
@Component({
  selector: 'app-project-workspaces-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AgentRow, Chip, CreateAgentForm, PageLayoutComponent, RouterLink, Spinner],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout title="Workspaces">
        <p class="m-0 mb-6 max-w-[48rem] text-sm text-charcoal-brown-600">
          An agent works on one ticket or epic in its own worktree of the project's wrapper.
          Workspaces are the slots agents run in; the platform makes and removes them as agents need
          them.
        </p>
        <ui-spinner [state]="state()" class="min-h-48">
          <div class="flex flex-col gap-8">
            @if (wrapperId(); as wrapper) {
              <app-create-agent-form
                [repositoryId]="wrapper"
                [slug]="slug() ?? ''"
                (created)="reload()"
              />
            }
            <section class="flex flex-col gap-3" aria-labelledby="workspaces-agents">
              <h2
                id="workspaces-agents"
                class="m-0 text-base font-semibold text-charcoal-brown-900"
              >
                Agents
              </h2>
              <p
                class="m-0 text-sm text-charcoal-brown-500"
                [class.hidden]="state() !== 'loaded' || agents().length"
              >
                No agents yet.
              </p>
              <ul class="m-0 flex list-none flex-col gap-2 p-0">
                @for (agent of agents(); track agent.agentId) {
                  <li><app-agent-row [agent]="agent" [slug]="slug()" /></li>
                }
              </ul>
            </section>

            <section class="flex flex-col gap-3" aria-labelledby="workspaces-slots">
              <h2 id="workspaces-slots" class="m-0 text-base font-semibold text-charcoal-brown-900">
                Slots
              </h2>
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
            </section>
          </div>
        </ui-spinner>
      </app-page-layout>
    </div>
  `,
})
export class ProjectWorkspacesPage {
  private readonly selected = inject(SelectedProject);
  private readonly repositories = inject(RepositoriesStore);
  private readonly store = inject(AgentsStore);

  protected readonly slug = computed(() => this.selected.slug());

  /** The project's wrapper repository, once qits-projects named it. */
  protected readonly wrapperId = computed(() => {
    const id = this.selected.project()?.id;
    return id ? this.repositories.byProject()[id]?.wrapper?.repositoryId : undefined;
  });

  private readonly read = computed(() => {
    const wrapper = this.wrapperId();
    return wrapper ? this.store.projectOf(wrapper) : undefined;
  });

  protected readonly agents = computed(() => this.read()?.agents ?? []);
  protected readonly slots = computed(() => this.read()?.slots ?? []);

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
      const wrapper = this.wrapperId();
      if (wrapper) untracked(() => void this.store.loadProject(wrapper, this.slug()));
    });
    this.store.follow(
      inject(DestroyRef),
      () => ({ repositoryId: this.wrapperId() }),
      () => this.reload(),
    );
  }

  /** Reads the wrapper's slots and the project's agents again (after a lifecycle event, a create). */
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
    const count = this.agents().filter((a) => a.workspaceRowId === id).length;
    return count === 1 ? '1 agent' : `${count} agents`;
  }
}
