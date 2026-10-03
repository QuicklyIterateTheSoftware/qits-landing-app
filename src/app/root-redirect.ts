import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';

/**
 * The root sends the visitor on to `/projects`, replacing the root in the browser history.
 *
 * A component rather than a `redirectTo` route: a redirect route runs again on every Back, so the
 * visitor could never navigate back past it. Navigating with `replaceUrl` leaves no root entry to
 * return to.
 */
@Component({
  selector: 'app-root-redirect',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ``,
})
export class RootRedirect {
  constructor() {
    void inject(Router).navigate(['/projects'], { replaceUrl: true });
  }
}
