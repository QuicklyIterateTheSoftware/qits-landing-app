// The Node-side commands `vitest-browser.config.ts` gives the browser screenshot tests.
import 'vitest/browser';

declare module 'vitest/browser' {
  interface BrowserCommands {
    /** The body `provider` (default qits-projects) recorded for `operationId` in `state`. */
    goldenMaster: <T = any>(
      state: string,
      operationId: string,
      provider?: 'qits-projects' | 'qits-githost',
    ) => Promise<T>;
  }
}
