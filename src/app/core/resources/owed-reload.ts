import { effect, signal, untracked } from '@angular/core';

/** What {@link owedReload} reloads: a resource's `reload()` and `isLoading()`. */
export interface Reloadable {
  reload(): boolean;
  isLoading(): boolean;
}

/**
 * A reload for a resource followed by a subscriber of its own (qits-2146): `reload()`, or, while a
 * read is on its way (a first read or a read again: Angular's `reload()` does nothing then), one
 * more read once that read ends, as `WorkStore.refresh` queued one (qits-1684). Call it in an
 * injection context (a field initializer): it holds an effect.
 */
export function owedReload(resource: Reloadable): () => void {
  const owed = signal(false);
  effect(() => {
    if (owed() && !resource.isLoading()) {
      owed.set(false);
      untracked(() => resource.reload());
    }
  });
  return () => {
    if (!resource.reload() && untracked(() => resource.isLoading())) owed.set(true);
  };
}
