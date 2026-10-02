import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Spinner } from '../ui/components/spinner/spinner';
import { SelectedProject } from './selected-project';
import { SelectedWork } from './work/selected-work';
import { WorkList } from './work/work-list';
import { BACKLOG_STATUSES, BOARD_COLUMNS, withStatus } from './work/work-statuses';

/**
 * A project's work, at `/projects/<slug>/work`: the Board (work being worked on, one column per
 * status) and below it the Backlog (work not refined yet). The Archive link at the top right
 * leads to the work in a final state.
 */
@Component({
  selector: 'app-project-work',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Spinner, WorkList],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <div class="flex items-baseline justify-between gap-4">
        <h1 class="m-0 text-3xl leading-[1.1] font-bold">Work</h1>
        <a
          class="text-sm text-charcoal-brown-600 no-underline hover:text-charcoal-brown-900"
          [routerLink]="archivePath()"
          >Archive</a
        >
      </div>

      <ui-spinner [state]="work.state()" class="mt-6 min-h-48">
        <section aria-labelledby="work-board">
          <h2 id="work-board" class="mt-0 mb-3 text-lg font-semibold">Board</h2>
          <div class="overflow-x-auto">
            <ol class="m-0 grid min-w-[40rem] list-none grid-cols-3 gap-4 p-0">
              @for (column of columns(); track column.status) {
                <li
                  class="flex flex-col overflow-hidden rounded-lg border border-charcoal-brown-100 bg-charcoal-brown-50"
                >
                  <h3
                    class="m-0 flex items-baseline justify-between bg-charcoal-brown-100 px-3 py-2 text-sm font-semibold text-charcoal-brown-900"
                  >
                    {{ column.label }}
                    <span class="text-xs font-normal text-charcoal-brown-600">{{
                      column.entries.length
                    }}</span>
                  </h3>
                  <ul
                    class="m-0 flex list-none flex-col gap-2 p-2"
                    [class.hidden]="!column.entries.length"
                  >
                    @for (entry of column.entries; track entry.id) {
                      <li class="rounded-md border border-charcoal-brown-100 bg-white p-2 text-sm">
                        <div class="flex items-center justify-between gap-2">
                          <span class="font-mono text-xs text-charcoal-brown-600">{{
                            entry.qualifiedId
                          }}</span>
                          <span
                            class="rounded-sm bg-ocean-deep-50 px-1.5 text-[0.6875rem] text-ocean-deep-800"
                            >{{ entry.archetype?.toLowerCase() }}</span
                          >
                        </div>
                        <p class="mt-1 mb-0 text-charcoal-brown-900">{{ entry.title }}</p>
                      </li>
                    }
                  </ul>
                  <p
                    class="m-0 px-3 py-2 text-sm text-charcoal-brown-500"
                    [class.hidden]="column.entries.length"
                  >
                    Nothing here
                  </p>
                </li>
              }
            </ol>
          </div>
        </section>

        <section aria-labelledby="work-backlog" class="mt-8">
          <h2 id="work-backlog" class="mt-0 mb-3 text-lg font-semibold">Backlog</h2>
          <app-work-list [entries]="backlog()" />
        </section>
      </ui-spinner>
    </div>
  `,
})
export class ProjectWork {
  protected readonly work = inject(SelectedWork);
  private readonly selected = inject(SelectedProject);

  protected readonly columns = computed(() =>
    BOARD_COLUMNS.map((column) => ({
      ...column,
      entries: withStatus(this.work.entries(), [column.status]),
    })),
  );

  protected readonly backlog = computed(() => withStatus(this.work.entries(), BACKLOG_STATUSES));

  protected readonly archivePath = computed(
    () => `/projects/${this.selected.slug() ?? ''}/work/archive`,
  );
}
