import { exit, outcomes } from '@qits/angular';

/**
 * The provider repository's Contracts page, as the UI builder links it (qits-2337): a call's
 * popover (`call-details.ts`) and an outbox entry with no recorded call (`ui-builder.page.ts`).
 * It replaced their links into qits-docs' reader, which the landing app's own reader hands back to
 * that page anyway. One declaration for both (`open-call-contract` `contracts`), so the popover's
 * screenshot shows the trigger and its spec follows it for either place. Call it from a field
 * initializer (an injection context).
 */
export function contractsPageOutcomes() {
  return outcomes('open-call-contract', {
    contracts: exit('projects/:slug/components/:repo/contracts'),
  });
}
