import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { AppOrigins } from '../../../core/platform/app-origins';
import { SelectedProject } from '../../../core/projects/selected-project';

/**
 * The platform's browser editor for a project, at `/projects/<slug>/editor`, embedded in a frame
 * that fills the page.
 *
 * The frame opens qits-workspaces' editor door, `/<slug>/editor` on the workspaces host: the door
 * asks the platform for the shared editor, waits until it answers, and then moves on to the editor
 * on its own origin, opened at the project's folder. That last step happens inside the frame, so
 * this page stays the frame around it. The workspaces origin is the navigation's `qits-workspaces`
 * (`AppOrigins`); until it is known (on the server, or when the navigation names none) the frame
 * shows `about:blank`, and the layout's alert says what is missing.
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
  private readonly origins = inject(AppOrigins);
  private readonly sanitizer = inject(DomSanitizer);

  /** The editor door's address for the open project. */
  readonly url = computed(() => editorUrl(this.origins.origin('workspaces'), this.selected.slug()));

  // The origin passed `AppOrigins`' check (https, under the platform's domain); the slug is
  // encoded.
  protected readonly src = computed(() =>
    this.sanitizer.bypassSecurityTrustResourceUrl(this.url()),
  );
}

/**
 * qits-workspaces' editor door at `origin` for `slug`, or for no project when there is none;
 * `about:blank` while the origin is not known.
 */
export function editorUrl(origin: string, slug: string | undefined): string {
  if (!origin) return 'about:blank';
  return slug === undefined ? `${origin}/editor` : `${origin}/${encodeURIComponent(slug)}/editor`;
}
