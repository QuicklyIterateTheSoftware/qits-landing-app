import { Injectable, signal, type TemplateRef } from '@angular/core';

/**
 * A page's own navigation in the shell's sidebar (qits-2493): a page that navigates within itself
 * (the UI builder's Routes, Entities and Outcomes) hands the shell a template, which the shell draws
 * in the repository sidebar's place, below a way back to the repository, for as long as the page
 * holds it. The template is the page's, so it runs in the page's context: its bindings and clicks
 * are the page's own.
 *
 * The page shows its template in the browser only, once it has something to list, and clears it on
 * destroy; the server render, and a page with nothing to list, keep the repository sidebar. `close`
 * asks the shell to close the burger's navigation (below 768px the sidebar is an overlay), for a
 * choice in the page's list that changes what the page shows.
 */
@Injectable({ providedIn: 'root' })
export class SidebarOutlet {
  private readonly held = signal<TemplateRef<unknown> | null>(null);
  private closer: (() => void) | null = null;

  /** The template the shell draws in the sidebar; null while no page holds one. */
  readonly template = this.held.asReadonly();

  /** Draws `template` in the sidebar, in place of whatever another page held. */
  show(template: TemplateRef<unknown>): void {
    this.held.set(template);
  }

  /** Stops drawing `template`; a template another page holds by now stays. */
  clear(template: TemplateRef<unknown>): void {
    if (this.held() === template) this.held.set(null);
  }

  /** Asks the shell to close the burger's navigation; nothing while no shell listens. */
  close(): void {
    this.closer?.();
  }

  /** The shell's way to close its navigation; returns what stops it listening. */
  onClose(close: () => void): () => void {
    this.closer = close;
    return () => {
      if (this.closer === close) this.closer = null;
    };
  }
}
