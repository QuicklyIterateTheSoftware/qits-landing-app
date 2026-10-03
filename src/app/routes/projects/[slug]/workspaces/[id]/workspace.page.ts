import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';

/**
 * The workspace of a work item, at `/projects/<slug>/workspaces/<qualified id>`: where a
 * workspace link on a card leads. Only its title for now; what it shows is decided later.
 */
@Component({
  selector: 'app-workspace-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageLayoutComponent],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout [title]="title()" />
    </div>
  `,
})
export class WorkspacePage {
  /** The work item's qualified id in the URL. */
  protected readonly id = toSignal(
    inject(ActivatedRoute).paramMap.pipe(map((params) => params.get('id') ?? '')),
    { initialValue: '' },
  );

  protected readonly title = computed(() => `Workspace ${this.id()}`);
}
