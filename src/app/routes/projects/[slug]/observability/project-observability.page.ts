import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * A project's observability, at `/projects/<slug>/observability`. Blank for now; built up next.
 *
 * Staleness (qits-1270): holds no platform state yet, so nothing to follow.
 */
@Component({
  selector: 'app-project-observability-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: ``,
})
export class ProjectObservabilityPage {}
