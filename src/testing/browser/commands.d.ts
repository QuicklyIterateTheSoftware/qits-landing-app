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
      provider?:
        | 'qits-projects'
        | 'qits-githost'
        | 'qits-events'
        | 'qits-maintenance'
        | 'qits-workspaces'
        | 'qits-ci'
        | 'qits-workspace-daemon'
        | 'qits-system',
    ) => Promise<T>;
    /** Moves the mouse to the page's top-left corner, so no element is hovered. */
    parkPointer: () => Promise<void>;
    /**
     * A real mouse step at (`x`, `y`) in the test page's viewport: `move` there (in `steps`
     * moves), or move there and press (`down`) or release (`up`) the left button.
     */
    mouse: (action: 'move' | 'down' | 'up', x: number, y: number, steps?: number) => Promise<void>;
    /** Answers every request matching `pattern` with a plain grey image, without the network. */
    stubFigure: (pattern: string) => Promise<void>;
  }
}
