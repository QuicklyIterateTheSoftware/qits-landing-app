import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  PLATFORM_ID,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import {
  exit,
  outcomes,
  QitsEntity,
  QitsEntityList,
  QitsExit,
  QitsField,
  qitsResource,
  type QitsDomainEvent,
} from '@qits/angular';
import { repositoryNamed } from '$core/ci/repository-ci';
import { SelectedProject } from '$core/projects/selected-project';
import type { RepositoryEntry } from '$core/repositories/repositories.consumes';
import { PROJECT_REPOSITORY_PAGE } from '$core/repositories/repositories.operations';
import { movesWrapper } from '$core/repositories/wrapper-commits';
import { loadState } from '$core/resources/load-state';
import { RepositoryPublished } from '$patterns/repositories/repository-published/repository-published';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import type { Action } from '$ui/components/action-button/action';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** No repository found (yet). */
const NO_REPOSITORY: NonNullable<RepositoryEntry['repository']> = {};

/**
 * One repository of the open project, at `/projects/<slug>/repositories/<repository name>`
 * (qits-2478): its name and archetype, links to its own pages (contracts and entities for a
 * service, the UI builder for a frontend or an app, its docs for every one), and the artifacts it
 * publishes, each linking the artifact store's page that shows it.
 *
 * It reads the project's repositories (`PROJECT_REPOSITORY_PAGE`, in the browser only), where the
 * address's name is found (`repositoryNamed`; an unknown name says so, with a link back to the
 * Repositories page) and its archetype read, which decides the links. What the repository
 * publishes is `app-repository-published`, which reads it itself.
 *
 * Staleness (qits-1270): `SCMPublishCommit` to the wrapper's main branch (`movesWrapper`) → the
 * project's repositories. Refresh reads them and what the repository publishes again.
 */
@Component({
  selector: 'app-repository-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    LoadFailure,
    PageLayoutComponent,
    RepositoryPublished,
    QitsEntity,
    QitsEntityList,
    QitsExit,
    QitsField,
    Spinner,
  ],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout [title]="repo()" [actions]="actions">
        <p class="mt-0 mb-4 text-sm" [qitsEntityList]="repositories">
          <a
            class="font-semibold text-accent no-underline hover:underline"
            [qitsExit]="leaving.repositories"
            [exitParams]="{ slug: slug() }"
            [exitCurrent]="null"
            data-back
            >← Repositories</a
          >
          <span
            class="text-fg-soft"
            [class.hidden]="!archetype()"
            [qitsEntity]="shown()"
            entityKey="id"
            [fieldOf]="shown()"
            [qitsField]="{ derived: ['archetype'] }"
          >
            · {{ archetype() }}</span
          >
        </p>
        <ui-load-failure
          message="This project’s repositories could not be read."
          [class.hidden]="repositoriesState() !== 'error'"
          (retry)="repositories.reload()"
        />
        @if (unknown()) {
          <p class="m-0 px-3 py-8 text-center text-sm text-fg-muted" data-unknown>
            This project has no repository {{ repo() }}.
            <a
              class="text-accent no-underline hover:underline"
              [qitsExit]="leaving.repositories"
              [exitParams]="{ slug: slug() }"
              [exitCurrent]="null"
              >Back to Repositories</a
            >
          </p>
        }
        <ui-spinner
          [state]="repositoriesState()"
          class="min-h-32"
          [class.hidden]="repositoriesState() === 'error' || unknown()"
        >
          <div class="flex flex-col gap-8" [qitsEntityList]="repositories">
            <nav
              class="flex flex-wrap gap-2"
              aria-label="Repository pages"
              [qitsEntity]="shown()"
              entityKey="id"
            >
              @if (service()) {
                <a
                  class="rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-fg no-underline hover:bg-surface-muted"
                  [qitsExit]="pages.contracts"
                  [exitParams]="params()"
                  >Contracts →</a
                >
                <a
                  class="rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-fg no-underline hover:bg-surface-muted"
                  [qitsExit]="pages.entities"
                  [exitParams]="params()"
                  >Entities →</a
                >
              }
              @if (frontend()) {
                <a
                  class="rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-fg no-underline hover:bg-surface-muted"
                  [qitsExit]="pages.uiBuilder"
                  [exitParams]="params()"
                  >UI builder →</a
                >
              }
              <a
                class="rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-fg no-underline hover:bg-surface-muted"
                [qitsExit]="docs.repository"
                [exitParams]="params()"
                >Docs →</a
              >
            </nav>

            <app-repository-published [repo]="repo()" />
          </div>
        </ui-spinner>
      </app-page-layout>
    </div>
  `,
})
export class RepositoryPage {
  private readonly selected = inject(SelectedProject);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly route = inject(ActivatedRoute);

  private readonly paramMap = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  /** The address's repository name. */
  protected readonly repo = computed(() => this.paramMap().get('repo') ?? '');

  /** The open project's slug. */
  protected readonly slug = computed(
    () => this.selected.slug() ?? this.paramMap().get('slug') ?? '',
  );

  /** The open project's id, in the browser only: the repositories' read waits for it. */
  private readonly projectId = computed(() =>
    this.browser ? this.selected.project()?.id : undefined,
  );

  /** The repository's own pages, as its card links them (epic qits-2000). */
  protected readonly pages = outcomes('open-repository-pages', {
    uiBuilder: exit('projects/:slug/repositories/:repo/ui-builder'),
    contracts: exit('projects/:slug/repositories/:repo/contracts'),
    entities: exit('projects/:slug/repositories/:repo/entities'),
  });

  /** The repository's Docs page (qits-2336). */
  protected readonly docs = outcomes('open-repository-docs', {
    repository: exit('projects/:slug/docs/repositories/:repo'),
  });

  /** Back to the project's Repositories page. */
  protected readonly leaving = outcomes('leave-repository', {
    repositories: exit('projects/:slug/repositories'),
  });

  /** What the repository publishes, for Refresh. */
  private readonly published = viewChild(RepositoryPublished);

  /** The repository's pages' exit params. */
  protected readonly params = computed(() => ({ slug: this.slug(), repo: this.repo() }));

  /** The open project's repositories, read again after a commit to its wrapper's main branch. */
  protected readonly repositories = qitsResource(
    PROJECT_REPOSITORY_PAGE,
    () => {
      const projectId = this.projectId();
      return projectId ? { path: { projectId } } : undefined;
    },
    {
      refreshOn: {
        names: ['SCMPublishCommit'],
        when: (event) => this.commitsToWrapper(event),
      },
    },
  );

  /** The repositories' answer, once there. */
  private readonly repositoryAnswer = computed(() =>
    this.repositories.hasValue() ? this.repositories.value() : undefined,
  );

  /** The address's repository, once the project's repositories are read. */
  private readonly found = computed(() =>
    repositoryNamed(this.repositoryAnswer()?.entries ?? [], this.repo()),
  );

  /** The repository as shown: the found one, or an empty one before (or without) it. */
  protected readonly shown = computed(() => this.found() ?? NO_REPOSITORY);

  /** Whether the project's repositories are read and none has the address's name. */
  protected readonly unknown = computed(() => !!this.repositoryAnswer() && !this.found());

  /** The archetype, as a word: SERVICE reads "Service". */
  protected readonly archetype = computed(() => {
    const archetype = this.shown()?.archetype;
    return archetype ? archetype.charAt(0) + archetype.slice(1).toLowerCase() : '';
  });

  /** A frontend or an app, whose routes the UI builder shows (never judged by its name). */
  protected readonly frontend = computed(() => {
    const archetype = this.shown()?.archetype;
    return archetype === 'FRONTEND' || archetype === 'APP';
  });

  /** A service, whose contracts and entities have pages. */
  protected readonly service = computed(() => this.shown()?.archetype === 'SERVICE');

  protected readonly repositoriesState = computed((): LoadState => loadState(this.repositories));

  /** Refresh: reads all three again (no domain event says a release published). */
  protected readonly actions: readonly Action[] = [
    {
      label: 'Refresh',
      variant: 'muted',
      callback: () => {
        this.repositories.reload();
        this.published()?.reload();
      },
    },
  ];

  /** Whether a commit is to the wrapper's main branch, as the repositories read names them. */
  private commitsToWrapper(event: QitsDomainEvent): boolean {
    return movesWrapper(event, this.repositoryAnswer());
  }
}
