import { isPlatformBrowser, NgTemplateOutlet } from '@angular/common';
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
import { SelectedProject } from '$core/projects/selected-project';
import { needsBackupSignIn, signInRepositoryId } from '$core/repositories/remote-login';
import { RepositoriesStore } from '$core/repositories/repositories.store';
import { repositoryTree } from '$core/repositories/repository-tree';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import type { Action } from '$ui/components/action-button/action';
import { ActionButton } from '$ui/components/action-button/action-button';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';
import { TreeFolder } from '$ui/components/tree-folder/tree-folder';
import { RemoteLoginPanel } from '$patterns/repositories/remote-login-panel/remote-login-panel';
import { RepositoryCard } from '$patterns/repositories/repository-card/repository-card';

/**
 * A project's repositories, at `/projects/<slug>/repositories`, laid out like the wrapper's
 * checkout: the wrapper repository on top, then its directories (`components/<component>/…`) with
 * a card per repository, and a repository the wrapper does not mount under "Not in the wrapper".
 * The tree is `repositoryTree` in `core/repositories`; this page only draws it.
 *
 * Above the tree, the backup remote's sign-in (qits-1268, ported from qits-projects-frontend's
 * backup panel): when any repository's last backup is `AUTH_REQUIRED`, an alert says so and offers
 * the sign-in terminal; otherwise it is a quieter action in the header. One sign-in fills the
 * shared credential store and so clears every repository's (`signInRepositoryId`: the wrapper's
 * backup remote first). The terminal is `app-remote-login-panel`; when its session ends the page
 * does what the old panel did: reads the repositories again (`RepositoriesStore.refresh`) and nudges
 * every backup (`RepositoriesStore.syncBackups`). A refused sync is a quiet note: the backups still
 * run on their own schedule. The old panel also read the list again 3 s after an accepted sync; that
 * was a refresh timer, which qits-1270 forbids, and qits-projects emits no event for a backup's
 * outcome, so an "Auth needed" turns back into an outcome on the next read.
 *
 * Staleness (qits-1270): `SCMPublishCommit` to the open project's wrapper on its main branch → the
 * project's repositories (`RepositoriesStore.follow`; see the store for the gaps: no event for a
 * repository created, renamed or deleted, nor for a backup's outcome). The cards show no branch,
 * commit or version, so `SCMPublishCommit` on other repositories, `SCMPublishTag`,
 * `SCMDeleteBranch` and `SCMRelease` change nothing here.
 */
@Component({
  selector: 'app-project-repositories-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    ActionButton,
    PageLayoutComponent,
    RemoteLoginPanel,
    Spinner,
    TreeFolder,
    RepositoryCard,
  ],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout title="Repositories" [actions]="headerActions()">
        @if (needsSignIn() && !terminalRepoId()) {
          <div
            class="mb-4 flex flex-col items-start gap-2 rounded-md border border-sunflower-gold-300 bg-sunflower-gold-50 px-3 py-2.5 text-sm"
            role="alert"
          >
            <p class="m-0 text-sunflower-gold-900">
              The backup remote refused the platform’s credentials.
            </p>
            <p class="m-0 text-sunflower-gold-800">
              Sign in once and every repository’s backup works again: the credentials go to the
              platform’s shared store.
            </p>
            @if (signInAction(); as action) {
              <ui-action-button [action]="action" />
            } @else {
              <p class="m-0 text-sunflower-gold-800">
                No repository of this project has a backup remote to sign in through.
              </p>
            }
          </div>
        }
        @if (terminalRepoId(); as repositoryId) {
          <app-remote-login-panel
            class="mb-6"
            [repositoryId]="repositoryId"
            (ended)="signInEnded()"
            (closed)="terminalRepoId.set(null)"
          />
        }
        @if (syncNote(); as note) {
          <p class="m-0 mb-4 text-sm text-charcoal-brown-600" role="status">{{ note }}</p>
        }
        <ui-spinner [state]="state()" class="min-h-48">
          <div class="flex flex-col gap-6">
            <section aria-label="Wrapper" [class]="tree().wrapper ? 'block' : 'hidden'">
              @if (tree().wrapper; as wrapper) {
                <app-repository-card class="max-w-[24rem]" [entry]="wrapper" />
              }
            </section>

            <ng-template #branch let-nodes let-level="level">
              <div
                class="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-x-4 gap-y-6 py-2"
              >
                @for (node of nodes; track $index) {
                  @if (node.kind === 'repository') {
                    <app-repository-card [entry]="node.entry" />
                  }
                }
              </div>
              @for (node of nodes; track $index) {
                @if (node.kind === 'folder') {
                  <ui-tree-folder [name]="node.name" [level]="level">
                    <ng-container
                      *ngTemplateOutlet="
                        branch;
                        context: { $implicit: node.children, level: level + 1 }
                      "
                    />
                  </ui-tree-folder>
                }
              }
            </ng-template>

            <section aria-label="Directories">
              <ng-container
                *ngTemplateOutlet="branch; context: { $implicit: tree().nodes, level: 2 }"
              />
            </section>

            <section
              aria-labelledby="repositories-other"
              [class]="tree().other.length ? 'block' : 'hidden'"
            >
              <h2
                id="repositories-other"
                class="mt-0 mb-2 text-sm font-semibold text-charcoal-brown-700"
              >
                Not in the wrapper
              </h2>
              <div class="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-x-4 gap-y-6">
                @for (entry of tree().other; track entry.repository?.id) {
                  <app-repository-card [entry]="entry" />
                }
              </div>
            </section>
          </div>
        </ui-spinner>
      </app-page-layout>
    </div>
  `,
})
export class ProjectRepositoriesPage {
  private readonly selected = inject(SelectedProject);
  private readonly store = inject(RepositoriesStore);

  private readonly repositories = computed(() => {
    const id = this.selected.project()?.id;
    return id ? this.store.byProject()[id] : undefined;
  });

  protected readonly tree = computed(() => {
    const repositories = this.repositories();
    return repositoryTree(repositories?.entries ?? [], repositories?.wrapper);
  });

  /** Whether any repository's last backup asked for a sign-in. */
  protected readonly needsSignIn = computed(() =>
    needsBackupSignIn(this.repositories()?.entries ?? []),
  );

  /** The repository the sign-in terminal pushes through; null when none has a backup remote. */
  protected readonly signInRepoId = computed(() => {
    const repositories = this.repositories();
    return signInRepositoryId(repositories?.entries ?? [], repositories?.wrapper?.repositoryId);
  });

  /**
   * The repository the open terminal pushes through, or null while it is closed. Fixed when it
   * opens: the re-reads after the session ends can change `signInRepoId`, and a new id would be a
   * new socket, so a new `git push`.
   */
  protected readonly terminalRepoId = signal<string | null>(null);

  protected readonly signInAction = computed((): Action | null =>
    this.signInRepoId()
      ? {
          label: 'Sign in to backup remote',
          variant: this.needsSignIn() ? 'success' : 'muted',
          callback: () => {
            this.syncNote.set('');
            this.terminalRepoId.set(this.signInRepoId());
          },
        }
      : null,
  );

  /** The sign-in, in the header while no backup asks for it (the alert offers it otherwise). */
  protected readonly headerActions = computed((): Action[] => {
    const action = this.signInAction();
    return action && !this.needsSignIn() && !this.terminalRepoId() ? [action] : [];
  });

  /** What the nudge after the sign-in came to, for a person; empty before one. */
  protected readonly syncNote = signal('');

  protected readonly state = computed((): LoadState => {
    const status = this.repositories()?.status;
    return status === 'loaded' || status === 'error' ? status : 'loading';
  });

  constructor() {
    // In the browser only (the server render has no session cookie). Only the project id is
    // tracked: `load` reads the store's state, and tracking that would fetch again on every answer.
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    effect(() => {
      const id = this.selected.project()?.id;
      if (browser && id) untracked(() => void this.store.load(id));
    });
    this.store.follow(() => this.selected.project()?.id, inject(DestroyRef));
  }

  /**
   * The sign-in ended, which says the terminal is gone, not that the sign-in worked. So the list is
   * read again and a sync is nudged: if the credentials landed, the sync is what turns every "Auth
   * needed" back into an outcome; if not, the badges come back unchanged.
   */
  protected async signInEnded(): Promise<void> {
    const id = this.selected.project()?.id;
    if (!id) return;
    void this.store.refresh(id);
    const scheduled = await this.store.syncBackups(id);
    if (scheduled === null) {
      this.syncNote.set(
        'Could not schedule the backups now; they run again on their own schedule.',
      );
      return;
    }
    this.syncNote.set(`Scheduled ${scheduled} backup${scheduled === 1 ? '' : 's'}.`);
  }
}
