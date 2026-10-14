/** A range of lines, one-based and inclusive at both ends, the way a file's own line numbers read. */
export interface LineRange {
  readonly startLine: number;
  readonly endLine: number;
}

/** A range that has just been picked, with the text it stood for captured at pick time. */
export interface PickedRange extends LineRange {
  readonly excerpt: string;
}

/** `12` for one line, `12-20` for a span: what a chip prints and the `lines` parameter carries. */
export function formatRange(range: LineRange): string {
  return range.startLine === range.endLine
    ? `${range.startLine}`
    : `${range.startLine}-${range.endLine}`;
}

/**
 * Read a `lines` parameter. Anything unreadable is no anchor rather than an error: the parameter is
 * hand-editable, and a malformed one should cost the highlight, never the file.
 */
export function parseRange(value: string | null | undefined): LineRange | null {
  if (!value) return null;
  const match = /^(\d+)(?:-(\d+))?$/.exec(value.trim());
  if (!match) return null;
  const start = Number(match[1]);
  const end = match[2] === undefined ? start : Number(match[2]);
  if (start < 1 || end < start) return null;
  return { startLine: start, endLine: end };
}
