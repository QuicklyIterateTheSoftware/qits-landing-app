import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID } from '@angular/core';
import { patchState, signalStore, withHooks, withMethods, withState } from '@ngrx/signals';
import { listLoc } from '../../api/githost';
import { consume } from '@qits/angular';
import { LIST_LOC, type LocEntry } from './loc.consumes';

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
  /** Some of the repositories were never counted (`PENDING`): they are left out of the sums. */
  readonly uncounted: boolean;
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
 * - A repository whose tip qits-githost has not counted yet comes back `STALE`, with the count of
 *   an older commit: the store uses it like `COUNTED`. Rough and slightly outdated beats nothing.
 *   A repository never counted at all (`PENDING`) adds nothing; the store does not ask again.
 * - `totals(repositoryIds)` sums the lines of those repositories, in all and per language. Only
 *   CODE languages count: data (JSON, YAML, XML, …) and docs (Markdown) are left out, so the
 *   numbers are lines people wrote as code. A repository qits-githost does not hold, or holds
 *   without a commit (`EMPTY`), adds nothing.
 *
 * The store is the only user of the generated qits-githost client, so its pact
 * (`loc.store.pact.spec.ts`) is the whole of what this app relies on from qits-githost.
 */
export const LocStore = signalStore(
  { providedIn: 'root' },
  withState<LocState>({ status: 'idle', byRepository: {} }),
  withMethods((store) => {
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
        let uncounted = false;
        const perLanguage = new Map<string, { main: number; test: number }>();
        for (const id of repositoryIds) {
          const entry = store.byRepository()[id];
          if (entry?.status === 'PENDING') uncounted = true;
          for (const lines of entry?.languages ?? []) {
            if (lines.category !== 'CODE') continue;
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
        return { main, test, uncounted, languages };
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
