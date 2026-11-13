import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, PLATFORM_ID } from '@angular/core';
import { QitsEntity, QitsEntityList, qitsResource } from '@qits/angular';
import { PROJECT_LIST } from '$core/projects/projects.operations';
import { loadState } from '$core/resources/load-state';
import type { Project } from '$core/projects/selected-project';
import { ProjectCard } from '$patterns/projects/project-card/project-card';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/**
 * The start page: every project, one card each.
 *
 * It reads the list through its own `qitsResource` over `PROJECT_LIST` (qits-2146; it was
 * a store's), in the browser only: the server render holds no token to send, so it renders
 * the heading and a loading state. Loading and failure are shown by `ui-spinner` over the list's
 * place, never as text. The list marks its read and each card its project (qits-2141); what a card
 * shows of it is the card's own business.
 *
 * Staleness (qits-1270): the list → no event (qits-projects emits none for a project created,
 * renamed or deleted), so it is read on each visit. Each card keeps its own facts current
 * (`ProjectCard`).
 */
@Component({
  selector: 'app-project-picker-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageLayoutComponent, ProjectCard, QitsEntity, QitsEntityList, Spinner],
  template: `
    <div class="mx-auto max-w-[60rem] px-6 pt-16 pb-12">
      <app-page-layout title="Projects">
        <ui-spinner [state]="state()" class="mt-6 min-h-48">
          @if (state() === 'loaded') {
            @if (listed().length === 0) {
              <p class="m-0 text-fg-muted">There are no projects yet.</p>
            } @else {
              <ul
                class="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-6 p-0"
                [qitsEntityList]="projects"
              >
                @for (project of listed(); track project.id) {
                  <li [qitsEntity]="project" entityKey="id">
                    <app-project-card [project]="project" />
                  </li>
                }
              </ul>
            }
          }
        </ui-spinner>
      </app-page-layout>
    </div>
  `,
})
export class ProjectPickerPage {
  /** No read in the server render: it has no session to send. */
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Every project, in the browser only. */
  protected readonly projects = qitsResource(PROJECT_LIST, () => (this.browser ? {} : undefined));

  /** The projects the list holds, each with an id. */
  protected readonly listed = computed((): readonly Project[] =>
    this.projects.hasValue()
      ? (this.projects.value()?.entries ?? [])
          .map((entry) => entry.project)
          .filter((project): project is Project => !!project?.id)
      : [],
  );

  protected readonly state = computed((): LoadState => loadState(this.projects));
}
