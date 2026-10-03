import { ChangeDetectionStrategy, Component } from '@angular/core';

/** A project's domain events, at `/projects/<slug>/events`. Blank for now; built up next. */
@Component({
  selector: 'app-project-events',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: ``,
})
export class ProjectEvents {}
