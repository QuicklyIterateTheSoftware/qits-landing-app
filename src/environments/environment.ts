/**
 * The build switch for where platform applications answer (`core/platform/platform-origins.ts`).
 * This file is the deployed build's; `ng serve` (the `development` configuration) swaps in
 * `environment.development.ts` through `fileReplacements`.
 */
export const environment = {
  /**
   * `null`: deployed. Every application answers at `https://<label>.<this page's hostname>`.
   * A domain: `ng serve`. Api paths stay on this page's origin (`proxy.conf.json` serves them),
   * and pages (the Editor frame, links) open on that domain.
   */
  platformDomain: null as string | null,
};
