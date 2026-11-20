/**
 * swagger-ui-dist ships no type declarations; this is the narrow surface the docs reader calls
 * (qits-2337, `docs-reader.page.ts`). The UI object it returns is never read back.
 */
declare module 'swagger-ui-dist/swagger-ui-es-bundle.js' {
  interface SwaggerUIOptions {
    url: string;
    domNode: HTMLElement;
    presets?: unknown[];
    /** The methods "Try it out" may send; `[]` hides it. */
    supportedSubmitMethods?: string[];
  }
  const SwaggerUIBundle: {
    (options: SwaggerUIOptions): unknown;
    presets: { apis: unknown };
  };
  export default SwaggerUIBundle;
}
