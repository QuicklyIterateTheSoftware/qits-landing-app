import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * One work item's page, at `/projects/<slug>/work/<qualified id>`, reached from any card on the
 * board, the backlog or the archive. Blank for now; designed later.
 */
@Component({
  selector: 'app-work-item-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: ``,
})
export class WorkItemPage {}
