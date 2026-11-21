import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IdpFrame } from '$patterns/idp/idp-frame/idp-frame';

/**
 * The IdP admin section's Users page (qits-2481), at `/idp/users`: qits-idp-frontend's
 * `/idp/users` in a frame filling the main slot.
 */
@Component({
  selector: 'app-idp-users-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IdpFrame],
  template: `<app-idp-frame page="users" title="IdP admin: Users" />`,
})
export class IdpUsersPage {}
