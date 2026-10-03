import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { WorkspaceHistoryEntry } from '$core/workspaces/workspaces.consumes';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';
import { Tag } from '$ui/components/tag/tag';

/**
 * A work item's workspaces in every state (active, integrated, abandoned), newest first: each with
 * its state, its branch, when it was opened and, once resolved, when it was closed (UTC). Each
 * links to the item's workspace page, `link`. "No workspaces yet" for none. A region named
 * "Workspaces"; `state` is the read's (`WorkspacesStore.historyOf`). The list is read in the
 * browser only, so the server renders none of its rows, and a row may use `@if`.
 */
@Component({
  selector: 'app-work-workspaces',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, Spinner, Tag],
  host: { class: 'block' },
  template: `
    <section class="flex flex-col gap-3" aria-label="Workspaces">
      <h2 class="m-0 text-base font-semibold text-charcoal-brown-900">Workspaces</h2>
      <ui-spinner [state]="state()" class="min-h-8">
        <ol class="m-0 flex list-none flex-col gap-2 p-0">
          @for (workspace of workspaces(); track workspace.id) {
            <li>
              <a
                class="flex items-center gap-3 rounded-md border border-charcoal-brown-200 px-4 py-2 text-sm text-charcoal-brown-900 no-underline transition-shadow duration-150 hover:shadow-md"
                [routerLink]="link()"
              >
                <!-- A fixed width, so the branches line up. -->
                <span class="w-20 shrink-0">
                  <ui-tag [label]="workspace.status?.toLowerCase() ?? ''" />
                </span>
                <span class="min-w-0 flex-1 font-mono text-xs wrap-anywhere">{{
                  workspace.branch
                }}</span>
                <span class="shrink-0 text-xs whitespace-nowrap text-charcoal-brown-600">
                  Opened {{ workspace.createdAt | date: 'd MMM y, HH:mm' : 'UTC' }}
                  @if (workspace.resolvedAt; as closed) {
                    · Closed {{ closed | date: 'd MMM y, HH:mm' : 'UTC' }}
                  }
                </span>
              </a>
            </li>
          }
        </ol>
        <p
          class="m-0 text-sm text-charcoal-brown-500"
          [class.hidden]="state() !== 'loaded' || workspaces().length"
        >
          No workspaces yet
        </p>
      </ui-spinner>
    </section>
  `,
})
export class WorkWorkspaces {
  readonly workspaces = input.required<readonly WorkspaceHistoryEntry[]>();
  readonly state = input.required<LoadState>();
  /** The item's workspace page, `/projects/<slug>/workspaces/<qualified id>`. */
  readonly link = input.required<string>();
}
