import { InjectionToken } from '@angular/core';
import type { ReleaseRequest } from './release-request.consumes';

/**
 * The release request a release request's page shows (qits-2146), as the patterns that change it
 * reach it: the page (`release-request.page.ts`) reads the request through its own `qitsResource`
 * over `RELEASE_REQUEST` and provides itself under this token, so a change made below it (approve,
 * decline, withdraw, a priority, a move, an override, a waiver, a re-run) puts the request it
 * answered in place of the one on show, as `ReleaseRequestStore.put` did. Not a root service: it
 * lives as long as the page. Outside the page (the Release Requests list's Withdraw) nothing
 * provides it.
 */
export interface OpenReleaseRequest {
  /**
   * Shows `request`, a change's answer, in place of the request on show when it is that request
   * (the same id); the reads that follow it (the fold's commits and verdicts, the artifacts, the
   * eligibility) follow it too.
   */
  put(request: ReleaseRequest): void;
  /** Reads the request again, as a change the service found moot (409) asks. */
  reload(): void;
}

/** Where the patterns on a release request's page find the request the page read. */
export const OPEN_RELEASE_REQUEST = new InjectionToken<OpenReleaseRequest>('OPEN_RELEASE_REQUEST');
