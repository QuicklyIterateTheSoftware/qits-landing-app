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
    /** Moves the mouse to the page's top-left corner, so no element is hovered. */
    parkPointer: () => Promise<void>;
  }
}
