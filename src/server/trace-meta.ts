/**
 * Puts `<meta name="traceparent">` into a server-rendered page. The browser library's document-load
 * instrumentation reads it, so the browser's page-load spans join the trace of the render that
 * produced the page.
 */

/** W3C trace-context, version 00. Anything else is not written into the page. */
const TRACEPARENT = /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/;

export function withTraceparentMeta(html: string, traceparent: string | undefined): string {
  if (!traceparent || !TRACEPARENT.test(traceparent)) return html;
  return html.replace(
    /<head(\s[^>]*)?>/i,
    (head) => `${head}<meta name="traceparent" content="${traceparent}">`,
  );
}
