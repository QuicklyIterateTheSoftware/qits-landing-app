import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { client as observabilityClient } from '../../../../../../api/observability/client.gen';
import { provideHeyApiClient } from '../../../../../../api/observability/client/client.gen';
import type { ErrorIssueDetail } from '$core/observability/observability.consumes';
import { SelectedProject } from '$core/projects/selected-project';
import {
  isRecorded,
  observabilityGoldenMasters,
} from '../../../../../../../testing/golden-masters';
import { dismissRefusal, ObservabilityErrorPage } from './observability-error.page';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const STORED = 'stored error issues';
const FINGERPRINT = '0123456789abcdef0123456789abcdef';
const ISSUE = `/observability/api/error-issues/${FINGERPRINT}`;

/** The recorded issue: OPEN, three occurrences in one hour, with a sample trace and stack trace. */
const recorded = (): ErrorIssueDetail =>
  observabilityGoldenMasters.body<ErrorIssueDetail>(STORED, 'getErrorIssue');

/**
 * The issue page (qits-2538) on answers no recording holds, each derived from qits-observability's
 * recorded issue ("stored error issues"): a regressed issue (`regressions` set), one with no
 * sample trace (no Open trace), a 404 and the dismissal's refusal texts. Skipped until the pin
 * records the state.
 */
describe.skipIf(!isRecorded(STORED, 'getErrorIssue', observabilityGoldenMasters))(
  'ObservabilityErrorPage',
  () => {
    let http: HttpTestingController;

    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [
          { provide: PLATFORM_ID, useValue: 'browser' },
          provideRouter([{ path: 'errors/:fingerprint', component: ObservabilityErrorPage }]),
          provideHttpClient(),
          provideHttpClientTesting(),
          provideHeyApiClient(observabilityClient),
          { provide: SelectedProject, useValue: { slug: signal('p') } },
        ],
      });
      http = TestBed.inject(HttpTestingController);
    });

    afterEach(() => http.verify());

    async function ticked() {
      for (let i = 0; i < 3; i++) {
        TestBed.tick();
        await settle();
      }
    }

    /** The page at the recorded fingerprint, its read answered by `answer` (or `status`). */
    async function shown(answer: ErrorIssueDetail | null, status = 200) {
      const harness = await RouterTestingHarness.create(`/errors/${FINGERPRINT}`);
      await ticked();
      const [read] = http.match((request) => request.url.split('?')[0] === ISSUE);
      const sent = new URL(read.request.urlWithParams, 'http://x').searchParams;
      read.flush(answer, { status, statusText: status === 200 ? 'OK' : 'Error' });
      await ticked();
      harness.detectChanges();
      return { element: harness.routeNativeElement as HTMLElement, sent };
    }

    it('reads the issue by its path alone and charts its week', async () => {
      const { element, sent } = await shown(recorded());
      expect([...sent.keys()]).toEqual([]);
      expect(element.querySelector('h2')?.textContent).toContain(
        'IllegalStateException: invoice store unreachable',
      );
      expect(element.querySelectorAll('[data-bar]')).toHaveLength(168);
      expect(element.querySelector('[data-trace]')).toBeNull();
      expect(element.querySelector('[data-issue-trace]')?.getAttribute('href')).toBe(
        '/projects/p/observability/traces/6a1f0c2b9d8e47f3a5b4c3d2e1f00a01?source=_service%2Fqits-example',
      );
      expect(element.querySelector('[data-regressed]')).toBeNull();
    });

    it('says regressed N× on an OPEN issue that came back', async () => {
      const { element } = await shown({ ...recorded(), regressions: 2 });
      expect(element.querySelector('[data-regressed]')?.textContent).toContain('regressed 2×');
    });

    it('offers no Open trace when the issue has no sample trace', async () => {
      const { element } = await shown({ ...recorded(), sampleTraceId: undefined });
      expect(element.querySelector('[data-issue-trace]')).toBeNull();
      expect(element.querySelector('[data-issue-logs]')).not.toBeNull();
    });

    it('says no issue has the fingerprint on a 404', async () => {
      const { element } = await shown(null, 404);
      const missing = element.querySelector('[data-missing]');
      expect(missing?.classList).not.toContain('hidden');
      expect(missing?.textContent).toContain(FINGERPRINT);
    });

    it('words a dismissal’s refusal', () => {
      expect(dismissRefusal(403, undefined)).toContain('needs qits:admin');
      expect(dismissRefusal(404, undefined)).toContain('no error issue has this fingerprint');
      expect(dismissRefusal(0, undefined)).toBe('Could not dismiss — the service is unreachable.');
    });
  },
);
