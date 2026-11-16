import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Mock } from 'vitest';
import { SERVICE_WORKER_SCRIPT } from './app-updates';

/** A fetch event as the worker gets it, its two calls spied on. */
interface FakeFetchEvent {
  readonly request: { readonly url: string };
  readonly stopImmediatePropagation: Mock<() => void>;
  readonly respondWith: Mock<(answer: Promise<unknown>) => void>;
  stopped: boolean;
}

type Listener = (event: FakeFetchEvent) => void;

const ORIGIN = 'https://qits.example.test';

/**
 * The script `provideAppUpdates` registers (`public/sw.js`, qits-2297), run against a fake worker
 * scope: `self` with this app's origin and an `addEventListener` that keeps every listener in
 * order, and an `importScripts` that stands in for `ngsw-worker.js` by adding a second fetch
 * listener, as ngsw does, which answers every request. A dispatch runs the listeners in order and
 * stops after one that called `stopImmediatePropagation`, as the browser does. The file is read
 * relative to the repository, as the pact specs read theirs.
 */
describe('the service worker wrapper (public/sw.js)', () => {
  let listeners: Map<string, Listener[]>;
  let importScripts: Mock<(...urls: string[]) => void>;
  let ngsw: Mock<Listener>;

  beforeEach(() => {
    listeners = new Map();
    ngsw = vi.fn<Listener>((event) => event.respondWith(Promise.resolve('ngsw')));
    const self = {
      location: { origin: ORIGIN },
      addEventListener: (type: string, listener: Listener) =>
        listeners.set(type, [...(listeners.get(type) ?? []), listener]),
    };
    importScripts = vi.fn<(...urls: string[]) => void>(() => self.addEventListener('fetch', ngsw));
    const source = readFileSync(resolve(process.cwd(), `public/${SERVICE_WORKER_SCRIPT}`), 'utf8');
    new Function('self', 'importScripts', source)(self, importScripts);
  });

  function dispatch(url: string): FakeFetchEvent {
    const event: FakeFetchEvent = {
      request: { url },
      stopped: false,
      stopImmediatePropagation: vi.fn(() => {
        event.stopped = true;
      }),
      respondWith: vi.fn(),
    };
    for (const listener of listeners.get('fetch') ?? []) {
      listener(event);
      if (event.stopped) break;
    }
    return event;
  }

  it('imports ngsw after its own listener', () => {
    expect(importScripts).toHaveBeenCalledExactlyOnceWith('ngsw-worker.js');
    expect(listeners.get('fetch')).toHaveLength(2);
    expect(listeners.get('fetch')![1]).toBe(ngsw);
  });

  it('keeps a cross-origin request out of ngsw, unanswered, so the page makes it itself', () => {
    const event = dispatch('https://projects.qits.example.test/projects/api/projects');
    expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
    expect(event.respondWith).not.toHaveBeenCalled();
    expect(ngsw).not.toHaveBeenCalled();
  });

  it('hands a same-origin request on to ngsw', () => {
    for (const url of [`${ORIGIN}/main-1234.js`, `${ORIGIN}/projects/qits/work`]) {
      const event = dispatch(url);
      expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
      expect(ngsw).toHaveBeenLastCalledWith(event);
      expect(event.respondWith).toHaveBeenCalledOnce();
    }
  });
});
