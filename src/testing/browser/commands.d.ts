// The Node-side commands `vitest-browser.config.ts` gives the browser screenshot tests.
import 'vitest/browser';

declare module 'vitest/browser' {
  interface BrowserCommands {
    /** The body qits-projects recorded for `operationId` in `state` (its golden masters). */
    goldenMaster: <T = any>(state: string, operationId: string) => Promise<T>;
  }
}
