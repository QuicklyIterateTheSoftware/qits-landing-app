import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DOCUMENT, inject, PLATFORM_ID } from '@angular/core';
import { Router } from '@angular/router';
import { SignInCallback } from '$core/auth/session';

/**
 * Where the idp sends the visitor back after signing in under `ng serve` (the bearer sign-in,
 * `core/auth/dev-tokens.ts`): finishes the sign-in, then goes on to the page the sign-in started
 * from, replacing this one in the browser history.
 *
 * A failed sign-in stays here, with the reason in the console: going on would only start the next
 * sign-in, and a refusal would loop. Deployed, nothing sends a visitor here (the idp sets the
 * session cookie instead), and the page goes on to the root.
 */
// eslint-disable-next-line qits/page-has-screenshots -- renders nothing: it finishes the sign-in and navigates on
@Component({
  selector: 'app-auth-callback-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ``,
})
export class AuthCallbackPage {
  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    const router = inject(Router);
    const callback = inject(SignInCallback, { optional: true });
    const query = new URLSearchParams(inject(DOCUMENT).location.search);
    (callback ? callback.complete(query) : Promise.resolve('/')).then(
      (path) => router.navigateByUrl(path, { replaceUrl: true }),
      (error: unknown) => console.error('Sign-in failed; open / to try again.', error),
    );
  }
}
