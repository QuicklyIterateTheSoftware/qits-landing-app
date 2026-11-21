/**
 * A cache root's eviction window (qits-2358) in words: qits-mirror answers it as an ISO-8601
 * duration (`EvictionConfig.window()`), `P30D` for the npm and OCI caches and `P90D` for maven by
 * default. `P1D` is `1 day`, `P30D` `30 days`; anything else (`PT12H`, `P1M`) is shown as the server
 * wrote it rather than guessed at.
 */
export function evictionWindowWords(window: string): string {
  const days = /^P(\d+)D$/.exec(window.trim());
  if (!days) return window;
  const n = Number(days[1]);
  return `${n} ${n === 1 ? 'day' : 'days'}`;
}
