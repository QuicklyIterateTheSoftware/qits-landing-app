import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  assertInInjectionContext,
  DestroyRef,
  effect,
  inject,
  Injector,
  PLATFORM_ID,
  signal,
  untracked,
} from '@angular/core';

/**
 * How often a running CI run is read again for its live step's output (qits-2321). An
 * orchestrator process run is not polled: its run and step events announce it (qits-2472).
 */
export const RUNNING_RUN_POLL_MS = 10_000;

/** What {@link pollWhile} reads again, and while when. */
export interface PollWhileOptions {
  /** Whether there is something only a read can bring (a signal read: the poll follows it). */
  readonly active: () => boolean;
  /** Between two reads. */
  readonly everyMs: number;
  /** Reads again. */
  readonly refresh: () => void;
}

/**
 * The one poll the staleness rule (qits-1270) allows, for what no domain event announces: a
 * running CI run's live step writes output, and qits-ci sends an event only when a run changes
 * status (`BuildStatusChanged`), never per line (qits-2321). So while `active()` holds AND the
 * document is visible, `refresh` runs every `everyMs`; it stops as soon as either ends (a finished
 * run, a hidden tab) and starts again when both hold. Everything an event does announce still
 * follows the event (`refreshOn`), never this.
 *
 * Called in an injection context (a component's field or constructor); stops with `destroy`, the
 * injection context's `DestroyRef` when not given. On the server it does nothing.
 */
export function pollWhile(options: PollWhileOptions, destroyRef?: DestroyRef): void {
  assertInInjectionContext(pollWhile);
  if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
  const document = inject(DOCUMENT);
  const destroy = destroyRef ?? inject(DestroyRef);
  const visible = signal(document.visibilityState !== 'hidden');
  const seen = () => visible.set(document.visibilityState !== 'hidden');
  document.addEventListener('visibilitychange', seen);

  let timer: ReturnType<typeof setInterval> | undefined;
  const stop = () => {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
  };
  const watching = effect(
    () => {
      const on = options.active() && visible();
      untracked(() => {
        if (!on) stop();
        else if (timer === undefined) timer = setInterval(() => options.refresh(), options.everyMs);
      });
    },
    { injector: inject(Injector) },
  );
  destroy.onDestroy(() => {
    watching.destroy();
    stop();
    document.removeEventListener('visibilitychange', seen);
  });
}
