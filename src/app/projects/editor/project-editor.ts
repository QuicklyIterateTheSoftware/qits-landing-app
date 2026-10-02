import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { platformOrigin } from '../../core/platform-host';
import { SelectedProject } from '../selected-project';

/**
 * The platform's browser editor for a project, at `/projects/<slug>/editor`, embedded in a frame
 * that fills the page.
 *
 * The frame opens qits-workspaces' editor door, `/<slug>/editor` on the workspaces host: the door
 * asks the platform for the shared editor, waits until it answers, and then moves on to the editor
 * on its own origin, opened at the project's folder. That last step happens inside the frame, so
 * this page stays the frame around it. The workspaces host is derived from this page's host.
 *
 * `allow="clipboard-read; clipboard-write"` lets the editor copy and paste; the browser denies the
 * clipboard to a frame that is not allowed it. No `sandbox`: the editor needs scripts, storage,
 * its service worker and same-origin access to its own origin, which a sandbox would take away.
 */
@Component({
  selector: 'app-project-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The top bar is 3.5rem; the frame takes the rest of the window, without a scrollbar.
  host: { class: 'block h-[calc(100vh-3.5rem)]' },
  template: `
    <iframe
      title="Editor"
      class="block h-full w-full border-0"
      allow="clipboard-read; clipboard-write"
      [src]="src()"
    ></iframe>
  `,
})
export class ProjectEditor {
  private readonly selected = inject(SelectedProject);
  private readonly location = inject(DOCUMENT).location;
  private readonly sanitizer = inject(DomSanitizer);

  /** The editor door's address for the open project. */
  readonly url = computed(() => editorUrl(this.location, this.selected.slug()));

  // The address is built from this page's own host and a slug from the route, never from data.
  protected readonly src = computed(() =>
    this.sanitizer.bypassSecurityTrustResourceUrl(this.url()),
  );
}

/** qits-workspaces' editor door for `slug`, or for no project when there is none. */
export function editorUrl(
  location: Pick<Location, 'protocol' | 'hostname'>,
  slug: string | undefined,
): string {
  const origin = platformOrigin('workspaces', location);
  return slug === undefined ? `${origin}/editor` : `${origin}/${encodeURIComponent(slug)}/editor`;
}
