import { isPlatformBrowser } from '@angular/common';
import { computed, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { qitsResource } from '@qits/angular';
import type { LocEntry } from './loc.consumes';
import { LOC_LIST } from './loc.operations';

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

/**
 * The lines of `repositoryIds`, from each repository's row (`byRepository`), in all and per
 * language. Only CODE languages count: data (JSON, YAML, XML, …) and docs (Markdown) are left out,
 * so the numbers are lines people wrote as code. A repository qits-githost does not hold, or holds
 * without a commit (`EMPTY`), adds nothing; one counted at an older commit (`STALE`) adds that
 * count; one never counted (`PENDING`) adds nothing and makes the totals `uncounted`.
 */
export function lineTotals(
  byRepository: ReadonlyMap<string, LocEntry>,
  repositoryIds: readonly string[],
): LineTotals {
  let main = 0;
  let test = 0;
  let uncounted = false;
  const perLanguage = new Map<string, { main: number; test: number }>();
  for (const id of repositoryIds) {
    const entry = byRepository.get(id);
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
    .sort((a, b) => b.main + b.test - (a.main + a.test) || a.language.localeCompare(b.language));
  return { main, test, uncounted, languages };
}

/**
 * The lines of code of every repository, from qits-githost, in ONE read for the whole app: a
 * `qitsResource` over `LOC_LIST` (qits-2146; it was `LocStore`'s), `listLoc` without a filter,
 * which answers every repository qits-githost holds. Filtering by the ids the cards know would mean
 * waiting for every project's repositories first, and 52 ids in a URL.
 *
 * - `load()` starts the read, in the browser only (the server render has no session to send), and
 *   reads again after a failure. Nothing calls it on its own: a project card does, the first time
 *   its languages section opens.
 * - A repository whose tip qits-githost has not counted yet comes back `STALE`, with the count of
 *   an older commit: it counts like `COUNTED`. Rough and slightly outdated beats nothing. A
 *   repository never counted at all (`PENDING`) adds nothing; nothing asks again.
 * - `totals(repositoryIds)` sums the lines of those repositories ({@link lineTotals}), once the read
 *   answered.
 *
 * Staleness (qits-1270): no event → read once. qits-githost emits no event when it has counted a
 * commit; `SCMPublishCommit` only says a count is about to go `STALE`, and reading then would bring
 * back the same older count. So nothing reads it again; a gap until qits-githost announces a count.
 */
@Injectable({ providedIn: 'root' })
export class LinesOfCode {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Whether a card asked for the lines yet: the read waits for it. */
  private readonly wanted = signal(false);

  /** Every repository's lines, once a card asked. */
  readonly lines = qitsResource(LOC_LIST, () => (this.browser && this.wanted() ? {} : undefined));

  /** Where the read stands: `idle` until a card asked. */
  readonly status = computed((): 'idle' | 'loading' | 'loaded' | 'error' => {
    if (this.lines.status() === 'error') return 'error';
    if (this.lines.hasValue()) return 'loaded';
    return this.wanted() ? 'loading' : 'idle';
  });

  /** Each repository's row, by repository id. */
  private readonly byRepository = computed((): ReadonlyMap<string, LocEntry> => {
    const entries = this.lines.hasValue() ? (this.lines.value()?.entries ?? []) : [];
    return new Map(
      entries.flatMap((entry) => (entry.repositoryId ? [[entry.repositoryId, entry]] : [])),
    );
  });

  /** Starts the read once, and again after a failure. */
  load(): void {
    if (!this.wanted()) this.wanted.set(true);
    else if (this.lines.status() === 'error') this.lines.reload();
  }

  /** The lines of `repositoryIds`, or undefined until the read answered. */
  totals(repositoryIds: readonly string[]): LineTotals | undefined {
    return this.status() === 'loaded' ? lineTotals(this.byRepository(), repositoryIds) : undefined;
  }
}
