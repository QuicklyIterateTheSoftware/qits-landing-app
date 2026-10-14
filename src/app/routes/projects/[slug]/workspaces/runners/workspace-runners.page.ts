import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  PLATFORM_ID,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { SelectedProject } from '$core/projects/selected-project';
import { RepositoriesStore } from '$core/repositories/repositories.store';
import { AgentsStore } from '$core/workspaces/agents.store';
import type { RunnerRegistration } from '$core/workspaces/runners.consumes';
import { RunnersStore } from '$core/workspaces/runners.store';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import { InstallLinePanel } from '$patterns/workspaces/install-line-panel/install-line-panel';
import { RegisterRunnerForm } from '$patterns/workspaces/register-runner-form/register-runner-form';
import { RunnerCard, type RunnerSlot } from '$patterns/workspaces/runner-card/runner-card';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/**
 * How often the runners are read again while the page is visible. There are no runner events on
 * qits-events, so this is how a runner connecting, a slot filling or a login landing reaches the
 * screen (as on qits-workspaces-frontend's runners page).
 */
export const RUNNERS_POLL_MS = 5_000;

/**
 * The Runners page, at `/projects/<slug>/workspaces/runners` (epic qits-1230), ported from
 * qits-workspaces-frontend's runners page: every node qits-workspaces can place a workspace on —
 * the estate's, not one project's — each with its connection, slots, health, quarantine and the
 * node's agent login (`app-runner-card`), and a form to register another
 * (`app-register-runner-form`). Registering a runner, or rotating its token, answers a one-time
 * install line, which `app-install-line-panel` shows until it is closed, and nothing else holds.
 *
 * Under each runner are this project's slots placed on it (`AgentsStore.loadProject` on the
 * project's wrapper, as the Workspaces page reads them), each a link to its slot page.
 *
 * The runners are read in the browser only (the server render has no session to send), again
 * every {@link RUNNERS_POLL_MS} while the page is visible, on coming back to it, and after every
 * write.
 */
@Component({
  selector: 'app-workspace-runners-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    InstallLinePanel,
    PageLayoutComponent,
    RegisterRunnerForm,
    RouterLink,
    RunnerCard,
    Spinner,
  ],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout title="Runners">
        <p class="m-0 mb-6 max-w-[48rem] text-sm text-charcoal-brown-600">
          The nodes a workspace can be placed on, each installed with one pasted line — the
          platform’s, not one project’s.
          <a class="text-ocean-deep-700" [routerLink]="workspacesLink()">Back to the workspaces</a>
        </p>
        <div class="flex flex-col gap-6">
          @if (registration(); as shown) {
            <app-install-line-panel [registration]="shown" (closed)="registration.set(null)" />
          }
          <app-register-runner-form (registered)="show($event); reload()" />
          <ui-spinner [state]="state()" class="min-h-32">
            <section class="flex flex-col gap-3" aria-labelledby="runners-list">
              <h2 id="runners-list" class="m-0 text-base font-semibold text-charcoal-brown-900">
                Runners
              </h2>
              <p
                class="m-0 text-sm text-charcoal-brown-500"
                [class.hidden]="state() !== 'loaded' || runners().length"
              >
                No runners are registered yet.
              </p>
              <ul class="m-0 flex list-none flex-col gap-3 p-0">
                @for (runner of runners(); track runner.id) {
                  <li>
                    <app-runner-card
                      [runner]="runner"
                      [slots]="slotsOn(runner.name)"
                      [slug]="slug()"
                      [now]="now()"
                      (changed)="reload()"
                      (registration)="show($event)"
                    />
                  </li>
                }
              </ul>
            </section>
          </ui-spinner>
        </div>
      </app-page-layout>
    </div>
  `,
})
export class WorkspaceRunnersPage {
  private readonly selected = inject(SelectedProject);
  private readonly repositories = inject(RepositoriesStore);
  private readonly agents = inject(AgentsStore);
  private readonly store = inject(RunnersStore);
  private readonly document = inject(DOCUMENT);

  protected readonly slug = computed(() => this.selected.slug());
  protected readonly runners = computed(() => this.store.runners());
  /** The clock the "ago" labels are read against, moved by every read. */
  protected readonly now = signal(new Date());

  /** The one-time install line on show; nothing else holds it. */
  protected readonly registration = signal<RunnerRegistration | null>(null);

  protected readonly state = computed((): LoadState => {
    const status = this.store.status();
    if (status === 'loaded') return 'loaded';
    return status === 'error' ? 'error' : 'loading';
  });

  /** The project's wrapper repository, once qits-projects named it. */
  private readonly wrapperId = computed(() => {
    const id = this.selected.project()?.id;
    return id ? this.repositories.byProject()[id]?.wrapper?.repositoryId : undefined;
  });

  private readonly projectSlots = computed(() => {
    const wrapper = this.wrapperId();
    return (wrapper ? this.agents.projectOf(wrapper)?.slots : undefined) ?? [];
  });

  private poll: ReturnType<typeof setInterval> | null = null;
  /** A poll is in flight: the next tick does not stack another on it. */
  private polling = false;

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    void this.read();
    effect(() => {
      const id = this.selected.project()?.id;
      if (id) untracked(() => void this.repositories.load(id));
    });
    effect(() => {
      const wrapper = this.wrapperId();
      if (wrapper) untracked(() => void this.agents.loadProject(wrapper, this.slug()));
    });
    const onVisibility = () => this.onVisibilityChange();
    this.document.addEventListener('visibilitychange', onVisibility);
    inject(DestroyRef).onDestroy(() => {
      this.document.removeEventListener('visibilitychange', onVisibility);
      this.stopPolling();
    });
    this.sync();
  }

  protected workspacesLink(): string {
    return `/projects/${this.slug() ?? ''}/workspaces`;
  }

  /** This project's slots on the runner called `name`. */
  protected slotsOn(name: string | undefined): readonly RunnerSlot[] {
    return name ? this.projectSlots().filter((slot) => slot.runner?.name === name) : [];
  }

  /** Shows a one-time install line (a card's rotated token reads the list again itself). */
  protected show(registration: RunnerRegistration): void {
    this.registration.set(registration);
  }

  /** Reads the runners again (after a write), and the project's slots with them. */
  protected reload(): void {
    void this.read();
    const wrapper = this.wrapperId();
    if (wrapper) void this.agents.loadProject(wrapper, this.slug());
  }

  private async read(): Promise<void> {
    await this.store.load();
    this.now.set(new Date());
  }

  private async tick(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      await this.read();
    } finally {
      this.polling = false;
    }
  }

  private sync(): void {
    if (this.document.hidden) this.stopPolling();
    else this.poll ??= setInterval(() => void this.tick(), RUNNERS_POLL_MS);
  }

  private stopPolling(): void {
    if (this.poll !== null) clearInterval(this.poll);
    this.poll = null;
  }

  private onVisibilityChange(): void {
    if (!this.document.hidden) void this.tick();
    this.sync();
  }
}
