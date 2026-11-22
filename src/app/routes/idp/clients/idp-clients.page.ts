import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IdpFrame } from '$patterns/idp/idp-frame/idp-frame';

/**
 * The IdP admin section's Clients page (qits-2481), at `/idp/clients`: qits-idp-frontend's
 * `/idp/clients` in a frame filling the main slot.
 */
@Component({
  selector: 'app-idp-clients-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IdpFrame],
  template: `<app-idp-frame page="clients" title="IdP admin: Clients" />`,
})
export class IdpClientsPage {}
