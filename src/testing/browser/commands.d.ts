// The Node-side commands `vitest-browser.config.ts` gives the browser screenshot tests.
import 'vitest/browser';

declare module 'vitest/browser' {
  interface BrowserCommands {
    /**
     * The body `provider` (default qits-projects) recorded for `operationId` in `state`. Specs use
     * `golden-master.ts`, which registers it as a recording.
     */
    goldenMaster: <T = any>(
      state: string,
      operationId: string,
      provider?: 'qits-projects' | 'qits-githost' | 'qits-events' | 'qits-maintenance',
    ) => Promise<T>;
    /** Moves the mouse to the page's top-left corner, so no element is hovered. */
    parkPointer: () => Promise<void>;
    /** Answers every request to `origin` with a plain grey page, without the network. */
    stubOrigin: (origin: string) => Promise<void>;
  }
}
