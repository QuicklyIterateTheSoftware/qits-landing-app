import { isPlatformBrowser } from '@angular/common';
import { computed, type DestroyRef, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { qitsResource } from '@qits/angular';
import { injectRefreshOn } from '$core/events/refresh-on';
import { owedReload } from '$core/resources/owed-reload';
import { SelectedProject } from '$core/projects/selected-project';
import type { WrapperClosing } from './work.consumes';
import { WRAPPER_CLOSINGS } from './wrapper-closings.operations';

/** The events after which a project's wrapper closings may have moved (see the service's comment). */
export const WRAPPER_CLOSING_EVENTS = [
  'EntityTransitioned',
  'ReleaseRequestStateChanged',
  'ReleaseRequestChanged',
] as const;

/**
 * Where each VERIFIED ticket of the open project stands on its way to DONE (qits-1873; qits-2146, in
 * place of `WrapperClosingsStore`): one root `qitsResource` over `WRAPPER_CLOSINGS`
 * (`listWrapperClosings`), one row per ticket, with the verdict of the platform's close rules and
 * the wrapper release request its ledger row names. A VERIFIED ticket's line
 * (`app-wrapper-closing`, in the lists and on its page) reads it by the ticket's qualified id.
 *
 * - `want()`: read the open project's closings from now on, in the browser only. The line calls it:
 *   only a page drawing a VERIFIED ticket asks, once per project however many lines show.
 * - `closingOf(qualifiedId)`: the ticket's row; undefined while not read, after an error, or when
 *   the ticket has none. A failed read again keeps the rows.
 * - `follow(destroy)`: keeps the closings current while `destroy` lives.
 *
 * Staleness (qits-1270): `EntityTransitioned` whose `entities[].projectId` names the open project
 * (a ticket reaching VERIFIED gets a row, one leaving it loses it), and `ReleaseRequestStateChanged`
 * or `ReleaseRequestChanged` whose `projectId` is the open project (the wrapper request joined,
 * moved, approved, finalized or withdrawn) → the closings (`reload()`), debounced 1 s, and only once
 * they were read; through `follow`, which the work layout and the work item page call, rather than
 * the resource's own `refreshOn`, since the resource is the app's and its events are wanted only
 * while those pages show. A ledger row moving without its request's event (a ticket's branch
 * pushed, PUSHED) shows on the next read.
 */
@Injectable({ providedIn: 'root' })
export class WrapperClosings {
  private readonly selected = inject(SelectedProject);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly refreshOn = injectRefreshOn();
  private readonly wanted = signal(false);

  /** The open project's id, once a line wants the closings, in the browser only. */
  private readonly projectId = computed(() =>
    this.browser && this.wanted() ? this.selected.project()?.id : undefined,
  );

  /** The open project's wrapper closings. */
  readonly resource = qitsResource(WRAPPER_CLOSINGS, () => {
    const project = this.projectId();
    return project ? { path: { project } } : undefined;
  });

  private readonly reload = owedReload(this.resource);

  /** Each VERIFIED ticket's row, by its qualified id. */
  private readonly byTicket = computed(
    () =>
      new Map(
        (this.resource.hasValue() ? (this.resource.value()?.closings ?? []) : []).flatMap((c) =>
          c.ticket ? [[c.ticket, c] as const] : [],
        ),
      ),
  );

  /** Reads the open project's closings from now on. */
  want(): void {
    this.wanted.set(true);
  }

  /** The ticket's row, by its qualified id. */
  closingOf(qualifiedId: string): WrapperClosing | undefined {
    return this.byTicket().get(qualifiedId);
  }

  /** Keeps the read closings of the open project current while `destroy` lives. */
  follow(destroy: DestroyRef): void {
    this.refreshOn(
      {
        names: WRAPPER_CLOSING_EVENTS,
        when: (_, ids) => {
          const id = this.projectId();
          return !!id && this.resource.hasValue() && ids.projectIds.includes(id);
        },
        refresh: () => this.reload(),
      },
      destroy,
    );
  }
}
