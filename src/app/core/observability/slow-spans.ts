/**
 * Duration floors and durations as the Traces page draws them (qits-2341, qits-2342). The Slow
 * spans page these began on is gone (qits-2536): its view is the Traces page with a floor.
 */

/** A floor as a duration: `500 ms`, `1 s`. */
export function floorText(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${ms / 1000} s`;
}

/** A floor's label: `500 ms or slower`, `1 s or slower`, `Any duration`. */
export function thresholdLabel(ms: number): string {
  return ms === 0 ? 'Any duration' : `${floorText(ms)} or slower`;
}

/** A span's duration: `750 ms` under a second, else seconds with one decimal (`1.2 s`). */
export function formatSpanDuration(durationMs: number | undefined): string {
  if (durationMs === undefined || !Number.isFinite(durationMs)) return '';
  if (durationMs < 1000) return `${Number(durationMs.toFixed(1))} ms`;
  return `${(durationMs / 1000).toFixed(1)} s`;
}
