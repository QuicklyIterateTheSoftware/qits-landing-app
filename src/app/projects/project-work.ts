import { ChangeDetectionStrategy, Component } from '@angular/core';

/** A project's work, at `/projects/<slug>/work`. A blank canvas for now; its content comes next. */
@Component({
  selector: 'app-project-work',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: ``,
})
export class ProjectWork {}
