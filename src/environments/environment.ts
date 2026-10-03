/**
 * The build switch for where backend calls go. This file is the deployed build's; `ng serve` (the
 * `development` configuration) swaps in `environment.development.ts` through `fileReplacements`.
 */
export const environment = {
  /**
   * False: each backend is called at its own application's origin, read from `/main-navigation`
   * (`core/platform/app-origins.ts`). True: every call stays on this page's origin, which only
   * works where something serves the backends' paths there, i.e. `proxy.conf.json` under
   * `ng serve`.
   */
  sameOriginApis: false,
};
