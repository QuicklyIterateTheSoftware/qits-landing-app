import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  PLATFORM_ID,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { exit, outcomes, QitsExit, qitsResource } from '@qits/angular';
import { MAINTENANCE_BUMP } from '$core/maintenance/maintenance.operations';
import { SelectedProject } from '$core/projects/selected-project';
import { isMissing } from '$core/resources/resource-family';
import { loadState } from '$core/resources/load-state';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner } from '$ui/components/spinner/spinner';

/**
 * A bump's old address, `/projects/<slug>/maintenance/bumps/<bumpId>` (qits-2332), since the bump
 * page moved under its repository (qits-2489). qits-maintenance-frontend's and the maintenance
 * service webui's `DependenciesRedirect` still hand off here, so it stays an entry point. It reads
 * the bump (`MAINTENANCE_BUMP`, in the browser only), and replaces the address with the bump's
 * page under its `repository` (`follow-moved-bump`). A bump the service does not know (404), or
 * one naming no repository, says so, with a link to the project's Components; any other failed
 * read offers Retry.
 */
@Component({
  selector: 'app-bump-redirect-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LoadFailure, PageLayoutComponent, QitsExit, Spinner],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout title="Bump">
        <ui-load-failure
          message="This bump could not be read."
          [class.hidden]="state() !== 'error' || orphan()"
          (retry)="read.reload()"
        />
        @if (orphan()) {
          <p class="m-0 px-3 py-8 text-center text-sm text-fg-muted" data-missing>
            No bump {{ bumpId() }}, so it has no page here.
            <a
              class="text-accent no-underline hover:underline"
              [qitsExit]="moving.components"
              [exitParams]="{ slug: slug() }"
              >Components</a
            >
          </p>
        }
        <ui-spinner
          [state]="state()"
          class="min-h-32"
          [class.hidden]="state() === 'error' || orphan()"
        />
      </app-page-layout>
    </div>
  `,
})
export class BumpRedirectPage {
  private readonly selected = inject(SelectedProject);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly route = inject(ActivatedRoute);

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  /** The bump the old address names. */
  protected readonly bumpId = computed(() => this.params().get('bumpId') ?? '');

  protected readonly slug = computed(() => this.selected.slug() ?? this.params().get('slug') ?? '');

  /** The bump under its repository, or the project's Components for a bump with no page. */
  protected readonly moving = outcomes('follow-moved-bump', {
    bump: exit('projects/:slug/components/:repo/bumps/:bumpId'),
    components: exit('projects/:slug/components'),
  });

  /** The bump, in the browser only. */
  protected readonly read = qitsResource(MAINTENANCE_BUMP, () => {
    const id = this.bumpId();
    return this.browser && id ? { path: { id } } : undefined;
  });

  /** The bump's repository, once read: `''` when it names none. */
  private readonly repository = computed(() => {
    if (!this.read.hasValue()) return undefined;
    return this.read.value()?.repository ?? '';
  });

  /** The service does not know the bump, or the bump names no repository. */
  protected readonly orphan = computed(() => isMissing(this.read) || this.repository() === '');

  protected readonly state = computed(() => loadState(this.read));

  constructor() {
    effect(() => {
      const repo = this.repository();
      if (!repo) return;
      const params = { slug: this.slug(), repo, bumpId: this.bumpId() };
      void this.moving.bump.go(params, { replaceUrl: true });
    });
  }
}
