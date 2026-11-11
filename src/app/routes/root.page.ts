import { ChangeDetectionStrategy, Component } from '@angular/core';
import { exit, outcomes } from '@qits/angular';

/**
 * The root sends the visitor on to `/projects`, replacing the root in the browser history.
 *
 * A component rather than a `redirectTo` route: a redirect route runs again on every Back, so the
 * visitor could never navigate back past it. Navigating with `replaceUrl` leaves no root entry to
 * return to.
 *
 * Where it leads is declared (`leave-root:projects`, epic qits-2000), with no trigger: the page
 * renders nothing and leaves at once.
 */
// eslint-disable-next-line qits/page-has-screenshots -- only redirects, renders nothing
@Component({
  selector: 'app-root-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ``,
})
export class RootPage {
  private readonly leaving = outcomes(
    'leave-root',
    { projects: exit('projects') },
    { triggered: false },
  );

  constructor() {
    void this.leaving.projects.go(undefined, { replaceUrl: true });
  }
}
