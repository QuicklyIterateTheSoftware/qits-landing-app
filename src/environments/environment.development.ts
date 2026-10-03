import type { HttpInterceptorFn } from '@angular/common/http';
import type { Provider } from '@angular/core';
import { devBearerInterceptor, provideDevBearer } from '$core/auth/dev-bearer';

/**
 * `ng serve`: the app calls the platform's applications directly, with a bearer from the idp's
 * public PKCE client instead of the session cookie, which never reaches localhost
 * (`core/auth/dev-bearer.ts`). See `environment.ts`. The only file that imports the bearer code,
 * so the deployed bundle holds none of it.
 */
export const environment = {
  platformDomain: 'qits.wohlben.eu' as string | null,
  sendCookie: false,
  providers: provideDevBearer() as Provider[],
  interceptors: [devBearerInterceptor] as HttpInterceptorFn[],
};
