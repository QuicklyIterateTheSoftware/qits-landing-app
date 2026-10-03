import type { HttpInterceptorFn } from '@angular/common/http';
import type { Provider } from '@angular/core';

/**
 * The build switch for where platform applications answer and how calls prove who is signed in.
 * This file is the deployed build's; `ng serve` (the `development` configuration) swaps in
 * `environment.development.ts` through `fileReplacements`.
 */
export const environment = {
  /**
   * `null`: deployed. Every application answers at `https://<label>.<this page's hostname>`
   * (`core/platform/platform-origins.ts`). A domain: `ng serve`, the platform to call.
   */
  platformDomain: null as string | null,
  /**
   * Deployed: cross-origin calls send the `qits-session` cookie (`credentials: 'include'`); the
   * app sits at the platform's apex, so the cookie is same-site.
   */
  sendCookie: true,
  /** Added to the app's providers. Deployed: none. */
  providers: [] as Provider[],
  /** Added to `HttpClient`'s interceptors. Deployed: none. */
  interceptors: [] as HttpInterceptorFn[],
};
