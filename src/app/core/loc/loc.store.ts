import { isPlatformBrowser } from '@angular/common';
import { DestroyRef, inject, PLATFORM_ID } from '@angular/core';
import { patchState, signalStore, withHooks, withMethods, withState } from '@ngrx/signals';
import { listLoc } from '../../api/githost';
import { consume } from '@qits/angular';
import { LIST_LOC, type LocEntry } from './loc.consumes';

/** How long after an answer with uncounted repositories the store asks once more. */
export const RECOUNT_AFTER_MS = 15_000;

/** One language's lines, summed over some repositories. */
export interface LanguageLines {
  readonly language: string;
  readonly main: number;
  readonly test: number;
}

/** A sum of lines over some repositories. */
export interface LineTotals {
  readonly main: number;
  readonly test: number;
  /** Some of the repositories are not counted yet: the sums are a lower bound. */
  readonly partial: boolean;
  /** The same sums per language, largest (main + test) first, then by name. */
  readonly languages: readonly LanguageLines[];
}

interface LocState {
  readonly status: 'idle' | 'loading' | 'loaded' | 'error';
  /** Each repository's row, by repository id. */
  readonly byRepository: Readonly<Record<string, LocEntry>>;
}

/**
 * The lines of code of every repository, from qits-githost, in ONE request for the whole app:
 * `listLoc` without a filter answers every repository qits-githost holds. Filtering by the ids the
 * cards know would mean waiting for every project's repositories first, and 52 ids in a URL.
 *
 * - `load()` fetches once. The `onInit` hook calls it, in the browser only.
 * - When the answer has repositories qits-githost has not counted yet (`PENDING`; that very request
 *   queued their count), the store asks once more after {@link RECOUNT_AFTER_MS}, and not again.
 * - `totals(repositoryIds)` sums the lines of those repositories, in all and per language. A
 *   repository qits-githost does not hold, or holds without a commit (`EMPTY`), adds nothing.
 *
 * The store is the only user of the generated qits-githost client, so its pact
 * (`loc.store.pact.spec.ts`) is the whole of what this app relies on from qits-githost.
 */
export const LocStore = signalStore(
  { providedIn: 'root' },
  withState<LocState>({ status: 'idle', byRepository: {} }),
  withMethods((store) => {
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    let recounted = false;
    let recount: ReturnType<typeof setTimeout> | undefined;
    inject(DestroyRef).onDestroy(() => clearTimeout(recount));

    async function fetchAll(): Promise<void> {
      patchState(store, { status: 'loading' });
      const { data, error } = await consume(listLoc(), LIST_LOC);
      if (error !== undefined || !data) {
        patchState(store, { status: 'error' });
        return;
      }
      const byRepository: Record<string, LocEntry> = {};
      for (const entry of data.entries ?? []) {
        if (entry.repositoryId) byRepository[entry.repositoryId] = entry;
      }
      patchState(store, { status: 'loaded', byRepository });
      const pending = Object.values(byRepository).some((entry) => entry.status === 'PENDING');
      if (browser && pending && !recounted) {
        recounted = true;
        recount = setTimeout(() => void fetchAll(), RECOUNT_AFTER_MS);
      }
    }

    return {
      async load(): Promise<void> {
        if (store.status() === 'idle' || store.status() === 'error') await fetchAll();
      },
      /** The lines of `repositoryIds`, or undefined until the store has an answer. */
      totals(repositoryIds: readonly string[]): LineTotals | undefined {
        if (store.status() !== 'loaded') return undefined;
        let main = 0;
        let test = 0;
        let partial = false;
        const perLanguage = new Map<string, { main: number; test: number }>();
        for (const id of repositoryIds) {
          const entry = store.byRepository()[id];
          if (entry?.status === 'PENDING') partial = true;
          for (const lines of entry?.languages ?? []) {
            const name = lines.language ?? 'Unknown';
            const sum = perLanguage.get(name) ?? { main: 0, test: 0 };
            sum.main += lines.mainLines ?? 0;
            sum.test += lines.testLines ?? 0;
            perLanguage.set(name, sum);
            main += lines.mainLines ?? 0;
            test += lines.testLines ?? 0;
          }
        }
        const languages = [...perLanguage]
          .map(([language, sum]) => ({ language, ...sum }))
          .sort(
            (a, b) => b.main + b.test - (a.main + a.test) || a.language.localeCompare(b.language),
          );
        return { main, test, partial, languages };
      },
    };
  }),
  withHooks((store) => {
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    return {
      onInit(): void {
        if (browser) void store.load();
      },
    };
  }),
);
