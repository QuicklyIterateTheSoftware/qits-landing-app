/**
 * The build switch for where platform applications answer and how the app signs in. This file is
 * the deployed build's; `ng serve` (the `development` configuration) swaps in
 * `environment.development.ts` through `fileReplacements`.
 */
export const environment = {
  /**
   * `null`: deployed. Every application answers at `https://<label>.<this page's hostname>`
   * (`core/platform/platform-origins.ts`). A domain: `ng serve`, the platform to call.
   */
  platformDomain: null as string | null,
  /**
   * `@qits/angular`'s bearer sign-in (`provideQitsBearerSignIn`, epic qits-543): the idp's public
   * PKCE client. Deployed, `qits-spa`, whose redirect is `https://<a name under the platform
   * domain>/auth/callback`; the platform domain and the idp are read from this page's hostname
   * (the apex, `qits.<domain>`).
   */
  signInClientId: 'qits-spa',
};
