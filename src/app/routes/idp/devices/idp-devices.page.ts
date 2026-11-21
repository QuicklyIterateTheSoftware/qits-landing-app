import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IdpFrame } from '$patterns/idp/idp-frame/idp-frame';

/**
 * The IdP admin section's Signed-in devices page (qits-2481), at `/idp/devices`: qits-idp-frontend's
 * `/idp/devices` in a frame filling the main slot.
 */
@Component({
  selector: 'app-idp-devices-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IdpFrame],
  template: `<app-idp-frame page="devices" title="IdP admin: Signed-in devices" />`,
})
export class IdpDevicesPage {}
