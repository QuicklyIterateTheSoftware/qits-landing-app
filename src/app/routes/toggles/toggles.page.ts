import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, PLATFORM_ID } from '@angular/core';
import {
  exit,
  outcomes,
  QitsEntity,
  QitsEntityList,
  QitsExit,
  QitsField,
  qitsResource,
} from '@qits/angular';
import { plural } from '$core/artifacts/artifact-listings';
import { loadState } from '$core/resources/load-state';
import type { ToggleRow, ToggleRows } from '$core/toggles/toggles.consumes';
import { TOGGLE_LIST } from '$core/toggles/toggles.operations';
import { ruleInBrief } from '$core/toggles/toggle-rules';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import type { Action } from '$ui/components/action-button/action';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** The answer while the read has none. */
const NO_TOGGLES: ToggleRows = [];

/**
 * The Toggles section's list (qits-2704), at `/toggles`: qits-toggles' declared feature toggles,
 * reached from the root sidebar with no project open.
 *
 * **Load budget: 1, nothing per row.** `TOGGLE_LIST` (`getToggles`) is the table, by slug. The read
 * is made in the browser only (the server render has no session).
 *
 * - Rows: slug (opening its rule editor, `open-toggle`), description, and its ordered rules in brief
 *   (`user alice → on`, `from <instant> → on`, `else off`): the first that matches decides.
 * - **No create control.** A toggle exists only by its declaration in qits-toggles-service's code;
 *   the lede says so, and so does the empty list.
 *
 * Last use by a deployed pact and an open removal ticket (qits-2714) are not shown yet: the released
 * qits-toggles document and golden masters do not carry them.
 *
 * States: loading; no toggle declared; any failure says the toggles cannot be read, with Retry.
 *
 * Staleness: no `refreshOn` (qits-toggles sends no event); Refresh reads the list again.
 */
@Component({
  selector: 'app-toggles-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    LoadFailure,
    PageLayoutComponent,
    QitsEntity,
    QitsEntityList,
    QitsExit,
    QitsField,
    Spinner,
  ],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout title="Toggles" [actions]="actions">
        <p class="mt-0 mb-2 text-sm text-fg-soft">
          Feature toggles, each evaluated once per call chain. A toggle is declared in
          qits-toggles-service’s code and ships with its release; here you configure its rules.
        </p>
        @if (state() === 'loaded') {
          <p class="mt-0 mb-4 text-sm text-fg-soft" [qitsEntityList]="toggles" data-lede>
            <span [fieldOf]="answer()" [qitsField]="marks.count">{{ caption() }}</span>
          </p>
        }

        <ui-load-failure
          message="The toggles cannot be read right now."
          [class.hidden]="state() !== 'error'"
          (retry)="toggles.reload()"
        />
        <ui-spinner [state]="state()" class="min-h-32" [class.hidden]="state() === 'error'">
          @if (rows().length === 0) {
            <p
              role="status"
              class="m-0 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
            >
              No toggle is declared. A toggle is added by declaring it in qits-toggles-service’s
              code, not here.
            </p>
          } @else {
            <div class="overflow-x-auto">
              <table class="w-full border-collapse text-left text-sm" aria-label="Toggles">
                <thead>
                  <tr class="border-b border-line text-xs text-fg-muted">
                    <th class="py-1.5 pr-3 font-semibold">Toggle</th>
                    <th class="py-1.5 pr-3 font-semibold">Description</th>
                    <th class="py-1.5 font-semibold">Rules, first match decides</th>
                  </tr>
                </thead>
                <tbody [qitsEntityList]="toggles">
                  @for (row of rows(); track row.slug) {
                    <tr
                      class="border-b border-line-subtle align-top"
                      [qitsEntity]="row"
                      entityKey="slug"
                    >
                      <td class="py-1.5 pr-3 whitespace-nowrap">
                        <a
                          class="font-mono font-medium text-accent no-underline hover:underline"
                          [qitsExit]="opening.toggle"
                          [exitParams]="{ slug: row.slug ?? '' }"
                          [fieldOf]="row"
                          qitsField="slug"
                          >{{ row.slug }}</a
                        >
                      </td>
                      <td class="py-1.5 pr-3 text-fg-soft" [fieldOf]="row" qitsField="description">
                        {{ row.description }}
                      </td>
                      <td class="py-1.5" [fieldOf]="row" [qitsField]="marks.rules">
                        <ol class="m-0 list-none p-0 font-mono text-xs">
                          @for (rule of row.rules ?? []; track $index) {
                            <li>{{ brief(rule) }}</li>
                          }
                        </ol>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </ui-spinner>
      </app-page-layout>
    </div>
  `,
})
export class TogglesPage {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** A row's slug: that toggle's rule editor. */
  protected readonly opening = outcomes('open-toggle', { toggle: exit('toggles/:slug') });

  /** The declared toggles; read again on Refresh only (no event announces a change). */
  protected readonly toggles = qitsResource(TOGGLE_LIST, () => (this.browser ? {} : undefined));

  /** The read's answer; no toggles while it has none. */
  protected readonly answer = computed(
    (): ToggleRows => (this.toggles.hasValue() ? this.toggles.value() : undefined) ?? NO_TOGGLES,
  );

  /** The rows, by slug as the service sends them. */
  protected readonly rows = computed((): readonly ToggleRow[] => this.answer());

  protected readonly state = computed((): LoadState => loadState(this.toggles));

  /** `1 declared toggle`. */
  protected readonly caption = computed(() =>
    plural(this.rows().length, 'declared toggle', 'declared toggles'),
  );

  /** Refresh: the toggles, read again (qits-toggles sends no event for them). */
  protected readonly actions: readonly Action[] = [
    { label: 'Refresh', variant: 'muted', callback: () => this.toggles.reload() },
  ];

  protected readonly marks = MARKS;

  protected brief(rule: NonNullable<ToggleRow['rules']>[number]): string {
    return ruleInBrief(rule);
  }
}

/** The data marks of what the page derives (each a class constant, as the rule reads). */
const MARKS = {
  count: { derived: [] },
  rules: { derived: ['rules'] },
} as const;
