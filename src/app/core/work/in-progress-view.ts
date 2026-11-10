import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { afterNextRender, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';

/**
 * How the In Progress tab draws its work (qits-2051): `epics`, each epic on the board with its own
 * epic board and one board for the rest; `inline`, everything on one board, as before.
 */
export type InProgressView = 'epics' | 'inline';

/** The `localStorage` key holding the chosen view. */
export const IN_PROGRESS_VIEW_KEY = 'qits.work.inProgressView';

/** The view where none is stored, the stored one is unknown, or there is no storage. */
export const DEFAULT_IN_PROGRESS_VIEW: InProgressView = 'epics';

const VIEWS: ReadonlySet<string> = new Set<InProgressView>(['epics', 'inline']);

function storage(document: Document): Storage | undefined {
  try {
    return document.defaultView?.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * The In Progress tab's view setting, per browser (not per account): read by the work layout (its
 * gear on the In Progress tab switches it), the In Progress page and the Acceptance page, which
 * leaves out what the epic boards show already.
 *
 * Kept in `localStorage` under {@link IN_PROGRESS_VIEW_KEY}. Every read and write is guarded: with
 * no storage, or a storage that throws, the default applies and switching still works for the
 * visit. An unknown stored value reads as the default. The server render always uses the default;
 * the stored value is applied in the browser only after the first render (`afterNextRender`), so
 * hydration never meets a page drawn another way than the server drew it.
 */
@Injectable({ providedIn: 'root' })
export class InProgressViewStore {
  private readonly document = inject(DOCUMENT);
  private readonly current = signal<InProgressView>(DEFAULT_IN_PROGRESS_VIEW);
  private chosen = false;

  /** The view in use. */
  readonly view = this.current.asReadonly();

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    // A choice made before the first render ends wins over what was stored.
    afterNextRender(() => {
      if (!this.chosen) this.current.set(this.stored());
    });
  }

  /** Uses `view` at once and keeps it for the next visit, when the browser lets it. */
  set(view: InProgressView): void {
    this.chosen = true;
    this.current.set(view);
    try {
      storage(this.document)?.setItem(IN_PROGRESS_VIEW_KEY, view);
    } catch {
      // Storage blocked or full: the view still holds for this visit.
    }
  }

  /** The stored view, or the default for none, an unknown one or no storage. */
  private stored(): InProgressView {
    try {
      const value = storage(this.document)?.getItem(IN_PROGRESS_VIEW_KEY);
      return value && VIEWS.has(value) ? (value as InProgressView) : DEFAULT_IN_PROGRESS_VIEW;
    } catch {
      return DEFAULT_IN_PROGRESS_VIEW;
    }
  }
}
