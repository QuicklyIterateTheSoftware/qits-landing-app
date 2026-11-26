import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { client as observabilityClient } from '../../../../../../api/observability/client.gen';
import { provideHeyApiClient } from '../../../../../../api/observability/client/client.gen';
import { client as projectsClient } from '../../../../../../api/projects/client.gen';
import { provideHeyApiClient as provideProjectsClient } from '../../../../../../api/projects/client/client.gen';
import type { ErrorIssueTickets } from '$core/work/work.consumes';
import type { ErrorIssueDetail } from '$core/observability/observability.consumes';
import { SelectedProject } from '$core/projects/selected-project';
import {
  isRecorded,
  observabilityGoldenMasters,
  projectsGoldenMasters,
} from '../../../../../../../testing/golden-masters';
import { dismissRefusal, ObservabilityErrorPage } from './observability-error.page';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const STORED = 'stored error issues';
const FINGERPRINT = '0123456789abcdef0123456789abcdef';
const ISSUE = `/observability/api/error-issues/${FINGERPRINT}`;
const PROJECT_ID = 'project-1';
const TICKETS = `/projects/api/projects/${PROJECT_ID}/work`;
/** qits-projects' state of a ticket made from the same fingerprint. */
const FROM_ISSUE = 'a ticket made from an error issue';

/** The recorded tickets made from the issue: one REPORTED bug. */
const recordedTickets = (): ErrorIssueTickets =>
  projectsGoldenMasters.body<ErrorIssueTickets>(FROM_ISSUE, 'listProjectWork');

/** The recorded issue: OPEN, three occurrences in one hour, with a sample trace and stack trace. */
const recorded = (): ErrorIssueDetail =>
  observabilityGoldenMasters.body<ErrorIssueDetail>(STORED, 'getErrorIssue');

/**
 * The issue page (qits-2538) on answers no recording holds, each derived from qits-observability's
 * recorded issue ("stored error issues"): a regressed issue (`regressions` set), one with no
 * sample trace (no Open trace), a 404 and the dismissal's refusal texts. Its Tickets (qits-2538)
 * from qits-projects' "a ticket made from an error issue", and none; Make ticket's query. Skipped
 * until the pin records the state.
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
          provideProjectsClient(projectsClient),
          {
            provide: SelectedProject,
            useValue: { slug: signal('p'), project: signal({ id: PROJECT_ID }) },
          },
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

    /**
     * The page at the recorded fingerprint, its read answered by `answer` (or `status`), and the
     * tickets read that follows a shown issue by `tickets` (the recorded ones by default).
     */
    async function shown(
      answer: ErrorIssueDetail | null,
      status = 200,
      tickets: ErrorIssueTickets = recordedTickets(),
    ) {
      const harness = await RouterTestingHarness.create(`/errors/${FINGERPRINT}`);
      await ticked();
      const [read] = http.match((request) => request.url.split('?')[0] === ISSUE);
      const sent = new URL(read.request.urlWithParams, 'http://x').searchParams;
      read.flush(answer, { status, statusText: status === 200 ? 'OK' : 'Error' });
      await ticked();
      const ticketReads = http.match((request) => request.url.split('?')[0] === TICKETS);
      const ticketsSent = ticketReads.map(
        (r) => new URL(r.request.urlWithParams, 'http://x').searchParams,
      );
      for (const r of ticketReads) r.flush(tickets);
      await ticked();
      harness.detectChanges();
      return { element: harness.routeNativeElement as HTMLElement, sent, ticketsSent };
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

    it('lists the tickets made from the issue, read by its fingerprint (qits-2538)', async () => {
      const { element, ticketsSent } = await shown(recorded());
      expect(ticketsSent).toHaveLength(1);
      expect([...ticketsSent[0].entries()]).toEqual([['errorIssue', FINGERPRINT]]);
      const rows = element.querySelectorAll('[data-ticket]');
      expect(rows).toHaveLength(1);
      expect(rows[0].textContent).toContain('Export answers 500 for an empty quarter');
      expect(rows[0].textContent).toContain('reported');
      expect(rows[0].querySelector('a')?.getAttribute('href')).toBe(
        '/projects/p/work/detail/contract-00000001-1',
      );
      expect(element.querySelector('[data-no-tickets]')?.classList).toContain('hidden');
    });

    it('says no ticket has been made from the issue yet', async () => {
      const { element } = await shown(recorded(), 200, { entities: [] });
      expect(element.querySelectorAll('[data-ticket]')).toHaveLength(0);
      const none = element.querySelector('[data-no-tickets]');
      expect(none?.classList).not.toContain('hidden');
      expect(none?.textContent).toContain('No ticket has been made from this issue yet.');
    });

    it('makes a ticket: the work form as a ticket naming the issue, filled from it', async () => {
      const { element } = await shown(recorded());
      const href = element.querySelector('[data-make-ticket]')?.getAttribute('href') ?? '';
      const url = new URL(href, 'http://x');
      expect(url.pathname).toBe('/projects/p/work/create');
      expect(url.searchParams.get('archetype')).toBe('TICKET');
      expect(url.searchParams.get('errorIssue')).toBe(FINGERPRINT);
      expect(url.searchParams.get('title')).toBe(
        'IllegalStateException: invoice store unreachable',
      );
      const description = url.searchParams.get('description') ?? '';
      expect(description).toContain('- Service: qits-example');
      expect(description).toContain('- Location: `eu.example.InvoiceResource.list`');
      expect(description).toContain('- Versions: 2026.1230.090000 → 2026.1231.120000');
      expect(description).toContain('- Occurrences: 3');
      expect(description).toContain('at eu.example.InvoiceResource.list(InvoiceResource.java:42)');
    });

    it('reads no tickets for an issue it could not read', async () => {
      const { ticketsSent } = await shown(null, 404);
      expect(ticketsSent).toHaveLength(0);
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
