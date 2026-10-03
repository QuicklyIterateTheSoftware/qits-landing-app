import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformServer } from '@angular/common';
import type { CanActivateFn } from '@angular/router';
import { Session } from './session';

/**
 * Sends a visitor who is not signed in to sign in (`Session`: the cookie deployed, a bearer under
 * `ng serve`), which brings them back here.
 *
 * The server render passes: it holds no session to check, and the browser checks right after.
 */
export const sessionGuard: CanActivateFn = (_route, state) => {
  if (isPlatformServer(inject(PLATFORM_ID))) return true;
  return inject(Session).ensure(state.url);
};
