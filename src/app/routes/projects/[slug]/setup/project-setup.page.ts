import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { QitsEntity, QitsField, qitsResource } from '@qits/angular';
import { openProjectDetail } from '$core/projects/project-detail';
import { PROJECT_DETAIL } from '$core/projects/projects.operations';
import { Spinner } from '$ui/components/spinner/spinner';

/**
 * A project's settings, at `/projects/<slug>/setup`, reached by the gear in the top bar. For now it
 * only names the project; the settings come later.
 *
 * It reads the project through its own `qitsResource` over `PROJECT_DETAIL` (qits-2146), by the id
 * `SelectedProject`'s list gives the slug, and marks its name (qits-2141).
 *
 * Staleness (qits-1270): no event; qits-projects emits none for a project renamed, so the name is
 * read once per visit.
 */
@Component({
  selector: 'app-project-setup-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [QitsEntity, QitsField, Spinner],
  template: `
    <div class="mx-auto max-w-[60rem] px-6 pt-16 pb-12">
      <ui-spinner [state]="state()" class="min-h-12">
        <h1 class="m-0 text-3xl leading-[1.1] font-bold">Setup</h1>
        @let project = shown();
        <p
          class="mt-2 mb-0 text-fg-muted"
          [qitsEntity]="project"
          entityKey="id"
          [entitySource]="detail"
          [fieldOf]="project"
          qitsField="name"
        >
          {{ project.name ?? '' }}
        </p>
      </ui-spinner>
    </div>
  `,
})
export class ProjectSetupPage {
  private readonly open = openProjectDetail();

  /** The open project, by its id. */
  protected readonly detail = qitsResource(PROJECT_DETAIL, this.open.params);

  /** The project read; an empty one until it answered. */
  protected readonly shown = computed(
    () => (this.detail.hasValue() ? this.detail.value()?.project : undefined) ?? NO_PROJECT,
  );

  protected readonly state = this.open.state(this.detail);
}

/** What the page shows before the project is read: nothing. */
const NO_PROJECT: { readonly id?: string; readonly name?: string } = {};
