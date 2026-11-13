import { signal, untracked, type Injector } from '@angular/core';
import {
  QitsApiError,
  qitsResource,
  type QitsOperation,
  type QitsRefreshOn,
  type QitsResourceRef,
} from '@qits/angular';

/** Whether a read failed because the thing is not there (a 404), which reading again won't change. */
export function isMissing(read: { status(): string; error(): unknown }): boolean {
  const error = read.status() === 'error' ? read.error() : undefined;
  return error instanceof QitsApiError && error.status === 404;
}

/**
 * Keyed `qitsResource`s over one read operation, made on demand (qits-2146): a root service that
 * reads one file per site, version or path (as a store kept them in a record by key) asks
 * `read(key, params)` for each, and every component reading `get(key)` shares that one read.
 *
 * A key's resource is made once, with its params fixed, under the service's injector, so it lives as
 * long as the service; `read` again reads a failed one again (unless it is missing, a 404, and the
 * caller does not ask for that too). Make
 * them outside a reactive context (a constructor, an effect's `untracked`, an event handler): a
 * resource is not made inside a `computed`. `refreshOn`, when given, is each resource's own.
 */
export class ResourceFamily<Params, Value, Err = unknown> {
  private readonly reads = signal<ReadonlyMap<string, QitsResourceRef<Value>>>(new Map());

  constructor(
    private readonly op: QitsOperation<Params, Value, 'read', Err>,
    private readonly injector: Injector,
    private readonly refreshOn?: QitsRefreshOn,
  ) {}

  /**
   * Starts reading `key` with `params`, unless held; reads a failed one again, a missing one (a
   * 404) only when `retryMissing`.
   */
  read(key: string, params: Params, retryMissing = false): QitsResourceRef<Value> {
    const held = untracked(() => this.reads().get(key));
    if (held) {
      const retry = untracked(
        () => held.status() === 'error' && (retryMissing || !isMissing(held)),
      );
      if (retry) held.reload();
      return held;
    }
    const made = qitsResource(this.op, () => params, {
      injector: this.injector,
      refreshOn: this.refreshOn,
    });
    this.reads.update((reads) => new Map(reads).set(key, made));
    return made;
  }

  /** The read of `key`, once `read` started it. */
  get(key: string): QitsResourceRef<Value> | undefined {
    return this.reads().get(key);
  }

  /** Every read started, by key. */
  all(): ReadonlyMap<string, QitsResourceRef<Value>> {
    return this.reads();
  }
}
