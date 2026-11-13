import { isPlatformBrowser, NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { QitsEntityList, qitsMutation, qitsResource, type QitsDomainEvent } from '@qits/angular';
import { SelectedProject } from '$core/projects/selected-project';
import { needsBackupSignIn, signInRepositoryId } from '$core/repositories/remote-login';
import { BACKUP_SYNC, PROJECT_REPOSITORIES } from '$core/repositories/repositories.operations';
import { movesWrapper } from '$core/repositories/repositories.store';
import { loadState } from '$core/resources/load-state';
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
 * does what the old panel did: reads the repositories again and nudges every backup
 * (`BACKUP_SYNC`, a `qitsMutation`). A refused sync is a quiet note: the backups still
 * run on their own schedule. The old panel also read the list again 3 s after an accepted sync; that
 * was a refresh timer, which qits-1270 forbids, and qits-projects emits no event for a backup's
 * outcome, so an "Auth needed" turns back into an outcome on the next read.
 *
 * It reads the open project's repositories through its own `qitsResource` over
 * `PROJECT_REPOSITORIES` (qits-2146), in the browser only (the server render has no session), and
 * marks them (qits-2141): the tree lists that read, each card marks its repository.
 *
 * Staleness (qits-1270): `SCMPublishCommit` to the open project's wrapper on its main branch → the
 * project's repositories (the resource's `refreshOn`, narrowed by `movesWrapper` as
 * `RepositoriesStore.follow` is; see the store for the gaps: no event for a repository created,
 * renamed or deleted, nor for a backup's outcome). The cards show no branch,
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
    QitsEntityList,
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
            class="mb-4 flex flex-col items-start gap-2 rounded-md border border-warning-line bg-warning-soft px-3 py-2.5 text-sm"
            role="alert"
          >
            <p class="m-0 text-warning-strong">
              The backup remote refused the platform’s credentials.
            </p>
            <p class="m-0 text-warning-strong">
              Sign in once and every repository’s backup works again: the credentials go to the
              platform’s shared store.
            </p>
            @if (signInRepoId()) {
              <ui-action-button [action]="alertSignIn" />
            } @else {
              <p class="m-0 text-warning-strong">
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
          <p
            class="m-0 mb-4 text-sm text-fg-soft"
            role="status"
            data-qits-source="qits-projects-service#backupSyncProject"
            data-qits-derived="scheduled"
          >
            {{ note }}
          </p>
        }
        <ui-spinner [state]="state()" class="min-h-48">
          <div class="flex flex-col gap-6" [qitsEntityList]="repositories">
            <section aria-label="Wrapper" [class]="tree().wrapper ? 'block' : 'hidden'">
              @if (tree().wrapper; as wrapper) {
                <app-repository-card class="max-w-[24rem]" [entry]="wrapper" [slug]="slug()" />
              }
            </section>

            <ng-template #branch let-nodes let-level="level">
              <div
                class="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-x-4 gap-y-6 py-2"
              >
                @for (node of nodes; track $index) {
                  @if (node.kind === 'repository') {
                    <app-repository-card [entry]="node.entry" [slug]="slug()" />
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
              <h2 id="repositories-other" class="mt-0 mb-2 text-sm font-semibold text-fg-soft">
                Not in the wrapper
              </h2>
              <div class="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-x-4 gap-y-6">
                @for (entry of tree().other; track entry.repository?.id) {
                  <app-repository-card [entry]="entry" [slug]="slug()" />
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
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** The open project's id, in the browser only: the read waits for it. */
  private readonly projectId = computed(() =>
    this.browser ? this.selected.project()?.id : undefined,
  );

  /** The open project's repositories, read again after a commit to its wrapper's main branch. */
  protected readonly repositories = qitsResource(
    PROJECT_REPOSITORIES,
    () => {
      const projectId = this.projectId();
      return projectId ? { path: { projectId } } : undefined;
    },
    { refreshOn: { names: ['SCMPublishCommit'], when: (event) => this.commitsToWrapper(event) } },
  );

  /** Nudges every backup after the sign-in. */
  private readonly sync = qitsMutation(BACKUP_SYNC);

  /** The repositories read, once answered. */
  private readonly answer = computed(() =>
    this.repositories.hasValue() ? this.repositories.value() : undefined,
  );

  /** The open project's slug, for the cards' links. */
  protected readonly slug = computed(() => this.selected.slug() ?? '');

  protected readonly tree = computed(() => {
    const repositories = this.answer();
    return repositoryTree(repositories?.entries ?? [], repositories?.wrapper);
  });

  /** Whether any repository's last backup asked for a sign-in. */
  protected readonly needsSignIn = computed(() => needsBackupSignIn(this.answer()?.entries ?? []));

  /** The repository the sign-in terminal pushes through; null when none has a backup remote. */
  protected readonly signInRepoId = computed(() => {
    const repositories = this.answer();
    return signInRepositoryId(repositories?.entries ?? [], repositories?.wrapper?.repositoryId);
  });

  /**
   * The repository the open terminal pushes through, or null while it is closed. Fixed when it
   * opens: the re-reads after the session ends can change `signInRepoId`, and a new id would be a
   * new socket, so a new `git push`.
   */
  protected readonly terminalRepoId = signal<string | null>(null);

  /** Opens the sign-in terminal through `signInRepoId`'s repository. */
  private openSignIn(): void {
    this.syncNote.set('');
    this.terminalRepoId.set(this.signInRepoId());
  }

  /** The sign-in in the alert, which shows while a backup asks for it. */
  protected readonly alertSignIn: Action = {
    label: 'Sign in to backup remote',
    variant: 'success',
    callback: () => this.openSignIn(),
  };

  /** The sign-in in the header, while no backup asks for it (the alert offers it otherwise). */
  private readonly headerSignIn: Action = {
    label: 'Sign in to backup remote',
    variant: 'muted',
    callback: () => this.openSignIn(),
  };

  /** The header's sign-in, when a repository has a backup remote to sign in through. */
  protected readonly headerActions = computed((): Action[] =>
    this.signInRepoId() && !this.needsSignIn() && !this.terminalRepoId() ? [this.headerSignIn] : [],
  );

  /** What the nudge after the sign-in came to, for a person; empty before one. */
  protected readonly syncNote = signal('');

  protected readonly state = computed((): LoadState => loadState(this.repositories));

  /** Whether a commit is to the wrapper's main branch, as the repositories read names them. */
  private commitsToWrapper(event: QitsDomainEvent): boolean {
    return movesWrapper(event, this.answer());
  }

  /**
   * The sign-in ended, which says the terminal is gone, not that the sign-in worked. So the list is
   * read again and a sync is nudged: if the credentials landed, the sync is what turns every "Auth
   * needed" back into an outcome; if not, the badges come back unchanged.
   */
  protected async signInEnded(): Promise<void> {
    const projectId = this.selected.project()?.id;
    if (!projectId) return;
    this.repositories.reload();
    const scheduled = await this.sync
      .run({ path: { projectId } })
      .then((answer) => (answer ? (answer.scheduled ?? 0) : null))
      .catch(() => null);
    if (scheduled === null) {
      this.syncNote.set(
        'Could not schedule the backups now; they run again on their own schedule.',
      );
      return;
    }
    this.syncNote.set(`Scheduled ${scheduled} backup${scheduled === 1 ? '' : 's'}.`);
  }
}
