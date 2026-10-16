import type { DestroyRef } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { consume } from '@qits/angular';
import { getRunReport, listRunReports } from '../../api/ci';
import { injectRefreshOn } from '$core/events/refresh-on';
import { BUILD_EVENTS } from './build-events';
import {
  GET_RUN_REPORT,
  LIST_RUN_REPORTS,
  type RunReport,
  type RunReports,
} from './ci-reports.consumes';

/** A read that may still be on its way, may have failed, or answered `value`. */
export interface ReportRead<T> {
  readonly status: 'loading' | 'loaded' | 'error';
  readonly value?: T;
}

interface CiReportsState {
  /** Each run's reports, by run id. */
  readonly runs: Readonly<Record<string, ReportRead<RunReports>>>;
  /** Each report with its payload, by `<run id>/<report id>`. */
  readonly reports: Readonly<Record<string, ReportRead<RunReport>>>;
}

/**
 * CI run reports from qits-ci (ported from `@qits/ui-components`' `qits-run-reports`): a run's
 * reports with their highlights (`loadRun`), and one report with its payload (`loadReport`), for
 * the kinds the page draws in full. Each is read once, and again after an error; `refreshRun`
 * reads a run's list again (its reports arrive while it runs). Start reads from an effect (they
 * write state); read them by key: `runs()[runId]`, `reports()[reportKey(runId, id)]`.
 * `followRun(runId, destroy)` reads `runId()`'s list again after its build events.
 *
 * Staleness (qits-1270): `BUILD_EVENTS` whose `runId` is the followed run → that run's list of
 * reports (`refreshRun`), at most once a second; a report newly listed is then read in full by
 * whoever shows it. qits-ci sends no event when a report is submitted: one submitted while the run
 * goes on shows with the run's next status change, at the latest its finish. A report's payload is
 * read once: a submitted report does not change.
 */
export const CiReportsStore = signalStore(
  { providedIn: 'root' },
  withState<CiReportsState>({ runs: {}, reports: {} }),
  withMethods((store) => {
    const refreshOn = injectRefreshOn();

    async function fetchRun(runId: string): Promise<void> {
      const { data, error } = await consume(listRunReports({ path: { runId } }), LIST_RUN_REPORTS);
      const failed = error !== undefined || !data;
      if (failed && store.runs()[runId]?.status === 'loaded') return;
      patchState(store, {
        runs: {
          ...store.runs(),
          [runId]: failed ? { status: 'error' } : { status: 'loaded', value: data },
        },
      });
    }

    return {
      loadRun(runId: string): void {
        const current = store.runs()[runId];
        if (!runId || (current && current.status !== 'error')) return;
        patchState(store, { runs: { ...store.runs(), [runId]: { status: 'loading' } } });
        void fetchRun(runId);
      },
      refreshRun(runId: string): void {
        if (store.runs()[runId]) void fetchRun(runId);
      },
      /** Reads `runId()`'s reports again after a build event naming that run, until `destroy`. */
      followRun(runId: () => string | undefined, destroy: DestroyRef): void {
        refreshOn(
          {
            names: BUILD_EVENTS,
            when: (_, ids) => !!ids.runId && ids.runId === runId(),
            refresh: () => {
              const id = runId();
              if (id && store.runs()[id]) void fetchRun(id);
            },
          },
          destroy,
        );
      },
      loadReport(runId: string, reportId: string): void {
        const key = reportKey(runId, reportId);
        const current = store.reports()[key];
        if (current && current.status !== 'error') return;
        patchState(store, { reports: { ...store.reports(), [key]: { status: 'loading' } } });
        void consume(getRunReport({ path: { runId, reportId } }), GET_RUN_REPORT).then(
          ({ data, error }) =>
            patchState(store, {
              reports: {
                ...store.reports(),
                [key]:
                  error !== undefined || !data
                    ? { status: 'error' }
                    : { status: 'loaded', value: data },
              },
            }),
        );
      },
    };
  }),
);

/** The key a report is held under. */
export function reportKey(runId: string, reportId: string): string {
  return `${runId}/${reportId}`;
}
