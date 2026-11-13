import type { LoadState } from '$ui/components/spinner/spinner';

/** What a resource's read has come to, as far as a spinner needs it. */
export interface ReadProgress {
  status(): string;
  hasValue(): boolean;
}

/**
 * What a `qitsResource`'s spinner shows (qits-2146): failed, loaded (a quiet read again included,
 * which keeps the value), else loading. An idle resource (its params still undefined) is loading.
 */
export function loadState(read: ReadProgress): LoadState {
  if (read.status() === 'error') return 'error';
  return read.hasValue() ? 'loaded' : 'loading';
}
