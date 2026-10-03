import { ChangeDetectionStrategy, Component } from '@angular/core';

/** A project's observability, at `/projects/<slug>/observability`. Blank for now; built up next. */
@Component({
  selector: 'app-project-observability-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: ``,
})
export class ProjectObservabilityPage {}
