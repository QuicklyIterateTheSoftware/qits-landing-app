import { computed, signal } from '@angular/core';
import type { QitsResourceRef } from '@qits/angular';

/** A {@link resourceStub}: the resource, and how often `reload()` was called. */
export type ResourceStub<T> = QitsResourceRef<T> & { readonly reloads: () => number };

/**
 * A resolved `qitsResource` holding `value`, for a spec that hands a component a read as an input
 * (qits-2146) without making the request: `value()`, `status()` (`resolved`, or `error` when
 * `value` is an `Error`), `set` / `update` (writing as a resource does, `local`), and `reload()`,
 * counted by `reloads()`. Nothing else of a resource is real.
 */
export function resourceStub<T>(
  value: T | Error | undefined,
  operation = { provider: 'test', operationId: 'test', method: 'GET' as const },
): ResourceStub<T> {
  const failed = value instanceof Error ? value : undefined;
  const held = signal<T | undefined>(value instanceof Error ? undefined : value);
  const status = signal<string>(failed ? 'error' : value === undefined ? 'loading' : 'resolved');
  const reloads = signal(0);
  const stub = {
    operation,
    value: computed(() => held()),
    status: status.asReadonly(),
    qitsStatus: status.asReadonly(),
    error: signal(failed).asReadonly(),
    reloadError: signal(undefined).asReadonly(),
    cachedAt: signal(undefined).asReadonly(),
    isLoading: computed(() => status() === 'loading'),
    hasValue: () => held() !== undefined,
    set: (next: T | undefined) => {
      held.set(next);
      status.set('local');
    },
    update: (fn: (current: T | undefined) => T | undefined) => {
      held.set(fn(held()));
      status.set('local');
    },
    reload: () => {
      reloads.update((n) => n + 1);
      return true;
    },
    reloads: reloads.asReadonly(),
    asReadonly: () => stub,
    destroy: () => undefined,
    snapshot: computed(() => ({ status: status(), value: held() })),
  };
  return stub as unknown as ResourceStub<T>;
}
