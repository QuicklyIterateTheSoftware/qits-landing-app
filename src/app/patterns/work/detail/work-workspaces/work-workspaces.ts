import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  exit,
  outcomes,
  QitsEntity,
  QitsEntityList,
  QitsExit,
  QitsField,
  type QitsResourceRef,
} from '@qits/angular';
import type { WorkItemWorkspaces } from '$core/workspaces/workspaces.consumes';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';
import { Tag } from '$ui/components/tag/tag';

/**
 * A work item's workspaces in every state (active, integrated, abandoned), newest first: each with
 * its state, its branch, when it was opened and, once resolved, when it was closed (UTC). Each
 * links to the item's agent, `/projects/<slug>/work/detail/<qualified id>/agent` (the declared exit
 * `open-workspace-agent` `open`, epic qits-2000), which leads on to its ACTIVE agent's page: a
 * workspace names no agent. "No workspaces yet" for none. A region named
 * "Workspaces"; `workspaces` is the work item page's read (`WORK_ITEM_WORKSPACES`, qits-2146), and
 * each row marks its workspace (`qitsEntity` by `id`) and the fields it shows. The list is read in the
 * browser only, so the server renders none of its rows, and a row may use `@if`.
 */
@Component({
  selector: 'app-work-workspaces',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, QitsEntity, QitsEntityList, QitsExit, QitsField, Spinner, Tag],
  host: { class: 'block' },
  template: `
    <section class="flex flex-col gap-3" aria-label="Workspaces">
      <h2 class="m-0 text-base font-semibold text-fg">Workspaces</h2>
      <ui-spinner [state]="state()" class="min-h-8">
        <ol class="m-0 flex list-none flex-col gap-2 p-0" [qitsEntityList]="workspaces()">
          @for (entry of answer()?.entries ?? []; track entry.workspace?.id) {
            @if (entry.workspace; as workspace) {
              <li [qitsEntity]="workspace" entityKey="id">
                <a
                  class="flex items-center gap-3 gap-y-1 rounded-md border border-line px-4 py-2 text-sm text-fg no-underline transition-shadow duration-150 hover:shadow-md max-sm:flex-wrap"
                  [qitsExit]="opening.open"
                  [exitParams]="{ slug: slug(), id: qualifiedId() }"
                >
                  <!-- A fixed width, so the branches line up. -->
                  <span class="w-20 shrink-0">
                    <ui-tag
                      [fieldOf]="workspace"
                      [qitsField]="{ derived: ['status'] }"
                      [label]="workspace.status?.toLowerCase() ?? ''"
                    />
                  </span>
                  <span
                    class="min-w-0 flex-1 font-mono text-xs wrap-anywhere"
                    [fieldOf]="workspace"
                    qitsField="branch"
                    >{{ workspace.branch }}</span
                  >
                  <span
                    class="shrink-0 text-xs whitespace-nowrap text-fg-soft max-sm:basis-full max-sm:whitespace-normal"
                  >
                    Opened
                    <span [fieldOf]="workspace" [qitsField]="{ derived: ['createdAt'] }">{{
                      workspace.createdAt | date: 'd MMM y, HH:mm' : 'UTC'
                    }}</span>
                    @if (workspace.resolvedAt; as closed) {
                      · Closed
                      <span [fieldOf]="workspace" [qitsField]="{ derived: ['resolvedAt'] }">{{
                        closed | date: 'd MMM y, HH:mm' : 'UTC'
                      }}</span>
                    }
                  </span>
                </a>
              </li>
            }
          }
        </ol>
        <p class="m-0 text-sm text-fg-muted" [class.hidden]="state() !== 'loaded' || count()">
          No workspaces yet
        </p>
      </ui-spinner>
    </section>
  `,
})
export class WorkWorkspaces {
  /** The item's workspaces: the work item page's read. */
  readonly workspaces = input.required<QitsResourceRef<WorkItemWorkspaces>>();

  /** How the read stands (the page's `loadState` of it). */
  readonly state = input.required<LoadState>();

  /** The workspaces as read; none until they are in, and after a failed first read. */
  protected readonly answer = computed(() => {
    const read = this.workspaces();
    return read.hasValue() ? read.value() : undefined;
  });

  protected readonly count = computed(
    () => this.answer()?.entries?.filter((e) => e.workspace).length ?? 0,
  );

  /** The open project's slug and the item's qualified id: its agent address (a redirect). */
  readonly slug = input.required<string>();
  readonly qualifiedId = input.required<string>();

  protected readonly opening = outcomes('open-workspace-agent', {
    open: exit('projects/:slug/work/detail/:id/agent'),
  });
}
