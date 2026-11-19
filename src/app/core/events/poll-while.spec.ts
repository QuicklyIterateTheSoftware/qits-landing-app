import {
  type DestroyRef,
  Injector,
  PLATFORM_ID,
  runInInjectionContext,
  signal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { pollWhile } from './poll-while';

/** A `DestroyRef` a spec destroys by hand. */
class ManualDestroy implements DestroyRef {
  private readonly callbacks = new Set<() => void>();
  destroyed = false;
  onDestroy(callback: () => void): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }
  destroy(): void {
    this.destroyed = true;
    this.callbacks.forEach((callback) => callback());
  }
}

describe('pollWhile', () => {
  let visibility: DocumentVisibilityState;
  let destroy: ManualDestroy;

  beforeEach(() => {
    visibility = 'visible';
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibility,
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    destroy?.destroy();
    vi.useRealTimers();
    delete (document as { visibilityState?: unknown }).visibilityState;
  });

  /** Starts a poll of `refresh` while `active`, every second, on `platform`. */
  function start(active: () => boolean, refresh: () => void, platform = 'browser') {
    TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: platform }] });
    destroy = new ManualDestroy();
    runInInjectionContext(TestBed.inject(Injector), () =>
      pollWhile({ active, everyMs: 1_000, refresh }, destroy),
    );
    TestBed.tick();
  }

  /** Tells the document its visibility changed. */
  function show(state: DocumentVisibilityState) {
    visibility = state;
    document.dispatchEvent(new Event('visibilitychange'));
    TestBed.tick();
  }

  it('reads again every interval while active and visible, and stops when it is no longer active', () => {
    const active = signal(true);
    const refresh = vi.fn();
    start(active, refresh);
    vi.advanceTimersByTime(3_000);
    expect(refresh).toHaveBeenCalledTimes(3);
    active.set(false);
    TestBed.tick();
    vi.advanceTimersByTime(5_000);
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it('never reads while not active', () => {
    const refresh = vi.fn();
    start(() => false, refresh);
    vi.advanceTimersByTime(5_000);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('pauses while the document is hidden, and goes on once it is visible again', () => {
    const refresh = vi.fn();
    start(() => true, refresh);
    vi.advanceTimersByTime(1_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    show('hidden');
    vi.advanceTimersByTime(5_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    show('visible');
    vi.advanceTimersByTime(1_000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('stops when destroyed', () => {
    const refresh = vi.fn();
    start(() => true, refresh);
    destroy.destroy();
    vi.advanceTimersByTime(5_000);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('does nothing on the server', () => {
    const refresh = vi.fn();
    start(() => true, refresh, 'server');
    vi.advanceTimersByTime(5_000);
    expect(refresh).not.toHaveBeenCalled();
  });
});
